# Brainstorm: Matura P0 Smart Contracts

- **Date:** 2026-09-25
- **Author:** arjunamarcelino
- **Status:** Ready for planning
- **Scope:** `packages/contracts` (Solidity) + artifact/address export through `packages/chain`

## What We're Building

The P0 contracts that verify, price, route, and settle Matura claims on BSC
Testnet (chain 97), plus the tests, gas report, ABI/address export, and doc
updates that make them auditable. The contracts must conform to the domain
already frozen in `@matura/shared` — enum ordinals, struct shapes, and the money
conventions are the source of truth, not something to reinvent.

Seven contracts — the six from the request plus a `VaultRegistry` introduced by
the multi-vault decision (canonical set, README.md:96–104):

1. **MockUSDT** — ERC-20, 6 decimals; per-address faucet cap + admin mint.
   Testnet/demo only.
2. **IssuerRegistry** — admin registers/deactivates issuers and rotates their
   authorized signer; stores `signer`, `active`, optional `metadataHash`.
3. **ClaimRegistry** — verifies issuer EIP-712 `ClaimAttestation`, records claim
   state + `financedFaceValue`, exposes `reserveSlice`/`releaseSlice` to
   authorized roles, enforces `financedFaceValue + requested <= faceValue`.
4. **LiquidityVault** — admin-funded isolated vault (no public LP deposits);
   deterministic `previewQuote`, mandate policy, per-claim exposure accounting.
5. **VaultRegistry** — enumerates the N vaults the router may route across
   (chosen topology; see decisions).
6. **MaturaRouter** — verifies a user-signed EIP-712 `ExecutionRoute`, recomputes
   every vault quote on-chain, reserves slices, funds the user atomically. The
   router **validates** a backend-proposed route (which claims/vaults/face
   amounts) by recomputing each leg's quote and re-checking every total — it does
   **not** search for the cheapest combination on-chain. The "cheapest feasible
   combination" (README.md:66) is selected off-chain; on-chain the router only
   guarantees the proposed route is valid and honestly priced.
7. **SettlementManager** — registers funded allocations, accepts issuer payment,
   distributes vault allocations + user residual + optional protocol fee under a
   strict conservation check.

Out of scope for this pass: `MockFreelanceEscrow` / `MockStreamAdapter` (source
simulators), loss socialization, public LP deposits, upgradeable proxies.

## Why This Approach

Three material forks were left open by the spec and confirmed with the user:

- **Multi-vault registry** over a single vault. A lightweight `VaultRegistry`
  tracks N vaults with distinct mandates/pricing so the router genuinely splits a
  target advance across vaults — the "Compare / Split / Route" narrative
  (README.md:58–67) is the demo's centerpiece, so it's worth the extra surface.
- **EIP-712 signed `ExecutionRoute`** (relayer-capable) over direct user calls.
  It matches the signed-`Quote` flavor already in `@matura/shared` and enables
  gasless/relayed UX; the route signature sits alongside the issuer attestation
  as the second typed-data scheme.
- **OpenZeppelin AccessControl** over Ownable + immutable wiring. Named roles
  (`DEFAULT_ADMIN_ROLE`, `ROUTER_ROLE`, `SETTLEMENT_ROLE`, `ISSUER_ADMIN_ROLE`)
  cleanly express the `reserveSlice`(router)/`releaseSlice`(settlement) split and
  let the router/settlement rotate without redeploying the registry. Grants stay
  explicit in the Ignition deploy module.

Everything else follows the repo's frozen decisions: Solidity 0.8.28, OZ 5.6.1,
Hardhat 3 + viem + `node:test`, optimizer runs 200, SafeERC20 + ReentrancyGuard,
custom errors, CEI, no proxies (docs/decisions.md, README.md:116–128).

## Key Decisions

- **Enum ordinals are law.** `ClaimType = [PAYROLL, FREELANCE_ESCROW, STREAM]`
  and the 11-state `ClaimState` machine map to Solidity `uint8` in exactly the
  order in `packages/shared/src/enums.ts`. Add the Solidity side of the planned
  three-way parity test.
- **Two EIP-712 domains, both chain-bound.** `ClaimAttestation`
  (verifyingContract = ClaimRegistry) binds `claimId, issuer, beneficiary, token,
faceValue, dueDate, claimType, externalIdHash, evidenceHash, nonce, deadline`.
  `ExecutionRoute` (verifyingContract = MaturaRouter) binds `user, targetAdvance,
maxTotalFace, deadline, nonce, legs[]`. Distinct domains prevent
  cross-contract/cross-chain replay; per-signer and per-user nonce maps prevent
  reuse.
- **claimId derivation** = `bytes32` from `chainId, issuer, externalId, nonce`
  (README.md:52). ClaimRegistry rejects duplicate `claimId`.
