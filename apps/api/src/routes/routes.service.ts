import { Injectable } from "@nestjs/common";
import { type Hex } from "viem";
import type { z } from "zod";
import { optimizeRoute, parseOptimizeInput, RouteIntentPayload } from "@matura/shared";

import { ChainService } from "../chain/chain.service";
import { ContractsService } from "../chain/contracts.service";
import { CursorService } from "../cursor/cursor.service";
import { parseUint256 } from "../common/amount.util";
import { toHexAddress, validateBytes32 } from "../common/evm.util";
import { conflict, notFound, unprocessable } from "../common/http-errors";
import { validateRouteLegs } from "../common/leg-mirror";
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
      frontier.timestamp,
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

      // Authoritative mirror of _validateLegs (+ slice/remaining/dup) on the fresh block.
      const validated = await validateRouteLegs(reads, user, payload.legs);
      const messageLegs = validated.map((l) => ({
        claimId: l.claimId,
        vault: l.vault,
        faceAmount: l.faceAmount,
        // minimumAdvanceAmount = the fresh authoritative advance — the only on-chain cost floor.
        minimumAdvanceAmount: l.advance,
      }));

      const totalAdvance = messageLegs.reduce((sum, l) => sum + l.minimumAdvanceAmount, 0n);
      if (totalAdvance < BigInt(intent.targetAdvance)) {
        throw unprocessable("TARGET_NO_LONGER_MET", "Liquidity/pricing moved; re-optimize");
      }
      const totalFace = messageLegs.reduce((sum, l) => sum + l.faceAmount, 0n);
      // Enforce the user's advisory cost cap at the FRESH price (there is no on-chain cost field,
      // so prepare is the only place this can be honoured after pricing may have drifted).
      const totalCost = totalFace - totalAdvance;
      if (intent.maxTotalCost !== null && totalCost > BigInt(intent.maxTotalCost)) {
        throw unprocessable(
          "MAX_COST_EXCEEDED",
          "Route cost exceeds maxTotalCost at current pricing; re-optimize",
        );
      }
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
}

function dedupe(ids: Hex[]): Hex[] {
  return [...new Set(ids)];
}
