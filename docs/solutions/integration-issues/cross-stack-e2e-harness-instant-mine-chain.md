---
title: "Cross-stack e2e harness (node + Postgres + worker + API) against an instant-mine local chain"
category: integration-issues
tags:
  [
    apps-e2e-stack,
    apps-api,
    matura-chain,
    hardhat,
    edr,
    testcontainers,
    postgres,
    viem,
    siwe,
    eip712,
    indexer,
    nonces,
    block-timestamp,
    child-process,
    determinism,
    docker,
  ]
module: "apps/e2e-stack, apps/api (worker + HTTP API), @matura/chain"
symptom: "Building a one-command e2e that boots the full local stack and drives the real product flow (SIWE → optimize → prepare → sign → executeRoute → settle) then reconciles contract events ↔ DB projections ↔ token balances — deterministically + repeatably. On an instant-mine hardhat chain the routes fail intermittently with InvalidAccountNonce, OverAssignment, and RouteExpired, the read-model assertions race stale state, and a prior run's node hijacks the next."
root_cause: "The API reads chain state at a lagging frontier (head − INDEXER_CONFIRMATIONS) whose RPC view transiently trails on an instant-mine chain; hardhat forces each rapidly-mined block's timestamp to parent+1 so chain time races ahead of the API's wall-clock route deadline; getManifest is bound to the import-time dist; the read-model cursor lags the projected state; the test-client mine doesn't reliably advance head; and a detached hardhat node survives teardown to accumulate blocks."
date: 2026-09-27
related:
  - docs/solutions/integration-issues/next15-wallet-frontend-siwe-eip712-e2e.md
  - docs/solutions/build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md
  - docs/solutions/deployment-issues/hardhat3-deploy-seed-manifest-pipeline.md
  - docs/routing.md
  - docs/plans/2026-09-27-feat-claim-source-adapters-settlement-plan.md
---

# Cross-stack e2e harness — instant-mine chain timing + lifecycle

Reusable gotchas from building `apps/e2e-stack` (`test:e2e:stack`): a standalone Node harness that
spawns a local hardhat node + Testcontainers Postgres + the indexer worker + the HTTP API, drives
the real `optimize → prepare → sign → executeRoute → settle` flow **through the API**, and reconciles
on-chain `ClaimSettled` events ↔ Prisma settlement projections (via the read-model API) ↔ exact token
balance deltas. Each entry is symptom → root cause → fix. The theme: **an instant-mine local chain
breaks nearly every timing assumption a real chain hides**, and a multi-process stack has real
lifecycle hazards. Needs a Docker daemon.

## 1. `executeRoute` reverts `InvalidAccountNonce` for the 2nd+ route

**Symptom:** Request A executes; Request B's `executeRoute` reverts `InvalidAccountNonce(alice, 1)` —
the API prepared route `nonce=0` even though A already consumed nonce 0. Intermittent; more likely
the less real time elapsed between A and B.

**Root cause:** the router uses OZ per-user `Nonces`. The API's `prepareExecution` reads the nonce at
its pinned frontier (`head − INDEXER_CONFIRMATIONS`, = `head − 1` locally). On an instant-mine chain
the API's own RPC connection to the node transiently trails ours after we mine, so `head − 1` doesn't
yet include A's block → it reads the stale (pre-A) nonce. It is NOT a confirmations misconfig — the
frontier is genuinely fresh-read, the node just answers a hair behind on a second connection.

