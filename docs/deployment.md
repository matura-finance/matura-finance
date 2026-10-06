# End-to-End Deployment (living document)

> **Living doc — update every iteration.** This is the tracked, secret-free procedure for
> standing up the **whole** Matura stack (contracts → chain manifests → API DB + indexer worker +
> HTTP API → web app). Live addresses and secrets stay in the **gitignored**
> `docs/deployment-runbook.md`; contract-deploy detail lives in `packages/contracts/README.md`.
> Hosting is documented (EasyPanel/Docker — see [EasyPanel / Docker hosting](#7-easypanel--docker-hosting))
> but not yet executed against a live instance — that lands with Track B (the live runbook,
> `docs/deployment-trackb-runbook.md`); remaining gaps in
> [Open items](#open-items). Append an entry to the [Iteration log](#iteration-log) whenever the
> deploy surface changes.

## Deployable surface (status by iteration)

| Component                                |       Local (31337)       |  BSC Testnet (97)   | Production hosting |
| ---------------------------------------- | :-----------------------: | :-----------------: | :----------------: |
| Contracts (deploy + seed + verify)       |            ✅             |         ✅          |        n/a         |
| Chain manifests (`@matura/chain`, built) |            ✅             |         ✅          |        n/a         |
| API DB (Postgres + Prisma migrations)    |            ✅             |     ✅ (manual)     | ⏳ pending Track B |
| Indexer worker                           |            ✅             |     ✅ (manual)     | ⏳ pending Track B |
| HTTP API (reads + prepares + SIWE)       |            ✅             |     ✅ (manual)     | ⏳ pending Track B |
| Web app (`apps/app`)                     | ✅ (dev vs seeded stack)  | ⏳ env flip pending | ⏳ pending Track B |
| Marketing (`apps/landing`)               |            ✅             |     ✅ (static)     | ⏳ pending Track B |
| E2E (`apps/e2e`, Playwright)             | ✅ landing; product gated |  ⏳ remote (WS-6)   |        n/a         |
| Cross-stack E2E (`apps/e2e-stack`)       |     ✅ (needs Docker)     |         n/a         |        n/a         |

Legend: ✅ runnable now · ⏳ pending. **"pending Track B"** = Dockerfiles + hosting procedure
authored (WS-5/WS-7 below), not yet stood up against a live EasyPanel instance. Update this table
each iteration.

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
NEXT_PUBLIC_RPC_URL=<public BSC-testnet RPC>  NEXT_PUBLIC_LANDING_URL=https://usematura.xyz \
pnpm --filter @matura/app build && pnpm --filter @matura/app start   # :3002
```

The product **gates on `isDeployed(97)`** — until the manifest (`@matura/chain/src/deployments/97.json`)
has real addresses it renders "Contracts deploying soon", and the `/request` flow **pins the
`executeRoute` target to the manifest router** and refuses otherwise. So the app only becomes
functional **after** step 1's testnet deploy+seed lands and `@matura/chain` is rebuilt. Wallet is
injected/EIP-6963, BSC-testnet only; SIWE session is a header-bearer JWT (in-memory + `sessionStorage`).

**`apps/landing`** — static + wallet-free; no chain/API:

```bash
NEXT_PUBLIC_APP_URL=https://app.usematura.xyz  NEXT_PUBLIC_CONTRACTS_DEPLOYED=<true|false> \
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

### 7. EasyPanel / Docker hosting

> Target hosting for the testnet deploy: all four services (landing, product app, API, indexer
> worker) + Postgres on **EasyPanel via Docker**. The live runbook with GO gates is
> `docs/deployment-trackb-runbook.md`; this section is the standing per-service reference.

**Ordering (non-negotiable):** deploy contracts → write `97.json` → **commit the manifest +
regenerated `deployments.generated.ts`** → rebuild `@matura/chain` → **then** build the app/api
images. Images must bake from the committed real manifest, never the zero manifest; the root
`.dockerignore` excludes build junk but **keeps** `packages/chain/src/deployments/97.json` +
`deployments.generated.ts`. Any address change means re-baking BOTH frontends (see
[Reindex / rollback](#reindex--rollback)).

**Per-service config** (all four services): **Build Path = repo ROOT** with a **per-service
Dockerfile path** (`apps/{landing,app,api}/Dockerfile`); each is a `turbo prune`-based multi-stage
build on `node:24-slim`.

- **API + worker = the same image, role chosen by env** — the entrypoint runs `dist/worker.js` when
  `SERVICE_ROLE=worker`, else `dist/main.js`. Two services, one Dockerfile, **no command override**.
- **Migrate = a ONE-OFF job** (`prisma migrate deploy`), run **exactly once per release** and
  **gating BOTH** the API and the worker — never per-replica, or migrations race.
- **Healthcheck:** API = `GET /api/v1/health` (liveness only) with a startup grace ≥ reindex time;
  **worker = no HTTP probe** (it serves no port — use a process-only probe). Do **not** point the
  healthcheck at `/health/ready` — during a cold reindex `ready` is false and the platform will
  restart-loop the container. `ready` is a GO gate you poll by hand (smoke), not a liveness probe.
- **TLS / Traefik:** the EasyPanel proxy (Traefik) **owns TLS**. Do **not** enable any in-app HTTPS
  redirect (Next or Nest) — the proxy already terminates TLS and forwards HTTP, so an in-app force
  produces an infinite redirect loop. Keep the API's `trust proxy` hop count correct for the real
  client IP (per-wallet throttling falls back to IP on public routes).
- **Domains (Traefik):** apex `usematura.xyz` → **landing**; `app.usematura.xyz` → **app**. **No
  wildcard** and no overlapping host rules (avoids route collisions / redirect loops). Keep
  `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_LANDING_URL` consistent across both frontends so the
  cross-domain CTA resolves.

#### Indexer worker — SAME image, its OWN service (not the same running instance)

The indexer is a **separate EasyPanel service** deployed from the **same API image**, selected at
runtime by **`SERVICE_ROLE=worker`** (the HTTP API is a _different_ service that leaves `SERVICE_ROLE`
unset → runs `dist/main.js`). One build, one Dockerfile, two services — **no per-service command
override needed**. They are **not** the same process — the worker is a headless polling loop
(`createApplicationContext`, no HTTP server), so running it inside the API would couple their
lifecycles/restarts; keep them as two services off the one image.

- **Role:** set env **`SERVICE_ROLE=worker`** — the image entrypoint then runs `node apps/api/dist/worker.js`.
- **Replicas: exactly 1.** A `pg_advisory_xact_lock` already guarantees a single writer, but run one
  replica anyway to avoid lock contention / restart churn.
- **Healthcheck: handled** — the baked `HEALTHCHECK` short-circuits to success when `SERVICE_ROLE=worker`
  (the worker serves no HTTP port), so it won't be marked unhealthy / restart-looped. It drains on `SIGTERM`.
- **Runtime env it needs:** `DATABASE_URL`, `CHAIN_ID=97`, `RPC_URL`, `INDEXER_CONFIRMATIONS=0`
  (+ optional `INDEXER_MAX_BLOCK_RANGE`, `INDEXER_POLL_INTERVAL_MS`, `CURSOR_*`). It does **not** need
  `JWT_SECRET` / `SIWE_DOMAIN` / `API_CORS_ORIGINS` (HTTP-API-only), and carries **no issuer key** —
  reusing the API's runtime env set is harmless.
- **Ordering:** start it **after** the migrate-once job (it upserts projections immediately — an
  unmigrated DB crash-loops it), and let it **catch up** before product smoke (poll the API's
  `/health/ready` until the cursor is `up`, else `/account` reads empty).

**Secrets boundary — build-args are NOT secret.** EasyPanel build-args are baked into the image
layer and are recoverable; treat them as public. So **only `NEXT_PUBLIC_*` go in as build-args**
(Next inlines them at `next build` and they also drive the app's CSP `connect-src`). Every real
secret (`DATABASE_URL`, `JWT_SECRET`, `RPC_URL`) is a **runtime** env on the API/worker only. The
hosted API runs with **no issuer key** (`ISSUER_PRIVATE_KEY` absent, `DEMO_ISSUER_SIGNING_ENABLED=false`,
`NODE_ENV=production` — the env schema refuses to boot otherwise); claims are signed at seed time.

#### Environment matrix (build-arg vs runtime; per service)

| Var(s)                                                                                                                                                                                                                                                | Service                             | Build-arg / Runtime | Notes                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LANDING_URL`                                                                                                                                | **app**                             | **build-arg**       | Inlined at `next build`; also derive the CSP `connect-src`. Rebuild on any change. |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LANDING_URL`, `NEXT_PUBLIC_CONTRACTS_DEPLOYED`                                                                                                                                                                    | **landing**                         | **build-arg**       | Only these — **no** wallet/chain/secret vars (keeps landing wallet-free).          |
| `DATABASE_URL`, `JWT_SECRET`                                                                                                                                                                                                                          | **api + worker**                    | **runtime**         | Secrets — never a build-arg.                                                       |
| `RPC_URL`, `CHAIN_ID=97`, `INDEXER_CONFIRMATIONS=0`, `INDEXER_MAX_BLOCK_RANGE`, `INDEXER_POLL_INTERVAL_MS`, `SIWE_DOMAIN=app.usematura.xyz`, `API_CORS_ORIGINS=https://app.usematura.xyz`, `NODE_ENV=production`, `DEMO_ISSUER_SIGNING_ENABLED=false` | **api (+ worker where applicable)** | **runtime**         | `ISSUER_PRIVATE_KEY` **absent** (prod refuses it).                                 |
| `DEPLOYER_PRIVATE_KEY`, `ISSUER_PRIVATE_KEY`, `BSC_TESTNET_RPC_URL`, `BSCSCAN_API_KEY`                                                                                                                                                                | **local/CI deploy only**            | Hardhat keystore    | Never present in any hosted service image or env.                                  |

`SIWE_DOMAIN` is a bare host (**no scheme**) — `app.usematura.xyz`, not `https://…`. `API_CORS_ORIGINS`
must be the exact origin **with** scheme and **no trailing slash** (`https://app.usematura.xyz`); empty
or `*` silently breaks all cross-origin calls.

#### EasyPanel setup (per-service click-path)

Docs: [App service](https://easypanel.io/docs/services/app) · [Builders](https://easypanel.io/docs/builders) · [Postgres](https://easypanel.io/docs/services/postgres).

**The crux — Build Path = repo ROOT.** EasyPanel resolves the Dockerfile path from the **Build Path**,
and that dir **is** the Docker build context ("a Dockerfile cannot COPY files outside that context").
Each service's Dockerfile must COPY the root `pnpm-lock.yaml` + `packages/*`, so **set Build Path =
`/`** on every app service and put the per-service Dockerfile at `apps/<svc>/Dockerfile`. Do **not**
set Build Path to `apps/api` (the context would lose the root lockfile/workspaces).

| Service      | New Service type        | Source                       | Build Path | Dockerfile path           | Role selector (env)       | Domain → target port           | Replicas | Env                             |
| ------------ | ----------------------- | ---------------------------- | ---------- | ------------------------- | ------------------------- | ------------------------------ | -------- | ------------------------------- |
| **postgres** | **Postgres** (template) | —                            | —          | —                         | —                         | none (internal)                | 1        | —                               |
| **api**      | **App**                 | GitHub `owner/repo` @ `main` | `/`        | `apps/api/Dockerfile`     | (unset → `main.js`)       | `api.usematura.xyz` → **3000** | ≥1       | runtime secrets (DB/JWT/RPC)    |
| **worker**   | **App**                 | same repo/branch             | `/`        | `apps/api/Dockerfile`     | **`SERVICE_ROLE=worker`** | none                           | **1**    | same runtime env (DB/CHAIN/RPC) |
| **landing**  | **App**                 | same repo/branch             | `/`        | `apps/landing/Dockerfile` | —                         | `usematura.xyz` → **3001**     | ≥1       | **only** public `NEXT_PUBLIC_*` |
| **app**      | **App**                 | same repo/branch             | `/`        | `apps/app/Dockerfile`     | —                         | `app.usematura.xyz` → **3002** | ≥1       | only public `NEXT_PUBLIC_*`     |

Order + how-to:

1. **Postgres:** New Service → Postgres → name it → deploy → copy the **internal** `DATABASE_URL` from the **Credentials** tab (internal host, port `5432`, `sslmode=disable`).
2. **API service:** New Service → App → **Source** = GitHub repo + branch, **Build Path `/`**; **Build** = Dockerfile builder, path `apps/api/Dockerfile`; **Environment** = the runtime vars (secrets live here); **Domains** = `api.usematura.xyz` → port **3000**, HTTPS on (Traefik auto-issues Let's Encrypt); Deploy.
3. **Migrate once:** open the **api service → Shell** and run `pnpm --filter @matura/api exec prisma migrate deploy` against the internal DB (there is **no** native run-once job — the Shell is the documented path; running it from any machine with DB access also works, as we did). Do this **before** the API/worker serve traffic.
4. **Worker service:** New Service → App → **same** repo/branch/Build Path/Dockerfile (`apps/api/Dockerfile`) → in **Environment** add **`SERVICE_ROLE=worker`** (the image entrypoint then runs `dist/worker.js` — **no command override needed**); **no domain**; **replicas = 1**; same runtime env as the API.
5. **Landing + app services:** App, `apps/landing/Dockerfile` / `apps/app/Dockerfile`; the `NEXT_PUBLIC_*` go in **Environment** (EasyPanel passes service env as **build args**, so they reach `next build`); domains `usematura.xyz` → 3001 / `app.usematura.xyz` → 3002.
6. **Deploy trigger:** the **Deploy** button; enable the GitHub webhook for auto-deploy on push; use **Force Rebuild** when only a build-arg changed (skips the Docker cache).

**Healthcheck (handled by the image).** EasyPanel exposes no documented first-class healthcheck field,
so the probe is the Dockerfile `HEALTHCHECK`. It's **role-aware**: it short-circuits to success when
`SERVICE_ROLE=worker` (the headless worker serves no HTTP), and keeps the real `/api/v1/health` check
for the API — so the worker is never marked unhealthy / restart-looped, and no per-service healthcheck
config is required.

**Could NOT confirm from docs (verify in-panel):** the internal Postgres hostname spelling (copy it
from the Credentials tab, don't construct it); any native run-once/job or pre-deploy hook (we use the
service **Shell** for migrate); the exact "primary domain" toggle + default Traefik HTTP→HTTPS middleware.

## Post-deploy smoke checklist

> **Pre-demo operator sanity** (env/stack readiness + abort conditions): run through
> `docs/demo-operator-checklist.md` before driving a demo.

- [ ] `GET /api/v1/health` → `200 {status:"ok"}`; `GET /api/v1/health/ready` → `200` (db/rpc/cursor up).
- [ ] Seeded claims visible: `GET /api/v1/account/:aliceWallet` returns her ELIGIBLE claims after the worker catches up.
- [ ] `GET /api/v1/vaults` returns the two vaults with mandates.
- [ ] `GET /auth/nonce` → `{nonce, domain, chainId}`; SIWE `POST /auth/verify` mints a bearer token.
- [ ] A `*/prepare` endpoint returns the uniform envelope (chainId, steps, summary, finalizedThrough).
- [ ] `POST /api/v1/routes/optimize` (authed) with Alice's ELIGIBLE claim ids returns an executable route + `routeId`; `POST /api/v1/routes/:routeId/prepare-execution` returns the `ExecutionRoute` typed-data step. A second prepare of the same `routeId` → `409`.
- [ ] Restart the worker → no duplicate rows (idempotent).
- [ ] **Landing** loads at its URL; `/protocol` + footer show real contract links when
      `NEXT_PUBLIC_CONTRACTS_DEPLOYED=true` (else "Contracts deploying soon"); `check:bundle` passes
      (both guards: landing wallet/secret-free + product-app secret-value-free — needs `apps/app` built first).
- [ ] **App**: connect (EIP-6963) → SIWE sign-in mints a session; `/account` shows the connected
      beneficiary's claims; `/vaults` lists Stable + Flex.
- [ ] **Request A** (partial payroll slice) and **Request B** (≥2 claims combined) each produce an
      executable route → review → sign → `executeRoute` → "Liquidity received" after indexing; the
      execution appears on `/activity` with a working explorer link.

## Reindex / rollback

- **Reindex:** `node apps/api/dist/admin/reindex.cli.js [fromBlock]` — wipes projections + resets the
  cursor; the next worker run rebuilds from the deployment block (idempotent). CLI-only; no prod HTTP
  surface. **Over public BSC-testnet RPC this is a long, rate-limited scan** (bounded by
  `INDEXER_MAX_BLOCK_RANGE` per batch) — expect **minutes**, not seconds. Size the API healthcheck
  startup grace ≥ this window so a cold reindex doesn't trip a restart loop.
- **Reseed (no contract change):** contracts are **immutable — never "deleted."** Just re-run
  `seed:bsc-testnet` (state-aware / resumable — it probes on-chain adapter state, so a re-run after a
  crash resumes rather than double-funding).
- **Full contract rollback = a cascade** (a redeploy mints new addresses, and the frontends bake
  addresses at build time — so it fans out):
  1. **Redeploy** contracts → new `97.json` addresses.
  2. **Reseed** the new deployment.
  3. **Commit** the new manifest + regenerated `deployments.generated.ts` (satisfies the freshness/ABI gate).
  4. **Rebuild `@matura/chain`** (tsup dual build the CJS API consumes).
  5. **Rebuild BOTH frontends** — `NEXT_PUBLIC_*` + the manifest are baked at build time, so stale
     images point at dead addresses.
  6. **Redeploy all images** on EasyPanel.
  7. Re-run the **migrate one-off job only if the schema changed** (address changes don't touch it).
- **Contracts rollback / testnet notes:** live addresses + tx hashes are captured in
  `docs/deployment-runbook.md` (gitignored) during Track B; also `packages/contracts/README.md`.

## Public RPC limitations

The hosted stack points at a public BSC-testnet RPC. Key constraints:

- **`finalized` tag is supported** on `bsc-testnet-rpc.publicnode.com` (probed: chainId `0x61`), so
  keep **`INDEXER_CONFIRMATIONS=0`** (finalized-tag cursor — the correct default).
- **`RPC_URL` is replaceable.** If you swap to an endpoint **without** the `finalized` tag, set
  `INDEXER_CONFIRMATIONS=N` (>0) to fall back to a confirmations-based cursor.
- **Polling is bounded** (`INDEXER_MAX_BLOCK_RANGE`, `INDEXER_POLL_INTERVAL_MS`) to stay within
  public-node rate limits; this is why reindex is slow (above).
- **Rate-limit hardening on the scripted proof tx:** the execute+settle script uses
  `waitForTransactionReceipt` with retry/backoff and explicit nonce management, and is resumable
  (re-drive settle if the route already executed).

## Open items (before a real production deploy)

- Hosting/orchestration for the API + worker — **now authored** (EasyPanel/Docker; see
  [EasyPanel / Docker hosting](#7-easypanel--docker-hosting)) but **not yet stood up live** (Track B);
  still confirm `terminationGracePeriodSeconds` ≥ max batch time on the platform.
- CI migration-freshness gate (`prisma migrate diff` schema-vs-migrations) + running `prisma migrate deploy` from a locked pipeline.
- Managed Postgres + per-process `connection_limit`; Redis for the shared throttler store.
- Monitoring/alerting on cursor freshness (readiness), RPC health, and error rates.
- **Frontend hosting** for `apps/app` + `apps/landing` — **now authored** (EasyPanel/Docker
  build-arg `NEXT_PUBLIC_*`, `NEXT_PUBLIC_CONTRACTS_DEPLOYED` flip; the app's CSP `connect-src` must
  match the deployed API/RPC origins) but **not yet stood up live** (Track B).
- **Seed the claim beneficiary to a wallet you control** on testnet — **addressed** via the
  `SEED_BENEFICIARY` override (payroll + escrow; the stream claim is recipient-gated so it stays a
  key we hold); required before the product `/request` demo works end-to-end.
- **Chain-scope the demo-signing gate** (API `env.validation`): `DEMO_ISSUER_SIGNING_ENABLED` +
  `ISSUER_PRIVATE_KEY` should be permitted only for `CHAIN_ID ∈ {31337, 97}` so it can never
  activate against mainnet (flagged in the PR #5 review; not yet implemented). The fail-closed
  boot-refusal (`ISSUER_PRIVATE_KEY` set + `NODE_ENV=production` → throw at boot) is now
  regression-tested (PR #7), but the chain-scope restriction is still pending.
- **Fill the `SECURITY.md` disclosure contact** (`<SECURITY_CONTACT_EMAIL>` placeholder) before
  the repo/PR is shared externally.
- **Install `gitleaks` locally** (`brew install gitleaks`) so the pre-commit secret-scan hook is a
  real gate, not a skipped no-op (CI's `secret-scan` job already runs).

## Iteration log

> Append newest-first. One entry per iteration that touches the deploy surface.

### 2026-09-28 — BSC-testnet deploy + EasyPanel/Docker hosting

- **No contract change:** no new contracts, **no ABI/manifest schema change**, no Prisma migration.
  This is an infra/ops iteration — deploy chain **97 only**, host on EasyPanel, and land **≥1 real
  BSC-testnet execute + settle**; the local (31337) env stays untouched. The sequential live runbook
  with GO gates is `docs/deployment-trackb-runbook.md`.
- **New tooling (Track A):** `scripts/preflight.ts` (chainId-97 + config-vars-present + tBNB-balance
  guard, prints addresses never values) and `scripts/check-deployment.ts` (bytecode / role-wiring /
  vault-config / balances / `manifest == on-chain`); `hardhat-verify` wired for chain 97
  (`etherscan.customChains`) + `verify-explorer.ts` (per-contract commands, BSCScan key optional);
  a **`SEED_BENEFICIARY`** override so the interactive demo wallet owns payroll + escrow claims
  (stream stays recipient-gated → skipped for an arbitrary beneficiary); `demo-testnet-execute.ts`
  drives a **deployer-owned** claim through a scripted execute + settle (public-RPC-hardened:
  retry/backoff, explicit nonce, resumable settle); and a **remote smoke** suite
  (`playwright.remote.config.ts` + `scripts/smoke-api.mjs`, URLs from env, no `webServer`).
- **New build/hosting surface:** per-app `turbo prune` multi-stage **Dockerfiles**
  (`apps/{landing,app,api}/Dockerfile`, `node:24-slim`, Next `output: "standalone"`), **API + worker
  share one image** (two start commands), a **migrate one-off job** (`prisma migrate deploy`,
  gates both), a root `.dockerignore` that **keeps `97.json` + `deployments.generated.ts`**, and a
  positive-bake assertion (`NEXT_PUBLIC_*` present in the built app chunks). See the new
  [EasyPanel / Docker hosting](#7-easypanel--docker-hosting) section for per-service config +
  env matrix.
- **Ordering guarantee:** commit the real `97.json` manifest (+ regenerated `deployments.generated.ts`)
  and rebuild `@matura/chain` **before** building any image — images must bake the real manifest, not
  the zero manifest.
- **Env:** no new persisted env; the hosting env split (build-arg `NEXT_PUBLIC_*` vs runtime secrets;
  `SIWE_DOMAIN=app.usematura.xyz`, `API_CORS_ORIGINS=https://app.usematura.xyz`, `INDEXER_CONFIRMATIONS=0`)
  is documented in the env matrix. Live addresses + tx hashes captured in `docs/deployment-runbook.md`
  (gitignored) during Track B.
- **Status:** authoring (Track A) done; live standup (Track B) pending an EasyPanel instance + DNS +
  operator GO gates — hosting rows in the surface table are **⏳ pending Track B**, not ✅.

### 2026-09-28 — security & correctness hardening pass (PR #7)

- **No deploy-surface change:** no new contracts, **no ABI/manifest change** (contract source
  untouched — all on-chain findings were proof-of-control), **no Prisma migration**, and **no new
  env**. Re-deploy/seed/reindex steps are unchanged from PR #6. Almost entirely tests + docs + three
  small off-chain fixes.
- **Build/CI surface:** `check:bundle` now runs **two** guards — the existing wallet/secret-free
  landing guard **and** a new product-app guard that scans `apps/app` client chunks for secret
  **values** (postgres creds, JWT, private-key-adjacent hex), not just env names. Both need the
  respective app built first (same precondition as before). No CI job added; `verify` + `secret-scan`
  unchanged.
- **Behavioral fixes (off-chain, no config change):** malformed money strings now return `400` (was
  a raw `500`); oversized/malformed request bodies return `413`/`400` (was `500`); the API error
  filter maps only body-parser errors to a client 4xx (an outbound RPC `429`/`404` now stays a
  generic `500`, so server faults remain visible to 5xx alerting). The pin-to-manifest control on the
  product `/request` signing path was hardened into the pure `prepareRoute` boundary (submit target +
  EIP-712 domain both pinned to the manifest router).
- **New docs:** `SECURITY.md` (disclosure policy + **testnet-only, never-real-funds** warning),
  `docs/demo-operator-checklist.md` (pre-demo env/stack sanity — now referenced from the smoke
  checklist above), and an extended full-stack `docs/threat-model.md`. Key learning: the
  test-fidelity "a guard test must fail if the guard is removed" lesson.
- **New Open items surfaced:** fill the `SECURITY.md` disclosure-contact placeholder; install
  `gitleaks` locally for the pre-commit hook (see Open items).

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
  CI yet (Docker dependency) — see Open items.

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
  chain-scope guard (see Open items).

### 2026-09-26 — deterministic best-execution router (PR #4)

- **New migration:** `3_route_intent` (adds the `RouteIntent` table + `RouteIntentStatus` enum). Purely additive — `prisma migrate deploy` applies it with no backfill/locks. Re-run step §2 on deploy.
- **New endpoints:** `POST /api/v1/routes/optimize` + `POST /api/v1/routes/:routeId/prepare-execution` (SIWE-authed; smoke-checked above). No new contracts and **no new env** — uses the existing chain/DB/SIWE config; required on-chain readers already exist in the committed ABIs.
- **Operational:** throttling is now **per authenticated wallet** (IP fallback for public routes) — see §5. `RouteIntent` rows are short-lived (120s TTL) and pruned opportunistically on `optimize`; no sweeper/cron required.
- **Not yet wired:** the Hardhat golden-vector parity CI gate for the off-chain `_validateLegs` mirror (see `docs/routing.md` follow-ups).

### 2026-09-26 — apps/api orchestration & read-model service (PR #3)

- **Added to the deployable surface:** the API DB (Prisma migrations `0_init`, `1_cut_issuerprojection_nullable_targetadvance`, `2_drop_claimprojection_txhash_unique`), the **indexer worker**, the **HTTP API** (reads + non-custodial prepares + SIWE auth).
- **New env** (see §3): chain/indexer/cursor/auth keys + optional `REDIS_URL`. `@matura/chain` now needs `build` before the CJS API consumes it.
- **Not yet wired:** production hosting for API/worker, `apps/app` ↔ API, CI migration gate (see Open items).
