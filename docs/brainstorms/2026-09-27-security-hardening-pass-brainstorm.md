# Security & Correctness Hardening Pass — Brainstorm

**Date:** 2026-09-27
**Status:** Ready for planning
**Author:** arjunamarcelino

## What We're Building

A focused **security & correctness hardening pass** over the Matura MVP (BSC-Testnet
RWA/invoice-financing; contracts + API/indexer + frontend). This is **not** feature work.
The lightweight scan showed the codebase is already unusually security-conscious
(OZ `AccessControl`, EIP-712 nonces + deadlines, `ReentrancyGuardTransient`, single-block-pinned
router mirror, single-use route intents, fail-closed SIWE/JWT, atomic advisory-locked indexer
cursor, a committed 25-row threat model, ~55 security tests, zero core placeholders).

So the pass is scoped as **adversarial verification + close documented gaps + fix any real
P0/P1 the red-team surfaces** — prove the existing controls hold, don't rebuild them.

## Why This Approach

**Adversarial-tests-led.** The task's ADVERSARIAL TESTS list is effectively a red-team suite.
Building those tests _first_ is the most rigorous discovery method AND simultaneously satisfies
deliverable #2 (regression tests). For each scenario: write the attack test → if the control
holds, keep it as a proof-of-control test; if it fails, that's a confirmed P0/P1 → fix + keep the
test as a regression guard. Discovery, proof, and regression collapse into one artifact — the
compounding choice over a read-only manual audit.

## Key Decisions

| Decision             | Choice                              | Rationale                                                                                                                                                                                   |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hardening depth**  | Testnet-hardened bar                | Fix all confirmed P0/P1 + clean-fix plausible P2s. Only genuinely out-of-scope items (external audit, formal verification, mainnet ops, multisig/timelock) become documented accepted risk. |
| **Effort focus**     | Even split                          | Contracts, API/indexer, and frontend/secrets weighted roughly equally per confirmed findings. All layers reviewed regardless.                                                               |
| **Process**          | Fix P0/P1 as found, report the rest | Auto-fix clear P0/P1 with regression tests inline; surface P2 / accepted-risk candidates for review. Fewer round-trips.                                                                     |
| **Discovery engine** | Adversarial-tests-led               | Red-team suite is both discovery and regression.                                                                                                                                            |
| **Docs scope**       | Extend to full stack                | Grow `threat-model.md` to cover API/indexer/SIWE/JWT/frontend; add `SECURITY.md`; add operator checklist.                                                                                   |

## Severity Rubric (the fix-vs-document boundary)

- **P0** — funds/claims can be stolen or destroyed, a secret can leak, or the demo cannot run.
  Always fixed + regression test.
- **P1** — accounting can be corrupted, a control can be bypassed, or state can desync
  (indexer/reconciliation) without direct theft. Always fixed + regression test.
- **P2** — griefing, edge-case DoS, or defense-in-depth gaps. Fixed only if the fix is clean and
  low-risk under the testnet-hardened bar; otherwise documented as accepted risk.
- **Accepted risk** — out-of-scope by design (see Non-Goals) or a P2 not worth a fix. Documented
  in `threat-model.md`, never silently dropped.

## Scope

### Adversarial red-team suite (each → proof-of-control OR fix+regression)

1. Malicious / reentrant ERC-20 — the asset token is `immutable` and every registration path
   rejects `!= settlementToken`, so a full deploy-and-drain harness tests an unreachable threat.
   Instead: **proof-of-pinning** (`TokenNotSettlement`/`TokenMismatch` guards + immutable wiring:
   `ClaimRegistry.sol:65,126`, `MaturaRouter.sol:127`) + **proof-of-guard** (small callback fixture
   confirming `nonReentrant`+CEI+`AlreadySettled` hold on `fund`/`executeRoute`/`settleClaim`).
