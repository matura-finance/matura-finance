# End-to-End Deployment (living document)

> **Living doc — update every iteration.** This is the tracked, secret-free procedure for
> standing up the **whole** Matura stack (contracts → chain manifests → API DB + indexer worker +
> HTTP API → web app). Live addresses and secrets stay in the **gitignored**
> `docs/deployment-runbook.md`; contract-deploy detail lives in `packages/contracts/README.md`.
> Full production hosting is not wired yet — see [Open items](#open-items). Append an entry to the
> [Iteration log](#iteration-log) whenever the deploy surface changes.

## Deployable surface (status by iteration)

| Component                                |     Local (31337)     | BSC Testnet (97) | Production hosting |
| ---------------------------------------- | :-------------------: | :--------------: | :----------------: |
| Contracts (deploy + seed + verify)       |          ✅           |        ✅        |        n/a         |
| Chain manifests (`@matura/chain`, built) |          ✅           |        ✅        |        n/a         |
| API DB (Postgres + Prisma migrations)    |          ✅           |   ✅ (manual)    |    ⏳ not wired    |
| Indexer worker                           |          ✅           |   ✅ (manual)    |    ⏳ not wired    |
| HTTP API (reads + prepares + SIWE)       |          ✅           |   ✅ (manual)    |    ⏳ not wired    |
| Web app (`apps/app`)                     | ⏳ API wiring pending |        ⏳        |         ⏳         |

Legend: ✅ runnable now · ⏳ pending. Update this table each iteration.

## Prerequisites

- **Node 24** (keg-only): `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` (verify `node -v` → v24.x).
- `pnpm` (Corepack), a **PostgreSQL** instance, **Docker** (only for `test:int`), a funded key +
  RPC for testnet (faucet steps in `packages/contracts/README.md`).
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

Behind a reverse proxy, `trust proxy` is set so the IP-keyed throttler sees the real client.
Swagger is dev-only at `/docs`.

### 6. Web app (`apps/app`) — pending

Point `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_CHAIN_ID` / `NEXT_PUBLIC_RPC_URL` at the API + chain.
(Wiring not finalized — see Open items.)

## Post-deploy smoke checklist

- [ ] `GET /api/v1/health` → `200 {status:"ok"}`; `GET /api/v1/health/ready` → `200` (db/rpc/cursor up).
- [ ] Seeded claims visible: `GET /api/v1/account/:aliceWallet` returns her ELIGIBLE claims after the worker catches up.
- [ ] `GET /api/v1/vaults` returns the two vaults with mandates.
- [ ] `GET /auth/nonce` → `{nonce, domain, chainId}`; SIWE `POST /auth/verify` mints a bearer token.
- [ ] A `*/prepare` endpoint returns the uniform envelope (chainId, steps, summary, finalizedThrough).
- [ ] Restart the worker → no duplicate rows (idempotent).

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
- `apps/app` ↔ API wiring + its own env/build/deploy.

## Iteration log

> Append newest-first. One entry per iteration that touches the deploy surface.

### 2026-09-26 — apps/api orchestration & read-model service (PR #3)

- **Added to the deployable surface:** the API DB (Prisma migrations `0_init`, `1_cut_issuerprojection_nullable_targetadvance`, `2_drop_claimprojection_txhash_unique`), the **indexer worker**, the **HTTP API** (reads + non-custodial prepares + SIWE auth).
- **New env** (see §3): chain/indexer/cursor/auth keys + optional `REDIS_URL`. `@matura/chain` now needs `build` before the CJS API consumes it.
- **Not yet wired:** production hosting for API/worker, `apps/app` ↔ API, CI migration gate (see Open items).
