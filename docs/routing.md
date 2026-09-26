# Deterministic Best-Execution Router

Matura's core differentiator. Given a wallet's `targetAdvance` and a list of its
claim ids, the router deterministically selects the **cheapest verifiable route** — a
set of `(claimId, vault, faceAmount)` legs — that the on-chain
`MaturaRouter.executeRoute` will independently accept.

- Pure optimizer: `packages/shared/src/routing/{optimize,arithmetic,optimize-io,reasons,candidate,explanation}.ts`
- API pipeline: `apps/api/src/routes/{routes.service,quote-collector,route-hash,route-intent.service,routes.dto}.ts`
- On-chain reference: `packages/contracts/contracts/MaturaRouter.sol` (`_validateLegs`) and
  `libraries/MaturaPricing.sol` (the pricing formula).

The optimizer is a pure `bigint`-only function; the API pipeline collects pinned
chain state, runs the optimizer, persists a short-lived intent, and later re-validates
against a fresh block before emitting EIP-712 typed data to sign.

## 1. Objective and constraints

**Objective:** meet `targetAdvance` at **minimum total cost** (equivalently, minimum
assigned face, since cost is a monotone function of face at a fixed rate). The
comparator `isBetter` (`optimize.ts`) ranks feasible allocations by, in order:

1. lower `totalCost`;
2. fewer legs;
3. lower `totalFace`;
4. stable lexicographic `(claimId, vault)` leg key.

This chain is deterministic: identical inputs at the same pinned block yield a
byte-identical route.

**Constraints** (enforced across the collector, the optimizer, and the on-chain
contract):

- **Remaining face** — a leg draws at most `remainingFace = faceValue − financedFaceValue`.
- **Per-vault liquidity aggregation** — advances are summed **per distinct vault** and
  must not exceed that vault's `fundableLiquidity()` snapshot (mirrors
  `MaturaRouter._validateLegs`, which accumulates `reserved[vi]` and reverts on
  `reserved[vi] > fundable[vi]`). Liquidity is denominated in advance/settlement units,
  so face caps are derived from it via the pricing curve.
- **Supported claim-type bitmap** — `(mandate.supportedTypesBitmap >> claimType) & 1`.
- **Issuer eligibility** — `IssuerRegistry.isActive(issuer)` (global), re-checked per leg.
- **Vault active** — `VaultRegistry.isActive(vault)` (`getVaults()` returns _all_ vaults;
  the collector filters to active-only).
- **Token match** — `vault.token() == claim.token`.
- **`maxDurationDays`** — `(dueDate − blockTimestamp) / 86400 ≤ mandate.maxDurationDays`;
  a past-due claim is rejected outright.
- **Lot bounds** — face ≥ `mandate.minFace` (min lot) and ≤ `min(mandate.maxFace, remainingFace)`.
- **`MAX_LEGS = 8`** — at most 8 legs per route (`MaturaConstants.MAX_LEGS`,
  `MAX_ROUTE_LEGS` in `optimize-io.ts`).
- **One claim → one vault** — a claim appears at most once per route
  (contract-enforced via `_requireNoDuplicateClaims`; no intra-route split).
- **Slice count** — `slicesRemaining = MAX_SLICES_PER_CLAIM (8) − sliceCount > 0`.
- **Integer base-unit arithmetic** — every money value is a `bigint`/base-unit string;
  no floats, no `Math.floor`, no `1e4`. `advance`/`discount` round exactly as Solidity does.
- **Determinism** — no `Date`/`Math.random`/network/DB in the optimizer; a fixed
  canonical candidate ordering feeds both selection and hashing.

## 2. The size-independent (linear) pricing assumption

The optimizer treats each `(claim, vault)` candidate as having a **size-independent
discount rate** `rateBps`, recovered once from a probe quote at `maxFace`:

```
rateBps = ceil(discountAmount * 10_000 / maxFace)   // quote-collector.ts, ceilRateBps
```

Selection then computes advance directly from face via the one reimplemented formula
(`arithmetic.ts`), which mirrors `MaturaPricing` exactly (discount rounds **up**,
advance rounds **down**):

```
advance(face, bps) = face − ceilDiv(face * bps, 10_000)
```

