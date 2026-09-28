---
title: BSC-Testnet Deploy + EasyPanel Docker Hosting
type: feat
date: 2026-09-28
brainstorm: docs/brainstorms/2026-09-28-bsc-testnet-deploy-easypanel-brainstorm.md
---

# 🚀 BSC-Testnet Deploy + EasyPanel Docker Hosting

## Overview

Deploy the Matura MVP to **BSC Testnet (chain 97) only**, host all four services (landing, product
app, API, indexer worker) + Postgres on **EasyPanel via Docker**, and complete **one real on-chain
execute + settle** — while leaving the local (31337) environment untouched. This is an
infra/ops iteration: **no contract logic changes.**

Structured as **two tracks**: **Track A** — parallel authoring workstreams (Dockerfiles, scripts,
docs) that run concurrently with no live actions; **Track B** — a sequential execution runbook with
explicit GO gates, `[I RUN]` (CLI-drivable) vs `[OPERATOR]` (EasyPanel/DNS/secrets) tags, and a
VERIFY + ROLLBACK per step. Syncs into the living `docs/deployment.md`.

**Constraints (user):** no `any` (type-aware ESLint); follow base-code idioms; parallelize Track A;
add tests where they add signal; keep the local env working.

## Decisions (from brainstorm — locked)

- **Chain 97 only.** Every raw-key sender asserts chainId 97 and hard-refuses 56/unknown (reuse `scripts/lib/network-guard.ts`).
- **EasyPanel + Docker** for landing/app/api/worker/Postgres (not Vercel). Per-app `turbo prune` multi-stage Dockerfiles, `node:24-slim`. **API + worker share ONE image**, two start commands.
- **Build ordering:** deploy → write `97.json` → **commit manifest + regen `deployments.generated.ts`** → rebuild `@matura/chain` → build app/api images with `NEXT_PUBLIC_*` as **build args** (Next inlines at build; rebuild frontends on any address change). Server secrets **runtime-only on the API**.
- **API hardened:** `NODE_ENV=production`, **no issuer key**, `DEMO_ISSUER_SIGNING_ENABLED=false`. Claims signed at **seed time**.
- **Beneficiary:** `SEED_BENEFICIARY` override for the interactive demo (payroll+escrow only — stream is recipient-gated); a **deployer-owned** claim for the scripted proof tx.
- **RPC:** public BSC-testnet (`finalized` tag confirmed supported on publicnode → `INDEXER_CONFIRMATIONS=0`); replaceable `RPC_URL` + bounded polling fallback (`INDEXER_CONFIRMATIONS>0`, `INDEXER_MAX_BLOCK_RANGE`).
- **Verify:** free BSCScan key → wire `hardhat-verify` (`etherscan.customChains` for 97) + emit manual commands.

## Acceptance Criteria

- [ ] Chain-97 addresses come only from deploy output (`97.json`), consumed by API + app; landing reads only public metadata (`NEXT_PUBLIC_CONTRACTS_DEPLOYED`).
- [ ] `matura.xyz` → landing, `app.matura.xyz` → app; **no redirect loops / route collisions**; cross-domain CTA works.
- [ ] Portfolio (`/account`) + route optimize/simulation work against chain 97.
- [ ] **≥1 real BSC-testnet execute + settlement** recorded with tx hashes.
- [ ] **No mainnet (56) tx** — pre-flight + every sender refuses non-97.
- [ ] No DB/issuer/deployer secret reachable from any frontend image (`check:bundle` both guards pass; secrets runtime-only).
- [ ] Landing + product smoke pass; final report of URLs, addresses, verification status, smoke results, remaining manual steps.

## Operator Prerequisites & Actions (what YOU provide / do)

**Provide up front (blocks Track B):**

- [ ] A running **EasyPanel instance** you can create services on.
- [ ] **DNS control** for `matura.xyz` (apex) + `app.matura.xyz` (to point at EasyPanel/Traefik).
- [ ] A free **BSCScan API key** (for explorer verification; else we ship manual commands).
- [ ] The **`SEED_BENEFICIARY` wallet address** you'll connect in the demo — **funded with tBNB** (it signs `executeRoute`, needs gas).
- [ ] Confirm keystore vars set: `DEPLOYER_PRIVATE_KEY` (funded), `ISSUER_PRIVATE_KEY`, `BSC_TESTNET_RPC_URL`.

