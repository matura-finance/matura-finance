import {
  ConflictException,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { EXECUTION_ROUTE_TYPES, routerDomain } from "@matura/chain";
import { type Hex, hashTypedData } from "viem";
import type { z } from "zod";

import { ChainService } from "../../chain/chain.service";
import { ContractsService } from "../../chain/contracts.service";
import { parseUint256 } from "../../common/amount.util";
import { toHexAddress, validateBytes32 } from "../../common/evm.util";
import {
  buildPrepareResponse,
  type ExecutionPrepareSchema,
  type PrepareResponse,
  type PrepareStep,
} from "../../common/prepare.dto";
import { CursorService } from "../../cursor/cursor.service";

const DEFAULT_DEADLINE_SECONDS = 3600;

interface PreparedLeg {
  claimId: Hex;
  vault: Hex;
  faceAmount: bigint;
  minimumAdvanceAmount: bigint;
}

@Injectable()
export class ExecutionsPrepareService {
  constructor(
    private readonly chain: ChainService,
    private readonly contracts: ContractsService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * POST /api/v1/executions/prepare. Full chain-truth pre-flight mirroring `executeRoute`'s
   * revert reasons, so a returned route never reverts on a checkable condition. `user` comes
   * from the JWT (never the body). Returns the ExecutionRoute typed data + the executionId digest.
   */
  async prepare(
    wallet: string,
    body: z.infer<typeof ExecutionPrepareSchema>,
  ): Promise<PrepareResponse> {
    const user = toHexAddress(wallet);
    const targetAdvance = parseUint256(body.targetAdvance, "targetAdvance");
    if (targetAdvance === 0n) {
      throw new UnprocessableEntityException("targetAdvance must be non-zero");
    }

    // 1. Parse + validate leg inputs synchronously (dedup, bytes32, amounts) — no RPC.
    const seen = new Set<string>();
    const legInputs: PreparedLeg[] = body.legs.map((legInput) => {
      const claimId = validateBytes32(legInput.claimId, "claimId");
      if (seen.has(claimId)) throw new ConflictException(`Duplicate claim in route: ${claimId}`);
      seen.add(claimId);
      return {
        claimId,
        vault: toHexAddress(legInput.vault),
        faceAmount: parseUint256(legInput.faceAmount, "faceAmount"),
        minimumAdvanceAmount: parseUint256(legInput.minimumAdvanceAmount, "minimumAdvanceAmount"),
      };
    });

    // 2. Wave A: getClaim + isFinanceable for every leg, concurrently (batched by the http transport).
    const enriched = await Promise.all(
      legInputs.map(async (leg) => {
        const [claim, financeable] = await Promise.all([
          this.chain.getClaim(leg.claimId),
          this.contracts.isFinanceable(leg.claimId),
        ]);
        return { leg, claim, financeable };
      }),
    );
    const validated = enriched.map(({ leg, claim, financeable }) => {
      if (claim === null) throw new ConflictException(`Claim not found on chain: ${leg.claimId}`);
      if (!financeable) {
        throw new ConflictException(`Claim not financeable (must be ELIGIBLE/PARTIALLY_FUNDED): ${leg.claimId}`);
      }
      if (claim.beneficiary.toLowerCase() !== user) {
        throw new ConflictException(`Claim ${leg.claimId} beneficiary does not match the authenticated wallet`);
      }
      return { leg, claim };
    });

    // 3. Wave B: quoteAndCheck for every leg, concurrently.
    const quoted = await Promise.all(
      validated.map(async ({ leg, claim }) => ({
        leg,
        quote: await this.contracts.quoteAndCheck(leg.vault, claim.issuer, claim.claimType, leg.faceAmount, claim.dueDate),
      })),
    );

    const legs: PreparedLeg[] = [];
    const perVaultAdvance = new Map<string, bigint>();
    let totalAdvance = 0n;
    let totalFace = 0n;
    for (const { leg, quote } of quoted) {
      if (!quote.ok) throw new UnprocessableEntityException(`Vault ${leg.vault} rejected claim ${leg.claimId} (mandate)`);
      if (quote.advanceAmount < leg.minimumAdvanceAmount) {
        throw new UnprocessableEntityException(`Advance below minimum for claim ${leg.claimId}`);
      }
      legs.push(leg);
      perVaultAdvance.set(leg.vault, (perVaultAdvance.get(leg.vault) ?? 0n) + quote.advanceAmount);
      totalAdvance += quote.advanceAmount;
      totalFace += leg.faceAmount;
    }

    // 4. Wave C: fundableLiquidity per distinct vault + the router nonce, concurrently.
    const [liquidityChecks, nonce] = await Promise.all([
      Promise.all(
        [...perVaultAdvance.entries()].map(async ([vault, advance]) => ({
          vault,
          advance,
          fundable: await this.contracts.fundableLiquidity(vault as Hex),
        })),
      ),
      this.contracts.routerNonce(user),
    ]);
    for (const { vault, advance, fundable } of liquidityChecks) {
      if (advance > fundable) throw new UnprocessableEntityException(`Insufficient vault liquidity for ${vault}`);
    }

    if (totalAdvance < targetAdvance) {
      throw new UnprocessableEntityException("targetAdvance not met by the assembled route");
    }
    const maxTotalFace = body.maxTotalFace === undefined ? totalFace : parseUint256(body.maxTotalFace, "maxTotalFace");
    if (totalFace > maxTotalFace) {
      throw new UnprocessableEntityException("route total face exceeds maxTotalFace");
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + (body.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS));
    const router = this.chain.addresses.router;

    const message = {
      user,
      targetAdvance,
      maxTotalFace,
      deadline,
      nonce,
      legs: legs.map((leg) => ({
        claimId: leg.claimId,
        vault: leg.vault,
        faceAmount: leg.faceAmount,
        minimumAdvanceAmount: leg.minimumAdvanceAmount,
      })),
    };
    const domain = routerDomain(this.chain.chainId, router);
    const executionId = hashTypedData({
      domain,
      types: EXECUTION_ROUTE_TYPES,
      primaryType: "ExecutionRoute",
      message,
    });

    const step: PrepareStep = {
      kind: "typed-data",
      to: router,
      value: "0",
      verifyingContract: router,
      typedData: { domain, types: EXECUTION_ROUTE_TYPES, primaryType: "ExecutionRoute", message: serializeMessage(message) },
      nonce: nonce.toString(),
      expiry: deadline.toString(),
    };
    const summary =
      `Sign an ExecutionRoute (executionId ${executionId}) advancing ${totalAdvance.toString()} ` +
      `against ${totalFace.toString()} face across ${String(legs.length)} leg(s); submit via router.executeRoute.`;

    return buildPrepareResponse(
      this.chain.chainId,
      [step],
      summary,
      await this.cursor.finalizedThrough(),
    );
  }
}

/** JSON-safe view of the typed-data message (bigints → decimal strings) for the response body. */
function serializeMessage(message: {
  user: string;
  targetAdvance: bigint;
  maxTotalFace: bigint;
  deadline: bigint;
  nonce: bigint;
  legs: { claimId: string; vault: string; faceAmount: bigint; minimumAdvanceAmount: bigint }[];
}): Record<string, unknown> {
  return {
    user: message.user,
    targetAdvance: message.targetAdvance.toString(),
    maxTotalFace: message.maxTotalFace.toString(),
    deadline: message.deadline.toString(),
    nonce: message.nonce.toString(),
    legs: message.legs.map((leg) => ({
      claimId: leg.claimId,
      vault: leg.vault,
      faceAmount: leg.faceAmount.toString(),
      minimumAdvanceAmount: leg.minimumAdvanceAmount.toString(),
    })),
  };
}
