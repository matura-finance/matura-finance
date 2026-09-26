# @matura/e2e

Playwright end-to-end tests for the Matura frontends.

## Projects

- **landing** (always runs) — the static marketing site. No chain/API needed.
- **product** (opt-in, `E2E_STACK=1`) — the wallet-connected app happy paths (Request A
  partial slice, Request B multi-claim). Requires the full local stack.

## Setup

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # Node 24
pnpm --filter @matura/e2e e2e:install                # one-time: download Chromium
```

## Run

Landing only (CI default — no chain):

```bash
pnpm --filter @matura/e2e test:e2e
```

Full product happy path (needs the seeded stack up):

```bash
# 1. hardhat node + demo:local seed (beneficiary = the injected mock account)
# 2. apps/api dev + worker:dev against a local Postgres
# 3. then:
E2E_STACK=1 pnpm --filter @matura/e2e test:e2e
```

**Follow-up required for the product project:** inject a mock EIP-1193 provider into the
page (e.g. `page.addInitScript` announcing an EIP-6963 provider backed by the seeded
beneficiary key), so connect + SIWE + EIP-712 signing run deterministically without a wallet
popup. We deliberately do NOT ship a wagmi `mock` connector inside the app — importing
`wagmi/connectors` drags the Coinbase Base-account connector (and its broken `@x402/evm`
transitive dep) into the production bundle. Keeping the mock at the Playwright layer keeps the
shipped app lean and wallet-injection test-only. The injected account **must equal the seeded
claim beneficiary** or optimize returns `NOT_OWNED_BY_WALLET`, and the indexer worker must be
running or `GET /executions/:id` stays 404 and the happy path never completes.

## Bundle-leak gate (no browser)

```bash
pnpm --filter @matura/landing build
pnpm --filter @matura/e2e check:bundle
```

Fails if the landing client bundle contains any wallet/chain identifier or server secret.
