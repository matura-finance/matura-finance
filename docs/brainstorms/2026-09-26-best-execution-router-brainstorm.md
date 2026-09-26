# Best-Execution Router — Brainstorm

**Date:** 2026-09-26
**Status:** Ready for planning
**Topic:** Deterministic best-execution router (`packages/shared` optimizer + `apps/api` routes endpoints)

## What We're Building

Matura's core differentiator: given a wallet's target advance and a set of eligible unfunded
claims + live vault quotes, deterministically choose the **cheapest verifiable route** — a set of
`(claimId, vault, faceAmount)` legs — that the on-chain `MaturaRouter` will independently accept.

- **`POST /api/v1/routes/optimize`** — pure optimization over a pinned quote snapshot; returns the
  selected `RouteLeg[]`, aggregates (`totalAdvance`, `totalFaceAssigned`, `totalCost`,
  `effectiveDiscountBps`, retained face per claim), machine-readable **rejected alternatives**, a
  deterministic explanation, and a persisted short-lived **route intent**.
- **`POST /api/v1/routes/:routeId/prepare-execution`** — loads the intent, re-validates freshness
  against a fresh block, and emits the `ExecutionRoute` **EIP-712 typed-data step** for the user to
  sign (non-custodial; the API never holds a key).

The optimizer is a **pure, integer-only, DB/network-free** function. Quote collection (chain reads)
is separated from optimization (pure math), so the core is independently unit- and property-testable.

## Why This Approach

Two research findings shaped every decision:

1. **`MaturaRouter` has no view-only validator.** `executeRoute` is state-changing and
   signature+nonce-gated, so it **cannot be `eth_call`'d before the user signs** — which is exactly
   when both endpoints run. The contract validates a _backend-proposed_ route on-chain and reverts
   per-leg. So "simulation" for MVP means **replicating the contract's own checks off-chain** using
   the identical reads it uses (`quoteAndCheck`, `fundableLiquidity`, `IssuerRegistry.isActive`,
   `routerNonce`), pinned to one finalized block. Correctness is guarded by a **parity test** that
   asserts the off-chain mirror matches `_validateLegs` semantics.

2. **Vault pricing is size-independent.** The discount _rate_ (`baseBps + durationBpsPerDay·daysToDue
   - premiumBps`) depends only on claim type + duration, **not on face amount**. So marginal cost per
`(claim, vault)`pair is **constant**, and advance/cost are **linear** in face within the mandate's`[minFace, maxFace]`band. This collapses the objective (minimize total cost / assigned face to
meet a target advance) into a **fractional-knapsack** shape where **greedy-by-marginal-rate is
provably optimal** for the divisible case. The only combinatorial pressure is`MAX_LEGS = 8`,
     min-lot rounding, and per-vault liquidity aggregation.

**Chosen algorithm:** for each claim, pick its **single cheapest eligible vault** (the contract
forbids the same `claimId` in two legs, so a claim maps to exactly one vault per route). Then greedy
allocation over these per-claim candidates sorted by the spec's objective — ascending marginal
discount rate, tie-broken by fewer legs → earlier maturity → stable `claimId`/vault ordering — draws
`faceAmount ≤ remainingFace` from each until `targetAdvance` is met, capped at `MAX_LEGS = 8` claims.
When a vault's liquidity/`maxFace` caps a claim's draw, the optimizer takes less from that claim and
moves to the next (no intra-route split). Because greedy is optimal under linear pricing, an "exact
bounded search" is unnecessary; the fuzz test validates greedy against a brute-force reference over
small random portfolios (and documents any bounded overshoot from integer/lot rounding). This honors
the spec's "prefer exact bounded search, fall back to documented greedy" by showing the fall-back is
in fact optimal here, not an approximation.

