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

    const seen = new Set<string>();
    const legs: PreparedLeg[] = [];
    const perVaultAdvance = new Map<string, bigint>();
    let totalAdvance = 0n;
    let totalFace = 0n;

    for (const legInput of body.legs) {
      const claimId = validateBytes32(legInput.claimId, "claimId");
      if (seen.has(claimId)) {
        throw new ConflictException(`Duplicate claim in route: ${claimId}`);
      }
      seen.add(claimId);
      const vault = toHexAddress(legInput.vault);
      const faceAmount = parseUint256(legInput.faceAmount, "faceAmount");
      const minimumAdvanceAmount = parseUint256(legInput.minimumAdvanceAmount, "minimumAdvanceAmount");

      const claim = await this.chain.getClaim(claimId);
      if (claim === null) {
        throw new ConflictException(`Claim not found on chain: ${claimId}`);
      }
      if (!(await this.contracts.isFinanceable(claimId))) {
        throw new ConflictException(`Claim not financeable (must be ELIGIBLE/PARTIALLY_FUNDED): ${claimId}`);
      }
      if (claim.beneficiary.toLowerCase() !== user) {
        throw new ConflictException(`Claim ${claimId} beneficiary does not match the authenticated wallet`);
      }

      const quote = await this.contracts.quoteAndCheck(
        vault,
        claim.issuer,
        claim.claimType,
        faceAmount,
        claim.dueDate,
      );
      if (!quote.ok) {
        throw new UnprocessableEntityException(`Vault ${vault} rejected claim ${claimId} (mandate)`);
      }
      if (quote.advanceAmount < minimumAdvanceAmount) {
        throw new UnprocessableEntityException(`Advance below minimum for claim ${claimId}`);
      }

      legs.push({ claimId, vault, faceAmount, minimumAdvanceAmount });
      perVaultAdvance.set(vault, (perVaultAdvance.get(vault) ?? 0n) + quote.advanceAmount);
      totalAdvance += quote.advanceAmount;
      totalFace += faceAmount;
    }

    for (const [vault, advance] of perVaultAdvance) {
      const fundable = await this.contracts.fundableLiquidity(vault as Hex);
      if (advance > fundable) {
        throw new UnprocessableEntityException(`Insufficient vault liquidity for ${vault}`);
      }
    }

    if (totalAdvance < targetAdvance) {
      throw new UnprocessableEntityException("targetAdvance not met by the assembled route");
    }
    const maxTotalFace = body.maxTotalFace === undefined ? totalFace : parseUint256(body.maxTotalFace, "maxTotalFace");
    if (totalFace > maxTotalFace) {
      throw new UnprocessableEntityException("route total face exceeds maxTotalFace");
    }

    const nonce = await this.contracts.routerNonce(user);
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
