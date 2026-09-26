---
title: "Best-execution router: off-chain _validateLegs mirror, single-use intents, and a bounded optimizer"
category: integration-issues
tags:
  [
    apps-api,
    shared,
    optimizer,
    prisma,
    viem,
    eip712,
    single-use,
    determinism,
    bigint,
    ts-eslint,
    routes,
  ]
module: "apps/api (routes), @matura/shared (routing)"
symptom: "Building an on-chain best-execution router that must not revert, must be deterministic + single-use, and must not blow up the event loop or 500 on valid input."
root_cause: "Off-chain approximations of on-chain validation drift; unbounded combinatorial search; Prisma prune races the single-use consume; ceil-rate recovery overshoots; TS/ESLint disagree on template-literal Hex in specs."
date: 2026-09-26
related:
  - docs/routing.md
  - docs/solutions/build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md
  - docs/plans/2026-09-26-feat-best-execution-router-plan.md
pr: 4
---

# Best-execution router: mirror, intents, optimizer

Hard-won, reusable learnings from building the deterministic best-execution router
(`packages/shared/src/routing/*` pure optimizer + `apps/api/src/routes/*` orchestration) and
the code-review pass that followed (PR #4). Each item is a trap that cost real time or would
have shipped a latent bug.

## 1. There is ONE off-chain mirror of `_validateLegs` — never fork it

`MaturaRouter.executeRoute` validates a backend-proposed route on-chain and reverts if any leg
fails. Any endpoint that prepares a signable `ExecutionRoute` must mirror those checks off-chain
so it never hands the user typed data that reverts. **The trap:** the mirror gets partially
re-implemented in each prepare flow and they drift. In this repo `executions-prepare` shipped
_missing_ the `token == vault.token()`, `IssuerRegistry.isActive`, and `vaultRegistry.isActive`
checks (its `isFinanceable` only covers existence + state), so it could emit a route that
reverts with `IssuerInactive`/`VaultNotActive`/`TokenMismatch`.

**Fix / rule:** keep exactly one shared predicate — `apps/api/src/common/leg-mirror.ts`
`validateRouteLegs(reads, user, legs)` — consumed by every prepare flow. It also enforces the
**effects-phase** checks that `_validateLegs` itself does _not_ (they revert later in
`ClaimRegistry.reserveSlice`): remaining face (`faceAmount ≤ faceValue − financedFaceValue` →
`OverAssignment`) and slice count (`sliceCount < MAX_SLICES_PER_CLAIM` → `MaxSlicesExceeded`),
plus `_requireNoDuplicateClaims`. `getVaults()` returns **all** vaults, not active-only — always
check `vaultRegistry.isActive` per vault.

Collection-time mandate pre-filters (supported-type bitmap, duration, min-lot) are for
**rejection-reason granularity only**; `LiquidityVault.quoteAndCheck(...).ok` remains the
authoritative gate, so a pre-filter can at worst mislabel — never accept — a candidate.

## 2. Determinism needs a pinned-read facade, not an optional block arg

A deterministic route + a meaningful quote-snapshot hash require every read in a request to land
on **one** block. An optional `blockNumber?` on each reader re-introduces the exact bug (a
forgotten arg silently reads `latest`).

**Fix:** `ContractsService.pinnedAt(blockNumber)` returns a `PinnedReads` facade whose methods
take **no** block argument — it is structurally impossible to read `latest` through it. `optimize`
pins the finalized frontier; `prepare-execution` pins a _fresh_ frontier (re-validation must be
current). Also: `getFrontierBlock()` already fetches the full block, so put `timestamp` on
`BlockRef` and reuse it — don't issue a second `getBlock` for the timestamp.

## 3. Single-use intents: create-or-ignore, and prune EXPIRED-ONLY

A short-lived `RouteIntent` (mirrors the `AuthNonce` pattern) is consumed once at prepare. Two
traps:

- **Never `upsert`** on the content-hash `routeId` — re-optimizing identical inputs would reset a
  `CONSUMED` row to `PENDING` (single-use bypass). Use create-or-ignore
  (`create` + catch `P2002` → `findUniqueOrThrow`).
- **Prune expired rows ONLY.** An opportunistic prune of `status = 'CONSUMED'` (à la
  `AuthNonce`) is wrong here because the two-step consume (`updateMany` guard → `findUniqueOrThrow`)
  can have the just-consumed row deleted out from under it by a concurrent `optimize`'s prune →
  `P2025` → unhandled 500. Pruning CONSUMED also lets delete+recreate revive a spent `routeId`.
  Prune `WHERE expiresAt < now()` only (single indexed predicate; keeps CONSUMED/FAILED durable).

The **on-chain nonce is the real replay guard** — the intent table is a UX/idempotency layer, not
the security boundary. Say so in comments so nobody "hardens" it into a race.

## 4. Bound the combinatorial optimizer — vault fan-out is unbounded

A per-claim vault-choice search branches `1 + vaultsPerClaim` per claim. Capping _claims_ (and
legs) is not enough: nothing caps the vault count, so `Σ C(n,k)·Vᵏ` explodes and blocks the
single-threaded Node event loop for the whole process (an auth'd DoS). The "few ms" intuition
also ignores per-leaf cost (binary-search inversions + a re-sort).

**Fix:** a hard **leaf budget** (`SEARCH_LEAF_BUDGET`) that aborts the search and falls back to a
greedy result marked `approximation: "greedy"`; track the caps-respecting and caps-ignoring optima
in one pass. Also require **≥1 leg** for an executable route (an empty route reverts `EmptyRoute`
on-chain and a `targetAdvance = 0` would otherwise yield a bogus executable-empty result).

## 5. Recovering a rate by dividing an already-ceil-rounded discount overshoots

`ceilRateBps = ⌈discount·10000 / face⌉` double-ceils the on-chain `ceil` discount. At the rate
ceiling (`MAX_DISCOUNT_BPS = 3000`) with a non-dividing face it returns **3001**, exceeding the
`RouteCandidate.rateBps.max(3000)` bound → `ZodError` → **500 on a valid, mandate-accepted quote**.
**Clamp to 3000** (the estimate only drives selection; the leg is re-quoted on-chain at prepare).
Guard `face > 0` before the division (a degenerate `minFace = 0` mandate divides by zero).

## 6. `maxTotalCost` has no on-chain field — enforce it at prepare

`ExecutionRoute` carries only `targetAdvance` + `maxTotalFace`; there is no cost cap on-chain, and
the signed per-leg `minimumAdvanceAmount` only bounds cost at the _worse, fresh_ price. So an
advisory `maxTotalCost` accepted at optimize can be silently exceeded if pricing drifts within the
TTL. **Compute `totalFace − totalAdvance` at prepare and reject if it exceeds `maxTotalCost`.**

## 7. Rate-limit authenticated routes by wallet, not IP

The stock `ThrottlerGuard` keys on IP, so a wallet dodges per-principal limits by rotating IPs (and
NAT'd wallets share one budget). Subclass it with `getTracker → request.wallet ?? ip`, and register
`WalletAuthGuard` **before** the throttler guard so the wallet is resolved when the tracker runs.

## 8. `0x${string}` (Hex) in specs: `tsc` and ESLint/ts-jest disagree

`ts-jest` (isolatedModules) and `eslint`'s type-checker infer a bare `` `0x${x}` `` template as the
literal type `` `0x${string}` `` (= viem `Hex`), so both pass — but the project `tsc --noEmit`
widens it to `string` and fails where a `Hex` is required. Worse, ESLint flags an inline `as Hex`
as an "unnecessary assertion" while `tsc` requires it. **Net:** jest + lint can be green while the
monorepo typecheck is red, and the pushed branch fails CI.

**Fix:** route spec fixtures through a typed helper with an explicit return annotation and **no**
assertion: `const hex = (fill: string): Hex => ` + `` `0x${fill}` `` `;`. The `: Hex` context types
the template literal (satisfies `tsc`) and there's no assertion (satisfies ESLint). Always run the
project-wide `pnpm typecheck` before pushing — per-package/jest green is not sufficient.

## 9. BigInt never crosses JSON; re-parse Prisma `Json` on read-back

Money is `bigint` internally, decimal base-unit **strings** at every boundary. Keep `BigInt`
columns (e.g. `blockNumber`) out of any response path (`.toString()` at the DTO). On read-back,
re-parse `Json` columns through a Zod schema (`RouteIntentPayload.parse(...)`) — never cast
`Prisma.JsonValue` to a branded type; the cast passes `strictTypeChecked` but silently asserts
brands + refinements that were never re-checked across the serialization boundary.

---

## Prevention checklist (for the next on-chain-prepare feature)

- [ ] One shared, pinned leg-validation mirror; include effects-phase reverts (slice/remaining).
- [ ] `PinnedReads` facade for every request read; no optional `blockNumber` that defaults to `latest`.
- [ ] Prune short-lived rows expired-only; create-or-ignore, never upsert.
- [ ] Any combinatorial search has a hard budget + deterministic fallback.
- [ ] Clamp recovered/derived rates to the on-chain ceiling; guard divisors.
- [ ] Enforce off-chain-only caps (e.g. `maxTotalCost`) at the authoritative (prepare) step.
- [ ] Throttle authenticated routes by principal; auth guard before throttle guard.
- [ ] Spec `Hex` fixtures via a typed helper; run monorepo `pnpm typecheck` (not just jest/lint).
- [ ] BigInt→string at boundaries; re-parse `Json` through Zod, never cast.
