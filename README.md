# Matura

**Liquidity for what you've already earned.**

Matura is a best-execution liquidity router for future income. It aggregates
verified future payments, splits only the amount a user needs, and routes the
request to the most efficient liquidity across competing onchain pools.

A user can hold heterogeneous claims — accrued payroll, an approved freelance
escrow payout, an onchain token stream — and request liquidity now. Matura
compares competing vault quotes, assigns only the minimum face-value slices
required, and funds the request from the cheapest feasible combination. At
maturity, the issuer pays the SettlementManager, which distributes the financed
portion to Matura Vaults and returns the unassigned remainder to the user.

> **Status: hackathon MVP prototype.** This is a 7-day demonstration on BSC
> Testnet. It is not licensed, production-ready, or risk-free, and it does not
> legally transfer any receivable. It uses synthetic demo data and a faucet
> test token only.

---

## What this demonstrates

1. **Three claim sources in one portfolio** — payroll, freelance escrow, and an
   onchain stream, held together in a single Matura Account.
2. **Issuer-authorized claims** — EIP-712 signed attestations from allowlisted
   signers.
3. **Two vault pricing policies** — genuinely different quotes and eligibility
   mandates from competing Matura Vaults.
4. **Partial claim slicing** — never assign an entire claim when a smaller slice
   is sufficient.
5. **Multi-claim routing** — a larger request combines slices from more than one
   claim.
6. **Atomic stablecoin funding** — the user is funded atomically on BSC Testnet.
7. **Direct issuer settlement** — a conservation-checked distribution waterfall.
8. **A transparent UI** — cash received, face value assigned, total cost,
   selected pools, retained claim balance, and settlement state.

---

## Core concepts

| Term                | Meaning                                                                        |
| ------------------- | ------------------------------------------------------------------------------ |
| **Matura Protocol** | The onchain contracts that verify, price, route, and settle claims.            |
| **Matura Account**  | A user's portfolio of claims and financing history.                            |
| **Matura Claims**   | Verified future payments, represented onchain by hashes and state — never PII. |
| **Matura Vaults**   | Liquidity providers with distinct mandates and pricing policies.               |
| **Matura Router**   | Validates signed, executable routes and atomically funds the user.             |

A **claim** is a verified future payment. `claimId` is a `bytes32` derived from
`chainId`, issuer, `externalId`, and nonce. Every claim has a single settlement
token in this MVP.

---

## How a route works

1. **Verify** — an allowlisted issuer signs an EIP-712 attestation; the claim
   becomes `ATTESTED`, then `ELIGIBLE`.
2. **Compare** — competing Matura Vaults return quotes bound to `chainId`,
   vault, user, `claimId`, `faceAmount`, `advanceAmount`, `expiry`, and nonce.
3. **Split** — the router assigns only the minimum face-value slices needed to
   cover the requested amount.
4. **Route** — the request is funded from the cheapest feasible combination of
   vault slices.
5. **Receive** — the user is funded atomically in stablecoin.
6. **Settle** — at maturity the issuer pays the SettlementManager, which
   distributes vault allocations, the user residual, and any explicit protocol
   fee. Conservation must hold:
   `received = vault distributions + user residual + protocol fee` (subject only
   to documented rounding).

---

## Architecture

A pnpm + Turborepo monorepo.

```
apps/
  landing     Next.js App Router marketing site (matura.xyz).
              No wallet-heavy product code, no server secrets.
  app         Next.js App Router product UI (app.matura.xyz).
              Strict TypeScript, Tailwind, shadcn/ui, wagmi, viem.
  api         NestJS + Prisma + PostgreSQL, REST with OpenAPI.
packages/
  contracts   Hardhat 3, Solidity, OpenZeppelin.
  shared      Framework-independent Zod schemas and domain types.
  chain       Exported ABIs, addresses, chain definitions, viem helpers.
```

### Core contracts