This is an **assumption**, not a theorem: it holds because on-chain `totalBps`
(`baseDiscountBps + durationBpsPerDay * daysToDue + premiumBps`) depends only on the
mandate, claim type, and maturity — **not on face**. It is pinned to reality by
golden-vector tests that assert the reimplemented `advance(face, bps)` matches
`quoteAndCheck` across multiple face sizes on one `(claim, vault)` (a rounding
non-linearity at the margin would only surface in a vector, since the property test
shares the same assumption).

**Favorable drift.** `daysToDue` is non-increasing as `block.timestamp` advances, so
`totalBps` can only fall and `advance` can only **rise** between the optimize block and
the (later) prepare/execution block — until the claim goes past due, when the quote
fails. Because delay only increases advance, the optimizer's advance is a conservative
lower bound, and the authoritative re-quote at prepare meets or exceeds it. (At a
day-rollover the advance jumps up; equality holds only at the same block.)

## 3. Algorithm

`optimizeRoute(input)` (`optimize.ts`) dispatches on the number of **distinct claims**:

- **≤ `EXACT_SEARCH_MAX_CLAIMS` (= 12): bounded exact search — optimal.** `exactSearch`
  recurses over claims; for each claim it either skips it or chooses **exactly one** of
  its eligible vaults, pruning any branch with more than `maxLegs` chosen. For each
  chosen subset it runs `fillByRate` (greedy min-cost face allocation: cheapest rate
  first, honoring per-vault liquidity aggregation, min-lot smallest-unavoidable
  overshoot, and `maxFace`), keeps only allocations that meet `target` (and the caps),
  and retains the best under `isBetter`. Enumerating the _vault choice_ per claim is what
  a pure cheapest-vault-per-claim greedy would miss (the rate-vs-capacity trade-off);
  vault assignment within a subset stays greedy (never `V^k`).

  Complexity is bounded by the branching `(1 + vaultsPerClaim)^claims`, capped by the
  `maxLegs ≤ 8` prune — not `2^n` over all subsets. At the MVP scale (≤ 12 distinct
  claims, a handful of vaults each) the worst case is a few milliseconds of synchronous
  `bigint` work. This is a synchronous, event-loop-blocking search; the `= 12` bound
  keeps that block short, and the DTO layer independently caps request size before any
  chain read (that is the DoS control — see §8).

- **> 12 distinct claims: cheapest-vault-per-claim greedy — approximate.** Each claim is
  reduced to its cheapest vault; `fillByRate` allocates across them. If it meets target
  within the caps the route is returned, otherwise `TARGET_UNSATISFIABLE`.

**`approximation` disclosure.** `RouteResult.approximation` is `"exact"` for the bounded
search and `"greedy"` for the degraded fallback, so a client never sees a possibly
sub-optimal route under the "cheapest route" headline. (The `explanation.strategy`
field carries the finer label: `"bounded-exact"` or `"greedy-degraded"`.)

**Infeasible inputs** return a structured `NonExecutableResult` (never a bogus route):
`NO_ELIGIBLE_CANDIDATES` (empty input), `MAX_COST_EXCEEDED` (target reachable but caps
block it — distinguished by re-running the search with caps ignored), or
`TARGET_UNSATISFIABLE`. It carries `shortfallAdvance`, `maxAchievableAdvance` (from a
capacity-maximizing greedy), and a `bestFeasiblePartial` when one exists.

Because this is bounded and appropriate **only at MVP scale**, growth beyond a small
domain would require replacing the exact search (e.g. an ILP / min-cost-flow model)
rather than raising the cap.

## 4. Two-phase pipeline

### Phase 1 — `POST /api/v1/routes/optimize`

`RoutesService.optimize` (wallet from the SIWE JWT, never the body):

1. Pin one finalized block: `chain.getFrontierBlock()` → `contracts.pinnedAt(number)`
   returns a `PinnedReads` facade so **every** read in the request shares one block
   (structurally impossible to read at `latest`).
2. Short-circuit if `routerPaused()` (fail-closed → all claims filtered as `ROUTER_PAUSED`).
3. `collectCandidates` fans out concurrent read waves (vaults, then per-claim /
   per-vault quotes) all pinned to that block, filtering to `beneficiary == wallet`
   before quoting and mapping every hard-constraint failure to a machine reason.
4. Run the pure `optimizeRoute`.
5. If executable: compute `quoteSnapshotHash` + `routeId`, then persist a `RouteIntent`
   (`createIfAbsent`) with a 120s TTL, and return `{ routeId, expiresAt, result,
filteredOut, blockNumber, finalizedThrough }`.

