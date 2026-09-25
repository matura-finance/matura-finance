# Brainstorm: Repeatable Deployment & Seed System (Local + BSC Testnet)

- **Date:** 2026-09-25
- **Status:** Brainstorm — ready for `/workflows:plan`
- **Author:** arjunamarcelino
- **Related:** `docs/brainstorms/2026-09-25-matura-p0-contracts-brainstorm.md`, `docs/deployment-runbook.md` (gitignored), `ignition/modules/MaturaProtocol.ts`

## What We're Building

A one-command, repeatable deploy-and-seed pipeline for both local Hardhat and BSC
Testnet that **never** requires hand-editing generated addresses. It extends the
existing Hardhat **Ignition** module to stand up the full protocol (7 core contracts +
**two named vaults** + **self-paying source-simulator obligors**), wires every role and
dependency and asserts that wiring, then writes a Zod-validated JSON manifest that
`@matura/chain` consumers load through typed helpers. A separate imperative seed script
funds vaults and demo actors, registers Alice's three EIP-712 claims via the authorized
issuer signer, and exports calibrated request A/B parameters for a future optimizer.

**Outcome:** `deploy:local` + `seed:local` (chained behind one documented command) leave
a queryable, self-settling demo chain; a `verify` script confirms both vault mandates,
balances, role grants, and Alice's three eligible claims; contract tests stay green.

## Why This Approach

The repo already commits to Hardhat Ignition (`hardhat-ignition-viem` plugin, a working
`MaturaProtocol.ts`, keystore-backed secrets). Ignition is declarative and idempotent —
ideal for deploy + wiring — so we extend it rather than hand-roll scripts. Seeding is
imperative and signer-driven (EIP-712 attestations, funding, calibration), which fits
Ignition poorly, so it lives in a standalone viem script. This split keeps each tool
doing what it's best at and reuses the single-source configs that already exist
(`config/demo-mandate.ts`, the `eip712`/`constants` helpers).

The JSON-manifest-as-source-of-truth (with `deployments.ts` refactored into a typed Zod
loader) resolves the tension between the task's manifest requirement and CLAUDE.md's
"addresses live only in `deployments.ts`": there is still exactly one source, it is
machine-written atomically, and consumers keep the same typed API.

## Key Decisions

1. **Source simulators = self-paying obligors.** One obligor contract per source type
   (payroll / freelance-escrow / stream) holds MockUSDT and settles its claims at/after
   maturity (`mint`/`approve` + `settleClaim`). The seeded demo settles end-to-end with no
   human payer. (Settle-trigger interface is Open Q2.)
2. **Manifest is source of truth.** Deploy writes `packages/chain/deployments/<chainId>.json`
   (chainId, deployment block, addresses incl. named vaults + simulators, ABI build id),
   atomically (temp file + rename), Zod-validated before any consumer use.
   `deployments.ts` becomes a typed loader over these JSON files — no hand-edits ever.
3. **Seed creates claims + calibration only.** Register Alice's three eligible claims,
   fund vaults/actors, export request A/B params. **No optimizer, no route execution** —
   the optimizer is a later feature; this leaves queryable state for it to consume.
4. **Ignition deploys + wires; script seeds.** Ignition: 7 core + Stable/Flex vaults +
   simulators, 5 role grants per vault, `registerVault` ×2, `registerIssuer`,
   `setIssuerAllowed` on both vaults, `setTreasury`, then an assert-wiring step. Seed
   script: funding + claims + calibration export.
5. **Two vault mandates** (from a shared config, mirroring `demo-mandate.ts`):
   - **Stable Vault** — lower `baseDiscountBps`, `supportedTypesBitmap = PAYROLL | STREAM`,
     shorter `maxDurationDays`.
   - **Flex Vault** — higher `baseDiscountBps`, `supportedTypesBitmap = PAYROLL |
FREELANCE_ESCROW | STREAM`, longer `maxDurationDays`.
6. **Calibration invariants** (concrete numbers set in the plan):
   - **Request A** → a single payroll claim can cover `targetAdvance_A` via one _partial_
     slice, and payroll is the cheapest eligible option → optimizer picks one partial slice.
   - **Request B** → `targetAdvance_B` exceeds the max advance obtainable from any single
     eligible claim (bounded by claim face / vault `maxFace` / vault liquidity headroom) →
     at least two of Alice's claims/legs are required.
