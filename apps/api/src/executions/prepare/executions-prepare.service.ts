import { Injectable } from "@nestjs/common";
import { type Hex } from "viem";
import type { z } from "zod";

import { ChainService } from "../../chain/chain.service";
import { ContractsService } from "../../chain/contracts.service";
import { parseUint256 } from "../../common/amount.util";
import { conflict, unprocessable } from "../../common/http-errors";
import { toHexAddress, validateBytes32 } from "../../common/evm.util";
import {
  buildPrepareResponse,
  type ExecutionPrepareSchema,
  type PrepareResponse,
  type PrepareStep,
} from "../../common/prepare.dto";
import { buildExecutionRouteTypedData } from "../../common/prepare.serialize";
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
      throw unprocessable("ZERO_TARGET_ADVANCE", "targetAdvance must be non-zero");
    }

    // 1. Parse + validate leg inputs synchronously (dedup, bytes32, amounts) — no RPC.
    const seen = new Set<string>();
    const legInputs: PreparedLeg[] = body.legs.map((legInput) => {
      const claimId = validateBytes32(legInput.claimId, "claimId");
      if (seen.has(claimId))
        throw conflict("DUPLICATE_CLAIM_IN_ROUTE", `Duplicate claim in route: ${claimId}`);
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
      if (claim === null)
        throw conflict("CLAIM_NOT_FOUND", `Claim not found on chain: ${leg.claimId}`);
      if (!financeable) {
        throw conflict(
          "CLAIM_NOT_FINANCEABLE",
          `Claim not financeable (must be ELIGIBLE/PARTIALLY_FUNDED): ${leg.claimId}`,
        );
      }
      if (claim.beneficiary.toLowerCase() !== user) {
        throw conflict(
          "BENEFICIARY_MISMATCH",
          `Claim ${leg.claimId} beneficiary does not match the authenticated wallet`,
        );
      }
      return { leg, claim };
    });

    // 3. Wave B: quoteAndCheck for every leg, concurrently.
    const quoted = await Promise.all(
      validated.map(async ({ leg, claim }) => ({
        leg,
        quote: await this.contracts.quoteAndCheck(
          leg.vault,
          claim.issuer,
          claim.claimType,
          leg.faceAmount,
          claim.dueDate,
        ),
      })),
    );

    const legs: PreparedLeg[] = [];
    const perVaultAdvance = new Map<string, bigint>();
    let totalAdvance = 0n;
    let totalFace = 0n;
    for (const { leg, quote } of quoted) {
      if (!quote.ok) {
        throw unprocessable(
          "MANDATE_REJECTED",
          `Vault ${leg.vault} rejected claim ${leg.claimId} (mandate)`,
        );
      }
      if (quote.advanceAmount < leg.minimumAdvanceAmount) {
        throw unprocessable(
          "ADVANCE_BELOW_MINIMUM",
          `Advance below minimum for claim ${leg.claimId}`,
        );
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
      if (advance > fundable)
        throw unprocessable("INSUFFICIENT_LIQUIDITY", `Insufficient vault liquidity for ${vault}`);
    }

    if (totalAdvance < targetAdvance) {
      throw unprocessable("TARGET_ADVANCE_NOT_MET", "targetAdvance not met by the assembled route");
    }
    const maxTotalFace =
      body.maxTotalFace === undefined ? totalFace : parseUint256(body.maxTotalFace, "maxTotalFace");
    if (totalFace > maxTotalFace) {
      throw unprocessable("MAX_FACE_EXCEEDED", "route total face exceeds maxTotalFace");
    }

    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + (body.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS),
    );
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
    const { typedData, executionId } = buildExecutionRouteTypedData(
      this.chain.chainId,
      router,
      message,
    );

    const step: PrepareStep = {
      kind: "typed-data",
      to: router,
      value: "0",
      verifyingContract: router,
      typedData,
      submitFunction: "executeRoute",
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
