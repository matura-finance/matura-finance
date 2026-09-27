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
      intended env.
- [ ] **`DEMO_ISSUER_SIGNING_ENABLED`** — set to the value you intend (parsed via
      `z.stringbool`, so `"false"` really is `false`; it fails closed, not open).
      Enable only if the demo drives the server-side issuer signer.
- [ ] **CORS allowlist** — set to the exact frontend origin(s); **no `"*"`** (a
      literal `*` is filtered out, and an empty allowlist blocks all cross-origin,
      which will silently break the app).
- [ ] **`JWT_SECRET`** — set (strong, not a placeholder); SIWE sessions fail
      closed without it.
- [ ] **RPC URL** — set to a working BSC-Testnet endpoint.
- [ ] **`DATABASE_URL`** — points at the intended Postgres; migrations applied
      (`db:migrate`).
- [ ] No secret is echoed into logs or committed (`ISSUER_PRIVATE_KEY`,
      `DEPLOYER_PRIVATE_KEY`, `JWT_SECRET`, RPC URL, `DATABASE_URL`).

## 2. Chain / stack readiness

- [ ] **Contracts deployed & manifest current** — the per-chain manifest
      (`@matura/chain/src/deployments/<chainId>.json`) matches the live
      deployment; ABI/manifest freshness gates green. Never hand-edit the manifest.
- [ ] **Seeded stack up** — node/API/worker running; the indexer worker cursor is
      caught up to the chain (projections reflect on-chain state).
- [ ] **Faucet funded** — the demo wallet(s) hold enough testnet BNB (gas) and
      `MockUSDT`; vaults are seeded with liquidity.
- [ ] **Signer epoch current** — the active issuer `signerEpoch` matches the
      signer you will attest with (a rotated/former signer is rejected by design).
- [ ] **Docker running** — required only for the gated tests (`test:int`
      Testcontainers, `test:e2e:stack` cross-stack). Not needed for a plain demo,
      but confirm it if you plan to run those gates first.

## 3. Frontend

- [ ] Product app (`apps/app`) points at the intended API base URL and chainId
      (BSC Testnet only).
- [ ] Landing (`apps/landing`) bundle is wallet/secret-free (CI grep gate green).
- [ ] A wallet with the EIP-6963 connector is available for the sign step.

## 4. Smoke test (before the audience)

- [ ] SIWE login succeeds; session clears on account/chain switch.
- [ ] One end-to-end pass: optimize → review → sign → submit → the activity feed
      indexes the tx (projection catches up).
- [ ] A settlement completes (or `demo:settle` locally).

## Abort conditions — do NOT demo if any hold

- API refuses to boot (likely `ISSUER_PRIVATE_KEY` + `NODE_ENV=production`, or a
  missing `JWT_SECRET` / `DATABASE_URL`).
- CORS is `"*"` or empty / mismatched (app calls fail or origin is unsafe).
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
