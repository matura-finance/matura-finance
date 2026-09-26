import type { RouteCandidate } from "./candidate.js";
import type { RejectedAlternative, RejectionReason } from "./reasons.js";
import { EXACT_SEARCH_MAX_CLAIMS, OptimizeResult, type OptimizeInput } from "./optimize-io.js";
import {
  advanceForFace,
  effectiveDiscountBps,
  maxFaceForAdvanceCap,
  minFaceForAdvance,
} from "./arithmetic.js";

/** A single allocation the optimizer chose, in selection (rate) order. */
interface Draw {
  candidate: RouteCandidate;
  face: bigint;
  advance: bigint;
  discount: bigint;
}

interface Allocation {
  draws: Draw[];
  totalAdvance: bigint;
  totalFace: bigint;
  totalCost: bigint;
}

/**
 * Deterministic candidate ordering: cheapest rate first, then earliest maturity,
 * then stable `(claimId, vault)` — the objective's tie-break chain. Pure.
 */
function sortByRate(candidates: readonly RouteCandidate[]): RouteCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.rateBps !== b.rateBps) return a.rateBps - b.rateBps;
    const da = BigInt(a.dueDate);
    const db = BigInt(b.dueDate);
    if (da !== db) return da < db ? -1 : 1;
    if (a.claimId !== b.claimId) return a.claimId < b.claimId ? -1 : 1;
    return a.vault < b.vault ? -1 : a.vault > b.vault ? 1 : 0;
  });
}

function group(candidates: readonly RouteCandidate[]): Map<string, RouteCandidate[]> {
  const byClaim = new Map<string, RouteCandidate[]>();
  for (const c of sortByRate(candidates)) {
    const list = byClaim.get(c.claimId);
    if (list) list.push(c);
    else byClaim.set(c.claimId, [c]);
  }
  return byClaim;
}

/**
 * Greedy min-cost face allocation over a FIXED set of `(claim, vault)` legs
 * (each claim appears at most once). Fills cheapest rate first — optimal for the
 * divisible case under size-independent pricing — honouring per-vault liquidity
 * aggregation, min-lot (smallest unavoidable overshoot), and maxFace.
 */
function fillByRate(legs: readonly RouteCandidate[], target: bigint, maxLegs: number): Allocation {
  const vaultRemaining = new Map<string, bigint>();
  const usedClaims = new Set<string>();
  const draws: Draw[] = [];
  let remaining = target;

  for (const c of sortByRate(legs)) {
    if (remaining <= 0n || draws.length >= maxLegs) break;
    if (usedClaims.has(c.claimId)) continue; // one vault per claim (guards a mixed-vault input set)
    const vRem = vaultRemaining.get(c.vault) ?? BigInt(c.vaultFundable);
    if (vRem <= 0n) continue;
    const minFace = BigInt(c.minFace);
    const faceCap = maxFaceForAdvanceCap(vRem, c.rateBps, BigInt(c.maxFace));
    if (faceCap < minFace) continue; // no valid lot fits the remaining liquidity
    const needed = minFaceForAdvance(remaining, c.rateBps, faceCap);
    const face = needed === null ? faceCap : needed < minFace ? minFace : needed;
    const advance = advanceForFace(face, c.rateBps);
    draws.push({ candidate: c, face, advance, discount: face - advance });
    usedClaims.add(c.claimId);
    vaultRemaining.set(c.vault, vRem - advance);
    remaining -= advance;
  }
  return summarize(draws);
}

/**
 * Hard bound on the number of leaf allocations the exact search may evaluate.
 * The branching factor is `1 + vaultsPerClaim` per claim (vault count is NOT
 * capped by the caller), so an adversarial vault fan-out could otherwise explode
 * combinatorially and block the single-threaded event loop. When the budget is
 * exhausted the search aborts and the caller falls back to a greedy result
 * marked `approximation: "greedy"`. The demo/normal domain (≤ a few claims × a
 * few vaults) stays far under this and remains exact.
 */
const SEARCH_LEAF_BUDGET = 200_000;

interface ExactSearchResult {
  /** Min-cost allocation meeting target AND the caps, or null. */
  withCaps: Allocation | null;
  /** Min-cost allocation meeting target ignoring caps (to classify MAX_COST_EXCEEDED vs TARGET_UNSATISFIABLE). */
  ignoringCaps: Allocation | null;
  /** True if the leaf budget was hit before the search completed (result is partial → caller uses greedy). */
  exhausted: boolean;
}