| Contract                                   | Responsibility                                                          |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| `MockUSDT`                                 | Faucet-enabled test ERC-20 (6 decimals).                                |
| `IssuerRegistry`                           | Issuer and signer allowlist plus active status.                         |
| `ClaimRegistry`                            | EIP-712 attestations, canonical claim state, financed amount.           |
| `LiquidityVault`                           | Demo capital, mandate, quote calculation, funding accounting.           |
| `MaturaRouter`                             | Validates signed/executable routes and atomically funds the user.       |
| `SettlementManager`                        | Accepts issuer payment; distributes vault allocation and user residual. |
| `MockFreelanceEscrow`, `MockStreamAdapter` | Source simulators for demo claim origination.                           |

### Claim states

`DRAFT` exists only offchain. Onchain: `ATTESTED`, `ELIGIBLE`,
`PARTIALLY_FUNDED`, `FUNDED`, `MATURED`, `PAID`, `DELAYED`, `DISPUTED`,
`DEFAULTED`, `REJECTED`, `REVOKED`. Revocation is permitted only
before any funding. Funding state is monotonic — a funded claim cannot be
silently revoked. The implemented transition set is kept minimal and explicit.

---

## Engineering invariants

- Monetary values are `uint256` in token base units. No floating point.
- `financedFaceValue` must never exceed eligible `faceValue`.
- EIP-712 domains prevent cross-chain and cross-contract replay.
- Settlement conservation must always hold.
- Contracts use custom errors, events, checks-effects-interactions, SafeERC20,
  role separation, `ReentrancyGuard` around external token movement, and
  `Pausable` only where it has a clear emergency purpose.
- No upgradeable proxies.
- No PII or claim documents onchain — hashes and synthetic demo metadata only.
- Private keys never reach browser bundles, logs, committed files, or API
  responses.

---

## Demo scenario

**Alice's portfolio**

| Claim            | Face value  | Due     | Source          |
| ---------------- | ----------- | ------- | --------------- |
| Payroll          | 1,000 mUSDT | 10 days | Low-risk issuer |
| Freelance escrow | 600 mUSDT   | 14 days | Medium risk     |
| Stream           | 400 mUSDT   | 30 days | Onchain source  |

**Vaults**

| Vault        | Eligible claims    | Pricing         | Mandate                                |
| ------------ | ------------------ | --------------- | -------------------------------------- |
| Stable Vault | Payroll, stream    | Low discount    | Stricter max duration and issuer rules |
| Flex Vault   | All eligible types | Higher discount | Broader mandate                        |

- **Request A** is small and uses only a partial payroll slice.
- **Request B** is larger and combines at least two claim slices.

---

## Chain

- Network: **BSC Testnet** (chain ID `97`).
- Stablecoin: **MockUSDT**, 6 decimals, faucet-enabled.

---

## Non-goals

No real consumer lending, real money, fiat rails, KYC/KYB, public LP deposits,
secondary market, governance token, cross-chain system, opBNB or Greenfield
dependency, production legal assignment, AI underwriting, or real payroll
integration. This prototype does not transfer any real receivable.

---

## Development

**Prerequisites:** Node **24 LTS** (Hardhat 3 does not support Node 25+) and
pnpm 10. The version is pinned in `.nvmrc` / `engines`.

```bash
nvm use            # -> Node 24 (see .nvmrc)
pnpm install       # installs the workspace; sets up git hooks
cp .env.example .env   # fill in per-app values as needed
```

Run an app:

```bash
pnpm --filter @matura/app dev       # product app  -> http://localhost:3002
pnpm --filter @matura/landing dev   # marketing     -> http://localhost:3001
pnpm --filter @matura/api dev       # API           -> http://localhost:3000
```

Workspace checks (all pass on the foundation):

```bash
pnpm build           # turbo: shared (tsup), api (nest), both Next apps
pnpm lint            # ESLint 9, type-aware, no-any enforced
pnpm typecheck       # tsc --noEmit across packages/apps
pnpm test            # vitest (shared/chain/ui) + jest (api)
pnpm test:e2e        # api health e2e (supertest)
pnpm contracts:compile && pnpm contracts:test   # Hardhat 3 (needs Node 24)
```

> Layout, package boundaries, and technology rationale: see
> [`docs/architecture.md`](docs/architecture.md) and
> [`docs/decisions.md`](docs/decisions.md).
