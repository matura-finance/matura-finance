# Demo Operator Checklist

Pre-flight for running a Matura demo (BSC-Testnet MVP). Run top-to-bottom; do not
start a demo with any **abort condition** open. This is testnet only — see
`SECURITY.md` (no real funds, ever) and `docs/threat-model.md` for the full model.

> Node: contracts/monorepo commands need the keg-only Node 24 —
> `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"` (verify `node -v` → v24.x).

## 1. Environment sanity (`apps/api`)

- [ ] **`ISSUER_PRIVATE_KEY` vs `NODE_ENV`** — if `ISSUER_PRIVATE_KEY` is set,
      `NODE_ENV` **must not** be `production` (env validation fails closed and the
      service **refuses to boot**). Confirm the API actually boots with the
      intended env. **On the hosted (EasyPanel) API there is NO issuer key** —
      `ISSUER_PRIVATE_KEY` absent + `DEMO_ISSUER_SIGNING_ENABLED=false` +
      `NODE_ENV=production`; claims are signed at seed time, not by the server.
- [ ] **`DEMO_ISSUER_SIGNING_ENABLED`** — set to the value you intend (parsed via
      `z.stringbool`, so `"false"` really is `false`; it fails closed, not open).
      Enable only if the demo drives the server-side issuer signer.
- [ ] **`API_CORS_ORIGINS`** — set to the exact frontend origin **with** scheme
      and **no trailing slash** (hosted: `https://app.usematura.xyz`); **non-empty**,
      **no `"*"`** (a literal `*` is filtered out, and an empty allowlist blocks all
      cross-origin, which silently breaks the app).
- [ ] **`SIWE_DOMAIN`** — set to the bare host **with no scheme** (hosted:
      `app.usematura.xyz`, not `https://app.usematura.xyz`); it must match the app's
      origin or SIWE `verify` rejects every login.
- [ ] **`JWT_SECRET`** — set (strong, not a placeholder); SIWE sessions fail
      closed without it.
- [ ] **RPC URL** — set to a working BSC-Testnet endpoint. Hosted default keeps
      `INDEXER_CONFIRMATIONS=0` (the public `publicnode` RPC supports the
      `finalized` tag); a tagless RPC needs `INDEXER_CONFIRMATIONS>0`.
- [ ] **`DATABASE_URL`** — points at the intended Postgres; migrations applied.
      Hosted: the **migrate one-off job** (`prisma migrate deploy`) ran **exactly
      once** for this release (gates both API + worker — never per-replica).
- [ ] No secret is echoed into logs or committed (`ISSUER_PRIVATE_KEY`,
      `DEPLOYER_PRIVATE_KEY`, `JWT_SECRET`, RPC URL, `DATABASE_URL`).

## 2. Chain / stack readiness

- [ ] **Contracts deployed & manifest current** — the per-chain manifest
      (`@matura/chain/src/deployments/<chainId>.json`) matches the live
      deployment; ABI/manifest freshness gates green. Never hand-edit the manifest.
- [ ] **Seeded stack up** — node/API/worker running; the indexer worker cursor is
      caught up to the chain (projections reflect on-chain state).
- [ ] **Faucet funded** — the demo wallet(s) hold enough testnet BNB (gas) and
      `MockUSDT`; vaults are seeded with liquidity. In particular the
      **operator / `SEED_BENEFICIARY` wallet you connect must hold tBNB** — it
      signs `executeRoute` on chain 97 and needs gas, or the demo dies at the
      sign step.
- [ ] **Signer epoch current** — the active issuer `signerEpoch` matches the
      signer you will attest with (a rotated/former signer is rejected by design).
- [ ] **Docker running** — required only for the gated tests (`test:int`
      Testcontainers, `test:e2e:stack` cross-stack). Not needed for a plain demo,
      but confirm it if you plan to run those gates first.

## 3. Frontend

- [ ] Product app (`apps/app`) points at the intended API base URL and chainId
      (BSC Testnet only).
- [ ] Landing (`apps/landing`) bundle is wallet/secret-free (CI grep gate green).
- [ ] **Landing built with `NEXT_PUBLIC_CONTRACTS_DEPLOYED=true`** (build-arg) —
      flips `/protocol` + footer links from "Contracts deploying soon" to real
      explorer links. It bakes at build time; a stale `false` build needs a
      rebuild, not an env toggle.
- [ ] A wallet with the EIP-6963 connector is available for the sign step.

## 4. Smoke test (before the audience)

- [ ] SIWE login succeeds; session clears on account/chain switch.
- [ ] One end-to-end pass: optimize → review → sign → submit → the activity feed
      indexes the tx (projection catches up). **Sign promptly** — a `RouteIntent`
      lives ~**120s** (single-use TTL); if you dawdle between optimize and sign it
      expires and you must re-optimize.
- [ ] A settlement completes (or `demo:settle` locally).

## 5. Hosted deploy (EasyPanel) — if serving from a hosted stack

> Full per-service config + env matrix: `docs/deployment.md` →
> "EasyPanel / Docker hosting"; live standup runbook:
> `docs/plans/2026-09-28-feat-bsc-testnet-deploy-easypanel-plan.md`.

- [ ] **API healthcheck = `/api/v1/health`** (liveness), **not** `/health/ready` —
      pointing the platform probe at `ready` restart-loops the container during a
      cold reindex.
- [ ] **Worker: disable / override the baked `HEALTHCHECK`** — the worker runs the
      **same image** as the API (which bakes a `GET /api/v1/health` probe) but serves
      **no HTTP server**, so the inherited probe fails and the container
      **restart-loops**. Set it to process-only / none.
- [ ] **Migrate one-off job ran exactly once** for this release (gates API +
      worker); not run per-replica.
- [ ] **Traefik owns TLS** — no in-app HTTPS redirect (Next or Nest), or you get a
      redirect loop. Domains: apex `usematura.xyz` → landing, `app.usematura.xyz` → app,
      no wildcard.
- [ ] **No secret baked as a build-arg** — build-args are recoverable from the
      image; only `NEXT_PUBLIC_*` are build-args, all secrets are runtime env on
      API/worker.
- [ ] **Frontend (landing/app) services carry ZERO secret env vars** — public
      `NEXT_PUBLIC_*` only. EasyPanel forwards service env as build-args, which are
      recoverable from the image, so any secret placed on a frontend service leaks.
- [ ] **Manifest committed before images were built** — images bake the real
      `97.json`, not the zero manifest.

## Abort conditions — do NOT demo if any hold

- API refuses to boot (likely `ISSUER_PRIVATE_KEY` + `NODE_ENV=production`, or a
  missing `JWT_SECRET` / `DATABASE_URL`).
- CORS is `"*"` or empty / mismatched, or `SIWE_DOMAIN` carries a scheme or
  mismatches the app origin (app calls fail, or every SIWE login rejects).
- Hosted API healthcheck points at `/health/ready` (restart-loops on reindex), an
  in-app HTTPS redirect is on behind Traefik (redirect loop), or images were built
  from the zero manifest (app points at dead addresses).
- Indexer worker is stalled or behind (activity feed will lie about on-chain
  state) — check the cursor and worker logs.
- Manifest / ABI freshness gate is red, or the manifest doesn't match the live
  deployment.
- Faucet dry, vault unseeded, or the signer epoch is stale (attestations reject).
- Any secret is exposed in logs, a bundle, or a committed file.

## Who to contact

Security-relevant issues → the process in `SECURITY.md`
(`<SECURITY_CONTACT_EMAIL>` — maintainer to fill in). Operational demo issues →
the on-call operator / repo maintainer (`arjunamarcelino`).
