# @matura/contracts

Smart contracts for Matura, built with [Hardhat 3](https://hardhat.org) using the viem toolbox.

## Requirements

- **Node.js 22.13+ or 24** (Hardhat 3 requires a recent Node runtime).

This package is ESM-only and self-contained: it pins its own `typescript` (~5.8.3) and does **not** extend the shared `@matura/*` configs. Hardhat validates the TypeScript via `compile`, so there is intentionally no separate `lint`/`typecheck` script (Turbo skips those tasks here).

## Setup

Secrets are never hardcoded — they are resolved at runtime via `configVariable()` and stored in Hardhat's encrypted keystore. Set them once:

```bash
hardhat keystore set BSC_TESTNET_RPC_URL
hardhat keystore set DEPLOYER_PRIVATE_KEY
```

## Scripts

```bash
pnpm contracts:compile   # hardhat compile
pnpm contracts:test      # hardhat test
pnpm clean               # hardhat clean
```

## Note

The `contracts/` directory is intentionally empty for now, so `contracts:compile` compiles to zero contracts. Real `.sol` sources and a sample viem/`node:test` test file will land alongside the first contract.
