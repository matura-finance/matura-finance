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
6. **Integration test = full cross-stack**, a **new dedicated package** with one command (wired
   into the root turbo task), driven **through the API** (not direct `executeRoute` calldata):
   local hardhat + Testcontainers Postgres (`startTestDb()`) + the real indexer worker
   (`INDEXER_CONFIRMATIONS=1`) + API; deploy → seed → register 3 claims → **`POST /routes/optimize` → `prepare-execution` →
   sign (test key) → submit `executeRoute`** for Request A (partial payroll slice) and Request B
   (≥2 claims) → settle funded → reconcile events ↔ DB projections ↔ balance deltas (exact) →
   mark a separate claim delayed → assert not-PAID. Going through the optimizer/prepare path is
   what validates the router _and_ the read-model end-to-end (a direct-calldata e2e would prove
   neither). Runnable repeatedly on a clean env (idempotent / reset between runs).
7. **Scope = one plan, ordered slices:** escrow adapter → stream adapter → payroll-issuer
   formalization → settlement/delayed → cross-stack e2e.

## Resolved Questions (2026-09-27)

All prior open questions are resolved (codebase investigation + user confirmation):

- **`ClaimRegistry` change — confirmed.** `ClaimRegistry` uses OZ `AccessControl`. Extract the
  inline claim-write from `registerClaim` into a shared internal `_createClaim(...)`; add
  `registerFromSource(...)` gated by a new **`SOURCE_REGISTRAR_ROLE`** (granted to each adapter in
  the Ignition module). It reuses every existing invariant (face>0, dueDate>now, token match,
  valid claimType, dup-claimId, `_usedExternalId`/`_claimExternalId` bookkeeping) but **skips the
  EIP-712 signer path** — the adapter's on-chain state + role is the authority. Needs its own unit
  tests + a `docs/threat-model.md` update for the new registration authority (a second writer to
  the registry, distinct from the ROUTER_ROLE single-writer boundary).
- **Source-claim issuer identity:** **each adapter is registered as its own active issuer entity**
  in `IssuerRegistry` (signer field unused on the source path), so the optimizer's per-leg
  `isActive(issuer)` check passes and provenance is an honest 1:1 source→issuer.
- **Dedup = two layers:** adapter-side `mapping(payoutId ⇒ claimId)` (structural — one claim per
  payout) **plus** `externalIdHash = keccak256(adapter, payoutId)` so the registry's existing
  `_usedExternalId` uniqueness also guards it globally.
- **Obligor:** the **escrow + stream adapters are their own obligors** (hold funds, `forceApprove`
  - call `settleClaim` — the `SourceObligor` pattern, needs no role). Payroll keeps the existing
    signed path + its `SourceObligor`.
- **Time model:** local `evm_increaseTime` (deterministic; already used by `demo:settle`).
- **e2e home:** a **new dedicated workspace package** owning the full-stack scenario + its own
  script, wired into the root turbo task. Reuses the existing Testcontainers `startTestDb()`
  helper; boots a local hardhat node + the **real indexer worker** + API and drives the API
  optimize→prepare→sign→`executeRoute`→settle flow.
- **`finalized`-tag on local:** local EDR has **no `finalized` block tag**, so the e2e runs the
  worker with **`INDEXER_CONFIRMATIONS=1`** (the `head − N` branch), and mines one extra block
  after the last tx so the frontier includes the settlement events. This gates the "DB
  projections" half of the reconciliation.
- **Repeatability:** inherent — ephemeral Testcontainer DB + a fresh local hardhat node + fresh
  deploy/seed per run.

## Remaining implementation notes (for the plan, not blockers)

- Exact `_createClaim` signature + `registerFromSource` params (payoutRef, face, dueDate,
  beneficiary, issuer) — settle in planning; must keep `registerClaim` behavior byte-identical.
- The mined-block "nudge" after settlement so `head − 1` includes the final events deterministically.

## Acceptance Criteria (carried from the request)

Every displayed claim traces to a contract state + issuer/source action; no duplicate financing
or settlement possible in the tested flows; token-balance reconciliation is **exact**; the e2e is
one root command, deterministic, and repeatable on a clean local env; the delayed claim is never
treated as PAID and leaves principal outstanding (no fabricated reserve reimbursement).

## Next Step

Run `/workflows:plan` to turn this into an implementation plan (it will auto-detect this
brainstorm). Suggested spine: `ClaimRegistry` refactor (`_createClaim`) + `SOURCE_REGISTRAR_ROLE` +
`registerFromSource` (+ tests + threat-model note) → MockFreelanceEscrow (reference adapter, its
own issuer entity + obligor) → MockStream (linear, own issuer + obligor) → Mock Payroll Issuer
formalization → settlement receipt + delayed path → deploy/seed + manifest wiring → new cross-stack
e2e package (Testcontainers + local hardhat + worker@`INDEXER_CONFIRMATIONS=1` + API), one command.