/**
 * Bounded exact search: for each claim choose none or exactly one of its vaults
 * (pruned to ≤ maxLegs chosen), fill the chosen legs by rate, and keep the
 * min-cost allocation that meets `target`. Explores the vault-choice trade-off
 * (rate vs capacity) that a per-claim cheapest-vault greedy would miss. Tracks
 * the caps-respecting and caps-ignoring optima in ONE pass, and aborts once
 * `SEARCH_LEAF_BUDGET` leaves are evaluated (worst-case time bound).
 */
function exactSearch(
  byClaim: Map<string, RouteCandidate[]>,
  target: bigint,
  input: OptimizeInput,
): ExactSearchResult {
  // Consider cheapest-rate claims first so a good candidate is found early.
  const claimIds = [...byClaim.keys()].sort(
    (a, b) => (byClaim.get(a)?.[0]?.rateBps ?? 0) - (byClaim.get(b)?.[0]?.rateBps ?? 0),
  );
  let withCaps: Allocation | null = null;
  let ignoringCaps: Allocation | null = null;
  let exhausted = false;
  let leaves = 0;
  const chosen: RouteCandidate[] = [];

  const consider = (): void => {
    if (chosen.length === 0) return;
    if (leaves >= SEARCH_LEAF_BUDGET) {
      exhausted = true;
      return;
    }
    leaves++;
    const alloc = fillByRate(chosen, target, input.maxLegs);
    // A real route needs ≥1 leg (an empty route reverts on-chain with EmptyRoute) —
    // this also makes a non-positive target fall through to a non-executable result.
    if (alloc.draws.length === 0 || alloc.totalAdvance < target) return;
    if (ignoringCaps === null || isBetter(alloc, ignoringCaps)) ignoringCaps = alloc;
    if (withinCaps(alloc, input) && (withCaps === null || isBetter(alloc, withCaps)))
      withCaps = alloc;
  };

  const rec = (i: number): void => {
    if (exhausted || chosen.length > input.maxLegs) return; // budget/depth prune
    if (i === claimIds.length) {
      consider();
      return;
    }
    rec(i + 1); // skip this claim
    const claimId = claimIds[i];
    const vaults = claimId === undefined ? undefined : byClaim.get(claimId);
    if (vaults) {
      for (const c of vaults) {
        // The top-of-rec `exhausted` guard stops descent once the budget is hit.
        chosen.push(c);
        rec(i + 1);
        chosen.pop();
      }
    }
  };
  rec(0);
  return { withCaps, ignoringCaps, exhausted };
}

function isBetter(a: Allocation, b: Allocation): boolean {
  if (a.totalCost !== b.totalCost) return a.totalCost < b.totalCost;
  if (a.draws.length !== b.draws.length) return a.draws.length < b.draws.length;
  if (a.totalFace !== b.totalFace) return a.totalFace < b.totalFace;
  // Final stable tie-break on the canonical leg ordering.
  return legKey(a) < legKey(b);
}

function legKey(a: Allocation): string {
  return [...a.draws]
    .map((d) => `${d.candidate.claimId}:${d.candidate.vault}`)
    .sort()
    .join("|");
}

/**
 * Greedy allocation that MAXIMISES advance under `maxLegs` (used to report
 * `maxAchievableAdvance` / `bestFeasiblePartial` when a route is infeasible).
 */
function greedyMaxAdvance(candidates: readonly RouteCandidate[], maxLegs: number): Allocation {
  const byCapacity = [...candidates].sort((a, b) => {
    const ca = advanceForFace(BigInt(a.maxFace), a.rateBps);
    const cb = advanceForFace(BigInt(b.maxFace), b.rateBps);
    if (ca !== cb) return ca < cb ? 1 : -1; // desc
    if (a.claimId !== b.claimId) return a.claimId < b.claimId ? -1 : 1;
    return a.vault < b.vault ? -1 : a.vault > b.vault ? 1 : 0;
  });
  const usedClaims = new Set<string>();
  const vaultRemaining = new Map<string, bigint>();
  const draws: Draw[] = [];
  for (const c of byCapacity) {
    if (draws.length >= maxLegs) break;
    if (usedClaims.has(c.claimId)) continue;
    const vRem = vaultRemaining.get(c.vault) ?? BigInt(c.vaultFundable);
    if (vRem <= 0n) continue;
    const minFace = BigInt(c.minFace);
    const faceCap = maxFaceForAdvanceCap(vRem, c.rateBps, BigInt(c.maxFace));
    if (faceCap < minFace) continue;
    const advance = advanceForFace(faceCap, c.rateBps);
    draws.push({ candidate: c, face: faceCap, advance, discount: faceCap - advance });
    usedClaims.add(c.claimId);
    vaultRemaining.set(c.vault, vRem - advance);
  }
  return summarize(draws);
}

