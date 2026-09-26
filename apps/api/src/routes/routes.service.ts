import { Injectable } from "@nestjs/common";
import { type Hex } from "viem";
import type { z } from "zod";
import {
  CLAIM_STATES,
  optimizeRoute,
  parseOptimizeInput,
  RouteIntentPayload,
} from "@matura/shared";

import { ChainService } from "../chain/chain.service";
import { ContractsService, type PinnedReads } from "../chain/contracts.service";
import { CursorService } from "../cursor/cursor.service";
import { parseUint256 } from "../common/amount.util";
import { toHexAddress, validateBytes32 } from "../common/evm.util";
import { conflict, notFound, unprocessable } from "../common/http-errors";
import {
  buildPrepareResponse,
  type PrepareResponse,
  type PrepareStep,
} from "../common/prepare.dto";
import {
  buildExecutionRouteTypedData,
  type ExecutionRouteMessage,
} from "../common/prepare.serialize";
import { collectCandidates } from "./quote-collector";
import { quoteSnapshotHash, routeIdOf } from "./route-hash";
import { RouteIntentService } from "./route-intent.service";
import type { OptimizeRequestSchema, OptimizeResponse } from "./routes.dto";

/** Short-lived freshness window for a route intent. */
const ROUTE_INTENT_TTL_SECONDS = 120;
/** Upper bound on the on-chain route deadline set at prepare. */
const EXECUTION_DEADLINE_SECONDS = 300;
/** A prepared route must remain valid at least this long, or we refuse to hand out dead typed data. */
const MIN_DEADLINE_MARGIN_SECONDS = 30;

const ELIGIBLE = CLAIM_STATES.indexOf("ELIGIBLE");
const PARTIALLY_FUNDED = CLAIM_STATES.indexOf("PARTIALLY_FUNDED");

@Injectable()
export class RoutesService {
  constructor(
    private readonly chain: ChainService,
    private readonly contracts: ContractsService,
    private readonly cursor: CursorService,
    private readonly intents: RouteIntentService,
  ) {}

  /**
   * POST /api/v1/routes/optimize. Pins one finalized block, collects eligible
   * `(claim, vault)` candidates, runs the pure optimizer, and — when executable —
   * persists a short-lived route intent. `wallet` comes from the JWT (never the
   * body). Advance/cost figures are estimate-at-block; prepare-execution performs
   * the authoritative re-quote + mirror.
   */
  async optimize(
    wallet: string,
    body: z.infer<typeof OptimizeRequestSchema>,
  ): Promise<OptimizeResponse> {
    const user = toHexAddress(wallet);
    if (parseUint256(body.targetAdvance, "targetAdvance") === 0n) {
      throw unprocessable("ZERO_TARGET_ADVANCE", "targetAdvance must be non-zero");
    }
    const routeDeadlineSeconds = body.routeDeadlineSeconds ?? EXECUTION_DEADLINE_SECONDS;

    const frontier = await this.chain.getFrontierBlock();
    const block = await this.chain.client.getBlock({ blockNumber: frontier.number });
    const reads = this.contracts.pinnedAt(frontier.number);
    const finalizedThrough = await this.cursor.finalizedThrough();

    const claimIds = dedupe(body.claimIds.map((id) => validateBytes32(id, "claimId")));

    if (await reads.routerPaused()) {
      return {
        chainId: this.chain.chainId,
        blockNumber: frontier.number.toString(),
        finalizedThrough,
        routeId: null,
        expiresAt: null,
        result: optimizeRoute(
          parseOptimizeInput({ targetAdvance: body.targetAdvance, candidates: [] }),
        ),
        filteredOut: claimIds.map((claimId) => ({
          claimId,
          vault: claimId,
          reason: "ROUTER_PAUSED" as const,
        })),
      };
    }

    const { candidates, rejected } = await collectCandidates(
      reads,
      block.timestamp,
      user,
      claimIds,
    );
    const result = optimizeRoute(
      parseOptimizeInput({
        targetAdvance: body.targetAdvance,
        maxTotalFace: body.maxTotalFace,
        maxTotalCost: body.maxTotalCost,
        candidates,
      }),
    );

    if (!result.executable) {
      return {
        chainId: this.chain.chainId,
        blockNumber: frontier.number.toString(),
        finalizedThrough,
        routeId: null,
        expiresAt: null,
        result,
        filteredOut: rejected,
      };
    }

    const snapshotHash = quoteSnapshotHash(frontier.number, candidates);
    const routeId = routeIdOf({
      user,
      quoteSnapshotHash: snapshotHash,
      legs: result.legs.map((l) => ({
        claimId: l.claimId,
        vault: l.vault,
        faceAmount: l.faceAmount,
      })),
      targetAdvance: body.targetAdvance,
      maxTotalFace: body.maxTotalFace ?? null,
      maxTotalCost: body.maxTotalCost ?? null,
      routeDeadlineSeconds,
    });
    const expiresAt = new Date(Date.now() + ROUTE_INTENT_TTL_SECONDS * 1000);

    await this.intents.createIfAbsent({
      routeId,
      user,
      targetAdvance: body.targetAdvance,
      maxTotalFace: body.maxTotalFace ?? null,
      maxTotalCost: body.maxTotalCost ?? null,
      totalAdvance: result.totalAdvance,
      totalFaceAssigned: result.totalFaceAssigned,
      totalCost: result.totalCost,
      effectiveDiscountBps: result.effectiveDiscountBps,
      legs: result.legs,
      rejected: result.rejected,
      explanation: result.explanation,
      quoteSnapshotHash: snapshotHash,
      blockNumber: frontier.number,
      routeDeadlineSeconds,
      expiresAt,
    });

    return {
      chainId: this.chain.chainId,
      blockNumber: frontier.number.toString(),
      finalizedThrough,
      routeId,
      expiresAt: expiresAt.toISOString(),
      result,
      filteredOut: rejected,
    };
  }