The returned `advance`/`cost`/`effectiveDiscountBps` are **estimate-at-block**, tied to
`blockNumber`/`finalizedThrough` in the response. They are advisory; the authoritative
gate is the re-quote at prepare.

### Phase 2 — `POST /api/v1/routes/:routeId/prepare-execution`

`RoutesService.prepareExecution`:

1. **Atomic single-use consume** (`intents.consume`): a guarded `updateMany
… WHERE status='PENDING' AND expiresAt > now()` flips the row to `CONSUMED`; exactly
   one concurrent caller wins. A 0-row result is classified via a **user-scoped**
   lookup (never a cross-user status oracle).
2. Re-pin a **fresh** finalized block and re-check `routerPaused()`.
3. **Authoritative re-quote + re-mirror** (`revalidateLegs`): each stored leg is
   re-validated on-chain at its exact chosen `faceAmount`, and `minimumAdvanceAmount` is
   set to that **fresh re-quoted advance**. Per-vault advances are re-aggregated against
   a fresh `fundableLiquidity()`. Then `totalAdvance ≥ targetAdvance` and
   `totalFace ≤ maxTotalFace` are re-checked.
4. Bind the router **nonce** (`routerNonce(user)`) and a **bounded deadline**
   `min(userDeadline, now + 300s)`, refusing if it is within a 30s margin of now.
5. Emit the `ExecutionRoute` EIP-712 typed data (`buildExecutionRouteTypedData`); the
   `executionId` is `hashTypedData` of the **bigint** message.

The re-quote/re-mirror at prepare is the **authoritative gate**. The optimizer's
feasibility logic is advisory: any optimizer bug surfaces as a spurious
`NonExecutableResult` or a prepare-time 422 (a false negative), never as a route that
reverts on an `_validateLegs`-checkable condition. On any re-validation failure the
consumed intent is marked `FAILED` (fail-closed) and the error propagates.

## 5. Off-chain mirror scope

The mirror reproduces `MaturaRouter._validateLegs` (and route-level checks) off-chain.
It appears in two places: the **collector** (candidate qualification, with per-failure
reasons) and **`revalidateLegs`** (the authoritative prepare-time gate).

**Mirrored `_validateLegs` checks:** `beneficiary == user` · `vault.token() == claim.token`
· state ∈ {ELIGIBLE, PARTIALLY_FUNDED} · `IssuerRegistry.isActive(issuer)` ·
`VaultRegistry.isActive(vault)` · `quoteAndCheck.ok` · `advance ≥ minimumAdvanceAmount`
(at prepare, `minimumAdvanceAmount` _is_ the re-quoted advance, so this is trivially
satisfied) · **per-distinct-vault** reserved advance ≤ cached `fundableLiquidity()` ·
no duplicate `claimId` · `legs.length ≤ MAX_LEGS` · `totalFace ≤ maxTotalFace` ·
`totalAdvance ≥ targetAdvance`.

**Additions beyond `_validateLegs`:** router `paused()` (checked first, fail-closed) and
per-claim `slicesRemaining > 0` (`reserveSlice` reverts in the effects phase, so it is
un-mirrorable from `_validateLegs` alone).

Dedup, `MAX_LEGS`, and slice-count are enforced at collection/optimize time (the
optimizer only ever emits ≤ 8 legs, one per claim, from candidates that already passed
slice-count); the prepare-time mirror re-checks the per-leg on-chain predicate plus
per-vault aggregation and the route totals.

**Documented out of mirror scope (surfaced as _expected_ failures, not bugs):**

- **Effects-phase reverts** inside `reserveSlice` / `registerAllocation` / `vault.fund`
  beyond the slice-count already checked — not reachable by a `view` mirror.
- **Nonce bump between prepare and submit** — if the user's router nonce advances after
  prepare, the transaction fails with the expected `InvalidAccountNonce`. The bounded
  deadline keeps this window short.

## 6. `minimumAdvanceAmount` is the only on-chain cost floor

`ExecutionRoute` has **no cost field on-chain**. The only per-leg economic guarantee the
contract enforces is `advance ≥ minimumAdvanceAmount`. At prepare, each leg's
`minimumAdvanceAmount` is set to its **fresh re-quoted advance** (`revalidateLegs`), so
the signed message pins the exact advance the user is promised. Combined with favorable
drift (§2), this is what makes the client-supplied `maxTotalCost` safe: it is
**advisory** — enforced only inside the optimizer (`withinCaps`), labeled as such in the
response, and never re-checked on-chain.

