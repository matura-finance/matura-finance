# @matura/contracts

Smart contracts for Matura, built with [Hardhat 3](https://hardhat.org) using the viem toolbox.

## Requirements

- **Node.js 22.13+ or 24** (Hardhat 3 requires a recent Node runtime).

This package is ESM-only and self-contained: it pins its own `typescript` (~5.8.3) and does **not** extend the shared `@matura/*` configs. There is a `typecheck` script (`hardhat compile && tsc --noEmit`) that Turbo runs — it includes the generated `artifacts/**/*.d.ts` so viem contract types resolve. There is no `lint` script (the shared ESLint config is intentionally not wired here).

## Setup

Secrets are never hardcoded — they are resolved at runtime via `configVariable()` and stored in Hardhat's encrypted keystore. Set them once:

```bash
hardhat keystore set BSC_TESTNET_RPC_URL
hardhat keystore set DEPLOYER_PRIVATE_KEY
hardhat keystore set ISSUER_PRIVATE_KEY   # EIP-712 attestation signer (most sensitive)
```

`ISSUER_PRIVATE_KEY` is only wired into the **`bscTestnetSeed`** network (used solely by
`seed:bsc-testnet`), so `deploy`/`verify` never decrypt it. It only ever signs typed data
off-chain — never broadcasts a transaction.

## Scripts

Run under **Node 24** (keg-only): `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.

```bash
pnpm contracts:compile      # hardhat compile
pnpm contracts:test         # unit + integration + fast-check + gas (node:test + viem)
pnpm typecheck              # hardhat compile && tsc --noEmit (types + fixtures)
pnpm contracts:export-abis  # regenerate @matura/chain/src/abis from artifacts
pnpm clean                  # hardhat clean
```

## Deployment & seeding

Deployment uses **Hardhat Ignition** (declarative deploy + role wiring); seeding is a separate
idempotent viem script (issuer registration, funding, Alice's three EIP-712 claims). Deployed
addresses are written to a validated per-chain manifest at
`@matura/chain/src/deployments/<chainId>.json` (+ a generated typed loader) — **never hand-edited**.

### Local (one documented command)

```bash
# Terminal 1 — a persistent local chain (chainId 31337):
pnpm --filter @matura/contracts node

# Terminal 2 — deploy -> seed -> verify, leaving a queryable chain:
pnpm --filter @matura/contracts demo:local

pnpm --filter @matura/contracts demo:settle   # optional: end-to-end obligor self-settlement (local only)
pnpm --filter @matura/contracts demo:reset    # clear local journal + zero-seed the manifest
```

`deploy:local` / `seed:local` / `verify:local` are also runnable individually. Scripts are
idempotent — re-running resumes only what's missing, or fails clearly on conflicting state.

### BSC Testnet (two explicit steps — no auto-chain against a live network)

```bash
pnpm --filter @matura/contracts deploy:bsc-testnet   # writes + you commit 97.json
pnpm --filter @matura/contracts seed:bsc-testnet     # uses the bscTestnetSeed network (issuer key)
pnpm --filter @matura/contracts verify:bsc-testnet
```

Every script that connects to a chain asserts the connected chainId first and **refuses BSC Mainnet
(56)** (`demo:reset` is the exception — it opens no connection and only rewrites local `31337`
artifacts). After a testnet deploy, commit the regenerated `packages/chain/src/deployments/97.json`
and `deployments.generated.ts` (this replaces the old manual `deployments.ts` edit).

There is no automated testnet reset (you cannot un-deploy). The chain-97 Ignition deployment journal
(`ignition/deployments/matura-bsctestnet/`) is the resume key — preserve/commit it; to re-point at a
fresh protocol, deploy a new set and commit the new `97.json`. `demo:reset` is **local-only**.

## Faucets & BSC Testnet

You need **tBNB** (testnet BNB) for gas on chain 97. Request it from the official BNB Chain testnet
faucet: <https://www.bnbchain.org/en/testnet-faucet> (one address at a time; do not script it).

Test **MockUSDT** is available to any address via the on-chain, per-address-capped faucet
(`MockUSDT.faucet(amount)`, ≤ 10,000 units cumulative) for user-facing testing. Vault/demo funding
uses admin `mint` and is handled by the seed script — not the faucet.

> Testnet demo actors are **public-key throwaway identities** — never send anything of value to them.

## Contents

The P0 protocol (Solidity 0.8.28, OpenZeppelin 5.6.1):

- `token/MockUSDT.sol` — faucet ERC-20, 6 decimals (testnet/demo only).
- `IssuerRegistry.sol` — issuer + authorized-signer allowlist, `signerEpoch` rotation.
- `ClaimRegistry.sol` — EIP-712 `ClaimAttestation` verify, claim state machine, financed-face accounting.
- `LiquidityVault.sol` — admin-funded capital, mandate, deterministic integer-bps pricing.
- `VaultRegistry.sol` — enumerable vault registry.
- `MaturaRouter.sol` — verify user EIP-712 `ExecutionRoute`, recompute quotes on-chain, fund atomically.
- `SettlementManager.sol` — maturity-gated waterfall settlement with a strict conservation check.

`interfaces/` freeze the ABI boundary; `libraries/` hold enums/constants/pricing; `config/` +
`test/helpers/` are shared TS. Design + threat model live in `docs/` and the tracked plan.

### Mocks: deployed fixtures vs. test-only doubles

Two distinct kinds of mock live in the tree:

- **Deployed fixtures** — `token/MockUSDT.sol`, `sources/MockFreelanceEscrow.sol`,
  `sources/MockStream.sol`. These are on the `scripts/export-abis.ts` allowlist, so their ABIs ship
  to `@matura/chain` and they are deployed/seeded for local + testnet demos.
- **Test-only doubles** — `contracts/mocks/MaliciousToken.sol` (reentrant token),
  `contracts/mocks/MockNoReturnToken.sol` (non-returning ERC-20). These are **excluded** from the
  export allowlist, never deployed, and never registered as a settlement token — they exist solely
  to exercise the reentrancy guards and SafeERC20 handling in the test suite.

Toolchain note: contracts require an even-LTS Node (22.13+/24); the repo pins `<25`. See the root
`CLAUDE.md` for the toolchain setup.