function summarize(draws: Draw[]): Allocation {
  let totalAdvance = 0n;
  let totalFace = 0n;
  let totalCost = 0n;
  for (const d of draws) {
    totalAdvance += d.advance;
    totalFace += d.face;
    totalCost += d.discount;
  }
  return { draws, totalAdvance, totalFace, totalCost };
}

function withinCaps(alloc: Allocation, input: OptimizeInput): boolean {
  if (input.maxTotalFace !== undefined && alloc.totalFace > BigInt(input.maxTotalFace))
    return false;
  if (input.maxTotalCost !== undefined && alloc.totalCost > BigInt(input.maxTotalCost))
    return false;
  return true;
}

/**
 * Plain (unbranded) view of a route body. The optimizer builds these and hands
 * them to `OptimizeResult.parse`, which validates + brands — so no unsafe casts.
 */
interface CoreShape {
  legs: {
    claimId: string;
    vault: string;
    faceAmount: string;
    advanceAmount: string;
    discountAmount: string;
  }[];
  totalAdvance: string;
  totalFaceAssigned: string;
  totalCost: string;
  effectiveDiscountBps: number;
  retainedFace: { claimId: string; retained: string }[];
}

/** Canonical `(claimId, vault)` leg ordering for hashing + the signed message. */
function toLegs(draws: Draw[]): CoreShape["legs"] {
  return [...draws]
    .sort((a, b) => {
      if (a.candidate.claimId !== b.candidate.claimId)
        return a.candidate.claimId < b.candidate.claimId ? -1 : 1;
      return a.candidate.vault < b.candidate.vault ? -1 : 1;
    })
    .map((d) => ({
      claimId: d.candidate.claimId,
      vault: d.candidate.vault,
      faceAmount: d.face.toString(),
      advanceAmount: d.advance.toString(),
      discountAmount: d.discount.toString(),
    }));
}

function retainedFace(draws: Draw[]): CoreShape["retainedFace"] {
  return [...draws]
    .sort((a, b) => (a.candidate.claimId < b.candidate.claimId ? -1 : 1))
    .map((d) => ({
      claimId: d.candidate.claimId,
      retained: (BigInt(d.candidate.remainingFace) - d.face).toString(),
    }));
}

function core(alloc: Allocation): CoreShape {
  return {
    legs: toLegs(alloc.draws),
    totalAdvance: alloc.totalAdvance.toString(),
    totalFaceAssigned: alloc.totalFace.toString(),
    totalCost: alloc.totalCost.toString(),
    effectiveDiscountBps: effectiveDiscountBps(alloc.totalCost, alloc.totalFace),
    retainedFace: retainedFace(alloc.draws),
  };
}

/** Rejected alternatives: eligible candidates the optimizer did not select. */
function rejections(candidates: readonly RouteCandidate[], draws: Draw[]): RejectedAlternative[] {
  const selected = new Set(draws.map((d) => `${d.candidate.claimId}:${d.candidate.vault}`));
  const out: RejectedAlternative[] = [];
  for (const c of candidates) {
    if (selected.has(`${c.claimId}:${c.vault}`)) continue;
    // Hard-constraint rejections are attached at collection time and never reach
    // the optimizer; anything it receives but does not select is economically
    // dominated within the chosen route.
    const reason: RejectionReason = "HIGHER_MARGINAL_COST";
    out.push({ claimId: c.claimId, vault: c.vault, reason });
  }
  return out.sort((a, b) =>
    a.claimId !== b.claimId
      ? a.claimId < b.claimId
        ? -1
        : 1
      : a.vault < b.vault
        ? -1
        : a.vault > b.vault
          ? 1
          : 0,
  );
}

function stepsOf(draws: Draw[]): {
  claimId: string;
  vault: string;
  faceAmount: string;
  advanceAmount: string;
  rateBps: number;
}[] {
  return draws.map((d) => ({
    claimId: d.candidate.claimId,
    vault: d.candidate.vault,
    faceAmount: d.face.toString(),
    advanceAmount: d.advance.toString(),
    rateBps: d.candidate.rateBps,
  }));
}