**Do during execution (Track B):**

- [ ] Approve the **3 GO gates** — step 2 (deploy contracts), step 7 (real execute+settle), step 9 (go-live hosting).
- [ ] Step 9a–b: provision **Postgres**, set `DATABASE_URL`, run the **migrate one-off job** (once).
- [ ] Step 9c: set API **runtime** env (`SIWE_DOMAIN=app.matura.xyz`, `API_CORS_ORIGINS=https://app.matura.xyz`, `JWT_SECRET`, `RPC_URL`, `CHAIN_ID=97`, `NODE_ENV=production`, no issuer key); API healthcheck = `/api/v1/health`; worker = no HTTP probe.
- [ ] Step 9c–d: deploy 4 services (Build Path = repo root, per-service Dockerfile); **public build-args only** to frontends, **secrets runtime-only** on API.
- [ ] Step 9e: map domains in Traefik (apex→landing, `app.`→app, no wildcard), let the proxy own TLS.
- [ ] Flip landing **`NEXT_PUBLIC_CONTRACTS_DEPLOYED=true`**.
- [ ] Step 10: run/confirm smoke; for the interactive demo, connect the wallet and **optimize→sign within ~120s** (RouteIntent TTL).

---

## Track A — Parallel PREP workstreams (authoring; no live actions)

> Disjoint files → run concurrently (one agent per WS). **Serialization point:** `packages/contracts/package.json` script entries are touched by WS‑1/2/4 — one owner adds all new script names in a single edit, or stage per-file. All: **no `any`**, match base idioms, run the relevant gate green, don't commit.

### WS-1 · Pre-flight + `check-deployment.ts` `[packages/contracts/scripts]`

- [ ] `scripts/preflight.ts` — assert **chainId 97** (`assertChainId`, `lib/network-guard.ts`); assert required config vars **present** (`DEPLOYER_PRIVATE_KEY`, `ISSUER_PRIVATE_KEY`, `BSC_TESTNET_RPC_URL`) **without printing values**; print deployer + issuer **addresses** (derived) and **tBNB balance** with a min threshold; assert MockUSDT assumptions (6-dp, non-fee/non-rebasing — documented). Refuse to proceed on any failure.
- [ ] `scripts/check-deployment.ts` — for the chain-97 manifest: **bytecode present** at every address (`getCode`), **role wiring** (reuse `lib/assert-wiring.ts`), **vault config** vs `config/vault-mandates.ts`, deployer/vault **balances**, `manifest.chainId === 97`, and **manifest addresses == on-chain** (guards the redeploy/stale-manifest hazard). Exit non-zero + human-readable report on any mismatch.
- [ ] Test: `test/PreflightGuard.test.ts` — the chain guard **refuses 56 and unknown**, accepts 97/31337 (pure `assertChainId`); balance-threshold helper boundary. (No `any`; `node:test`+`assert/strict` idiom.)
- **Done:** `contracts:test` + `typecheck` green; both scripts run against the local 31337 stack as a dry-run.

### WS-2 · Explorer verification wiring `[packages/contracts/hardhat.config.ts + package.json + scripts]`

- [ ] Enable `@nomicfoundation/hardhat-verify` (import in `hardhat.config.ts`); add `verify` config: `etherscan.apiKey = configVariable("BSCSCAN_API_KEY")` + `customChains` for chainId **97** (api + browser URLs for the testnet explorer).
- [ ] `scripts/verify-explorer.ts` + `verify:bsc-testnet:explorer` script — read `97.json`, run explorer verify **per contract with its constructor args** (6 core + 2 source adapters + 2 vaults; constructor-arg mismatch is the usual failure). Emit the exact **manual `hardhat verify` commands** to the report as a fallback.
- **Done:** `typecheck` green; dry-run prints the per-contract command set (no key needed to author).

