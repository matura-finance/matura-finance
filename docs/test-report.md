# Matura — Test Report

A real, timestamped run of the CI quality gate. Numbers are copied from actual command output;
**no coverage percentages are fabricated** (the suites in this repo do not emit a coverage gate, so
none is reported).

## Environment

|           |                                                                                            |
| --------- | ------------------------------------------------------------------------------------------ |
| Date/time | **2026-09-29, ~00:33–00:41 (UTC+07:00)**                                                   |
| Commit    | `61097fe` (branch `chore/judge-demo-readiness`)                                            |
| OS        | macOS 26.2 — Darwin 25.2.0 arm64                                                           |
| Node      | v24.21.0 (keg-only `node@24`, per the Hardhat-3 even-LTS pin)                              |
| pnpm      | 10.29.2                                                                                    |
| Docker    | available, but the Docker-gated suites are **not** part of the CI `verify` job (see below) |

## CI `verify` sequence — results

Run in the documented CI order (`.github/workflows/ci.yml`). Every step exited `0`.

| #   | Step                        | Command                                                  | Result                                                              |
| --- | --------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Build                       | `pnpm build`                                             | ✅ 5/5 tasks · 23.0s                                                |
| 2   | Lint                        | `pnpm lint`                                              | ✅ 9/9 tasks (type-aware `strictTypeChecked`, repo-wide no-`any`)   |
| 3   | Typecheck                   | `pnpm typecheck`                                         | ✅ 11/11 tasks                                                      |
| 4   | Unit tests                  | `pnpm test`                                              | ✅ 7/7 tasks — **298 tests** (see breakdown)                        |
| 5   | Contracts compile           | `pnpm contracts:compile`                                 | ✅ (compiled as part of `contracts:test`)                           |
| 6   | Contracts tests             | `pnpm --filter @matura/contracts contracts:test`         | ✅ **169 passing** (unit + integration + fuzz + gas)                |
| 7   | ABI-freshness gate          | `contracts:export-abis` + `git diff --exit-code`         | ✅ PASS (no drift)                                                  |
| 8   | Manifest-freshness gate     | `chain gen:deployments` + `git diff --exit-code`         | ✅ PASS (no drift)                                                  |
| 9   | Demo-fixture-freshness gate | `contracts:export-demo-fixture` + `git diff --exit-code` | ✅ PASS (no drift) — new this pass                                  |
| 10  | E2E                         | `pnpm test:e2e`                                          | ✅ 7/7 tasks — landing **6 passed** (14.0s) + api e2e **14 passed** |

### Unit-test breakdown (step 4 — 298 tests)

| Package                    | Test files |                                     Tests |
| -------------------------- | ---------: | ----------------------------------------: |
| `@matura/api` (Jest, unit) |  20 suites |                                       116 |
| `@matura/shared` (Vitest)  |          7 | 70 — incl. the 5 new `demo-fixture` tests |
| `@matura/chain` (Vitest)   |          7 |                                        57 |
| `@matura/ui` (Vitest)      |          7 |                                        29 |
| `@matura/app` (Vitest)     |          4 |                                        26 |
| **Total**                  |            |                                   **298** |

### Contracts (step 6 — 169 passing)

`hardhat test` over `test/` (unit), `test/integration/`, `test/properties/` (fast-check fuzz), and
`test/gas/` — reported **169 passing (169 nodejs)**.

## Not run in this pass (honest scope)

These are **not part of the CI `verify` job** (confirmed: neither `test:int` nor `e2e-stack` appears
in `.github/workflows/ci.yml`), so they were not run here. They exist and are runnable with Docker:

- `pnpm --filter @matura/api test:int` — Testcontainers integration (Postgres). Requires Docker.
- `pnpm --filter @matura/e2e-stack test:e2e:stack` — cross-stack reconciliation e2e (boots node + PG +
  worker + API). Requires Docker.
- `pnpm --filter @matura/e2e test:e2e` product happy-path — gated behind `E2E_STACK=1` + a seeded stack;
  the always-on landing suite ran (6 passed) but the product path was not exercised here.
- `gitleaks` secret scan — a separate CI job; `gitleaks` is not installed on this machine (the lefthook
  pre-commit hook logged "gitleaks not installed — skipping"). The landing bundle wallet/secret-free
  grep (`@matura/e2e check:bundle`) is the app-level guard and remains available.

## Demo-readiness validation (beyond CI)

- `demo:local` (deploy → seed → verify) on a fresh local chain: **all verification checks passed**,
  including the retargeted Request B check ("eligible claims each financeable on an allowed vault,
  within maxTotalFace, reaching targetAdvance").
- `smoke:local` against the seeded chain: **demo-ready** — `alice-payroll` → Stable (leg advance
  19,726 mUSDT), `alice-freelance` → Flex (leg advance 14,266.5 mUSDT), both vaults' fundable liquidity
  ample, operator funded.

## Known limitations (unchanged by this pass — stated plainly)

Mock issuers · mock stablecoin (6-dp MockUSDT) · permissioned vaults · **no legal assignment** of
receivables · **no real KYC/KYB** · **no fiat rails** · limited optimizer scale (bounded exact search +
greedy fallback) · **unaudited contracts** · **BSC-Testnet only**. **Not production-ready.**

## Minor items flagged (not fixed — out of this pass's scope)

- Landing JSON-LD (`apps/landing/src/app/layout.tsx`) references `${SITE_URL}/icon.png`, but no
  `icon.png` asset exists in `apps/landing/public` (the brand is a flat text wordmark, per the decision
  to add no logo asset). The structured-data logo reference is therefore unresolved. Left as-is to
  respect "add no asset"; a future pass can either add an icon or drop the JSON-LD `logo` field.
- `CLAUDE.md` still refers to `matura.xyz` / `app.matura.xyz`; the live code and this pass use
  `usematura.xyz` / `app.usematura.xyz`. Flagged for a follow-up docs edit.
