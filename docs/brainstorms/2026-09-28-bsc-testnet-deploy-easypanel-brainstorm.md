# BSC-Testnet Deploy + EasyPanel Hosting — Brainstorm

**Date:** 2026-09-28
**Status:** Ready for planning
**Author:** arjunamarcelino

## What We're Building

A **one-time, repeatable BSC-Testnet (chain 97) deployment** of the Matura MVP — contracts +
API/indexer + both frontends — hosted on **EasyPanel via Docker**, with the local (31337)
environment left untouched. Ends with a real on-chain execute + settle transaction recorded by
hash, and the public sites live at `matura.xyz` (landing) / `app.matura.xyz` (product).

This is an **infrastructure/deployment iteration**, not a feature. No contract logic changes.

## Why This Approach

The spec named Vercel, but the operator runs **EasyPanel** (self-hosted, Docker-based PaaS), so
all three apps + Postgres ship as **EasyPanel Docker services** with domains routed there. Per-app
images are built with **`turbo prune`** multi-stage Dockerfiles (minimal, isolated, standard
Turborepo pattern). Execution is **split**: everything CLI-drivable (pre-flight, contract
deploy→seed→verify→manifest, `check-deployment.ts`, smoke reads, the real demo tx, the Dockerfiles,
docs) is done in-repo; the **external/infra steps** (EasyPanel project creation, DNS, Postgres
provisioning, secret injection) are executed by the operator with clearly-marked commands.

## Key Decisions

| Decision             | Choice                                                                                                     | Rationale                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Target chain**     | BSC Testnet (97) ONLY                                                                                      | Pre-flight asserts chainId 97; **refuses 56 or unknown**. Never sends a mainnet tx.                                                                                                         |
| **Preserve local**   | Yes — 31337 manifest/env untouched                                                                         | Deploy writes a separate `97.json`; Docker builds never clobber local state.                                                                                                                |
| **Hosting**          | **EasyPanel + Docker** (not Vercel) for landing, app, api, Postgres                                        | Operator's platform; one Docker service each + a Postgres service.                                                                                                                          |
| **Docker build**     | `turbo prune --scope=<app> --docker` per-app multi-stage Dockerfiles                                       | Smallest images, clean isolation. API image reused for the **indexer worker** as a second service (same image, different start cmd).                                                        |
| **Build ordering**   | contracts → write `97.json` → rebuild `@matura/chain` → build app/api images                               | Chain-97 addresses come only from deploy output; consumed by API + app at build.                                                                                                            |
| **Env separation**   | `NEXT_PUBLIC_*` as **Docker build-args** (Next inlines at build); secrets **runtime-only on API**          | Server keys (`DATABASE_URL`, `JWT_SECRET`, `ISSUER_PRIVATE_KEY`) never reach any frontend image. Guarded by the two `check:bundle` scans. **Frontends must rebuild when addresses change.** |
| **RPC**              | Public BSC-testnet RPC, **replaceable URL + bounded polling**                                              | Per spec; no new indexing platform. Tune indexer confirmations if the `finalized` tag is unreliable.                                                                                        |
| **Verification**     | Automated `hardhat verify` via a free BSCScan API key (operator adds) + emit manual commands               | Add a `verify:bsc-testnet:explorer` script; contracts show "verified".                                                                                                                      |
| **API hardening**    | Hosted API runs `NODE_ENV=production`, **no issuer key**, `DEMO_ISSUER_SIGNING_ENABLED=false`              | Claims signed at **seed time** (out-of-band); hardened helmet CSP + Swagger off. `/issuer` live-mint disabled on testnet (accepted).                                                        |
| **Demo beneficiary** | `SEED_BENEFICIARY` override for the interactive demo; a **deployer-owned** claim for the scripted proof tx | Operator connects their own wallet on `app.matura.xyz`; a keystore key signs the acceptance-criteria execute+settle.                                                                        |
| **Keys**             | Deployer (funded) + issuer in Hardhat keystore; issuer used **only at seed time**                          | Deploy/seed/verify runnable now; issuer never enters the hosted API or the deploy path (seed-only network).                                                                                 |

## Scope (this iteration)

**I drive (CLI/in-repo):**

