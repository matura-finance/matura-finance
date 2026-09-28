---
title: "BSC-testnet live deploy + EasyPanel: execution gotchas (public-RPC flakiness, Ignition journal desync, committed-manifest vs guard tests, BSCScan V2, claim timing/nonce, Prisma-in-dist, local≠CI)"
category: deployment-issues
tags:
  [
    bsc-testnet,
    deployment,
    ignition,
    public-rpc,
    manifest,
    bscscan,
    etherscan-v2,
    hardhat-verify,
    prisma,
    docker,
    easypanel,
    nextjs,
    siwe,
    cors,
    playwright,
    ci,
    read-after-write,
    nonce,
  ]
module: "@matura/contracts, @matura/chain, apps/api, apps/{app,landing}, apps/e2e"
symptom: "Driving the first REAL BSC-testnet deploy + EasyPanel hosting: the deploy/seed/verify tooling all passed locally, but the live run hit public-RPC failures, an unrecoverable Ignition journal, guard tests that assumed zero manifests, a deprecated explorer API, a past-due proof-claim, a read-lag false failure, a Prisma engine missing from the compiled image, and a CI-only test the local gate never runs."
root_cause: "Everything that only manifests against a real chain + a real registry + a compiled artifact: public RPCs drop confirmations and rate-limit; committing real addresses (for build-from-git) contradicts a zero-manifest invariant; explorer APIs migrate; on-chain time + single-use nonces + label-derived claimIds are unforgiving; `nest build` doesn't copy native engine binaries; and `turbo test` is a subset of CI's `verify`."
date: 2026-09-28
related:
  - docs/deployment.md
  - docs/deployment-trackb-runbook.md
  - docs/demo-operator-checklist.md
  - docs/plans/2026-09-28-feat-bsc-testnet-deploy-easypanel-plan.md
  - docs/solutions/deployment-issues/hardhat3-deploy-seed-manifest-pipeline.md
  - docs/solutions/integration-issues/security-hardening-adversarial-suite.md
  - docs/solutions/build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md
---

# BSC-testnet live deploy + EasyPanel — execution gotchas

Hard-won lessons from the first real chain-97 deploy + EasyPanel Docker hosting. The tooling
(pre-flight, deploy/seed/verify, Dockerfiles) all passed _locally_; every problem below only
appeared against a **real chain / real explorer / compiled artifact / CI**. Topology (turbo-prune
Dockerfiles, Next standalone, one-image-two-commands, migrate-once, build-args-not-secret) lives in
`docs/deployment.md` + the security-hardening learnings doc; this doc is the **execution** gotchas.

## 1. A public seed-node RPC drops a confirmation → an unrecoverable Ignition journal

