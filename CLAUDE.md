# CLAUDE.md

Guidance for working in this repo. Keep it short; link out for detail.

**Matura** — a BSC-Testnet RWA/invoice-financing MVP. pnpm + Turborepo monorepo:
`apps/{api,app,landing}`, `packages/{contracts,chain,shared,ui,eslint-config,typescript-config}`.
Architecture: `docs/architecture.md`. Rationale: `docs/decisions.md`.

## ⚠️ Node 24 (not the machine default)

Hardhat 3 needs an **even LTS** Node (22.13+/24); the repo pins `<25`. Node 24 is
installed **keg-only** (not on PATH). Prefix contracts/monorepo commands:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # verify: node -v → v24.x
```

## Commands

```bash
pnpm build | lint | typecheck | test        # turbo, whole monorepo
pnpm --filter @matura/contracts contracts:compile   # hardhat compile
pnpm --filter @matura/contracts contracts:test      # unit + integration + fuzz + gas
pnpm --filter @matura/contracts typecheck           # hardhat compile && tsc --noEmit
pnpm --filter @matura/contracts contracts:export-abis   # regenerate @matura/chain ABIs
```

CI order: build → lint → typecheck → test → contracts:compile → contracts:test →
ABI-freshness gate. Toolchain gotchas (Node, tsc `unknown`, ABI/prettier gate):
`docs/solutions/build-errors/hardhat3-viem-node24-toolchain.md`.

## Conventions

- **Commits:** author `arjunamarcelino` only — **no `Co-Authored-By: Claude` trailer.**
- **No `any`** anywhere — type-aware ESLint (`strictTypeChecked` + `projectService`).
  Contracts TS is now typechecked too (`tsc --noEmit` with `artifacts/**/*.d.ts` included).
- **Money** is `uint256` base units (6-dp MockUSDT) on-chain, decimal **strings** across
  APIs, never floats. Dates: ISO 8601 in APIs, Unix seconds on-chain.
- **Enum ordinals are law:** Solidity `ClaimTypes`/`ClaimStates` mirror
  `packages/shared/src/enums.ts`; parity tests guard drift (`packages/contracts/test/EnumParity.test.ts`,
  `apps/api/src/enum-parity.spec.ts`). Adding a claim type is a 7-site edit (see `ClaimEnums.sol`).
- **Contract addresses** live ONLY in the generated per-chain manifests
  `@matura/chain/src/deployments/<chainId>.json` (written by `deploy`, never hand-edited, never
  env) + the codegen'd `deployments.generated.ts`; `deployments.ts` exposes typed accessors
  (`getDeployment`/`getManifest`/…). ABIs are generated into `@matura/chain/src/abis` (never
  hand-copied, prettier-ignored). `@matura/chain/contracts` binds each address slot to its ABI.
- **Secrets** via Hardhat keystore / `configVariable()` (never `.env`, never committed):
  `DEPLOYER_PRIVATE_KEY`, `ISSUER_PRIVATE_KEY` (attestation signer — most sensitive), RPC URL.
- **Solidity:** 0.8.28 + OpenZeppelin 5.6.1; custom errors + NatSpec; CEI + SafeERC20 +
  `ReentrancyGuardTransient`; no proxies. Security posture: `docs/threat-model.md`.
- **Boundaries:** `apps/landing` stays wallet-free (lint-guarded, incl. subpath imports);
  `@matura/shared` is framework-free Zod; `@matura/contracts` is self-contained (no `@matura/*` deps).

## Local-only docs (gitignored)

`docs/deployment-runbook.md` (live addresses, update per deploy) and `docs/code-review.md`.
Planning docs (`docs/brainstorms/`, `docs/plans/`) and `docs/gas-report.md` are tracked.
