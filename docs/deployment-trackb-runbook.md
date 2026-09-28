# Track B — BSC-Testnet + EasyPanel Live Deploy Runbook (step by step)

Follow top-to-bottom. Each step tags **[YOU]** (operator) or **[CLAUDE]** (I run the CLI), has a
**Verify**, and — where it matters — an **On fail**. 🔴 = irreversible/outward GO gate (I pause for
your explicit go). Plan: `docs/plans/2026-09-28-feat-bsc-testnet-deploy-easypanel-plan.md`.
Live addresses + tx hashes get recorded in `docs/deployment-runbook.md` (gitignored).

> **Key ordering fact:** EasyPanel builds images **from your git repo** (per-service Dockerfile).
> So the deploy-produced `97.json` must be **committed + pushed** (Step 4) _before_ EasyPanel builds
> the API/app (Step 8). `NEXT_PUBLIC_*` are baked at build → any address change ⇒ rebuild.

---

## Phase 0 — Prerequisites (do these first) **[YOU]**

- [ ] **EasyPanel instance** reachable; you can create services + a Postgres.
- [ ] **DNS** control for `usematura.xyz` (apex), `app.usematura.xyz`, and `api.usematura.xyz`.
- [ ] **Free BSCScan API key** — https://bscscan.com/myapikey.
- [ ] **Demo wallet** (the one you'll connect in the app) address **funded with tBNB** (faucet: https://www.bnbchain.org/en/testnet-faucet). This is `SEED_BENEFICIARY`; it signs `executeRoute`, so it needs gas.
- [ ] **Deployer** account funded with tBNB (pays deploy + seed + scripted tx gas).
- [ ] Decide the git branch EasyPanel builds from (recommend: merge Track A → `main`, run Steps 1–4 on a `deploy/bsc-testnet-live` branch off main, point EasyPanel at that branch — or merge to `main` after Step 4).

### 0.1 Provide the secrets **[YOU]**

Secrets are resolved by Hardhat 3 `configVariable(NAME)` from the **environment**. This deploy uses a
**gitignored `.env`** (operator's choice; the repo convention is the encrypted keystore — `.env` is
plaintext on disk, so keep it ignored and rotate/delete after the hackathon). No dotenv is wired, so
each CLI step **sources the file inline**.

**You** create `packages/contracts/.env` (never commit it) with:

```
DEPLOYER_PRIVATE_KEY=0x<funded deployer key>
ISSUER_PRIVATE_KEY=0x<attestation signer key>
BSC_TESTNET_RPC_URL=https://bsc-testnet-rpc.publicnode.com
BSCSCAN_API_KEY=<bscscan key>
```

- **Verify:** `git check-ignore packages/contracts/.env` prints the path (ignored ✓). Never paste key values into chat.
- **How steps run:** each command is prefixed `set -a && source packages/contracts/.env && set +a && …` so `configVariable` reads the vars from the environment; secrets are never printed.

> Alternative (repo default): `npx hardhat keystore set <NAME>` per var — encrypted at rest, but the CLI then prompts for the keystore password (set `HARDHAT_KEYSTORE_PASSWORD` for non-interactive runs).

---

## Phase 1 — Contracts + on-chain (local CLI)

### Step 1 — Pre-flight **[CLAUDE]**

```bash
pnpm --filter @matura/contracts preflight:bsc-testnet   # + full quality gate
```

- **Verify:** chainId **97**; all config vars resolve (no values printed); deployer tBNB ≥ threshold; MockUSDT assumptions OK; `lint`/`typecheck`/`test`/`contracts:test` green.
- **On fail:** stop. If chainId ≠ 97 it **refuses** (never touches mainnet). Fund deployer / fix RPC and re-run.

### Step 2 — 🔴 Deploy contracts **[CLAUDE, needs your GO]**

```bash
pnpm --filter @matura/contracts deploy:bsc-testnet
```

- **Verify:** deploy completes; `packages/chain/src/deployments/97.json` has non-zero addresses.
- **On fail:** the Ignition journal (`ignition/deployments/<id>`) makes a re-run resumable — **back it up**; do not hand-edit the manifest.

### Step 3 — Rebuild chain package from the fresh manifest **[CLAUDE]**

`deploy:bsc-testnet` already regenerated `deployments.generated.ts` (deploy.ts calls
`@matura/chain gen:deployments`). Rebuild the tsup dist so the CJS API + the app consume the 97 addresses:

```bash
pnpm --filter @matura/chain build                 # tsup rebuild (dist) with 97 addrs
```

- **Verify:** ABI/manifest freshness gate clean; `@matura/chain/dist` rebuilt. _(If `deployments.generated.ts` is somehow stale: `pnpm --filter @matura/chain gen:deployments` then rebuild.)_

### Step 4 — Commit + push the manifest **[CLAUDE]**

```bash
git add packages/chain/src/deployments/97.json packages/chain/src/deployments.generated.ts
git commit -m "chore(deploy): add chain-97 deployment manifest"
git push
```

- **Verify:** `97.json` is on the branch EasyPanel will build from. _(This is the gate for Step 8 — images must build from a tree that has the real addresses.)_

### Step 5 — Explorer verification **[CLAUDE]** (non-blocking)

```bash
pnpm --filter @matura/contracts verify:bsc-testnet:explorer
```

- **Verify:** contracts show **Verified** on the testnet explorer. **On fail:** the script prints exact manual `hardhat verify` commands — run later; not a blocker.

### Step 6 — Seed vaults + claims **[CLAUDE]**

```bash
SEED_BENEFICIARY=0xYourDemoWallet pnpm --filter @matura/contracts seed:bsc-testnet
```

- **Verify:** two vaults (Stable/Flex) funded; interactive claims → your wallet (payroll+escrow); the deployer-owned scripted claim exists. Then:

```bash
pnpm --filter @matura/contracts verify:bsc-testnet         # on-chain wiring/state
pnpm --filter @matura/contracts check-deployment:bsc-testnet  # bytecode/roles/vaults/balances/manifest==on-chain
```

- **On fail:** seed is state-aware/resumable — re-run.

### Step 7 — 🔴 Scripted execute + settle (acceptance proof) **[CLAUDE, needs your GO]**

```bash
pnpm --filter @matura/contracts demo:testnet-execute
```

- **Verify:** `executeRoute` + settle tx receipts confirmed; hashes recorded to `.testnet-receipts/` and copied into `docs/deployment-runbook.md`. Satisfies "≥1 real execute+settle recorded."
- **Note:** the scripted claim has a short maturity window — the script waits for maturity, then settles; it's resumable if it lands execute but not settle.

### Step 7.5 — Smoke the compiled API image (pre-go-live) **[YOU]**

Before the go-live gate, prove the **compiled** runtime + Prisma engine resolve on the target
platform (dev/tests only ever run the TS source, not `dist`). Build the API image and boot it once
against a throwaway Postgres:

```bash
docker run --rm -e DATABASE_URL=<throwaway PG> <api-image> node apps/api/dist/main.js
```

- **Verify:** it boots and **Prisma connects** (no `MODULE_NOT_FOUND` / "Query engine not found").
  This proves the compiled `dist` runtime + the query-engine `.so` resolve on linux before real traffic.
- **On fail:** the compiled output or the Prisma engine isn't resolving — do **not** go live; fix the
  image (e.g. a `nest-cli.json` assets copy of `src/generated` → `dist/generated`, incl. the `.so`)
  and re-smoke.

---

## Phase 2 — Hosting on EasyPanel **[YOU]** 🔴 (go-live)

> For each service: **Source = your git repo**, **Build Path = repo root `/`**, **Dockerfile path** as
> noted. EasyPanel passes service env as **both build args and runtime** — so put **only public**
> vars on the frontends, and **never** a secret as a frontend var (build args are recoverable).
>
> **Canonical env matrix:** `docs/deployment.md` → [EasyPanel / Docker hosting] holds the living
> build-arg-vs-runtime env matrix (per service). The values below mirror it — if they drift, treat
> `docs/deployment.md` as the source of truth and reconcile back to it.

### Step 8a — Postgres service

- Create a **Postgres** service; note its internal `DATABASE_URL`.

### Step 8b — Migration (run once)

- One-off: run `prisma migrate deploy` against the DB **before** API/worker roll (a temporary job/service using the API Dockerfile with command `pnpm --filter @matura/api migrate:deploy`, or `docker run --rm -e DATABASE_URL=… <api-image> pnpm --filter @matura/api migrate:deploy`).
- **Verify:** migrations applied. **Do not** run this per-replica.

### Step 8c — API service (Dockerfile `apps/api/Dockerfile`)

Runtime env (all **runtime**, not build args):

```
NODE_ENV=production
CHAIN_ID=97
RPC_URL=https://bsc-testnet-rpc.publicnode.com
INDEXER_CONFIRMATIONS=0
DATABASE_URL=<from 8a>
JWT_SECRET=<32+ char random>
SIWE_DOMAIN=app.usematura.xyz            # bare host, no scheme/port
API_CORS_ORIGINS=https://app.usematura.xyz   # scheme, no trailing slash
# NO ISSUER_PRIVATE_KEY, DEMO_ISSUER_SIGNING_ENABLED unset/false
```

- Healthcheck = **`GET /api/v1/health`** (liveness). Startup grace ≥ reindex time.
- **Reorg note:** with `INDEXER_CONFIRMATIONS=0` (finalized-tag cursor) reorg safety leans on the
  indexer's block-hash-mismatch **full-wipe+reindex** rather than a confirmations buffer — acceptable
  for a testnet demo.
- **Verify:** service healthy on `/api/v1/health`.

### Step 8d — Worker service (SAME image + Dockerfile, role via env)

- Second App service, same repo/Build-Path/Dockerfile (`apps/api/Dockerfile`); in **Environment** add
  **`SERVICE_ROLE=worker`** — the image entrypoint runs `dist/worker.js` (**no command override**), and
  the baked `HEALTHCHECK` short-circuits to success for the worker (no restart-loop). Same runtime env
  as 8c, **no domain**, **replicas = 1**.
- **Verify:** logs show the indexer polling + advancing the cursor (no "listening on port" line).

### Step 8e — Landing service (Dockerfile `apps/landing/Dockerfile`)

Build-arg env only (public):

```
NEXT_PUBLIC_LANDING_URL=https://usematura.xyz
NEXT_PUBLIC_APP_URL=https://app.usematura.xyz
NEXT_PUBLIC_CONTRACTS_DEPLOYED=true
```

### Step 8f — App service (Dockerfile `apps/app/Dockerfile`)

Build-arg env only (public):

```
NEXT_PUBLIC_API_URL=https://api.usematura.xyz/api/v1
NEXT_PUBLIC_RPC_URL=https://bsc-testnet-rpc.publicnode.com
NEXT_PUBLIC_CHAIN_ID=97
NEXT_PUBLIC_APP_URL=https://app.usematura.xyz
NEXT_PUBLIC_LANDING_URL=https://usematura.xyz
```

### Step 8g — Domains (Traefik)

- Map `usematura.xyz` → landing (target port 3001), `app.usematura.xyz` → app (3002), `api.usematura.xyz` → API (3000). Mark primaries; **let Traefik own TLS** — do **not** force HTTPS in-app (avoids redirect loop). No wildcard rule that collides with `app.`.
- **Verify:** both hosts serve over HTTPS; no redirect loop.

---

## Phase 3 — Verify & smoke

### Step 9 — Catch-up gate **[YOU/CLAUDE]**

- Poll readiness until the indexer has caught up:

```bash
curl -s https://<api-host>/api/v1/health/ready   # wait for checks.cursor.status:"up"
```

- **Verify:** `status:"ok"`, cursor `up`, small lag. _(Do not smoke the product before this.)_

### Step 10 — Smoke **[CLAUDE drives scripts; YOU do the wallet leg]**

```bash
SMOKE_API_URL=https://<api-host> pnpm --filter @matura/e2e smoke:api
EXPECT_API_URL=https://<api-host>/api/v1 EXPECT_RPC_URL=bsc-testnet-rpc.publicnode.com \
  EXPECT_CHAIN_ID=97 pnpm --filter @matura/e2e assert:public-config   # (needs the built app bundle)
E2E_LANDING_URL=https://usematura.xyz E2E_APP_URL=https://app.usematura.xyz \
  pnpm --filter @matura/e2e test:e2e:remote
```

- **Landing smoke:** canonical/metadata, nav, cross-domain "Open Matura" CTA, static assets, responsive.
- **Product smoke [YOU]:** connect wallet (network = BSC Testnet 97) → SIWE sign-in → `/account` shows your seeded claims → optimize a route → review/simulate → **sign within ~120s** (RouteIntent TTL) → `executeRoute` → "Liquidity received" → execution on `/activity` with a working explorer link.
- **On fail:** empty `/account` ⇒ worker not caught up (Step 9) or wrong `SEED_BENEFICIARY`; dead API calls ⇒ `API_CORS_ORIGINS`/`SIWE_DOMAIN` mismatch (Step 8c); login fails ⇒ `SIWE_DOMAIN` ≠ `app.usematura.xyz`.

### Step 11 — Final report **[CLAUDE]**

Deployed URLs, contract addresses (`97.json`), verification status, the execute+settle **tx hashes**,
smoke results, and any remaining manual steps. Update `docs/deployment.md` iteration log + the
gitignored `docs/deployment-runbook.md`.

---

## Acceptance checklist (from the plan)

- [ ] Addresses from `97.json` consumed by API + app; landing only public metadata.
- [ ] `usematura.xyz`→landing, `app.usematura.xyz`→app; no redirect loop / route collision; CTA works.
- [ ] `/account` + route optimize/simulate work on chain 97.
- [ ] ≥1 real execute + settlement recorded with tx hashes.
- [ ] No mainnet (56) tx (every sender asserts 97).
- [ ] No secret in any frontend image; `check:bundle` both guards pass.
- [ ] Final report delivered.

## Rollback / reset

- **Reseed:** re-run Step 6 (contracts are immutable — never "deleted").
- **Contract rollback = cascade:** redeploy → reseed → commit manifest → rebuild `@matura/chain` → **rebuild BOTH frontends** (NEXT_PUBLIC baked) → EasyPanel Force-Rebuild all → migrate only if schema changed.
- **Reindex:** `reindex.cli` wipes projections + rebuilds from `deploymentBlock` (minutes over public RPC).