**Fix:** the harness signs the route itself, so **override the route nonce with the live on-chain
value** (`router.nonces(user)` at `latest`) before signing — exactly what a real wallet does (a real
chain's block time hides the lag). See `apps/e2e-stack/src/api.ts` `signAndExecuteRoute`.

## 2. `executeRoute` reverts `OverAssignment` for a route reusing a partially-financed claim

**Symptom:** Request B (payroll remaining + stream) intermittently reverts `OverAssignment` — the
optimizer sized payroll's leg as if it were unfinanced, but A already financed part of it.

**Root cause:** the same frontier lag as #1, but affecting the optimizer's view of `financedFaceValue`
— B's `optimize` reads chain state at a frontier that predates A, so it thinks payroll is fully
available and over-assigns at execute time.

**Fix:** gate the next route's `optimize` on the API's own chain view catching up past the prior
route. `optimize` is rate-limited (5/min/wallet) so you can't poll it — instead poll the
**un-throttled** `GET /claims/:id` `finalizedThrough` (the worker cursor, which lags the frontier) until
it passes the prior route's block, then a short settle, then one `optimize`. Assert
`opt.blockNumber >= requiredFrontier` and retry once. See `execViaApi` in `run.ts`.

## 3. `executeRoute` reverts `RouteExpired` even with a generous deadline

**Symptom:** a route reverts `RouteExpired()`; raising `routeDeadlineSeconds` doesn't help. Worsens as
the run's block count grows across repeated attempts.

**Root cause:** two compounding clock skews:

- Deploy+seed mine dozens of blocks in a few real seconds. Hardhat forces each block's timestamp to
  `max(parent+1, wallclock)`; rapid mining ⇒ `parent+1` wins ⇒ **chain time races ahead of
  wall-clock** by ~(#blocks − realSeconds). The API sets the route deadline from `Date.now()`
  (wall-clock), so `block.timestamp` (chain) can exceed it → expired.
- Warping EVM time for settlement (`increaseTime`) pushes chain time _days_ ahead, so **any route
  executed after the warp** is instantly expired.

**Fix:** (a) execute **all** routes BEFORE any time-warp (finance the delayed claim up front, then warp
once past every due date); (b) request a large `routeDeadlineSeconds`; and critically (c) keep the
block skew bounded — **never reuse a stale node** (see #6), because an accumulated chain amplifies the
skew past `EXECUTION_DEADLINE_SECONDS`.

## 4. `test.increaseTime`/`test.mine` don't reliably advance head

**Symptom:** after `createTestClient(...).mine({ blocks: 2 })`, `head` sometimes hasn't advanced;
downstream frontier gating then fails.

**Root cause:** viem's test-client `mine` (mode `hardhat`) did not reliably advance head against a
plain long-running `hardhat node` in this setup.

**Fix:** advance blocks with **real 0-value transactions** (reliable under automine) instead of the
test client; keep `createTestClient` only for `increaseTime` (which works). See `advanceBlocks` in
`run.ts`.

## 5. `getStream`/`getManifest` read stale/zero addresses at runtime

**Symptom:** `getStream returned no data ("0x")`, or the harness reads zero/other-run addresses even
though the deploy just wrote a fresh manifest.

**Root cause:** `@matura/chain`'s `getManifest` is compiled into `dist` and **bound at import time** —
which, for the harness process, predates the in-run `deploy` + `@matura/chain build`. So it returns
whatever addresses were compiled before the run (all-zero, or a prior run's).

**Fix:** read the freshly-written manifest **JSON from disk** at scenario time
(`packages/chain/src/deployments/<chainId>.json`), Zod-validated at the boundary. Read adapter
claimIds straight from the adapter contracts (`getStream`/`getEngagement`) rather than re-deriving
off-chain. See `Manifest` in `schemas.ts` + the claimId reads in `run.ts`.

## 6. A prior run's hardhat node hijacks the next run

**Symptom:** block numbers climb across runs (e.g. 260 → 461); RouteExpired worsens; teardown seems to
"work" but the port stays busy.

**Root cause:** `spawn("pnpm", ["--filter", "@matura/contracts", "node"])` launches a **tree**
(pnpm → hardhat); a plain `child.kill()` (or `pkill -f "hardhat node"`) doesn't reap it, so the node
survives on `:8545` and the next run's deploy/API hit the OLD, block-accumulating chain.

**Fix:** spawn the node **`detached`** (own process group), `process.kill(-pid, "SIGTERM")` the group
on teardown, and **free `:8545` by port** (`lsof -ti tcp:8545 | kill`) both before start and after
stop. See `freePort8545` + the node lifecycle in `stack.ts`.

## 7. `INDEXER_CONFIRMATIONS` must be 1 locally — and `.env` must not override it

**Symptom:** the worker never advances its cursor / the API frontier is stuck far behind.

**Root cause:** local EDR has **no `finalized` block tag**; with `INDEXER_CONFIRMATIONS=0` the frontier
uses `blockTag:"finalized"`, which never advances. Also, `apps/api/.env` pins
`INDEXER_CONFIRMATIONS=0` for testnet, and Nest's `ConfigModule` loads `.env` from the process CWD.

**Fix:** run the worker/API with `INDEXER_CONFIRMATIONS=1` (the `head − N` frontier), and spawn them
with **`cwd = REPO_ROOT`** (there is no root `.env`) so `apps/api/.env` is NOT loaded and the harness's
`childEnv` wins. Do NOT use a `pnpm --filter @matura/api run start` indirection — that sets
`cwd = apps/api` and loads the wrong `.env`. Mine one extra block after `settle` so `head − 1` covers
the settlement events. See `childEnv` in `env.ts` + the spawn comments in `stack.ts`.

## 8. Read-model assertions race the projected state

**Symptom:** the delayed claim reads `PARTIALLY_FUNDED` (not `DELAYED`), or a settled claim isn't
`PAID` yet, even after waiting on `finalizedThrough`.

**Root cause:** `finalizedThrough` (the worker cursor) advancing past a block does **not** guarantee
the projection's _state_ row has been updated in the same instant — the state update can lag the
cursor read by a tick. And `GET /claims/:id` falls back to a chain read-through (`settlement: null`,
`pending: true`) on a projection miss, which can mask a not-yet-projected row.

**Fix:** poll on the **real projected state** — `state === "PAID" && settlement !== null` (or
`"DELAYED"`), not merely on the cursor. The `settlement !== null` guard also rejects the chain
read-through. For a fully independent witness, cross-check the on-chain claim state + the vault/
beneficiary balance deltas against the emitted `ClaimSettled` components. See the reconciliation loop
in `run.ts`.

## 9. Typed teardown that can't hang or leak

**Symptom:** teardown hangs (burns the CI job timeout); a spawn failure throws uncaught past cleanup;
`node:events.once()` leaks `Promise<any[]>` under `strictTypeChecked`.

**Fix:** a hand-rolled `waitForExit(child)` that races the `exit` event against a bounded
`setTimeout(() => child.kill("SIGKILL"))` (timer `unref()`'d); a `guardSpawn` that attaches a
`.once("error", …)` to every child; ordered teardown (SIGTERM API+worker → await exits →
`container.stop()` → `git checkout` the manifests → **rebuild `@matura/chain`** because `dist` is
gitignored and `checkout` won't restore it → kill the node group → free the port); a SIGINT/SIGTERM
handler on the harness; and a **dirty-manifest pre-check** (before startup, so its throw can't trigger
the teardown `git checkout` that would clobber the very edits it protects). See `stack.ts`.

## Prevention checklist (copy for the next stack harness)

- [ ] Sign routes yourself and override the nonce with the live on-chain value.
- [ ] Gate each `optimize` on the API's cursor reaching the prior route's block (poll an
      un-throttled read, never the rate-limited `optimize`); assert `opt.blockNumber >= required`.
- [ ] Execute every route BEFORE any `increaseTime` warp; use a large `routeDeadlineSeconds`.
- [ ] Advance blocks with real txs, not the test-client `mine`.
- [ ] Read the manifest from disk at runtime, not via the import-time-bound `getManifest`.
- [ ] Fresh node per run: `detached` spawn, kill the group, free `:8545` before + after.
- [ ] `INDEXER_CONFIRMATIONS=1` locally; spawn worker/API from `REPO_ROOT` (avoid `apps/api/.env`).
- [ ] Poll on projected STATE (`+ settlement !== null`), not just `finalizedThrough`.
- [ ] Bounded `waitForExit` + `guardSpawn` + ordered teardown + dirty-tree guard.
- [ ] Wire the harness into the type-aware lint gate (it's the most `unknown`-heavy code you'll write).
