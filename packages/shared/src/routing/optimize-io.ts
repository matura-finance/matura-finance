import { z } from "zod";
import { ClaimId } from "../ids.js";
import { BaseUnitAmount } from "../money.js";
import { RouteLeg } from "../route.js";
import { RouteCandidate } from "./candidate.js";
import { RejectedAlternative, RejectionReason } from "./reasons.js";
import { Explanation } from "./explanation.js";

/** On-chain `MaturaConstants.MAX_LEGS` — the maximum legs per execution route. */
export const MAX_ROUTE_LEGS = 8;

/**
 * Above this many eligible claims the bounded exact search is skipped in favour
 * of a single-pass greedy result marked `approximation: "greedy"`. The search
 * enumerates each claim's vault choice (∈ {none} ∪ its vaults) pruned to ≤
 * maxLegs, so its branching is bounded by `(1 + vaultsPerClaim)^claims`; 12 keeps
 * the worst case (~3^12) to a few ms on the event loop. The DTO layer separately
 * caps request size before any chain read (that is the DoS control).
 */
export const EXACT_SEARCH_MAX_CLAIMS = 12;

/**
 * Input to the pure optimizer. `targetAdvance` is the advance to satisfy;
 * `maxTotalFace`/`maxTotalCost` are optional caps (`maxTotalCost` is advisory —
 * there is no on-chain cost field). `candidates` are the collector's
 * already-eligible `(claim, vault)` options. Typed, not `unknown`: callers build
 * it from server-collected chain reads, or use {@link parseOptimizeInput}.
 */
export const OptimizeInput = z
  .object({
    targetAdvance: BaseUnitAmount,
    maxTotalFace: BaseUnitAmount.optional(),
    maxTotalCost: BaseUnitAmount.optional(),
    maxLegs: z.number().int().positive().max(MAX_ROUTE_LEGS).default(MAX_ROUTE_LEGS),
    candidates: z.array(RouteCandidate),
  })
  .strict();

/** A validated optimizer input (defaults applied). */
export type OptimizeInput = z.infer<typeof OptimizeInput>;

/** Parse untrusted input into a branded, defaulted {@link OptimizeInput}. */
export function parseOptimizeInput(raw: unknown): OptimizeInput {
  return OptimizeInput.parse(raw);
}

/** Face left unfinanced on a selected claim after this route. */
const RetainedFace = z.object({ claimId: ClaimId, retained: BaseUnitAmount }).strict();

/**
 * Shared, discriminant-free route body. Reused by {@link RouteResult} and by
 * `NonExecutableResult.bestFeasiblePartial` so the partial can't accidentally
 * carry an `executable: true` discriminant.
 */
export const RouteResultCore = z
  .object({
    legs: z.array(RouteLeg),
    totalAdvance: BaseUnitAmount,
    totalFaceAssigned: BaseUnitAmount,
    totalCost: BaseUnitAmount,
    effectiveDiscountBps: z.number().int(),
    retainedFace: z.array(RetainedFace),
  })
  .strict();

/** A validated route body (no executability discriminant). */
export type RouteResultCore = z.infer<typeof RouteResultCore>;

/**
 * An executable route. Plain object with a literal discriminant and NO top-level
 * `.refine` (required by `z.discriminatedUnion`); cross-field invariants live in
 * the optimizer and on the nested `RouteLeg` schema.
 */
export const RouteResult = RouteResultCore.extend({
  executable: z.literal(true),
  /** "exact" (optimal) or "greedy" (degraded above EXACT_SEARCH_MAX_CLAIMS). */
  approximation: z.enum(["exact", "greedy"]),
  rejected: z.array(RejectedAlternative),
  explanation: Explanation,
}).strict();

/** A validated executable route. */
export type RouteResult = z.infer<typeof RouteResult>;

/** A structured non-executable result — never a bogus route. */
export const NonExecutableResult = z
  .object({
    executable: z.literal(false),
    reasonCode: RejectionReason,
    /** targetAdvance − maxAchievableAdvance (≥ 0). */
    shortfallAdvance: BaseUnitAmount,
    /** Best advance reachable under all constraints. */
    maxAchievableAdvance: BaseUnitAmount,
    /** The cheapest legs that reach `maxAchievableAdvance`, if any. */
    bestFeasiblePartial: RouteResultCore.optional(),
    rejected: z.array(RejectedAlternative),
    explanation: Explanation,
  })
  .strict();

/** A validated non-executable result. */
export type NonExecutableResult = z.infer<typeof NonExecutableResult>;

/** The optimizer's result: a route, or a structured non-executable outcome. */
export const OptimizeResult = z.discriminatedUnion("executable", [
  RouteResult,
  NonExecutableResult,
]);

/** A validated optimizer result (narrow on `.executable`). */
export type OptimizeResult = z.infer<typeof OptimizeResult>;

/**
 * The JSON payload persisted on a `RouteIntent`. Re-parse the Prisma `Json`
 * columns through THIS on read-back — never cast `JsonValue` to a branded
 * `RouteLeg[]`, so the brands + the `RouteLeg` invariant are restored.
 */
export const RouteIntentPayload = z
  .object({
    legs: z.array(RouteLeg),
    rejected: z.array(RejectedAlternative),
    explanation: Explanation,
  })
  .strict();

/** A validated persisted route-intent payload. */
export type RouteIntentPayload = z.infer<typeof RouteIntentPayload>;