`deploy:bsc-testnet` on `publicnode` failed with `Received an unexpected status code`. The tx had
actually **landed on-chain**, but Ignition never recorded its confirmation — so a retry (even on a
different RPC) hit `HHE10411: next nonce should be N, but node reports N+1` (an "out-of-band tx"
Ignition can't reconcile). The journal is now permanently 1 nonce behind.

- **Recovery:** delete the deployment journal (`packages/contracts/ignition/deployments/matura-bsctestnet/`)
  and **redeploy fresh** from the current nonce. The partially-deployed contracts are orphaned but
  harmless on testnet (contracts are never deleted; only the manifest points at the new set).
- **Prevention:** treat a public RPC as unreliable for deploys — keep `BSC_TESTNET_RPC_URL` replaceable
  and a `BSC_TESTNET_RPC_URL_2` fallback ready. `deploy.ts` writes the manifest only after
  `assertWiring` passes, so a mid-deploy failure leaves the committed manifest untouched (good) — but
  the journal is disposable, the committed `97.json` is the source of truth.

## 2. Committing the real manifest (for build-from-git) breaks the "manifests are zero" guard tests

EasyPanel builds images **from git**, so `97.json` with real addresses must be committed (`NEXT_PUBLIC_*`

- the API read-model bake it at build). But `@matura/chain` guard tests encoded an invariant that
  committed manifests are **zero** (`manifest-parity.test.ts`: `97.json` deep-equals `zeroManifest(97)`;
  `deployments.test.ts`: 97 is "not deployed"). Committing real addresses flipped them red — and, being
  Playwright-adjacent, only after the manifest commit.

* **Fix:** a deployed chain asserts **deployed** (dynamic: `isDeployed(97)===true`, positive block,
  non-zero addresses, `not.toEqual(zeroManifest)`); keep a **zero** chain (`31337`) as the zero-seeded
  guard fixture. Don't hardcode addresses in tests — assert dynamically so redeploys don't churn them.
* **Prevention:** decide up-front whether a chain's committed manifest is zero (pre-deploy) or real
  (deployed) and split the guard fixtures accordingly.

## 3. BSCScan deprecated the V1 API → verify with the Etherscan **V2** endpoint

`verify:bsc-testnet:explorer` failed on every contract with `HHE80023: "You are using a deprecated V1
endpoint, switch to Etherscan API V2"`. The config had overridden the chain-97 descriptor's `apiUrl`
to the retired `api-testnet.bscscan.com/api`.

- **Fix:** **remove** the custom V1 `chainDescriptors[97].apiUrl` override — Hardhat 3.18 ships a
  built-in chain-97 descriptor pointing at the unified **V2** endpoint (`api.etherscan.io/v2?chainid=97`).
  A key from `bscscan.com/myapikey` works on V2. `hardhat verify` then verifies on BscScan **and**
  Sourcify (Blockscout "not configured" is harmless).
- **Prevention:** don't pin per-chain V1 explorer URLs; trust the toolchain's built-in V2 descriptor.

## 4. The scripted proof-claim is unforgiving on time, nonce, and id

The one-shot execute+settle proof-claim broke three ways in a row:

- **Past-due → `MandateRejected`:** the finance window (`SCRIPTED_DUE_SECONDS=900`) elapsed during the
  verify/seed/check steps between seed and execute → the claim's `dueDate` was in the past → can't be
  financed. **Fix:** run seed→execute **back-to-back** (chain them) and give a generous window (1200s).
- **`NonceAlreadyUsed`:** attestation nonces are **single-use per issuer signer**. The retry reused a
  nonce the first attempt burned. **Fix:** a fresh, unused `attestationNonce`.
- **Can't re-create the claim:** `claimId = keccak(label)` — a spent label can't be re-registered
  (`DuplicateClaimId`). **Fix:** a **fresh label** for the new attempt.
- **Settle is maturity-gated:** you fund _before_ `dueDate` and settle _after_ — so the script funds,
  then must wait out the window before settling (two invocations / a timed re-run).

## 5. Post-settle read hit public-RPC read-after-write lag → false failure

The `settleClaim` tx **confirmed**, but the script's immediate `getClaim().state` read returned a stale
`FUNDED` (not `PAID`) from a lagging public RPC → the run threw "Expected PAID". On-chain reality:
`isSettled===true`, state `PAID`.

- **Fix:** **poll** for the terminal state (a few retries with a short delay) before erroring;
  `SettlementManager.isSettled(claimId)` is the authoritative signal, decoupled from the read-lagged
  claim projection. Never assert final state on the first read after a write to a public RPC.

## 6. The compiled `dist` runtime is never exercised — the Prisma engine wasn't in it

The image runs `node apps/api/dist/main.js`, but dev (`nest start`) and tests (ts-jest) only ever run
the **TS source**. `nest build` (tsc) auto-emits the imported generated client `.js` but does **not**
copy the query-engine binary (`libquery_engine-*.node`) into `dist`. It resolved on the host only via
a **baked absolute `src/generated` path + whole-tree copy** — a coincidence, never self-contained in
`dist`; a different layout/platform would crash-loop with `MODULE_NOT_FOUND`/"Query engine not found".

- **Fix:** a `nest-cli.json` `assets` entry copying `generated/prisma/**/*.node` → `dist` so `dist`
  resolves the engine itself. Confirm with `node dist/main.js` — it should boot and fail only on the
  DB connect, proving module + engine resolution.
- **Prevention:** any compiled-artifact deploy needs a **smoke of the compiled output** (`node dist/…`
  against a throwaway DB) before go-live — dev/test never touch `dist`.

## 7. Local `pnpm test` ≠ CI `verify` (Playwright + freshness gates are CI-only)

Local `turbo test` passed, but CI `verify` failed: CI additionally runs `contracts:compile/test`, the
**ABI/manifest-freshness** gates, and the **Playwright landing suite**. A domain rebrand
(`matura.xyz`→`usematura.xyz`) updated the app/landing source but missed the landing spec's CTA
assertion (`toHaveAttribute("href", /app\.matura\.xyz|…/)`) — invisible locally, red in CI, twice.

- **Fix / prevention:** a rebrand (or any user-visible-string change) must **sweep tests too**,
  including Playwright specs. Know the CI ≠ local delta: run `pnpm --filter @matura/e2e test:e2e`
  (landing) locally before pushing a frontend change, or add it to a pre-push hook.

## 8. EasyPanel + baked domains: SIWE/CORS are exact-match

`NEXT_PUBLIC_*` are inlined at **build**; the API verifies SIWE against `SIWE_DOMAIN` and CORS against
`API_CORS_ORIGINS` by **exact match** (wildcard stripped, empty allowlist blocks all). A domain
mismatch between the baked frontend and the API's env → **every login 401 + all API calls blocked**,
fixable only by a rebuild. So: `SIWE_DOMAIN` = the bare served host (no scheme), `API_CORS_ORIGINS` =
the exact app origin (scheme, no trailing slash), and reconcile the domain across **code, docs,
Dockerfile comments, DNS, and tests** in one pass. Healthcheck the API on `/api/v1/health` (liveness),
never `/health/ready` (503 during the first-boot reindex → restart loop); the worker (same image, no
HTTP server) must have its baked HEALTHCHECK disabled.

## Live chain-97 record

Deployed 2026-09-28; router `0xaA685233Cf2334d53523fFaA368B36528f0cD955`, block 133632667; all 11
contracts verified (BscScan V2 + Sourcify); one real execute (`0xc753cf91…`) + settle (`0x543555b4…`)
recorded. Live addresses/hashes: `docs/deployment-runbook.md` (gitignored).