/**
 * Deterministic best-execution optimizer. Pure and integer-only: no DB/network,
 * no `Date`/`Math.random`. Returns an executable route (min total cost/face to
 * meet `targetAdvance`) or a structured non-executable result — never a bogus
 * route. For the small MVP domain it runs a bounded exact search over per-claim
 * vault choice (optimal); above `EXACT_SEARCH_MAX_CLAIMS` it degrades to a
 * cheapest-vault-per-claim greedy marked `approximation: "greedy"`. Output is
 * validated + branded via `OptimizeResult.parse`.
 */
export function optimizeRoute(input: OptimizeInput): OptimizeResult {
  const target = BigInt(input.targetAdvance);
  const candidatesConsidered = input.candidates.length;

  if (candidatesConsidered === 0) {
    return nonExecutable(
      "NO_ELIGIBLE_CANDIDATES",
      target,
      greedyMaxAdvance([], input.maxLegs),
      input,
      candidatesConsidered,
      "bounded-exact",
    );
  }

  const byClaim = group(input.candidates);
  const distinctClaims = byClaim.size;

  // Exact search for the small domain; a single pass yields both the caps-respecting
  // optimum and the caps-ignoring optimum (to classify a failure). If the leaf budget
  // is exhausted (adversarial vault fan-out), fall through to the greedy approximation.
  if (distinctClaims <= EXACT_SEARCH_MAX_CLAIMS) {
    const search = exactSearch(byClaim, target, input);
    if (!search.exhausted) {
      if (search.withCaps)
        return buildExecutable(
          search.withCaps,
          "bounded-exact",
          "exact",
          input,
          candidatesConsidered,
        );
      const reason: RejectionReason = search.ignoringCaps
        ? "MAX_COST_EXCEEDED"
        : "TARGET_UNSATISFIABLE";
      return nonExecutable(
        reason,
        target,
        greedyMaxAdvance(input.candidates, input.maxLegs),
        input,
        candidatesConsidered,
        "bounded-exact",
      );
    }
  }

  // Large domain OR budget-exhausted: cheapest-vault-per-claim greedy (approximate).
  const cheapestPerClaim = [...byClaim.values()]
    .map((v) => v[0])
    .filter((c): c is RouteCandidate => c !== undefined);
  const greedy = fillByRate(cheapestPerClaim, target, input.maxLegs);
  if (greedy.draws.length > 0 && greedy.totalAdvance >= target && withinCaps(greedy, input)) {
    return buildExecutable(greedy, "greedy-degraded", "greedy", input, candidatesConsidered);
  }
  return nonExecutable(
    "TARGET_UNSATISFIABLE",
    target,
    greedyMaxAdvance(input.candidates, input.maxLegs),
    input,
    candidatesConsidered,
    "greedy-degraded",
  );
}

/** Which selection path produced a result — for observability, not control flow. */
type Strategy = "bounded-exact" | "greedy-degraded";

function nonExecutable(
  reasonCode: RejectionReason,
  target: bigint,
  partial: Allocation,
  input: OptimizeInput,
  candidatesConsidered: number,
  strategy: Strategy,
): OptimizeResult {
  const shortfall = target - partial.totalAdvance;
  return OptimizeResult.parse({
    executable: false,
    reasonCode,
    shortfallAdvance: (shortfall > 0n ? shortfall : 0n).toString(),
    maxAchievableAdvance: partial.totalAdvance.toString(),
    bestFeasiblePartial: partial.draws.length > 0 ? core(partial) : undefined,
    rejected: rejections(input.candidates, partial.draws),
    explanation: {
      strategy,
      steps: stepsOf(partial.draws),
      candidatesConsidered,
      targetAdvance: input.targetAdvance,
      achievedAdvance: partial.totalAdvance.toString(),
    },
  });
}

function buildExecutable(
  alloc: Allocation,
  strategy: Strategy,
  approximation: "exact" | "greedy",
  input: OptimizeInput,
  candidatesConsidered: number,
): OptimizeResult {
  return OptimizeResult.parse({
    executable: true,
    approximation,
    ...core(alloc),
    rejected: rejections(input.candidates, alloc.draws),
    explanation: {
      strategy,
      steps: stepsOf(alloc.draws),
      candidatesConsidered,
      targetAdvance: input.targetAdvance,
      achievedAdvance: alloc.totalAdvance.toString(),
    },
  });
}
