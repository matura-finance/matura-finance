# CLAUDE.md

Guidance for working in this repo. Keep it short; link out for detail.

**Matura** — a BSC-Testnet RWA/invoice-financing MVP. pnpm + Turborepo monorepo:
`apps/{api,app,landing}`, `packages/{contracts,chain,shared,ui,eslint-config,typescript-config}`.
Architecture: `docs/architecture.md`. Rationale: `docs/decisions.md`.

## ⚠️ Node 24 (not the machine default)

Hardhat 3 needs an **even LTS** Node (22.13+/24); the repo pins `<25`. Node 24 is
installed **keg-only** (not on PATH). Prefix contracts/monorepo commands:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # verify: node -v → v24.x
```

## Commands

```bash
pnpm build | lint | typecheck | test        # turbo, whole monorepo
pnpm --filter @matura/contracts contracts:compile   # hardhat compile
pnpm --filter @matura/contracts contracts:test      # unit + integration + fuzz + gas
pnpm --filter @matura/contracts typecheck           # hardhat compile && tsc --noEmit
pnpm --filter @matura/contracts contracts:export-abis   # regenerate @matura/chain ABIs
pnpm --filter @matura/chain build                   # tsup dual CJS/ESM build (CJS apps/api consumes it)
pnpm --filter @matura/api dev                        # nest start --watch (HTTP API)
pnpm --filter @matura/api worker:dev                 # indexer worker (separate process)
pnpm --filter @matura/api db:migrate                 # prisma migrate dev (needs Postgres)
pnpm --filter @matura/api test:int                   # Testcontainers integration tests (needs Docker)
pnpm --filter @matura/api reindex                    # CLI: wipe projections + reindex from deploymentBlock
pnpm --filter @matura/app dev                        # next dev — product app (:3002)
pnpm --filter @matura/landing dev                    # next dev — marketing site (:3001)
pnpm --filter @matura/app test                       # vitest (unit: tx reducer, chain bridge, money format)
pnpm --filter @matura/e2e e2e:install                # one-time: download Playwright Chromium
pnpm --filter @matura/e2e test:e2e                   # Playwright: landing always; product happy path needs E2E_STACK=1 + seeded stack
pnpm --filter @matura/e2e check:bundle               # assert built landing bundle has no wallet/chain code or secrets
pnpm --filter @matura/e2e-stack test:e2e:stack       # cross-stack reconciliation e2e (needs Docker): boots node+PG+worker+API, drives optimize→execute→settle, reconciles events↔DB↔balances
```

Deploy/seed/verify (Hardhat Ignition + idempotent viem scripts; addresses → per-chain manifest,
never hand-edited). Local: `hardhat node` in one terminal, then `pnpm --filter @matura/contracts
demo:local` (deploy→seed→verify) in another; `demo:settle` (local-only e2e), `demo:reset`. Testnet:
`deploy:bsc-testnet` then `seed:bsc-testnet` (uses the seed-only `bscTestnetSeed` network so the
issuer key stays out of deploy/verify). Full flow + faucet: `packages/contracts/README.md`.

**`apps/api`** — orchestration + read-model service. A separate-process **indexer worker**
(`worker.ts`; `finalized`-tag polling, block-hash-mismatch → full-wipe+reindex, idempotent upserts

- cursor in one advisory-locked tx) projects on-chain events into Postgres/Prisma. The HTTP API
  serves **read endpoints** (projection + chain read-through) and non-custodial **write-preparation**
  endpoints (unsigned calldata / EIP-712 typed data — never holds a user key), behind **SIWE** auth
  (viem, JWT, fail-closed global guard + `@Public()`; rate-limited **per wallet**). Money = base-unit
  **strings**; addresses lowercase; BigInt never leaks at the JSON boundary. Prisma migrations are
  committed + reproducible. The **deterministic best-execution router** (`routes/optimize` +
  `routes/:routeId/prepare-execution`) selects the cheapest verifiable route via a pure integer
  optimizer in `@matura/shared` (bounded exact search + greedy fallback), persists a **single-use**
  `RouteIntent`, and re-validates each leg against a pinned block through one shared off-chain
  `_validateLegs` mirror (`common/leg-mirror.ts`) before emitting the signable `ExecutionRoute`.
  Design + gotchas: `docs/routing.md`.

**`apps/app`** (Next 15, `app.matura.xyz`) — the wallet-connected product. wagmi + viem (BSC
Testnet only, EIP-6963 discovery) + TanStack Query; a thin typed API client (`src/lib/api`,
Zod-validated, reuses `@matura/shared` `OptimizeResult`); **SIWE** session (header-bearer JWT,
in-memory + `sessionStorage`, subject-bound, cleared on 401/switch); a `bridge.ts` brand→viem
boundary; a per-tx reducer + `useTxFlow`. Routes: `/account`, `/request` (the best-execution
optimize→review→sign→submit→index flow), `/activity`, `/vaults`, `/issuer` (demo simulator). The
signing money boundary is `BigInt(str)` (never `toBaseUnits`), one coerced message feeds
sign+hash+`executeRoute`, and targets are pinned to the manifest. **`apps/landing`** (`matura.xyz`)
— static, wallet-free marketing site (approved copy, SEO/OG/sitemap/robots/JSON-LD; a CI grep keeps
the bundle wallet/secret-free). **`apps/e2e`** — Playwright: an always-on landing suite + a
gated (`E2E_STACK=1`) product happy-path using a Node-side viem signer injected as an EIP-6963
provider (no wallet code in the app). Frontend build/integration gotchas (connectors barrel,
unstable-hook refetch loop, SIWE rehydrate race, EIP-712 boundary, e2e wallet injection):
`docs/solutions/integration-issues/next15-wallet-frontend-siwe-eip712-e2e.md`. Design + full
build: `docs/plans/2026-09-26-feat-matura-frontends-landing-and-product-plan.md`.

CI order: build → lint → typecheck → test → contracts:compile → contracts:test →
ABI-freshness gate → manifest-freshness gate. Gotchas: toolchain (Node, tsc `unknown`, ABI/prettier
gate) `docs/solutions/build-errors/hardhat3-viem-node24-toolchain.md`; deploy/seed pipeline
(event-scan block, `.js`→`.ts` script imports, `noUncheckedIndexedAccess`+viem)
`docs/solutions/deployment-issues/hardhat3-deploy-seed-manifest-pipeline.md`; **apps/api toolchain**
(CJS↔ESM chain consumption, `prisma-client` types, strict viem, `z.stringbool`, DB-less migrations)
`docs/solutions/build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md`; **best-execution router**
(one shared off-chain `_validateLegs` mirror, `PinnedReads` determinism, single-use intents pruned
expired-only, bounded optimizer, `tsc`-vs-ESLint `Hex` in specs)
`docs/solutions/integration-issues/best-execution-router-mirror-intent-optimizer.md`; **cross-stack
e2e harness** (instant-mine frontier lag → nonce override + cursor gating, block-timestamp skew →
RouteExpired, fresh-node-per-run lifecycle, `INDEXER_CONFIRMATIONS=1` + `cwd=REPO_ROOT`, poll
projected state not the cursor) `docs/solutions/integration-issues/cross-stack-e2e-harness-instant-mine-chain.md`;
**security hardening** (adversarial-tests-as-regression, proof-of-pinning vs full harness,
pause-can't-strand-settlement, the false-green guard test — a guard test must fail if the guard is
removed, share prod bootstrap/orchestration with tests instead of copying, scan bundles for secret
_values_ not env names) `docs/solutions/integration-issues/security-hardening-adversarial-suite.md`.

## Conventions

- **Commits:** author `arjunamarcelino` only — **no `Co-Authored-By: Claude` trailer.**
- **No `any`** anywhere — type-aware ESLint (`strictTypeChecked` + `projectService`).
  Contracts TS is now typechecked too (`tsc --noEmit` with `artifacts/**/*.d.ts` included).
- **Money** is `uint256` base units (6-dp MockUSDT) on-chain, decimal **strings** across
  APIs, never floats. Dates: ISO 8601 in APIs, Unix seconds on-chain.
- **Enum ordinals are law:** Solidity `ClaimTypes`/`ClaimStates` mirror
  `packages/shared/src/enums.ts`; parity tests guard drift (`packages/contracts/test/EnumParity.test.ts`,
  `apps/api/src/enum-parity.spec.ts`). Adding a claim type is a 7-site edit (see `ClaimEnums.sol`).
- **Contract addresses** live ONLY in the generated per-chain manifests
  `@matura/chain/src/deployments/<chainId>.json` (written by `deploy`, never hand-edited, never
  env) + the codegen'd `deployments.generated.ts`; `deployments.ts` exposes typed accessors
  (`getDeployment`/`getManifest`/…). ABIs are generated into `@matura/chain/src/abis` (never
  hand-copied, prettier-ignored). `@matura/chain/contracts` binds each address slot to its ABI.
- **Secrets** via Hardhat keystore / `configVariable()` (never `.env`, never committed):
  `DEPLOYER_PRIVATE_KEY`, `ISSUER_PRIVATE_KEY` (attestation signer — most sensitive), RPC URL.
  The keystore stays the default; the BSC-testnet deploy uses a **gitignored
  `packages/contracts/.env`** (sourced inline at runtime — `configVariable` reads it) as a
  deliberate MVP operator escape hatch. See `docs/deployment-trackb-runbook.md`.
- **Solidity:** 0.8.28 + OpenZeppelin 5.6.1; custom errors + NatSpec; CEI + SafeERC20 +
  `ReentrancyGuardTransient`; no proxies. Security posture: `docs/threat-model.md` (full-stack
  threat model), `SECURITY.md` (disclosure policy + testnet-only warning), and
  `docs/demo-operator-checklist.md` (pre-demo env/stack sanity).
- **Boundaries:** `apps/landing` stays wallet-free (lint-guarded, incl. subpath imports);
  `@matura/shared` is framework-free Zod; `@matura/contracts` is self-contained (no `@matura/*` deps).
  `@matura/chain` ships a **tsup dual CJS/ESM build** (`dist`) so the CommonJS `apps/api` can
  consume it; **EIP-712 typed-data** (attestation/route types + domains) lives in `@matura/chain`
  (viem-native), with `@matura/contracts` keeping its own copy behind a typehash parity test.

## Local-only docs (gitignored)

`docs/deployment-runbook.md` (live addresses, update per deploy), `docs/code-review.md`, and
`docs/reviews/` (per-PR review docs). Planning docs (`docs/brainstorms/`, `docs/plans/`),
`docs/gas-report.md`, and **`docs/deployment.md`** (living whole-stack E2E deploy guide — update
each iteration) are tracked.
