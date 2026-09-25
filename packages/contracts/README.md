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
```

## Scripts

Run under **Node 24** (keg-only): `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`.

```bash
pnpm contracts:compile      # hardhat compile
pnpm contracts:test         # unit + integration + fast-check + gas (node:test + viem)
pnpm typecheck              # hardhat compile && tsc --noEmit (types + fixtures)
pnpm contracts:export-abis  # regenerate @matura/chain/src/abis from artifacts
pnpm clean                  # hardhat clean

# Deploy (wires roles, registers + seeds the demo vault; parameterizable via --parameters):
hardhat ignition deploy ignition/modules/MaturaProtocol.ts --network bscTestnet
```

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

Toolchain gotchas (Node 24, tsc `unknown`, ABI/prettier gate):
`../../docs/solutions/build-errors/hardhat3-viem-node24-toolchain.md`.
