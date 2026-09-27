---
title: Security & Correctness Hardening Pass
type: fix
date: 2026-09-27
brainstorm: docs/brainstorms/2026-09-27-security-hardening-pass-brainstorm.md
---

# 🛡️ Security & Correctness Hardening Pass

## Overview

Adversarial-verification hardening pass over the Matura MVP (contracts + API/indexer +
frontend). The codebase is already strongly hardened (OZ 5.6.1 `AccessControl`, EIP-712
nonces + deadlines, `ReentrancyGuardTransient`, single-block-pinned router mirror, single-use
route intents, fail-closed SIWE/JWT, atomic advisory-locked indexer cursor, ~55 security tests,
zero core placeholders). So this pass is **prove the controls hold + close documented gaps +
fix any real P0/P1 the red-team surfaces** — not a rescue.

The task's adversarial-test list is used as the discovery engine: for each scenario, write the
attack test; if the control holds it becomes a proof-of-control regression test; if it fails
that's a confirmed finding → fix per the severity rubric + keep the test as a regression guard.

**Approach (from brainstorm):** adversarial-tests-led · testnet-hardened bar · even split across
layers · fix P0/P1 as found, report the rest. **Docs scope:** extend threat-model to full stack +
`SECURITY.md` + operator checklist.

**User constraints for this plan:** no `any` anywhere (repo rule; type-aware ESLint); follow
existing base-code test idioms exactly; structure as independent parallel workstreams;
create/update tests for every gap.

## Severity Rubric (fix-vs-document boundary)

- **P0** — funds/claims stealable or destroyable, secret leak, or demo cannot run. Always fix + regression test.
- **P1** — accounting corruptible, control bypassable, or state desync (indexer/reconciliation) without direct theft. Always fix + regression test.
- **P2** — griefing, edge-case DoS, defense-in-depth. Fix only if clean/low-risk under the testnet-hardened bar; else document as accepted risk.
- **Accepted risk** — out-of-scope by design (see §Accepted Risks) or a P2 not worth fixing. Documented in `threat-model.md`, never silently dropped.

## Problem Statement / Motivation

A pre-demo hardening pass needs (1) confidence the on-chain and off-chain controls actually
enforce what the threat model claims, (2) closure of concrete coverage gaps the research surfaced,
and (3) a disclosure policy + operator runbook so the demo is run safely and no secret leaks. The
research found the controls are sound in code but several are **asserted only by the threat model,
not by any test** — those untested claims are the real risk surface for a hardening pass.

## Proposed Solution — 4 Parallel Workstreams

Work is split by **disjoint top-level directory** so streams run concurrently with no file
contention. Each stream owns its adversarial tests AND any P0/P1 fix those tests surface (fixes
land in the same directory the stream owns).

| Stream                   | Directory (exclusive)               | Scope                                                                                              | Toolchain                                                                                                                                                                 |
| ------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Contracts**        | `packages/contracts/`               | On-chain adversarial + invariant tests; contract fixes if found                                    | **Node 24** (`export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`); `hardhat test` (node:test + `node:assert/strict`, `viem.assertions.revertWithCustomError`, fast-check) |
| **B — API/Indexer**      | `apps/api/`                         | Off-chain adversarial (auth, indexer, route-intent, mirror, redaction, HTTP) + fixes               | Jest: `test` (`*.spec.ts`), `test:int` (`*.int-spec.ts`, Testcontainers, **Docker**), `test:e2e` (`*.e2e-spec.ts`, supertest)                                             |
| **C — Frontend/secrets** | `apps/{app,landing,e2e,e2e-stack}/` | Product-bundle secret guard, pin-to-manifest defense, cross-stack spot-checks                      | Vitest (`apps/app`); Playwright (`apps/e2e`); node driver (`apps/e2e-stack`)                                                                                              |
| **D — Docs & runbook**   | `docs/`, root `SECURITY.md`         | Threat-model extension, `SECURITY.md`, operator checklist, learnings doc, TODO/mock classification | Markdown only                                                                                                                                                             |