- Pre-flight gate: env-vars present (values never printed), RPC → chainId **97** (refuse else), deployer/issuer addresses + tBNB balance + MockUSDT assumptions, **full quality gate**.
- `deploy:bsc-testnet` → wire roles → write typed `97.json` manifest → rebuild `@matura/chain`.
- `seed:bsc-testnet` (two vaults + Alice's synthetic claims), then verify.
- **`scripts/check-deployment.ts`** — bytecode presence, role wiring, vault config, balances, manifest chainId.
- Post-deploy smoke: **reads first**, then one **low-risk demo tx**; then a full **execute + settlement** tx recorded by hash.
- **Dockerfiles** (landing, app, api) + EasyPanel service definitions + **env matrix** (public vs server).
- **Testnet reset/reseed** procedure — reseed only; **contracts are never "deleted"** (a fresh deploy = new addresses).
- Extend **`docs/deployment.md`** (prereqs, env matrix, commands, rollback/fallback, public-RPC limitations) + chain-97 runbook.

**Operator executes (external — I provide exact steps):**

- EasyPanel projects for the 4 services; DNS for `matura.xyz` → landing, `app.matura.xyz` → app (no redirect loops / route collisions).
- Managed Postgres provisioning + `DATABASE_URL`; inject all server secrets into the API service only.
- Run migrations (`prisma migrate deploy`) against the hosted DB; set `NEXT_PUBLIC_LANDING_URL`/`NEXT_PUBLIC_APP_URL` consistently in **both** frontends.
- Landing smoke (canonical/metadata, nav, cross-domain "Open Matura" CTA, static assets, responsive) + product smoke (health/ready, wallet network, Account load, quote optimize, tx simulation, explorer links).

## Resolved Questions

- **Issuer-key vs `NODE_ENV` — RESOLVED: hosted API runs `NODE_ENV=production`, NO issuer key.**
  `env.validation` (enum `development|production|test`) **rejects a non-empty `ISSUER_PRIVATE_KEY`
  at boot when `production`**, and demo-signing needs `NODE_ENV≠production`. Decision: all claims
  are created **at seed time** (issuer key signs attestations locally/out-of-band, never in the
  hosted service), so the API runs `NODE_ENV=production` with `DEMO_ISSUER_SIGNING_ENABLED=false`
  and no issuer key → hardened helmet CSP + Swagger off. Tradeoff accepted: the `/issuer`
  live-simulator can't mint new claims on testnet. (The still-unimplemented `{31337,97}` chain-scope
  of the demo-signing gate is therefore moot for this deploy.)
- **Demo beneficiary — RESOLVED: add a `SEED_BENEFICIARY` override.** On `bscTestnetSeed` (2
  accounts) Alice falls back to the deployer and there's **no override today** (`seed.ts:64-66`;
  `ACTORS.alice=2`). Add an optional `SEED_BENEFICIARY` env/arg so the interactive
  wallet-connected demo assigns claims to a wallet the operator controls. **Note for sequencing:**
  the scripted acceptance-criteria tx (below) uses a **deployer-owned** claim so a keystore key can
  sign+execute it; the override is for the interactive demo. Plan seeds both a deployer-beneficiary
  claim (scripted proof) and operator-wallet claims (interactive).
- **`finalized` tag — RESOLVED: supported.** Probed `bsc-testnet-rpc.publicnode.com` → chainId
  `0x61` (97) and a real `finalized` block. Keep `INDEXER_CONFIRMATIONS=0` (finalized tag);
  confirmations fallback (`INDEXER_CONFIRMATIONS=N`) + bounded polling (`INDEXER_MAX_BLOCK_RANGE`,
  `INDEXER_POLL_INTERVAL_MS`) are built in for a replaceable `RPC_URL`. No code change.
- **Explorer verify — RESOLVED: get a free BSCScan API key.** No `hardhat verify` script is wired
  today; add `verify:bsc-testnet:explorer` (hardhat-verify) + run/provide exact commands so
  contracts show verified. (Emit manual commands regardless.)
- **Real tx — RESOLVED: scripted execute + settle right after deploy/seed.** Drive a
  deployer-beneficiary claim through optimize→sign→`executeRoute`→`settleClaim` via a script
  (independent of hosting), recording tx hashes — satisfies the acceptance criterion early; the
  hosted app then provides the interactive demo.

## Acceptance / Definition of Done

- [ ] Chain-97 addresses come **only** from deploy output, are written to `97.json`, and are consumed
      by API + product app (via rebuilt `@matura/chain`); landing reads **only** intentionally-public
      deployment metadata (gated on `NEXT_PUBLIC_CONTRACTS_DEPLOYED`).
- [ ] `matura.xyz` serves landing, `app.matura.xyz` serves the product — **no redirect loops or
      route collisions**; `NEXT_PUBLIC_LANDING_URL`/`NEXT_PUBLIC_APP_URL` consistent in both.
- [ ] Portfolio (`/account`) and route simulation/optimize work against chain 97.
- [ ] **≥1 real BSC-testnet execute + settlement** completed and recorded with tx hashes.
- [ ] **No mainnet (56) transaction** ever sent — pre-flight hard-refuses non-97.
- [ ] No DB/issuer/deployer secret reachable from either frontend image (`check:bundle` both guards pass).
- [ ] Landing smoke (canonical/metadata, nav, cross-domain CTA, static assets, responsive) + product
      smoke (health/ready, wallet network, Account load, quote optimize, tx simulation, explorer links) pass.
- [ ] Final report: deployed URLs + addresses, verification status, smoke results, and any manual steps still required.

## Non-Goals

Mainnet (56) anything; new indexing infrastructure (The Graph etc.); contract logic changes;
multisig/timelock governance; deleting deployed contracts (immutable — reset = reseed/redeploy).

## Safety Notes

Deployment involves **irreversible, outward-facing actions** (real on-chain txs, public domains,
hosted DB). Each such step in the plan gets an explicit go-ahead gate; pre-flight **hard-refuses**
any chain that isn't 97; secrets are never printed and never enter a frontend image.

## Next

Run `/workflows:plan` — sequence pre-flight → contracts → manifest/chain rebuild → Docker/EasyPanel
→ migrations/hosting → smoke → real tx → docs, marking operator-executed steps.