  /**
   * POST /api/v1/routes/:routeId/prepare-execution. Atomically consumes the intent
   * (single-use), re-validates every leg against a FRESH finalized block (the
   * authoritative mirror of `_validateLegs`), binds the router nonce and a bounded
   * deadline, and emits the ExecutionRoute typed data to sign. On any re-validation
   * failure the intent is marked FAILED and a re-optimize error is returned.
   */
  async prepareExecution(wallet: string, routeIdRaw: string): Promise<PrepareResponse> {
    const user = toHexAddress(wallet);
    const routeId = validateBytes32(routeIdRaw, "routeId");

    const intent = await this.intents.consume(routeId, user);
    if (intent === null) {
      // User-scoped classification — never a cross-user status oracle.
      const existing = await this.intents.getForUser(routeId, user);
      if (existing === null) throw notFound("ROUTE_INTENT_NOT_FOUND", "No such route intent");
      if (existing.expiresAt.getTime() <= Date.now()) {
        throw unprocessable("ROUTE_INTENT_EXPIRED", "Route intent expired; re-optimize");
      }
      throw conflict("ROUTE_INTENT_UNAVAILABLE", "Route intent already consumed");
    }

    try {
      const payload = RouteIntentPayload.parse({
        legs: intent.legs,
        rejected: intent.rejected,
        explanation: intent.explanation,
      });

      const frontier = await this.chain.getFrontierBlock();
      const reads = this.contracts.pinnedAt(frontier.number);
      if (await reads.routerPaused()) {
        throw unprocessable("ROUTER_PAUSED", "Router is paused; re-optimize later");
      }

      const messageLegs = await this.revalidateLegs(reads, user, payload.legs);

      const totalAdvance = messageLegs.reduce((sum, l) => sum + l.minimumAdvanceAmount, 0n);
      if (totalAdvance < BigInt(intent.targetAdvance)) {
        throw unprocessable("TARGET_NO_LONGER_MET", "Liquidity/pricing moved; re-optimize");
      }
      const totalFace = messageLegs.reduce((sum, l) => sum + l.faceAmount, 0n);
      const maxTotalFace = intent.maxTotalFace === null ? totalFace : BigInt(intent.maxTotalFace);

      const nonce = await reads.routerNonce(user);
      const nowSec = Math.floor(Date.now() / 1000);
      const userDeadline =
        Math.floor(intent.createdAt.getTime() / 1000) + intent.routeDeadlineSeconds;
      const deadline = BigInt(Math.min(userDeadline, nowSec + EXECUTION_DEADLINE_SECONDS));
      if (deadline <= BigInt(nowSec + MIN_DEADLINE_MARGIN_SECONDS)) {
        throw unprocessable(
          "ROUTE_DEADLINE_TOO_SOON",
          "Route deadline has effectively passed; re-optimize",
        );
      }

      const router = this.chain.addresses.router;
      const message: ExecutionRouteMessage = {
        user,
        targetAdvance: BigInt(intent.targetAdvance),
        maxTotalFace,
        deadline,
        nonce,
        legs: messageLegs,
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
        `against ${totalFace.toString()} face across ${String(messageLegs.length)} leg(s); submit via router.executeRoute.`;

      return buildPrepareResponse(
        this.chain.chainId,
        [step],
        summary,
        await this.cursor.finalizedThrough(),
      );
    } catch (error) {
      // Consume already committed; a failed re-validation burns the intent (fail-closed).
      await this.intents.markFailed(routeId);
      throw error;
    }
  }

  /** Re-validate each stored leg on a fresh block; returns the on-chain message legs. */
  private async revalidateLegs(
    reads: PinnedReads,
    user: Hex,
    legs: { claimId: string; vault: string; faceAmount: string }[],
  ): Promise<ExecutionRouteMessage["legs"]> {
    // Validate + re-quote every leg concurrently (no shared mutable state here).
    const messageLegs = await Promise.all(
      legs.map(async (leg) => {
        const claimId = validateBytes32(leg.claimId, "claimId");
        const vault = toHexAddress(leg.vault);
        const claim = await reads.getClaim(claimId);
        if (claim === null) {
          throw unprocessable("LEG_NOT_FINANCEABLE", `Claim ${claimId} not found`);
        }
        if (claim.beneficiary.toLowerCase() !== user.toLowerCase()) {
          throw unprocessable("LEG_NOT_FINANCEABLE", `Claim ${claimId} not financeable for wallet`);
        }
        if (claim.state !== ELIGIBLE && claim.state !== PARTIALLY_FUNDED) {
          throw unprocessable("LEG_NOT_FINANCEABLE", `Claim ${claimId} not in a financeable state`);
        }
        const [issuerActive, vaultActive, vaultToken] = await Promise.all([
          reads.isIssuerActive(claim.issuer),
          reads.isVaultActive(vault),
          reads.vaultToken(vault),
        ]);
        if (!issuerActive)
          throw unprocessable("ISSUER_INACTIVE", `Issuer inactive for claim ${claimId}`);
        if (!vaultActive) throw unprocessable("VAULT_INACTIVE", `Vault ${vault} inactive`);
        if (claim.token.toLowerCase() !== vaultToken.toLowerCase()) {
          throw unprocessable("TOKEN_MISMATCH", `Token mismatch for claim ${claimId}`);
        }

        const faceAmount = parseUint256(leg.faceAmount, "faceAmount");
        const quote = await reads.quoteAndCheck(
          vault,
          claim.issuer,
          claim.claimType,
          faceAmount,
          claim.dueDate,
        );
        if (!quote.ok) throw unprocessable("MANDATE_REJECTED", `Vault rejected claim ${claimId}`);

        // minimumAdvanceAmount = the fresh authoritative advance — the ONLY on-chain cost floor.
        return { claimId, vault, faceAmount, minimumAdvanceAmount: quote.advanceAmount };
      }),
    );

    // Aggregate advances per distinct vault against one fundable snapshot (mirror _validateLegs).
    const perVault = new Map<string, bigint>();
    for (const leg of messageLegs) {
      perVault.set(leg.vault, (perVault.get(leg.vault) ?? 0n) + leg.minimumAdvanceAmount);
    }
    await Promise.all(
      [...perVault.entries()].map(async ([vault, reserved]) => {
        const fundable = await reads.fundableLiquidity(vault as Hex);
        if (reserved > fundable)
          throw unprocessable("INSUFFICIENT_LIQUIDITY", `Vault ${vault} lacks liquidity`);
      }),
    );

    return messageLegs;
  }
}

function dedupe(ids: Hex[]): Hex[] {
  return [...new Set(ids)];
}