### Parallelization & coordination

- **A, B, C run fully in parallel** (disjoint dirs → no merge conflicts). Each can further sub-split
  across the file groups below since those files don't overlap within a stream.
- **D runs in parallel on a skeleton**, but its accepted-risk list and threat-model rows are
  **finalized last**, after A/B/C report findings. Start D immediately with structure + the known
  accepted-risk set; backfill findings on close.
- **Serialization points (single-owner, do first if triggered — expected rare):**
  1. Any edit to `packages/shared` (enum ordinals / optimizer) or `packages/chain` (EIP-712 types /
     ABIs) is cross-cutting — pause dependent streams, apply centrally, rebase. Enum changes are the
     documented 7-site edit guarded by parity tests.
  2. Any **contract source** change that alters an event/error/struct must run
     `contracts:export-abis` (writes `@matura/chain/src/abis`) → affects B and C. Treat ABI regen as
     a serialization checkpoint; re-run the ABI/manifest freshness gates.
- **Recommended execution:** worktree-isolated agents per stream (A/B/C/D). Contract fixes stay in
  A; no stream writes outside its directory except the coordinated serialization points.

---

## Stream A — Contracts (`packages/contracts/`)

Idiom: `import { network } from "hardhat"` → `deployProtocol()` from `./helpers/fixtures.js`; EIP-712
via `./helpers/eip712.js` (`claimRegistryDomain`/`routerDomain`, `CLAIM_ATTESTATION_TYPES`/
`EXECUTION_ROUTE_TYPES`); reverts via `viem.assertions.revertWithCustomError(promise, contract, "Err")`.
Run both `contracts:test` **and** `contracts:typecheck` (node:test type-strips, doesn't type-check).

### A1 — EIP-712 domain hardening _(GAP — threat model claims, untested)_

`test/ClaimRegistry.test.ts`, `test/MaturaRouter.test.ts` (extend); helper: add foreign-domain signer to `helpers/eip712.ts`.

- [ ] `rejects an attestation signed under a foreign chainId` → `InvalidSigner`/`InvalidSignature`
- [ ] `rejects an attestation signed for a different verifyingContract`
- [ ] `rejects a route signed under a foreign chainId`
- [ ] `rejects a route signed for a different verifyingContract`

### A2 — Settlement edge paths _(GAP/PARTIAL)_

`test/SettlementManager.test.ts`, `test/LiquidityVault.test.ts`, `test/integration/RouteToSettlement.test.ts`.

- [ ] `emits SettlementReturnFailed when vault callback reverts (revoked SETTLEMENT_ROLE); claim still PAID; no ConservationViolation` _(gap l — `SettlementManager.sol:126-132`)_
- [ ] `settles a partially-funded claim: vault gets financed, beneficiary residual == face − financed` _(C2 / short-payment)_
- [ ] `underfunded payer → settleClaim reverts atomically and claim stays settleable (isSettled==false)` _(C2 — proves `_settled=true`-before-transfer rolls back, `SettlementManager.sol:111-114`)_
- [ ] `payer approves wrong token → settleClaim reverts (allowance on immutable _token short)` _(gap h)_
- [ ] `feeBps raised after approve → settleClaim reverts, no partial state, still settleable`

### A3 — Pause scope & no-confiscation invariants _(C1 — highest priority)_

`test/LiquidityVault.test.ts`, `test/integration/RouteToSettlement.test.ts`.

- [ ] `settles a matured claim while router+vault are PAUSED (pause cannot strand funds)` _(C1)_
- [ ] `withdraw drains only idle liquidity; payer-funded settlement still succeeds after withdraw-all` _(`LiquidityVault.sol:216-220`)_
- [ ] `writeOffClaim moves zero tokens: balanceOf unchanged, only exposure counters clear` _(`:225-233`)_
- [ ] `writeOff(A) then external settle(A) → SettlementReturnFailed emitted, PAID, no double-decrement of _outstandingPrincipal` _(Q2a edge)_

### A4 — Access control & role initialization _(GAP)_

New `test/AccessControl.test.ts` (or per-contract).

- [ ] `no address holds both ROUTER_ROLE and SETTLEMENT_ROLE post-deploy` _(threat-model claim, untested)_
- [ ] `fund / reserveSlice / registerAllocation / releaseSlice revert AccessControlUnauthorizedAccount from a random EOA`
- [ ] `constructor grants expected admin/pauser/treasury; feeBps == 0`

### A5 — Multi-leg routing atomicity _(C5)_

`test/MaturaRouter.test.ts`.

- [ ] `mid-route leg failure rolls back ALL legs AND does not burn the user nonce (route retryable)` _(C5 — `MaturaRouter.sol:82,91-104`)_
- [ ] `MAX_LEGS legs succeed; MAX_LEGS+1 reverts MaxLegsExceeded; 0 legs → EmptyRoute`
- [ ] `two legs on one vault whose combined advance exceeds fundable → InsufficientLiquidity (no stale snapshot)` _(`:145-161`)_

### A6 — claimId uniqueness & externalId reuse _(C4 — freed-externalId path untested)_

`test/ClaimRegistry.test.ts`.

- [ ] `re-attest same externalIdHash under a NEW claimId succeeds after reject` _(`ClaimRegistry.sol:143,255-258`)_
- [ ] `same after revoke (only when financedFaceValue==0)`
- [ ] `re-using externalId BEFORE reject/revoke → DuplicateExternalId`
- [ ] `re-using the same claimId always → DuplicateClaimId (claimId never freed)`

### A7 — Reentrancy: proof-of-pinning + proof-of-guard _(Q1 resolution)_

New test-only mock: `packages/contracts/contracts/mocks/MaliciousToken.sol` (reentrant transfer callback) — **test-only, excluded from ABI export/manifest**. Tests in `test/MaturaRouter.test.ts` / `test/SettlementManager.test.ts` / `test/LiquidityVault.test.ts`.

- [ ] proof-of-pinning: `registerClaim/registerFromSource reject non-settlement token → TokenNotSettlement` (`ClaimRegistry.sol:65,126`); `router rejects claim↔vault TokenMismatch` (`MaturaRouter.sol:127`); asset immutables wired to the one token
- [ ] proof-of-guard: `reentrant token callback into fund/executeRoute/settleClaim is blocked by nonReentrant (+ AlreadySettled defense-in-depth)`
- [ ] (optional, defensive) `MockNoReturnToken` → SafeERC20 reverts rather than silently continuing _(SafeERC20 non-standard return; low value since token is immutable — 1 unit test max)_

### A8 — TOCTOU & concurrent financing _(gap f / e)_

`test/MaturaRouter.test.ts`.

- [ ] `quote → admin withdraw drains vault → executeRoute reverts InsufficientLiquidity` _(f)_
- [ ] `second route financing the same claim in the same block reverts OverAssignment` _(e — interleaved race)_

---

## Stream B — API / Indexer (`apps/api/`)

Idiom: unit specs hand-roll DI (`... as unknown as XService`) + `jest.mock("viem/siwe", …)`;
int-specs use `startTestDb()` from `test/db/postgres-testcontainer.ts` and call `applyEvent(tx, e, ctx)`
inside `prisma.$transaction`; e2e-specs use `Test.createTestingModule` + `supertest`, replicating
`main.ts` bootstrap (helmet + `enableCors` + `setGlobalPrefix("api")` + URI versioning).

### B1 — Route-intent single-use _(GAP — `route-intent.service.ts` has NO spec)_

New `test/route-intent.int-spec.ts` (real Postgres for the atomic `updateMany` guard).

- [ ] `consume returns the row exactly once; concurrent double-consume → one row, the other null` _(`route-intent.service.ts:65-72`)_
- [ ] `expired intent → null`
- [ ] `createIfAbsent never revives a CONSUMED/FAILED routeId on identical re-optimize` _(`:41-58`)_
- [ ] `losing concurrent prepare-execution marks intent FAILED, not left PENDING`

### B2 — Indexer idempotency / cursor atomicity / reorg / recovery _(GAP — item 10 + split scenarios)_

Extend `test/indexer.int-spec.ts`; add `test/indexer-recovery.int-spec.ts` if it grows large.

- [ ] `API/DB unavailable while chain advanced, then restored → projection == on-chain, cursor past tx block, no duplicate rows` _(item 10, crisp pass/fail)_
- [ ] `replaying an already-projected block range is idempotent (no dup rows, unchanged projection)`
- [ ] `cursor + projections advance together (no half-applied batch under advisory lock)`
- [ ] `block-hash mismatch → full-wipe + reindex yields canonical state` _(extend existing reorg test)_
- [ ] `RouteLegExecuted whose parent claim was skipped (unknown ordinal) → skip, not FK-abort (indexer not wedged)` _(learnings §6)_

### B3 — HTTP security surface _(GAP — no header/CORS/authz/rate-limit test exists)_

New `test/security.e2e-spec.ts` (bootstrap helmet + CORS like `main.ts:26-35`).

- [ ] headers present (prod mode): `X-Content-Type-Options`, HSTS, CSP set
- [ ] CORS: non-allowlisted `Origin` rejected; `"*"` filtered out (`main.ts:33`); empty allowlist blocks all cross-origin
- [ ] rate limit: same wallet over two IPs shares one budget → 429 `TOO_MANY_REQUESTS` (`wallet-throttler.guard.ts:13-17`); public routes fall back to IP
- [ ] authz: no / blank / `Bearer `-only header → 401; JWT for chain A rejected on chain B (`wallet-auth.guard.ts:47`); wallet X cannot read wallet Y `/account` (subject binding)
- [ ] body > 100kb → 413 (`main.ts:27`)

### B4 — Error / log redaction _(C3 — GAP)_

New `test/redaction.e2e-spec.ts` (or unit on `common/api-error.filter.ts`).

- [ ] `raw PrismaClientKnownRequestError → generic 500, body has no meta / stack / SQL`
- [ ] `thrown Error("…secret…") never reaches the client body`

### B5 — Input validation _(GAP)_

`common/amount.util` spec + `routes/routes.service.spec.ts` + relevant DTO specs.

- [ ] money `"1.5"` / `"1e9"` / `""` / negative → 400 (`Uint256StringSchema`, regex `^\d+$`)
- [ ] `EMPTY_ROUTE` on zero legs (`leg-mirror.ts:44`)
- [ ] unknown/extra route-leg fields → assert intentional strip-vs-reject behavior
- [ ] activity `limit` outside `[1,100]` → clamped/rejected (`dto.ts:87`)

### B6 — Off-chain mirror parity + read-through probes _(suspected-defect probes — fix if confirmed)_

`common/leg-mirror.spec.ts`, `claims/read/claims-read.service.spec.ts`, `routes/routes.service.spec.ts`.

- [ ] mirror rejects **inactive issuer** (`IssuerRegistry.isActive`) → coded `ISSUER_INACTIVE` _(learnings #1 — verify parity, fix mirror if missing = P1)_
- [ ] mirror rejects **inactive vault** (`vaultRegistry.isActive`) → `VAULT_NOT_ACTIVE`
- [ ] **RPC read that throws → 5xx, NOT 404 `CLAIM_NOT_FOUND`** _(C6 — verify catch scope uses `BaseError.walk`; if a catch-all masks transport errors, fix = correctness P1)_
- [ ] `maxTotalCost` enforced at prepare (drift-within-TTL) → coded rejection _(no on-chain field)_

### B7 — Env fail-closed regression _(probe → regression; already mitigated)_

`config/env.validation.spec.ts`.

- [ ] `DEMO_ISSUER_SIGNING_ENABLED="false" → false` (proves `z.stringbool`, not `z.coerce.boolean` fail-open) _(`env.validation.ts:46`)_
- [ ] `NODE_ENV=production` + `ISSUER_PRIVATE_KEY` set → boot throws _(`:54-67`)_

---

## Stream C — Frontend / Secrets (`apps/{app,landing,e2e,e2e-stack}/`)

### C1 — Product-app bundle secret guard _(GAP — `check:bundle` is landing-only)_

Extend `apps/e2e/scripts/check-landing-bundle.mjs` (or new `check-app-secrets.mjs` wired into `check:bundle`).

- [ ] assert built `apps/app` bundle contains no `ISSUER_PRIVATE_KEY` / `JWT_SECRET` / `DEPLOYER_PRIVATE_KEY` / `DATABASE_URL` (client-exposed secrets only — wallet/chain code IS expected in the product app, unlike landing)

### C2 — EIP-712 pin-to-manifest defense-in-depth _(learnings #3)_

`apps/app/src/lib/chain/execution-route.test.ts` (extend, Vitest).

- [ ] `a malicious API response with wrong to / verifyingContract is refused against the on-chain manifest` (never trust the API response; pin to manifest)

### C3 — Cross-stack spot-check _(optional, only if cheap)_

`apps/e2e-stack/src/run.ts` already reconciles events↔DB↔balances. Add a TOCTOU assertion only if
it doesn't destabilize the instant-mine harness (respect learnings #2: execute all routes before
any time-warp; override nonce from live `router.nonces(user)`; gate optimize on `finalizedThrough`).
Default: **do not** expand e2e-stack; rely on A8 (on-chain) + B6 (mirror) for TOCTOU coverage.

---

## Stream D — Docs & Runbook (`docs/`, root `SECURITY.md`)

Start skeletons immediately; finalize accepted-risk list + threat rows after A/B/C report.

### D1 — Extend `docs/threat-model.md` to full stack

Current: contract-scoped only (`## Assets`, `## Trust assumptions`, `## Threats and mitigations`, `## Out of scope for P0`).

- [ ] Add `## API & auth surface` (SIWE single-use nonce + chainId assertion, JWT alg-pinned/subject-bound, per-wallet rate limit, input validation, single-use RouteIntent + on-chain nonce as the real replay guard, off-chain `_validateLegs` mirror trust boundary, error redaction)
- [ ] Add `## Indexer / read-model surface` (finalized-tag polling, advisory-locked atomic cursor, block-hash-mismatch full-wipe+reindex, idempotent upserts, unknown-ordinal skip-not-wedge, DB-down recovery)
- [ ] Add `## Frontend surface` (wallet-free landing + bundle guards, EIP-712 money boundary `BigInt(str)`, pin-to-manifest, SIWE session hygiene, CSP `connect-src`)
- [ ] Update trust assumptions + accepted-risk list with pass findings

### D2 — New `SECURITY.md` (repo root)

- [ ] Responsible-disclosure process (contact, scope, no-bounty statement)
- [ ] **Bold warning: TESTNET ONLY — never send real funds; keys/contracts are demo-grade, unaudited**
- [ ] Link to threat-model + accepted risks

### D3 — Demo-operator checklist (`docs/demo-operator-checklist.md`)

- [ ] Pre-demo env sanity: `NODE_ENV` ≠ production when `ISSUER_PRIVATE_KEY` present (else boot throws — verify boots); `DEMO_ISSUER_SIGNING_ENABLED` intended; CORS allowlist set (no `"*"`); JWT secret set; RPC URL
- [ ] Chain/stack: seeded stack up, faucet funded, signer epoch current, Docker running for gated tests
- [ ] Abort conditions + who to contact

### D4 — Compound learnings + TODO/mock classification

- [ ] New `docs/solutions/integration-issues/security-hardening-adversarial-suite.md` (patterns + gotchas discovered)
- [ ] Classification appendix: the ~60 `TODO|FIXME|placeholder|mock` matches are all legitimate `Mock*`/skeleton names — enumerate + confirm none are core-logic placeholders; remove any misleading one found

---

## Coverage Matrix (adversarial item → disposition)

| #   | Scenario                                   | Status                   | Where                         |
| --- | ------------------------------------------ | ------------------------ | ----------------------------- |
| a   | Replay/expired attestation nonce           | COVERED                  | A (assert existing)           |
| b   | Expired route deadline                     | COVERED                  | A (assert existing)           |
| c   | Wrong chain / verifyingContract (on-chain) | **GAP**                  | **A1**                        |
| d   | Recipient bound to signed user             | COVERED                  | A (assert existing)           |
| e   | Concurrent same-claim financing            | PARTIAL                  | **A8**                        |
| f   | Vault drained between quote & exec         | PARTIAL                  | **A8** + B6                   |
| g   | Tiny-slice rounding + MAX_SLICES           | COVERED                  | A (assert existing)           |
| h   | Settlement wrong token                     | **GAP**                  | **A2**                        |
| i   | Double settlement                          | COVERED                  | A (assert existing)           |
| j   | Permissionless payer                       | COVERED                  | A (assert existing)           |
| k   | Former signer after epoch rotation         | COVERED                  | A (assert existing)           |
| 1   | Reentrant/malicious token                  | resolved → pinning+guard | **A7**                        |
| 6   | Expired route after UI confirm (intent)    | **GAP**                  | **B1**                        |
| 10  | API/DB down, tx succeeds                   | **GAP**                  | **B2**                        |
| l   | SettlementReturnFailed try/catch           | **GAP**                  | **A2**                        |
| m   | SourceObligor pooled cross-claim           | **GAP (characterize)**   | A (test) + D1 (accepted risk) |
| n   | Route-intent single-use                    | **GAP**                  | **B1**                        |
| o   | SIWE single-use / chainId                  | COVERED                  | B (assert existing)           |
| —   | Pause can't strand/confiscate              | **GAP**                  | **A3**                        |
| —   | Short/partial + underfunded payment        | **GAP**                  | **A2**                        |
| —   | Access control / role init                 | **GAP**                  | **A4**                        |
| —   | Multi-leg rollback + nonce                 | **GAP**                  | **A5**                        |
| —   | externalId reuse after reject/revoke       | **GAP**                  | **A6**                        |
| —   | HTTP headers/CORS/authz/rate-limit         | **GAP**                  | **B3**                        |
| —   | Error/log redaction                        | **GAP**                  | **B4**                        |
| —   | Input validation                           | **GAP**                  | **B5**                        |
| —   | Product-app secret bundle                  | **GAP**                  | **C1**                        |
| —   | Pin-to-manifest defense                    | **GAP**                  | **C2**                        |

---

## Accepted Risks (documented, NOT tested as defects)

- Admin honesty / single deployer key — test only role-separation blast radius, not admin malice.
- Fee-on-transfer / rebasing / non-standard token — asset is immutable standard MockUSDT; ≤1 defensive SafeERC20 unit test.
- Multi-token settlement, price oracles, upgradeable proxies, public LP deposits, loss socialization — out of scope (threat-model §Out of scope).
- `SourceObligor` pooled cross-claim accounting — accepted demo behavior (`SourceObligor.sol:26-31`); characterize, don't fail. Not theft (no attacker can name a beneficiary without an issuer key).
- Redis-less rate limiting across instances — single-instance in-memory accepted (`env.validation.ts:36`).

## Acceptance Criteria

### Functional

- [ ] Every GAP row in the coverage matrix has a new/extended test that passes.
- [ ] Every COVERED row has an explicitly named assertion (proof-of-control), even if pre-existing.
- [ ] Any test that reveals a defect → classified by rubric; P0/P1 fixed in-stream with the test kept as regression; P2/accepted logged in threat-model.
- [ ] The 3 suspected-defect probes (B6 mirror parity ×2, B6 RPC-not-404, B7 env) are resolved: fixed if real, converted to regression if already mitigated.

### Non-Functional / Quality Gate (no suppression, no type-loosening for green)

- [ ] Fresh install succeeds (`pnpm install`).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` green (root).
- [ ] `contracts:compile` + `contracts:test` + `contracts:typecheck` green (Node 24).
- [ ] `apps/api` unit specs green; **`test:int` green locally** (Docker); landing + product-app builds succeed.
- [ ] `apps/e2e` landing suite green; gated product happy-path green (`E2E_STACK=1`).
- [ ] **Docker-dependent gates** (`test:int`, `test:e2e:stack`) — **required locally, best-effort in CI**; CI must not fail solely for Docker's absence.
- [ ] ABI-freshness + manifest-freshness gates green (regen if any contract source changed).
- [ ] `no any`; no committed secret / key / mnemonic / DB cred / live token.
- [ ] TODO/FIXME/placeholder/mock classified (D4).
- [ ] Exact failures reported if anything stays red.

## Dependencies & Risks

- **Node 24** required for Stream A (keg-only). **Docker** required for B `test:int` + C `e2e-stack` (dev machine has v29.4.2; CI may not).
- **Instant-mine e2e flakiness** (learnings #2) — if C3 is attempted: override nonce from live `router.nonces`, gate optimize on `finalizedThrough`, execute before any time-warp, fresh node per run. Default is to skip C3.
- **Serialization risk:** a fix in `packages/shared`/`packages/chain` or an ABI-altering contract change forces a cross-stream checkpoint (see Coordination).
- **Low expected fix count:** research indicates most items are proof-of-control; the live fix candidates are B6 (mirror parity, RPC-not-404). Budget accordingly.

## References

### Internal (research-grounded)

- Brainstorm: `docs/brainstorms/2026-09-27-security-hardening-pass-brainstorm.md`
- Contracts: `MaturaRouter.sol:70-107,127,145-161`, `SettlementManager.sol:96-143`, `LiquidityVault.sol:140-233`, `ClaimRegistry.sol:65,126,143,255-258`, `SourceObligor.sol:26-31`
- API: `common/leg-mirror.ts`, `routes/route-intent.service.ts:41-72`, `auth/{auth,jwt}.service.ts`, `auth/wallet-auth.guard.ts:47`, `auth/wallet-throttler.guard.ts`, `common/api-error.filter.ts`, `config/env.validation.ts:36,46,54-67`, `main.ts:26-35`, `indexer/indexer.service.ts`
- Tests: `packages/contracts/test/**` (helpers `fixtures.ts`/`eip712.ts`/`constants.ts`); `apps/api/test/{indexer.int-spec.ts,health.e2e-spec.ts,db/postgres-testcontainer.ts}`; `apps/e2e/scripts/check-landing-bundle.mjs`
- Docs: `docs/threat-model.md` (contract-scoped), no `SECURITY.md` (absent)

### Institutional learnings (`docs/solutions/`)

- `integration-issues/best-execution-router-mirror-intent-optimizer.md` — mirror parity, single-use intent no-upsert, on-chain nonce is real replay guard, `SEARCH_LEAF_BUDGET` DoS, rate-limit-by-wallet, Zod re-parse
- `integration-issues/cross-stack-e2e-harness-instant-mine-chain.md` — nonce override, cursor gating, RouteExpired timing, fresh-node lifecycle
- `integration-issues/next15-wallet-frontend-siwe-eip712-e2e.md` — EIP-712 money boundary, pin-to-manifest, SIWE hygiene, CSP `connect-src`
- `build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md` — §6 reorg cursor atomicity + FK-wedge, §4 `z.coerce.boolean` fail-open, §3 read-through revert-vs-transport
- `build-errors/hardhat3-viem-node24-toolchain.md` — Node 24, node:test type-strips (run typecheck), ABI freshness

## AI-Era Notes

- Research done by Claude (repo scan, reentrancy/token-pinning proof, coverage gap analysis, SpecFlow completeness). All findings are file:line-grounded above.
- Adversarial tests double as regression suite; human review focus on any P0/P1 fix in Stream A/B and the RPC-not-404 / mirror-parity probes.
