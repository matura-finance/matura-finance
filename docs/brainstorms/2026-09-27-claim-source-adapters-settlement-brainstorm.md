# Brainstorm — Claim-source adapters + full settlement loop

**Date:** 2026-09-27
**Author:** arjunamarcelino
**Status:** Ready for planning

## What We're Building

Make the three claim sources **real** — each claim traceable to an on-chain source
action, not a UI label — and prove the whole loop end-to-end, without pretending any
external integration exists.

- **Payroll (Mock Payroll Issuer):** stays the **issuer-signed EIP-712 attestation** path.
  A labeled "Mock Payroll Issuer" computes a synthetic accrued net wage **off-chain (demo
  metadata)**; only the issuer-authorized final eligible face value is registered on-chain.
- **MockFreelanceEscrow (new contract):** client funds an engagement → approves work →
  creates a payout with a synthetic release date. The claim is registered **by the escrow
  adapter itself**, gated on real escrow state, and each escrow payout can back **at most one
  claim** (on-chain dedup).
- **MockStream (new contract):** a minimal **linear** stablecoin stream (start/stop/rate)
  exposing **vested / remaining-claimable** economics; the claim face = remaining claimable at
  registration; the stream position is **assigned to the protocol** at funding so the obligor
  pays from it. Explicitly a Mock — **no Sablier import**.
- **Settlement loop (extend):** the built route → `markMatured` → `settleClaim` waterfall
  already conserves value (vault gets financed face, Alice gets residual, treasury the fee
  surcharge). Add a deterministic issuer-simulator demo action (local time-warp, or immediate
  settle), before/after balances + a **settlement receipt**, and the **delayed path** (mark a
  freelance claim delayed → status shown, no false PAID, principal outstanding; **no fabricated
  reserve reimbursement** in P0).
- **One-command cross-stack integration test** reconciling contract events ↔ DB projections ↔
  token balance deltas (see below).

No new `ClaimType` — payroll/freelance/stream ordinals already exist (avoids the 7-site enum edit).

## Why This Approach

**On-chain adapter-registrar** for escrow + stream: the adapter contract holds its own state and
**registers the claim** through a new **role-gated path in `ClaimRegistry`** only when its state
permits, recording `payoutRef → claimId` to make duplicate financing structurally impossible.
This is the only option that makes "linked to actual escrow state" true on-chain (an off-chain
issuer check would still be a trusted label). Payroll keeps the existing signed path because it
genuinely _is_ an issuer attestation — which also **confines the core-contract change to one new
function**, leaving the audited ECDSA attestation path untouched.

**Full cross-stack e2e** because the acceptance criteria name "database projections" explicitly —
contract-only reconciliation wouldn't prove the read-model the product actually renders.

## Key Decisions

1. **Binding = on-chain adapter-registrar.** New role-gated `ClaimRegistry` entry (e.g.
   `registerFromSource(...)`), callable only by an allowlisted source adapter, which enforces
   adapter state + `payoutRef` dedup. (Considered + rejected: ERC-1271 contract-signature via
   `SignatureChecker` — elegant but conflates signing with state-verification and still changes
   the core auth path.)
2. **Payroll = issuer-signed EIP-712** (Mock Payroll Issuer); accrual math is off-chain demo
   metadata; only the final face is registered.
3. **MockFreelanceEscrow** = client-funded engagement with states (funded → approved → payout
   created w/ release date); adapter registers + dedups; it is the reference adapter built first.
4. **MockStream** = minimal linear stream; vested/remaining views; face = remaining claimable;
   assignable (position transferred to the protocol at funding). No Sablier.
5. **Settlement:** reuse the existing waterfall; add the issuer-simulator demo action, receipt +
   before/after balances, and the delayed path (no false PAID, principal stays outstanding, no
   reserve reimbursement in P0).
6. **Integration test = full cross-stack**, one root script: local hardhat + Testcontainers
   Postgres + indexer worker + API; deploy → seed → register 3 claims → optimize+execute Request
   A (partial payroll slice) → optimize+execute Request B (≥2 claims) → settle funded → reconcile
   events ↔ DB projections ↔ balance deltas (exact) → mark a separate claim delayed → assert
   not-PAID. Runnable repeatedly on a clean env (idempotent / reset between runs).
7. **Scope = one plan, ordered slices:** escrow adapter → stream adapter → payroll-issuer
   formalization → settlement/delayed → cross-stack e2e.

## Open Questions

- **`ClaimRegistry` new path shape:** exact signature of `registerFromSource` + how source
  adapters are allowlisted (a `SOURCE_ROLE` on the registry vs a source-registry lookup). Must
  preserve every existing invariant (dueDate>now, face>0, token match, no dup claimId). Decide in
  planning; it touches an audited contract → needs its own tests + threat-model note.
- **`payoutRef` / dedup key:** reuse the existing `externalIdHash` uniqueness for the payout id,
  or a dedicated adapter-side `mapping(payoutId ⇒ claimId)`? (Leaning: adapter-side mapping +
  `externalIdHash` = `keccak(adapter, payoutId)`.)
- **Escrow → obligor funding at settlement:** does the escrow adapter itself hold the client
  funds and pay at settlement (becoming the obligor), or does it hand off to a `SourceObligor`?
  (Leaning: the adapter _is_ the obligor for its claims, giving real per-source accounting the
  generic `SourceObligor` deliberately lacks.)
- **Time model:** local `evm_increaseTime` to reach maturity (deterministic, already used by
  `demo:settle`) vs seeding near-due claims. (Leaning: time-warp.)
- **e2e harness home:** a new `apps/e2e`-adjacent package / a `packages/contracts` script / a root
  `scripts/` orchestration invoked by one root `pnpm` task — and whether it reuses the existing
  Testcontainers setup from `apps/api` `test:int`.
- **Reset/repeatability:** `demo:reset` wipes local state; confirm the e2e self-cleans so it
  "passes repeatedly on a clean local environment."

## Acceptance Criteria (carried from the request)

Every displayed claim traces to a contract state + issuer/source action; no duplicate financing
or settlement possible in the tested flows; token-balance reconciliation is **exact**; the e2e is
one root command, deterministic, and repeatable on a clean local env; the delayed claim is never
treated as PAID and leaves principal outstanding (no fabricated reserve reimbursement).

## Next Step

Run `/workflows:plan` to turn this into an implementation plan (it will auto-detect this
brainstorm). Suggested spine: `ClaimRegistry` source-registration path (+ tests) → MockFreelanceEscrow
→ MockStream → Mock Payroll Issuer formalization → settlement receipt + delayed path → deploy/seed
wiring → cross-stack reconciliation e2e + one root script.
