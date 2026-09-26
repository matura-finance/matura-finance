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

Signing is handled by the **`support/mock-wallet`** fixture: a Node-side viem signer
(`privateKeyToAccount` + wallet/public clients) exposed to the page via `exposeFunction`, and a
thin in-page **EIP-6963 provider** (`addInitScript`) that delegates every `request` to it and
announces itself as "Matura E2E Wallet". The app's default wagmi discovery lists it as a
connector — with **no wallet code shipped in the app** (we deliberately avoid a wagmi `mock`
connector, whose `wagmi/connectors` barrel drags the Coinbase Base-account connector and its
broken `@x402/evm` transitive dep into the production bundle).

Configure via env (all optional):

| Var               | Default                 | Notes                                                                                           |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------- |
| `E2E_PRIVATE_KEY` | Hardhat #0              | **Its address must be the seeded claim beneficiary** or optimize returns `NOT_OWNED_BY_WALLET`. |
| `E2E_CHAIN_ID`    | `97`                    | The app's only chain; your local node must serve this id.                                       |
| `E2E_RPC_URL`     | `http://127.0.0.1:8545` | Local node RPC for signing/sending.                                                             |

The indexer worker must be running or `GET /executions/:id` stays 404 and the happy path never completes.

## Bundle-leak gate (no browser)

```bash
pnpm --filter @matura/landing build
pnpm --filter @matura/e2e check:bundle
```

Fails if the landing client bundle contains any wallet/chain identifier or server secret.
