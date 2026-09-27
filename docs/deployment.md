# End-to-End Deployment (living document)

> **Living doc — update every iteration.** This is the tracked, secret-free procedure for
> standing up the **whole** Matura stack (contracts → chain manifests → API DB + indexer worker +
> HTTP API → web app). Live addresses and secrets stay in the **gitignored**
> `docs/deployment-runbook.md`; contract-deploy detail lives in `packages/contracts/README.md`.
> Full production hosting is not wired yet — see [Open items](#open-items). Append an entry to the
> [Iteration log](#iteration-log) whenever the deploy surface changes.

## Deployable surface (status by iteration)

| Component                                |       Local (31337)       |  BSC Testnet (97)   | Production hosting |
| ---------------------------------------- | :-----------------------: | :-----------------: | :----------------: |
| Contracts (deploy + seed + verify)       |            ✅             |         ✅          |        n/a         |
| Chain manifests (`@matura/chain`, built) |            ✅             |         ✅          |        n/a         |
| API DB (Postgres + Prisma migrations)    |            ✅             |     ✅ (manual)     |    ⏳ not wired    |
| Indexer worker                           |            ✅             |     ✅ (manual)     |    ⏳ not wired    |
| HTTP API (reads + prepares + SIWE)       |            ✅             |     ✅ (manual)     |    ⏳ not wired    |
| Web app (`apps/app`)                     | ✅ (dev vs seeded stack)  | ⏳ env flip pending |    ⏳ not wired    |
| Marketing (`apps/landing`)               |            ✅             |     ✅ (static)     |    ⏳ not wired    |
| E2E (`apps/e2e`, Playwright)             | ✅ landing; product gated |         n/a         |        n/a         |
| Cross-stack E2E (`apps/e2e-stack`)       |     ✅ (needs Docker)     |         n/a         |        n/a         |

Legend: ✅ runnable now · ⏳ pending. Update this table each iteration.

`apps/e2e-stack` is a local-only reconciliation harness, not a deploy target: one command
(`pnpm --filter @matura/e2e-stack test:e2e:stack`) boots the whole stack (node + Postgres + worker +
API), drives optimize→execute→settle through the API, and reconciles events ↔ DB projections ↔
balances. Self-cleans (restores the zero manifest + rebuilds `@matura/chain`). Not in CI yet (Docker).

## Prerequisites

- **Node 24** (keg-only): `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` (verify `node -v` → v24.x).
- `pnpm` (Corepack), a **PostgreSQL** instance, **Docker** (for `test:int` + the cross-stack
  `test:e2e:stack`), a funded key + RPC for testnet (faucet steps in `packages/contracts/README.md`).
- Secrets via Hardhat keystore / `configVariable()` — never `.env`, never committed:
  `DEPLOYER_PRIVATE_KEY`, `ISSUER_PRIVATE_KEY` (attestation signer — most sensitive), RPC URL.

## End-to-end flow (in order)

### 1. Contracts → chain manifests

Deploy + seed + verify; this writes the per-chain manifest that everything downstream reads.

```bash
# Local (two terminals): persistent chain, then deploy→seed→verify
pnpm --filter @matura/contracts <hardhat node>          # terminal 1 (chain 31337)
pnpm --filter @matura/contracts demo:local              # terminal 2

# BSC Testnet (two explicit steps): deploy then seed (see runbook for the exact commands + keys)
pnpm --filter @matura/contracts deploy:bsc-testnet
pnpm --filter @matura/contracts seed:bsc-testnet
```

Manifests land in `@matura/chain/src/deployments/<chainId>.json` (never hand-edited). Regenerate
the typed accessors + rebuild the package so the API consumes fresh addresses/ABIs:

```bash
pnpm --filter @matura/chain gen:deployments   # if ABIs/manifests changed
pnpm --filter @matura/chain build             # tsup dual build (CJS apps/api consumes dist)
```

### 2. API database (Postgres + Prisma)

Provision a database and point `DATABASE_URL` at it, then apply the **committed** migrations
(reproducible path — never `db push`):

```bash
# create role+db to match apps/api/.env DATABASE_URL, then:
pnpm --filter @matura/api exec prisma migrate deploy
```

Migrations live in `apps/api/prisma/migrations/**` (committed). `prisma generate` runs as part of
`build`; it needs no DB.

### 3. API environment (`apps/api/.env` — see `.env.example`)

Contract addresses are NEVER in env (they come from the manifest). Key groups:

- **Chain:** `CHAIN_ID` (31337|97), `RPC_URL`.
- **Indexer:** `INDEXER_CONFIRMATIONS` (0 → `finalized` tag), `INDEXER_MAX_BLOCK_RANGE`, `INDEXER_POLL_INTERVAL_MS`.
- **Health readiness:** `CURSOR_STALE_MS`, `CURSOR_MAX_LAG_BLOCKS` (thresholded vs the finalized head).
- **Auth:** `JWT_SECRET` (CSPRNG, ≥32, unique per deployment), `JWT_TTL_SECONDS`, `SIWE_DOMAIN`, `SIWE_NONCE_TTL_SECONDS`.
- **Demo signing (dev only):** `DEMO_ISSUER_SIGNING_ENABLED` + `ISSUER_PRIVATE_KEY`. **In production:
  `DEMO_ISSUER_SIGNING_ENABLED` must be unset/false AND `ISSUER_PRIVATE_KEY` must be empty** — the
  env schema fails fast otherwise.
- **Optional:** `REDIS_URL` (shared rate-limit store for multi-instance), `API_CORS_ORIGINS` (allowlist, never `*`), `PORT`.

### 4. Indexer worker (separate process)

```bash
pnpm --filter @matura/api build
node apps/api/dist/worker.js        # prod   (or: pnpm --filter @matura/api worker:dev)
```

It polls to the `finalized` tag, projects events, and advances the cursor. On a block-hash
mismatch (e.g. a local `demo:reset` wipe) it full-wipes + reindexes from the deployment block.

### 5. HTTP API

```bash
node apps/api/dist/main.js          # prod   (or: pnpm --filter @matura/api dev)
```

Requests are throttled **per authenticated wallet** (falling back to IP for public routes), so
behind a reverse proxy keep `trust proxy` set for the real client IP on that fallback path.
Swagger is dev-only at `/docs`.

### 6. Frontends (`apps/app` product + `apps/landing` marketing)

Both are Next 15 apps. **Only `NEXT_PUBLIC_*` reaches the browser** (lint-guarded; never a keyed
RPC or any secret). Declared in `turbo.json` `build.env`; see `.env.example`.

**`apps/app`** — point it at the API + chain and build:

```bash
NEXT_PUBLIC_API_URL=<api>/api/v1  NEXT_PUBLIC_CHAIN_ID=97 \
NEXT_PUBLIC_RPC_URL=<public BSC-testnet RPC>  NEXT_PUBLIC_LANDING_URL=https://matura.xyz \
pnpm --filter @matura/app build && pnpm --filter @matura/app start   # :3002
```

The product **gates on `isDeployed(97)`** — until the manifest (`@matura/chain/src/deployments/97.json`)
has real addresses it renders "Contracts deploying soon", and the `/request` flow **pins the
`executeRoute` target to the manifest router** and refuses otherwise. So the app only becomes
functional **after** step 1's testnet deploy+seed lands and `@matura/chain` is rebuilt. Wallet is
injected/EIP-6963, BSC-testnet only; SIWE session is a header-bearer JWT (in-memory + `sessionStorage`).

**`apps/landing`** — static + wallet-free; no chain/API:

```bash
NEXT_PUBLIC_APP_URL=https://app.matura.xyz  NEXT_PUBLIC_CONTRACTS_DEPLOYED=<true|false> \
pnpm --filter @matura/landing build && pnpm --filter @matura/landing start   # :3001
```

`NEXT_PUBLIC_CONTRACTS_DEPLOYED=true` flips the `/protocol` + footer "View contracts" links from
"Contracts deploying soon" to real explorer links (landing can't import `@matura/chain`, so this is
its build-time gate). Both apps set CSP + security headers in `next.config.ts` — the app's
`connect-src` is derived from `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_RPC_URL`, so those must be the
real origins at build or API/RPC calls are blocked.

**E2E:** landing suite runs anywhere (`pnpm --filter @matura/e2e e2e:install` once, then
`test:e2e`); the product happy-path needs `E2E_STACK=1` + a seeded local stack + the signer key set
to the **seeded claim beneficiary** (`E2E_PRIVATE_KEY`), or optimize returns `NOT_OWNED_BY_WALLET`.

## Post-deploy smoke checklist

- [ ] `GET /api/v1/health` → `200 {status:"ok"}`; `GET /api/v1/health/ready` → `200` (db/rpc/cursor up).
- [ ] Seeded claims visible: `GET /api/v1/account/:aliceWallet` returns her ELIGIBLE claims after the worker catches up.
- [ ] `GET /api/v1/vaults` returns the two vaults with mandates.
- [ ] `GET /auth/nonce` → `{nonce, domain, chainId}`; SIWE `POST /auth/verify` mints a bearer token.
- [ ] A `*/prepare` endpoint returns the uniform envelope (chainId, steps, summary, finalizedThrough).
- [ ] `POST /api/v1/routes/optimize` (authed) with Alice's ELIGIBLE claim ids returns an executable route + `routeId`; `POST /api/v1/routes/:routeId/prepare-execution` returns the `ExecutionRoute` typed-data step. A second prepare of the same `routeId` → `409`.
- [ ] Restart the worker → no duplicate rows (idempotent).
- [ ] **Landing** loads at its URL; `/protocol` + footer show real contract links when
      `NEXT_PUBLIC_CONTRACTS_DEPLOYED=true` (else "Contracts deploying soon"); `check:bundle` passes.
- [ ] **App**: connect (EIP-6963) → SIWE sign-in mints a session; `/account` shows the connected
      beneficiary's claims; `/vaults` lists Stable + Flex.
- [ ] **Request A** (partial payroll slice) and **Request B** (≥2 claims combined) each produce an
      executable route → review → sign → `executeRoute` → "Liquidity received" after indexing; the
      execution appears on `/activity` with a working explorer link.

## Reindex / rollback

- **Reindex:** `node apps/api/dist/admin/reindex.cli.js [fromBlock]` — wipes projections + resets the
  cursor; the next worker run rebuilds from the deployment block (idempotent). CLI-only; no prod HTTP surface.
- **Contracts rollback / testnet notes:** see `docs/deployment-runbook.md` (gitignored) and
  `packages/contracts/README.md`.

## Open items (before a real production deploy)

- Hosting/orchestration for the API + worker (containers, process manager, `terminationGracePeriodSeconds` ≥ max batch time).
- CI migration-freshness gate (`prisma migrate diff` schema-vs-migrations) + running `prisma migrate deploy` from a locked pipeline.
- Managed Postgres + per-process `connection_limit`; Redis for the shared throttler store.
- Monitoring/alerting on cursor freshness (readiness), RPC health, and error rates.
- **Frontend hosting** for `apps/app` + `apps/landing` (static/SSR host, per-env `NEXT_PUBLIC_*`,
  `NEXT_PUBLIC_CONTRACTS_DEPLOYED` flip); the app's CSP `connect-src` must match the deployed
  API/RPC origins.
- **Seed the claim beneficiary to a wallet you control** on testnet (the seed currently hard-codes
  Alice → the deployer address); required before the product `/request` demo works end-to-end.
- **Chain-scope the demo-signing gate** (API `env.validation`): `DEMO_ISSUER_SIGNING_ENABLED` +
  `ISSUER_PRIVATE_KEY` should be permitted only for `CHAIN_ID ∈ {31337, 97}` so it can never
  activate against mainnet (flagged in the PR #5 review; not yet implemented).

## Iteration log

> Append newest-first. One entry per iteration that touches the deploy surface.

### 2026-09-27 — claim-source adapters + settlement + cross-stack e2e (PR #6)

- **New contracts:** `MockFreelanceEscrow` + `MockStream` (source adapters, each its own issuer +
  bound obligor). The `freelance`/`stream` **manifest source slots now point to these adapters**
  (payroll stays a `SourceObligor`); shape unchanged, so `prisma`/manifest schemas need no change.
  `ClaimRegistry` gained `SOURCE_REGISTRAR_ROLE` + `registerFromSource` (byte-identical `registerClaim`).
- **Deploy/seed change:** the Ignition module deploys the 2 adapters + grants the role; **`seed`** is
  now adapter-driven for freelance/stream (fund→approve→createPayout / createStream→assign→createClaim),
  registers each adapter as its own issuer, and allowlists all three issuers on both vaults. It is
  **state-aware/resumable** (probes on-chain adapter state, so a re-run after a crash resumes rather
  than double-funding) and calls the recipient-gated `MockStream.createClaim` as Alice. Re-run
  `deploy → seed → verify` as before; `verify` now derives each claim's issuer per-claim + enumerates
  `SOURCE_REGISTRAR_ROLE` holders. The Ignition contract-id rename (uniform `*Source`) means a
  redeploy needs `demo:reset` first (local + the e2e already reset). **No new env.**
- **New ABIs** exported (`mockFreelanceEscrow`, `mockStream`) — `@matura/chain` rebuild required (as
  always); both surfaced via `sourceAbis` on the package root.
- **New package `apps/e2e-stack`** — one-command cross-stack reconciliation e2e (`test:e2e:stack`).
  **Needs a Docker daemon** (Testcontainers Postgres). Boots node + PG + worker + API, drives the API
  optimize→execute→settle flow, and reconciles on-chain events ↔ DB projections ↔ token balances; runs
  the worker with `INDEXER_CONFIRMATIONS=1` (local EDR has no `finalized` tag). Self-cleans (restores
  the zero manifest + rebuilds `@matura/chain`) and refuses to run with dirty manifest files. Not in
  CI yet (Docker dependency) — see Open items. Harness gotchas:
  `docs/solutions/integration-issues/cross-stack-e2e-harness-instant-mine-chain.md`.

### 2026-09-27 — landing + product frontends (PR #5)

- **Added to the deployable surface:** `apps/app` (wallet-connected product — SIWE, best-execution
  `/request` flow, issuer simulator), `apps/landing` (static marketing site), `apps/e2e` (Playwright).
  See §6 for build/env.
- **New public env** (all `NEXT_PUBLIC_*`, in `turbo.json` `build.env`): `NEXT_PUBLIC_API_URL`,
  `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LANDING_URL`,
  `NEXT_PUBLIC_CONTRACTS_DEPLOYED`. **No new secrets.**
- **Gating:** the product is inert until the **testnet deploy+seed (step 1)** lands real
  `97.json` addresses and `@matura/chain` is rebuilt — it renders "Contracts deploying soon" and
  the `/request` flow pins `executeRoute` to the manifest router. Landing gates its contract links
  on `NEXT_PUBLIC_CONTRACTS_DEPLOYED`.
- **CI:** the `verify` job's E2E step now installs Playwright Chromium and runs the landing suite
  (product happy-path stays gated behind `E2E_STACK`).
- **Not yet wired:** frontend hosting, the seed-beneficiary parameterization, and the demo-signing
  chain-scope guard (see Open items). Gotchas: `docs/solutions/integration-issues/next15-wallet-frontend-siwe-eip712-e2e.md`.

### 2026-09-26 — deterministic best-execution router (PR #4)

- **New migration:** `3_route_intent` (adds the `RouteIntent` table + `RouteIntentStatus` enum). Purely additive — `prisma migrate deploy` applies it with no backfill/locks. Re-run step §2 on deploy.
- **New endpoints:** `POST /api/v1/routes/optimize` + `POST /api/v1/routes/:routeId/prepare-execution` (SIWE-authed; smoke-checked above). No new contracts and **no new env** — uses the existing chain/DB/SIWE config; required on-chain readers already exist in the committed ABIs.
- **Operational:** throttling is now **per authenticated wallet** (IP fallback for public routes) — see §5. `RouteIntent` rows are short-lived (120s TTL) and pruned opportunistically on `optimize`; no sweeper/cron required.
- **Not yet wired:** the Hardhat golden-vector parity CI gate for the off-chain `_validateLegs` mirror (see `docs/routing.md` follow-ups).

### 2026-09-26 — apps/api orchestration & read-model service (PR #3)

- **Added to the deployable surface:** the API DB (Prisma migrations `0_init`, `1_cut_issuerprojection_nullable_targetadvance`, `2_drop_claimprojection_txhash_unique`), the **indexer worker**, the **HTTP API** (reads + non-custodial prepares + SIWE auth).
- **New env** (see §3): chain/indexer/cursor/auth keys + optional `REDIS_URL`. `@matura/chain` now needs `build` before the CJS API consumes it.
- **Not yet wired:** production hosting for API/worker, `apps/app` ↔ API, CI migration gate (see Open items).