## 7. Determinism and hashing

- **Content hash** (`route-hash.ts`): `contentHash(v) = keccak256(stringToHex(canonical(v)))`.
  `canonical` sorts object keys, serializes only JSON scalars, and **throws on any
  `bigint`/`undefined`** — so byte-identical determinism is enforced, not incidental
  (every money value must be pre-stringified).
- **`quoteSnapshotHash`** = hash of `{ blockNumber, candidates }` (candidates sorted by
  `(claimId, vault)`).
- **`routeId`** = hash of `{ user, quoteSnapshotHash, legs (sorted), targetAdvance,
maxTotalFace, maxTotalCost, routeDeadlineSeconds }`. The **router nonce is excluded**
  — it is bound only at prepare — so re-optimizing identical inputs at the same block
  yields the same `routeId` (idempotent optimize).
- **`RouteIntent` single-use** (`route-intent.service.ts`):
  - **Create-or-ignore** — `create`, catching the P2002 unique-violation and returning
    the existing row. Never an upsert (an upsert on the content-hash PK could revive a
    `CONSUMED` intent; a collision is byte-identical by construction, so returning the
    existing row is safe).
  - **Atomic consume** — the guarded `updateMany` described in §4.
  - **Opportunistic prune** — a best-effort `deleteMany` of expired-or-consumed rows at
    the top of every optimize (mirrors `AuthNonce`; no cron), backed by
    `@@index([expiresAt])`.
  - **120s TTL** (`ROUTE_INTENT_TTL_SECONDS`); expiry is the `expiresAt > now()`
    predicate, never a persisted status.

## 8. HTTP error semantics

Coded errors (`common/http-errors.ts`) carry a stable machine `code` alongside the HTTP
status.

- **Oversized input** — `claimIds` is capped at `MAX_CLAIM_IDS = 20` in the DTO, so an
  oversized request is rejected **before any chain read** (DoS guard). This is distinct
  from `EXACT_SEARCH_MAX_CLAIMS`, which only bounds the in-optimizer search.
- **Double-prepare / already consumed** — `409 Conflict`, code `ROUTE_INTENT_UNAVAILABLE`.
- **Not found / wrong owner** — `404`, code `ROUTE_INTENT_NOT_FOUND` (identical for
  not-found and wrong-user — no status oracle).
- **Expired intent** — `422`, code `ROUTE_INTENT_EXPIRED` (re-optimize). _(There is no
  `410 Gone` helper today; expiry uses the 422 envelope.)_
- **Post-consume re-validation failed** — `422` with a specific code (`ROUTER_PAUSED`,
  `LEG_NOT_FINANCEABLE`, `ISSUER_INACTIVE`, `VAULT_INACTIVE`, `TOKEN_MISMATCH`,
  `MANDATE_REJECTED`, `TARGET_NO_LONGER_MET`, `INSUFFICIENT_LIQUIDITY`,
  `ROUTE_DEADLINE_TOO_SOON`); the intent is marked `FAILED`. The 422 signals
  "re-optimize", distinct from the 409 conflict.
- **Non-executable optimize** — a `200` with `result.executable = false` and a structured
  reason (not an HTTP error); no intent is persisted.

## 9. Follow-ups

- **Golden-vector differential generator + CI freshness gate not yet implemented.** The
  optimizer is currently validated by a fast-check property test against an independent
  brute-force reference (feasibility, optimality-by-value, deterministic tie-break) plus
  an arithmetic parity unit test against the Solidity rounding. The full Hardhat
  generator that dumps `quoteAndCheck` / accept-reject / aggregate vectors — and the
  regenerate-and-`git diff` freshness gate mirroring the ABI/manifest gates — is still
  outstanding. Until it lands, the multi-face **linearity assumption** (§2) is not yet
  pinned to on-chain reality by a committed vector.
- **`executions-prepare` mirror not yet unified.** The existing `/executions/prepare`
  service still lacks the token / issuer / vault-active checks that this module's
  `revalidateLegs` mirror adds. Extracting one shared per-leg `evaluateLeg` predicate
  used by the collector, `revalidateLegs`, and `executions-prepare` is a follow-up.