- **Single settlement token (MockUSDT) across all claims and vaults** in this MVP
  (README.md:53–54). The router's "token consistency" check enforces that a
  claim's `token`, its legs' vault tokens, and the funding token all match.
- **Router consumes vault quotes by recompute, not by signature.** The signed
  `Quote` in `@matura/shared` stays an off-chain UX artifact; the router does not
  verify individual per-vault quote signatures. It recomputes each vault's
  `previewQuote` on-chain and relies on the single `ExecutionRoute` signature for
  user authorization. (Resolves former open question #2.)
- **Struct/event fields mirror the Zod shapes** so the NestJS indexer can project
  them: `Claim`, `Quote`, `RouteLeg`/`ExecutionRoute`, `SettlementReceipt`,
  `Issuer`, `VaultSummary`. Emit `ClaimRegistered`, `ClaimStateChanged`,
  `ClaimSliceReserved`, `ClaimSliceReleased`, `RouteExecuted` (+ per-leg),
  issuer-registry events. Events should carry the fields the Prisma projections
  index.
- **Pricing (deterministic integer bps):** `totalDiscountBps = baseDiscountBps +
durationBpsPerDay * daysToDue + claimTypePremiumBps`, capped at
  `MAX_DISCOUNT_BPS`. `discount = ceil(face * bps / 10000)` (round in the vault's
  favor so it never undercharges); `advance = face - discount`. Rounding
  direction is documented, never silent. Demo defaults: `baseDiscountBps = 100`,
  `durationBpsPerDay = 5`, per-type premium `{PAYROLL: 0, FREELANCE_ESCROW: 50,
STREAM: 25}`, `MAX_DISCOUNT_BPS = 3000`.
- **Vault mandate = claim-type bitmap + per-vault issuer allowlist.** Supported
  claim types are a `uint8` bitmap (bit `i` = `CLAIM_TYPES[i]`); issuer
  eligibility is a per-vault admin-set `mapping(address => bool)` allowlist so
  vaults can specialize (payroll-only, single-issuer, etc.). Numeric demo limits:
  `minFace = 100e6`, `maxFace = 100_000e6`, `maxDurationDays = 180`,
  `liquidityCap` set per-vault at deploy.
- **Protocol fee → configurable treasury, 5% cap.** Fee is paid to a `treasury`
  address that admin can set (defaults to deployer); `feeBps` defaults to 0 for
  the demo; `MAX_FEE_BPS = 500` is a hard ceiling enforced on any fee update.
- **VaultRegistry export = single `vaultRegistry` slot.** `AddressBook` gains one
  `vaultRegistry` address; the app enumerates live vaults by calling the registry
  on-chain, so adding/removing a vault never edits `deployments.ts` / `.env` /
  `turbo.json`.
- **Property/fuzz tests via fast-check.** Add fast-check as a dev dependency and
  write invariant tests inside `node:test` for the two core invariants (no
  over-assignment across executions; settlement conservation), alongside the full
  unit suite.
- **Settlement conservation:** issuer pays face; each vault receives its financed
  face slice, protocol fee is explicit (default 0 bps, capped), beneficiary gets
  the residual: `amountReceived == vaultDistribution + userResidual +
protocolFee`. Mark `PAID` only after transfers + conservation succeed; support
  `DELAYED` as state without inventing funds.
- **Bounded loops:** `MAX_SLICES_PER_CLAIM = 8` enforced; no unbounded iteration.
- **Export path:** wire ABIs through a new `@matura/contracts/abis` subpath (no
  hand-copying) and populate `packages/chain/src/deployments.ts` from Ignition
  output.

## Open Questions

All brainstorm-phase questions are resolved (see Key Decisions). Remaining items
are ordinary plan-phase mechanics, not open design forks:

- Reconcile the new `vaultRegistry` slot across `AddressBook`, `.env.example`, and
  `turbo.json` `NEXT_PUBLIC_*_ADDRESS` vars (the app enumerates individual vaults
  from the registry on-chain).
- Confirm fast-check runs cleanly under Hardhat 3 + `node:test` when wiring the
  property-test harness.

## Acceptance Criteria (carried from the request)

- All contracts compile without correctness-indicating warnings; all tests pass.
- Comprehensive revert coverage: forged/expired/duplicate/replayed attestations;
  inactive issuer + signer rotation; duplicate claimIds; zero/past/invalid
  fields; over-assignment across executions; partial + multi-claim atomic
  funding; vault mandate rejection + insufficient liquidity; quote/route expiry +
  nonce replay; funded-claim revocation rejection; settlement conservation +
  residual; double settlement; unauthorized role calls; fee/rounding boundaries.
- Gas report (or recorded estimates) for `registerClaim`, `executeRoute`
  (one/two legs), `settleClaim`.
- ABIs + typed address metadata exported through `@matura/chain` (generated, not
  hand-copied).
- `docs/architecture.md` updated with contract relationships;
  `docs/threat-model.md` created (assets, trust assumptions, threats,
  mitigations).