**Timestamp drift is favorable, not a risk.** As execution is delayed, `daysToDue` shrinks →
discount shrinks → advance _grows_. A route meeting `targetAdvance` at snapshot time stays valid
on-chain (the router recomputes an **equal-or-higher** advance). Per-leg `minimumAdvanceAmount` is set
to the snapshot advance, so `AdvanceBelowMinimum` cannot trip from drift, and `maxTotalCost` only
gets easier to satisfy over time. Route intents still carry a short TTL and never claim a quote is
guaranteed past expiry.

## Key Decisions

| Decision              | Choice                                                                                                                                  | Rationale                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Router "simulation"   | **Off-chain mirror** of `_validateLegs` + route checks, pinned to one finalized block, guarded by a Solidity-parity test                | No signature-free on-chain validator exists; mirrors the exact reads the contract uses; no contract change in the 7-day window |
| `prepare-execution`   | **Reuse existing `executions-prepare` EIP-712 machinery**                                                                               | One code path builds/serializes the signed `ExecutionRoute`; DRY                                                               |
| Optimizer home        | **`packages/shared`** (pure `bigint`, vitest + fast-check)                                                                              | Already hosts `ExecutionRoute`/`RouteLeg` + `BaseUnitAmount`; framework/viem-free; converges the money model                   |
| Rejected alternatives | **Per-candidate machine-readable reason codes**                                                                                         | Small domain makes it cheap; strengthens the verifiable deterministic explanation                                              |
| Algorithm             | **Greedy by marginal discount rate** (optimal under linear pricing), fuzzed vs brute-force                                              | Size-independent pricing → fractional-knapsack → greedy optimal; avoids a heavy solver                                         |
| Route-intent storage  | **Prisma table mirroring `AuthNonce`** (`expiresAt` + consumed flag + `@@index([expiresAt])`, atomic consume)                           | Matches the repo's existing short-lived-record TTL precedent                                                                   |
| Determinism           | Integer/base-unit `bigint` only; quotes pinned to `{block, timestamp}` snapshot + **snapshot hash**; identical inputs → identical route | Explicit spec requirement; explanation derived from selected numbers, not text                                                 |

### Constraints the mirror must enforce (from `_validateLegs`, in order)

beneficiary == user · token match · state ∈ {ELIGIBLE, PARTIALLY_FUNDED} · `IssuerRegistry.isActive`
· vault active · `quoteAndCheck.ok` (mandate: supported type bitmap, issuer allowlist, `[minFace,
maxFace]`, `maxDurationDays`) · `advance ≥ minimumAdvanceAmount` · **per-distinct-vault** reserved
advance ≤ cached `fundableLiquidity()` · no duplicate `claimId` · `legs.length ≤ 8` · `totalFace ≤
maxTotalFace` · `totalAdvance ≥ targetAdvance`. Remaining face = `faceValue − financedFaceValue`.
`daysToDue` uses integer-floor division by `1 days` — the mirror must floor identically.

### Reason-code vocabulary (rejected alternatives)

`UNSUPPORTED_CLAIM_TYPE`, `ISSUER_INACTIVE`, `VAULT_INACTIVE`, `BELOW_MIN_LOT`, `ABOVE_MAX_LOT`,
`EXCEEDS_DURATION`, `INSUFFICIENT_LIQUIDITY`, `QUOTE_EXPIRED`, `MAX_LEGS_REACHED`,
`HIGHER_MARGINAL_COST` (feasible but economically dominated), `MAX_COST_EXCEEDED`,
`TARGET_UNSATISFIABLE`.

### Non-executable result

When no valid route exists (max-cost/max-face makes it infeasible, insufficient aggregate
liquidity, no eligible candidates, all quotes expired), `/optimize` returns a **structured
non-executable** object — never a partial route dressed up as executable:

```
{
  executable: false,
  reasonCode,                 // top-level cause, e.g. TARGET_UNSATISFIABLE, MAX_COST_EXCEEDED,
                              //   INSUFFICIENT_LIQUIDITY, NO_ELIGIBLE_CANDIDATES, ALL_QUOTES_EXPIRED
  shortfallAdvance,           // base-unit string: targetAdvance − maxAchievableAdvance (≥ 0)
  maxAchievableAdvance,       // best advance reachable under all constraints (string)
  bestFeasiblePartial?,       // optional: the cheapest legs that WOULD satisfy the reachable advance
  rejected[],                 // same per-candidate reason codes as a successful route
  explanation                 // deterministic, derived from the numbers above
}
```

No `routeId`/intent is persisted for a non-executable result. `retainedFace` per selected claim =
`faceValue − financedFaceValue − faceAssignedThisRoute` (the face left unfinanced after this route).

## Test Matrix (from spec, mapped)

Single cheapest partial payroll slice · large payroll+stream combo · cheaper quote lacking liquidity
· unsupported claim type · max-cost makes route infeasible → structured non-executable · expired
quote · equal-cost deterministic tie-break · min-lot & rounding boundary · claim nearly fully
financed (small remaining face) · no eligible route · **fuzz random small portfolios vs brute-force
reference** (assert optimality; document any bounded lot-rounding overshoot). Parity test:
off-chain mirror vs `_validateLegs` acceptance decisions.

## Acceptance Criteria

- Demo scenarios produce deterministic intended routes.
- Returned route passes the off-chain `MaturaRouter` mirror (and, at execution, the on-chain
  `executeRoute` recompute) — infeasible inputs return a structured **non-executable** result, never
  a bogus route.
- Explanation derived from actual selected numbers, not LLM text.
- Unit + property tests pass.
- `docs/routing.md` explains objective, constraints, complexity, the linear-pricing insight, and why
  greedy is appropriate (and optimal) at MVP scale.

## Resolved Questions

1. **Route-intent identity** — **Deterministic content hash.** `routeId = hash(wallet,
quoteSnapshotHash, canonical legs, targetAdvance, caps, routeDeadline)`. The on-chain
   `routerNonce` and the final `ExecutionRoute.deadline` are bound at **prepare-execution**, not at
   optimize, so the nonce can't go stale. Re-optimizing identical inputs returns the same `routeId`
   (idempotent), reinforcing determinism.
2. **Intent TTL vs route `deadline`** — **120s intent TTL, deadline bound at prepare.**
   `intent.expiresAt = optimizeTime + 120s` (a freshness guard for liquidity/claim-state, since
   pricing drift is favorable). `prepare-execution` re-validates against a fresh finalized block
   regardless, and sets `ExecutionRoute.deadline = min(user-supplied routeDeadline, now + 300s)`. An
   expired intent forces a re-optimize.
3. **Claim-vault assignment** — **One claim → one vault per route** (contract-enforced by
   `DuplicateClaimInRoute`, MaturaRouter.sol:165-172). The optimizer assigns each selected claim to
   its single cheapest eligible vault, `faceAmount ≤ remainingFace`, up to `MAX_LEGS = 8` claims.
   When a vault's liquidity/`maxFace` caps the draw, the optimizer takes less from that claim and
   moves to the next — **no intra-route split**. (`MAX_SLICES_PER_CLAIM = 8` governs slices across
   _separate_ financing events over time, not within one route.)
4. **Parity-test mechanism** — **Golden vectors from the contracts suite.** The Hardhat suite exports
   JSON fixtures (route inputs → `quoteAndCheck` outputs, accept/reject decision, aggregates);
   `packages/shared` + `apps/api` tests load them and assert the optimizer/mirror reproduces the same
   accept/reject + totals. Deterministic, fast, no live node in CI. Pricing itself is **not**
   reimplemented — it is read from on-chain `quoteAndCheck`; the mirror only reproduces the
   aggregation/acceptance logic (`_validateLegs` + route-level checks).

## Next

Run `/workflows:plan` to design the module layout, Prisma migration, mirror/parity strategy, and the
optimizer's `bigint` interface.