2. Compromised **former** issuer signer after rotation (`signerEpoch` kill-switch must reject).
3. Front-run / replay a route signed for a **different** user (recipient = signed `route.user`).
4. Route submitted on **wrong chain / wrong verifying contract** (EIP-712 domain must reject).
5. Same claim financed **concurrently** (double-financing / slice over-assignment).
6. **Expired** route after UI confirmation (deadline + single-use intent must reject).
7. **Vault drained** between quote and execution (on-chain requote + reserved-liquidity check).
8. **Rounding attack** with many tiny slices (integer-bps Ceil; `MAX_SLICES_PER_CLAIM=8`; conservation).
9. Settlement with **wrong token or wrong payer** (permissionless payer is by design — verify it can't corrupt accounting).
10. **API/DB temporarily unavailable while the on-chain tx succeeds** (indexer catches up; no lost/duplicated projection).

### Two flagged reconciliation surfaces (investigate, then fix-or-document)

- **`sources/SourceObligor.sol` pooled balance** — confirmed: single undifferentiated pool, no
  per-claim binding, so settling one claim can draw down funds "owed" to another
  (`SourceObligor.sol:26-31,85-86`). **Not theft** (no attacker can name themselves beneficiary
  without an issuer key) and already documented as accepted testnet-only behavior. Action:
  add a test asserting it stays testnet-scoped + carry the accepted-risk note into `threat-model.md`;
  no contract change. The per-claim-bound `MockFreelanceEscrow`/`MockStream` are the safe variants.
- **`SettlementManager` vault-return `try/catch`** — swallows failures into `SettlementReturnFailed`,
  leaving stale `principalByClaim`. Test the reconciliation path; document as an explicit
  operator-visible reconciliation surface (intended tradeoff: never brick settlement).

### Documentation deliverables

- Extend `docs/threat-model.md` → add API/indexer/SIWE/JWT/frontend trust assumptions, known
  limitations, and the accepted-hackathon-risk list (incl. `ISSUER_PRIVATE_KEY`-in-service gating,
  single deployer key, no multisig/timelock).
- New `SECURITY.md` — responsible-disclosure process + explicit "**testnet only, never use real
  funds**" warning.
- Concise **internal demo-operator checklist** (pre-demo env sanity: `NODE_ENV` not prod when
  issuer key present, CORS allowlist, seeded stack, faucet, signer epoch).

### Quality gate (must all pass, no suppression / no type-loosening for green)

Fresh install → root lint, typecheck, unit, **contracts:test**, landing build, product-app build,
selected Playwright E2E — all **hard-required**. The Docker-dependent items — API **integration
(Testcontainers)** and **cross-stack e2e** — are **required locally** (dev machine has Docker,
v29.4.2) but **best-effort in CI** (CI may lack Docker); the plan marks them accordingly and CI
must not fail solely for their absence. No committed secret/key/mnemonic/DB cred/live token.
Classify every remaining TODO/FIXME/placeholder/mock (scan found ~60, all legitimate `Mock*`
demo/test names — confirm and document). Report exact failures if anything is red.

## Resolved Questions

- **Reentrant-token test feasibility — RESOLVED.** Asset token is `immutable` + every registration
  path rejects non-pinned tokens, so a full malicious-token deploy-and-drain harness tests an
  unreachable threat. Decision: **proof-of-pinning + proof-of-guard unit tests** instead (see
  red-team item #1). Confirmed the guard + CEI would still hold even if pinning were subverted.
- **Docker dependency — RESOLVED.** Dev machine has Docker (v29.4.2). Testcontainers integration +
  cross-stack e2e are **required locally, best-effort in CI**; CI must not fail solely for Docker's
  absence (see Quality gate).
- **P2 boundary — RESOLVED** by the Severity Rubric above (clean-fix P2s under the testnet-hardened
  bar; otherwise documented accepted risk).

## Open Questions

- None blocking. Per-finding P2 fix-vs-document calls are made against the rubric during the pass.

## Non-Goals (accepted hackathon risks, documented not fixed)

External audit, formal verification, mainnet operational security, multisig/timelock governance,
`AccessControlDefaultAdminRules`, and any redesign of the intentionally-permissionless settlement
payer or the intentionally-non-pausable `SettlementManager`.

## Next

Run `/workflows:plan` to sequence the red-team suite, fixes, and docs into an implementation plan.