### WS-3 · `SEED_BENEFICIARY` override `[packages/contracts/scripts/seed.ts + config/demo.ts]`

- [ ] Optional `SEED_BENEFICIARY` (checksummed address) → used as beneficiary for **payroll (attestation) + escrow (`createPayout`)**. **Skip/guard the stream claim** for an arbitrary beneficiary (`MockStream.createClaim` is recipient-gated `seed.ts:268-278`; can only be created by a key we hold) — document.
- [ ] Distinct **claim labels** for the interactive set vs. the deployer-owned scripted set (`config/demo.ts` `resolveClaimId` labels) so ids don't collide.
- [ ] Test: `test/SeedBeneficiary.test.ts` — beneficiary resolver returns `SEED_BENEFICIARY` when set (valid checksummed), else deployer fallback; rejects malformed input (no `any`).
- **Done:** `contracts:test` green; seed dry-run against 31337 with/without the env behaves as specified.

### WS-4 · Scripted execute+settle proof `[packages/contracts/scripts]`

- [ ] `scripts/demo-testnet-execute.ts` — `assertChainId(97)` first; drive a **deployer-owned** claim through optimize→build route→sign(deployer)→`executeRoute`→`settleClaim`. **Public-RPC hardening:** wide route deadline; explicit nonce management; `waitForTransactionReceipt` with retry/backoff; **resumable settle** (re-drive settle if the route already executed); **record each tx hash as it confirms** to `docs/deployment-runbook.md` (gitignored) or a receipts file.
- **Done:** `typecheck` green; logic reviewed against `demo-settle.ts` idioms (adapts, doesn't duplicate the on-chain path).

### WS-5 · Dockerfiles + build config `[apps/{landing,app,api} + root]`

- [ ] `apps/app/next.config.ts` + `apps/landing/next.config.ts`: add `output: "standalone"` + `outputFileTracingRoot` = repo root.
- [ ] `apps/landing/Dockerfile`, `apps/app/Dockerfile`, `apps/api/Dockerfile` — 3-stage `turbo prune @scope --docker` → install(`--frozen-lockfile`)→build→slim runner (`node:24-slim`, `corepack enable`, non-root user). Next runners copy `.next/standalone` + **`.next/static` + `public`**; API runner copies the pruned tree (keeps prisma engines + generated client). API build runs `prisma generate` then `turbo run build --filter=@matura/api` (builds `@matura/chain` first via the task graph). `NEXT_PUBLIC_*` as `ARG`→`ENV` **before** build. Dockerfile `HEALTHCHECK` → `GET /api/v1/health` (API only).
- [ ] Root `.dockerignore` — exclude `node_modules`/`.next`/`.turbo`/`artifacts` but **NOT** `packages/chain/src/deployments/97.json` or `deployments.generated.ts`.
- [ ] `apps/api/package.json`: add `migrate:deploy` (`prisma migrate deploy`); a **migration one-off** command/Dockerfile target (run once on release, gates BOTH API + worker; never per-replica).
- [ ] Positive-bake assertion: extend `apps/e2e/scripts/check-app-secrets.mjs` (or a new `assert-public-config.mjs`) to **assert the built app chunks contain the expected API origin, RPC origin, and `CHAIN_ID=97`** (a wrong/empty `NEXT_PUBLIC_*` is silently empty + breaks the build-time CSP `connect-src`).
- **Done:** `pnpm --filter @matura/app build` + landing build succeed with standalone output; a local `docker build` of each image succeeds (or documented if Docker-build is operator-run).

### WS-6 · Remote smoke `[apps/e2e]`

- [ ] `playwright.remote.config.ts` — **no `webServer` block**; reads `E2E_LANDING_URL`/`E2E_APP_URL` (assert both `https://`); reuse `landing.spec.ts` + `product.spec.ts`.
- [ ] `scripts/smoke-api.mjs` — curl `/api/v1/health` (200 ok), `/api/v1/health/ready` (poll until `cursor.up`), SIWE `nonce → verify → bearer`, one authed read.
- **Done:** scripts lint clean; dry-run against the local stack.

### WS-7 · Docs sync `[docs/]`

- [ ] Extend **`docs/deployment.md`** (living): EasyPanel/Docker section (per-service Build Path = repo root + Dockerfile path; build-args-not-secret warning; migrate one-off job; healthcheck = `/health` liveness, worker = none; Traefik TLS/no-app-redirect; domains apex→landing, `app.`→app, no wildcard), **env matrix**, rollback **cascade**, public-RPC limitations + iteration entry.
- [ ] Update **`docs/demo-operator-checklist.md`**: `SIWE_DOMAIN=app.matura.xyz`, `API_CORS_ORIGINS=https://app.matura.xyz`, `NEXT_PUBLIC_CONTRACTS_DEPLOYED=true` flip, RouteIntent **120s window** ("optimize→sign promptly"), operator wallet needs **tBNB for gas**.
- [ ] `docs/deployment-runbook.md` (gitignored) — live 97 addresses + tx hashes captured during execution.
- **Done:** docs build/lint clean; env matrix complete.

---

## Track B — Sequential EXECUTION runbook (GO gates)

> `[I RUN]` = CLI-drivable here (keystore keys ready). `[OPERATOR]` = you (EasyPanel/DNS/secrets). Each step: **VERIFY** before proceeding; **ROLLBACK** if it fails. **Irreversible/outward steps (2, 7, 9) need an explicit GO from you.**

1. **Pre-flight** `[I RUN]` — `preflight.ts` (chainId 97, vars present, addresses, tBNB balance, MockUSDT) **+ full quality gate** (`lint`/`typecheck`/`test`/`contracts:test`). **VERIFY:** all green, balance ≥ threshold. **ROLLBACK:** n/a (nothing sent).
2. **Deploy contracts** `[I RUN]` 🔴GO — `deploy:bsc-testnet` → wire roles → write `97.json`. **VERIFY:** `assertWiring` passed; `97.json` has non-zero addresses. **ROLLBACK:** Ignition journal (`ignition/deployments/<id>`) makes a rerun resumable — **back it up**; on any redeploy confirm manifest == on-chain (step 6).
3. **Commit manifest + rebuild chain** `[I RUN]` — commit `97.json` + regenerated `deployments.generated.ts` (satisfies the freshness/ABI gate), then `gen:deployments` + `@matura/chain build`. **VERIFY:** freshness gate clean; `@matura/chain/dist` rebuilt. _(Ordering guard: images must build from this committed manifest, not the zero manifest.)_
4. **Explorer verify** `[I RUN]` — `verify:bsc-testnet:explorer` (if BSCScan key set) else emit manual commands. **VERIFY:** contracts show verified (or commands captured). Non-blocking.
5. **Seed** `[I RUN]` — 2 vaults (Stable/Flex) + claims: deployer-owned scripted claim **and** `SEED_BENEFICIARY` interactive claims (payroll+escrow). State-aware/resumable. **VERIFY:** `verify:bsc-testnet` (on-chain wiring/state) passes. **ROLLBACK:** re-run (idempotent/resumable).
6. **check-deployment.ts** `[I RUN]` — bytecode/roles/vaults/balances/`chainId===97`/manifest==on-chain. **VERIFY:** exit 0.
7. **Scripted execute + settle** `[I RUN]` 🔴GO — `demo-testnet-execute.ts` (deployer-owned claim). **VERIFY:** both tx receipts confirmed; hashes recorded. **ROLLBACK:** resumable settle if execute landed but settle reverted (RouteExpired/nonce → widen deadline, retry).
8. **Build images** `[I RUN or CI]` — build landing/app/api from the committed manifest; `NEXT_PUBLIC_*` build args (API/RPC origins + `CHAIN_ID=97` + `NEXT_PUBLIC_CONTRACTS_DEPLOYED=true` for landing). **VERIFY:** positive-bake assertion + `check:bundle` (both guards) pass on the built app bundle.
9. **Host on EasyPanel** `[OPERATOR]` 🔴GO — per Track A/WS-7 + env matrix:
   a. Provision **Postgres**; set `DATABASE_URL` (runtime, API+worker only).
   b. Run the **migrate one-off job** (`prisma migrate deploy`) — **exactly once**, gates API+worker. **VERIFY:** migrations applied.
   c. Deploy **API** (`node dist/main.js`) + **worker** (`node dist/worker.js`, same image, no HTTP healthcheck) with runtime env: `NODE_ENV=production`, `CHAIN_ID=97`, `RPC_URL`, `INDEXER_CONFIRMATIONS=0`, `SIWE_DOMAIN=app.matura.xyz`, `API_CORS_ORIGINS=https://app.matura.xyz`, `JWT_SECRET`, **no issuer key**. API healthcheck = `/api/v1/health` (liveness) with startup grace ≥ reindex time.
   d. Deploy **landing** (`matura.xyz`) + **app** (`app.matura.xyz`); Build Path = repo root, per-service Dockerfile; public build args only; consistent `NEXT_PUBLIC_LANDING_URL`/`NEXT_PUBLIC_APP_URL` in both.
   e. **DNS + domains** (Traefik): apex→landing, `app.`→app, no wildcard/redirect loop; let Traefik own TLS (no in-app HTTPS force). **VERIFY:** both hosts serve, no loop.
10. **Catch-up gate + smoke** — poll `/health/ready` until `cursor.up` & small lag `[OPERATOR/I RUN]`, then **landing smoke** (canonical/metadata, nav, cross-domain CTA, assets, responsive) + **product smoke** (health/ready, wallet network 97, `/account` load, optimize, tx simulation, explorer links). **VERIFY:** all pass; SIWE `nonce→verify→bearer` works.
11. **Final report** — URLs, addresses, verification status, tx hashes, smoke results, remaining manual steps.

---

## Environment Matrix

| Var                                                                                                                                                                                                                                             | Where                              | Build-arg / Runtime | Notes                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LANDING_URL`                                                                                                                          | **app**                            | **build-arg**       | Inlined at `next build`; also drive the CSP `connect-src`. Rebuild on change. |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LANDING_URL`, `NEXT_PUBLIC_CONTRACTS_DEPLOYED`                                                                                                                                                              | **landing**                        | **build-arg**       | Only these; **no** wallet/chain/secret vars (keeps landing wallet-free).      |
| `DATABASE_URL`, `JWT_SECRET`                                                                                                                                                                                                                    | **api + worker**                   | **runtime**         | Secrets — never a build arg.                                                  |
| `RPC_URL`, `CHAIN_ID=97`, `INDEXER_CONFIRMATIONS=0`, `INDEXER_MAX_BLOCK_RANGE`, `INDEXER_POLL_INTERVAL_MS`, `SIWE_DOMAIN=app.matura.xyz`, `API_CORS_ORIGINS=https://app.matura.xyz`, `NODE_ENV=production`, `DEMO_ISSUER_SIGNING_ENABLED=false` | **api (+worker where applicable)** | **runtime**         | `ISSUER_PRIVATE_KEY` **absent** (prod refuses it).                            |
| `DEPLOYER_PRIVATE_KEY`, `ISSUER_PRIVATE_KEY`, `BSC_TESTNET_RPC_URL`, `BSCSCAN_API_KEY`                                                                                                                                                          | **local/CI deploy only**           | Hardhat keystore    | Never in any hosted service.                                                  |

## Testnet reset / reseed & rollback cascade

- **Reseed (no contract change):** re-run `seed:bsc-testnet` (state-aware/resumable) — contracts are **immutable, never "deleted."**
- **Full contract rollback = cascade:** redeploy (new addresses) → reseed → commit manifest → rebuild `@matura/chain` → **rebuild BOTH frontends** (NEXT_PUBLIC baked) → redeploy all images → re-run migrate only if schema changed.
- **Reindex:** `reindex.cli` wipes projections + rebuilds from `deploymentBlock` — over public RPC this is a long, rate-limited scan (bounded by `INDEXER_MAX_BLOCK_RANGE`); expect minutes.

## Public RPC limitations

`finalized` tag works on `bsc-testnet-rpc.publicnode.com` (probed: chainId `0x61`). Keep
`INDEXER_CONFIRMATIONS=0`; if switching to an RPC without the tag, set `INDEXER_CONFIRMATIONS=N`
(confirmations-based cursor). `RPC_URL` is replaceable; polling is bounded. Rate-limits → the
scripted tx uses receipt retry/backoff.

## Tests to add

- `test/PreflightGuard.test.ts` — chain guard refuses 56/unknown (WS-1).
- `test/SeedBeneficiary.test.ts` — beneficiary resolver + malformed-input rejection (WS-3).
- `assert-public-config.mjs` — positive bake assertion for `NEXT_PUBLIC_*` (WS-5).
- Remote smoke (WS-6) doubles as the acceptance test for hosting.

## Risks & guards (from SpecFlow)

- **Healthcheck on `/ready` → restart loop during reindex** → use `/health`; `/ready` is a GO gate only.
- **Worker HTTP healthcheck fails** (no server) → process-only probe.
- **`SIWE_DOMAIN`/`API_CORS_ORIGINS` unset** → logins/API calls silently dead → assert at pre-flight, set before smoke.
- **migrate races** → one-off job, gates both services, never per-replica.
- **Stale/zero manifest baked into image** → commit `97.json` before build; `.dockerignore` keeps it.
- **RouteIntent 120s TTL** → interactive demo: optimize→sign promptly; re-optimize if lapsed.
- **`SEED_BENEFICIARY` + recipient-gated stream** → interactive set = payroll+escrow only; operator wallet needs tBNB.
- **Traefik + in-app HTTPS force** → redirect loop → let proxy own TLS; verify `trust proxy=1` hop count.

## Parallelization map

- **Track A:** WS-1..7 run concurrently (disjoint files); only `packages/contracts/package.json` script entries are a shared edit (single owner). WS-5 Next-config edits (app+landing) + Dockerfiles are independent per app.
- **Track B:** inherently sequential (deploy critical path). Track A must complete before Track B step 8 (images) and step 1 (pre-flight uses WS-1); steps 1–7 need only WS-1..4; step 8 needs WS-5; step 10 needs WS-6.

## References

- Brainstorm: `docs/brainstorms/2026-09-28-bsc-testnet-deploy-easypanel-brainstorm.md`; living doc `docs/deployment.md`; operator checklist `docs/demo-operator-checklist.md`.
- Code: `scripts/lib/network-guard.ts` (chain guard), `scripts/{deploy,seed,verify,demo-settle}.ts`, `hardhat.config.ts` (networks + `configVariable`), `apps/api/src/{main,worker}.ts`, `health/health.{controller,service}.ts`, `config/env.validation.ts`, `common/security-bootstrap.ts`, `apps/{app,landing}/next.config.ts`, `turbo.json` (`build.env`), root `package.json` (pnpm@10.29.2, node<25), `apps/e2e/playwright.config.ts` + `scripts/check-*.mjs`.
- Learnings: `docs/solutions/integration-issues/{cross-stack-e2e-harness-instant-mine-chain,best-execution-router-mirror-intent-optimizer,next15-wallet-frontend-siwe-eip712-e2e}.md`; `build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md`; `hardhat3-deploy-seed-manifest-pipeline.md`.
- External: Turborepo `prune`/Docker, Next.js standalone + `NEXT_PUBLIC` build-time, Prisma Docker (migrate-deploy once, `node:24-slim`), EasyPanel App Service/Builders/Domains (build-args-not-secret; Build Path = repo root; Traefik TLS). Healthcheck UI field **unconfirmed** → Dockerfile `HEALTHCHECK` fallback.

## AI-Era Notes

Research by Claude (repo Docker/build/verify surface, external turbo-prune/EasyPanel best practices, SpecFlow failure-mode pass). All findings file:line- or URL-grounded. Human review focus: the on-chain GO gates (steps 2, 7), the EasyPanel secret/build-arg boundary, and the migrate-once job.