7. **Reliability guardrails** (both networks): verify connected RPC chain id before any
   action; **refuse BSC Mainnet by default**; scripts idempotent or fail with a clear
   explanation on non-empty state; await receipts and surface failed txs; log addresses
   and tx hashes but never secrets.
8. **Deterministic local actors only.** Local uses fixed Hardhat accounts (Alice, issuer
   signer, payers). BSC Testnet uses keystore/env-provided keys; no keys or mnemonics
   committed.
9. **Scripts:** `deploy:local`, `seed:local`, `demo:reset`, `deploy:bsc-testnet`,
   `seed:bsc-testnet`, plus a `verify` script. Faucet + testnet instructions documented
   without automating faucet abuse.
10. **Single entry point.** A `demo:local` script chains `deploy:local → seed:local` (and
    optionally `verify`) so the "one documented command" acceptance criterion maps to a real
    command. Testnet stays two explicit steps (`deploy:bsc-testnet`, then `seed:bsc-testnet`)
    — no auto-chain against a live network.

## Non-Goals

- **Route optimizer / planner** — not built here; seed only emits calibration params for it.
- **Route execution** — seed stops at eligible claims; no `executeRoute` / funded state.
- **Faucet automation** — testnet faucet steps are documented, never scripted/abused.
- **BSC Mainnet** — refused by default; no mainnet deploy or seed path.

## Resolved Design Details (were open questions)

All seven planning questions are resolved — grounded in the contracts as they exist today.

1. **Manifest schema = separate sub-maps.** The JSON manifest is
   `{ meta, addresses, namedVaults, sources }`: `addresses` stays the existing 6-slot
   `AddressBook` (unchanged, so its 1:1 `contracts.ts` binding + parity test hold);
   `namedVaults = { stableVault, flexVault }`; `sources = { payroll, freelance, stream }`.
   `VaultRegistry.getVaults()` remains the discovery source of truth — named-vault
   addresses are convenience pointers for demo/verify, not the discovery mechanism.
2. **Simulator = permissionless self-paying obligor.** `settleClaim(bytes32)` is already
   permissionless and pulls `faceValue + fee` from `msg.sender`. Each of the three obligors
   (payroll / freelance / stream) is funded with MockUSDT at seed and approves the
   SettlementManager once; anyone can call `obligor.settle(claimId)`, which runs
   `markMatured` (if due) then `settleClaim`. Keeper-style, so the seeded demo self-settles.
   New Solidity contract → adds an ABI-export + test surface.
3. **Shared helpers → `config/`.** `constants.ts` and `eip712.ts` import only `viem`
   (already "single source shared by tests + Ignition"); move both to
   `packages/contracts/config/` beside `demo-mandate.ts` and repoint test / Ignition / seed
   imports. `fixtures.ts` stays in `test/` (Hardhat-bound). Package stays self-contained
   (no `@matura/*` imports); enum-ordinal parity tests continue to guard the duplication.
4. **`demo:reset` = local-only.** Returns the local env to clean pre-deploy state (fresh
   node + clear Ignition journal + delete local manifest) so `demo:local` reruns cleanly.
   On chainId 97 / any non-local chain it **refuses** with a clear message pointing at
   `seed:bsc-testnet`.
5. **`abiBuildId` = sha256 of exported ABIs.** Deterministic hash over the sorted exported
   ABI files in `packages/chain/src/abis`, computed in `export-abis.ts` and written to a
   generated `abis/build-id.ts`; the manifest imports that constant. The existing CI gate
   (`git diff --exit-code packages/chain/src/abis`) keeps it fresh, so the manifest's
   `abiBuildId` provably matches the shipped ABIs.
6. **Local chain id = 31337.** The `hardhat` network is `edr-simulated` with no `chainId`
   override → Hardhat default 31337. Add `LOCAL_CHAIN_ID = 31337` to `chains.ts` (+ a local
   viem chain def) and a 31337 manifest entry alongside 97.
7. **Seed idempotency = resume-missing.** Each step (fund vault, register issuer, each of
   Alice's 3 claims keyed by deterministic `claimId = keccak256(label)`) probes on-chain
   state and skips if present / creates if absent — truly idempotent; a re-run completes
   only what's missing. It fails with a clear explanation only on genuine conflict (an
   existing claim whose params differ from expected).

## Acceptance Criteria (restated)

- One documented command starts a local chain, deploys, seeds, and leaves queryable state.
- A verification script confirms the two vault configurations, balances, role grants, and
  Alice's three claims.
- `packages/chain` consumers load the generated JSON manifest via typed helpers.
- Contract tests remain green.
