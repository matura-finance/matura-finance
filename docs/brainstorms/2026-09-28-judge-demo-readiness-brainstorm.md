# Brainstorm — Judge & 3-Minute Demo Readiness

**Date:** 2026-09-28
**Topic:** Prepare the Matura repo for hackathon judges and a reliable, reproducible 3-minute demo
**Status:** Ready for `/workflows:plan`
**Constraint:** Clarity + reproducibility only. **No new product feature.** Documentation, copy, and demo-reliability tooling only.

---

## What We're Building

A judge-facing readiness pass over the existing Matura BSC-Testnet MVP. Four coordinated
deliverables, one sequenced plan:

1. **README rewrite** (root) — accurate one-sentence product statement, problem/distinction/why-blockchain,
   architecture diagram, monorepo map, exact local quick-start, live testnet addresses + explorer links,
   demo scenarios A & B, contract responsibilities + trust assumptions, disclaimers, test commands +
   current results, explicit scope (implemented / mocked / future), consistent brand vocabulary,
   independent `matura.xyz` + `app.matura.xyz` deployment notes.
2. **`docs/demo-script.md`** — a narrated, timed 3-minute demo with pre-demo checklist, tiered fallback
   plan, and nine beats (problem → portfolio → Request A → Request B → wallet/explorer proof → settlement
   waterfall → delayed-claim exception → closing differentiation). Optional segments marked.
3. **Demo-reliability tooling** — one-command local reset, a **tiered fallback** (live testnet →
   in-app recorded-data mode → recorded video), a checked-in deterministic fixture derived from the seed
   config, and a pre-demo **smoke test** that asserts live state matches the fixture.
4. **Final audit + `docs/test-report.md`** — verify every README claim against code, copy-voice audit,
   CTA/URL/metadata/cross-domain checks, logo/gradient check, dead-code/stale-artifact removal (behavior
   unchanged), clean-checkout command verification, full quality-gate run with real timestamped results,
   and an honest known-limitations list.

**Nothing here changes on-chain or app behavior.** It documents, verifies, and adds demo-safety scaffolding.

---

## Why This Approach

- **Live testnet is the primary demo** (judge impact: real wallet confirmation + BSCScan proof). The local
  hardhat stack is demoted to the _reset/rehearsal_ environment; a tiered fallback absorbs public-RPC flakiness.
- **Fixtures derive from `packages/contracts/config/demo.ts`** (the existing `CLAIMS`, `REQUEST_A`,
  `REQUEST_B`, vault mandates) rather than a hand-authored parallel file — one source of truth, no drift, and
  the smoke test can assert on-chain state == fixture.
- **Tiered fallback** because a hackathon room's network is the highest-probability failure. Never fake a new
  transaction; fallback surfaces _previously confirmed_ testnet reads/txs behind an unmistakable label.

---

## Key Decisions (confirmed with user)

| #   | Decision                  | Choice                                                                                                      |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Primary demo target       | **Live BSC Testnet** via `app.matura.xyz`; local stack = reset/rehearsal                                    |
| 2   | RPC-outage fallback       | **Tiered**: (1) live testnet → (2) in-app fixture mode w/ "RECORDED — not live" banner → (3) recorded video |
| 3   | Fixture source of truth   | **Derive from seed config** (`config/demo.ts`); smoke test asserts chain == fixture                         |
| 4   | Scope of this effort      | **All four blocks in one sequenced plan**                                                                   |
| 5   | Delayed-claim beat (live) | **Live-exclude** an ineligible claim (real) + **optional** local `demo:settle` waterfall                    |
| 6   | Request B claim set       | **Retarget to `alice-payroll + alice-freelance`** (both seed reliably; stream stays gated)                  |
| 7   | Fallback flag             | **`NEXT_PUBLIC_DEMO_FALLBACK=1`** + "RECORDED TESTNET DATA" banner; off by default, app-only                |
| 8   | Logo/favicon              | **Leave flat text wordmark**; add no asset (no-gradient satisfied by construction)                          |

---

## Grounded Facts (from repo scan)

**Deployed — BSC Testnet (chainId 97), deploymentBlock 133632667, all 11 contracts verified:**
MockUSDT `0x160d…9377` · IssuerRegistry `0xe28b…b97B` · ClaimRegistry `0x4208…5aA4` ·
VaultRegistry `0xF4d6…FC0e` · MaturaRouter `0xaA68…D955` · SettlementManager `0x74c2…7783` ·
StableVault `0x897f…37c5` · FlexVault `0x1853…276F` · PayrollSource `0x65A4…3416` ·
FreelanceSource `0x510d…147b0` · StreamSource `0x7d6b…59E8`.
Proof txs (in gitignored runbook): executeRoute `0xc753cf9…`, settleClaim `0x543555b…` → claim PAID.

**Deterministic demo data (`config/demo.ts`, all `parseUnits(x,6)`):**

- Alice's 3 claims: `alice-payroll` (signed, face **20,000**, PAYROLL, due 30d) ·
  `alice-freelance` (escrow, face **15,000**, due 45d) ·
  `alice-stream` (stream, deposit 20,000 → **~10,000 vested** at seed).
- **Request A** = target 4,800 / maxFace 6,000 / [alice-payroll] → single **partial slice** on cheapest vault.
- **Request B** = target 24,000 / maxFace 40,000 / [alice-payroll, alice-stream] → **multi-claim** aggregation.
- Scripted proof claim `matura-scripted-deployer-payroll-2`: face **1,000**, due 20 min (the automated
  testnet execute+settle proof).
- Vault mandates: **Stable** (PAYROLL|STREAM, 50 bps base, 3 bps/day, cap 500k) · **Flex** (all types,
  150 bps base, 6 bps/day, cap 1M).

**Existing tooling to reuse (not rebuild):** `demo:local`, `demo:settle` (local-only), `demo:testnet-execute`
(the real testnet proof), `demo:reset` (local, runs chain-down), `seed:*`, `reindex`,
`preflight:bsc-testnet`, `check-deployment:bsc-testnet`. Existing docs: `architecture.md`,
`demo-operator-checklist.md`, `deployment.md`.

---

## Concrete Audit Findings Already Surfaced (fix in this pass)

1. **CRITICAL — README demo numbers are wrong.** Root README "Demo scenario" advertises Payroll **1,000** /
   Freelance **600** / Stream **400**; the seeded reality is **20,000 / 15,000 / ~10,000**. Judges will
   cross-check against the live app. Reconcile to seed truth.
2. **Stream claim is skipped when `SEED_BENEFICIARY` override is set** (recipient-gated `MockStream`).
   **Resolved:** Request B is retargeted to `alice-payroll + alice-freelance` (Decision 6) so scenario B
   never depends on the gated stream claim. Smoke test still asserts both are ELIGIBLE live.
3. **Brand capitalization drift** — "Matura protocol" / "Matura account" lowercased in a few landing + app
   user-visible strings. Copy pass to canonicalize: Matura Protocol / Account / Claims / Vaults / Router.
4. **No logo asset exists** — brand is a flat text wordmark ("Matura"), zero SVGs → the "no gradient" logo
   constraint is _trivially satisfied_; there is no mark or favicon. **Resolved:** leave the wordmark as-is
   (Decision 8); audit records "flat wordmark, 0 gradients."
5. **Missing READMEs** for `apps/{app,landing,api}` and `packages/chain` — optional for a 3-min demo; root
   README is the judge entry point.

---

## Scope Boundaries (YAGNI)

**In scope:** docs, copy corrections, a fixture file, a smoke-test command, a documented in-app fallback
flag, an operator reset command, a timestamped test report, dead-code/stale-artifact removal that provably
changes no behavior.

- **Reset semantics:** the "one-command local demo reset" must restore a **clean, seeded, demo-ready
  rehearsal state**, not just wipe. The existing `demo:reset` is only a _bare wipe_ (Ignition journal +
  zeroed 31337 manifest, chain-down); the deliverable is a wrapper that chains **wipe → deploy → seed**
  (i.e. `demo:reset` then `demo:local`) into one command, leaving Alice's three claims freshly seeded.
- **Dead-code / package removal guard:** removal is limited to artifacts provably unreferenced _and_
  behavior-neutral. **Removing a workspace package is high-risk and out of scope unless** a build/lint/test
  run proves it has zero importers; otherwise flag it in the report as a candidate, don't delete it. Prefer
  reporting over deleting when in doubt.

**Explicitly out of scope:** new contracts, new app features, new routes, optimizer changes, new
on-chain state, real KYC/fiat/legal-assignment work. **Never** say "production-ready." **Never** fabricate
coverage numbers or fake a transaction.

**Honest known-limitations list (must appear in README + test-report):** mock issuers, mock stablecoin,
permissioned vaults, no legal assignment, no real KYC/KYB, no fiat rails, limited optimizer scale,
unaudited contracts, testnet-only.

---

## Resolved Questions (confirmed with user)

1. **Delayed-claim exception (demo beat 8)** — **Live-exclude + local waterfall.** Live path shows the
   optimizer honestly _excluding_ an ineligible / not-yet-due claim (real router behavior, nothing faked).
   The full past-due settlement waterfall + retained-user-balance is narrated from the **local `demo:settle`**
   output as an **optional/backup** segment. No testnet time-travel required.
2. **In-app fallback mechanism (tier 2)** — env flag **`NEXT_PUBLIC_DEMO_FALLBACK=1`** makes `apps/app` serve
   a checked-in `fixtures/testnet-demo.json` of previously-confirmed testnet reads/txs, behind a persistent
   **"⚠ RECORDED TESTNET DATA — not live"** banner, with explorer links pointing to the **real** past txs.
   **Off by default; must never ship in a prod build**; `apps/landing` stays wallet-free and unaffected.
3. **Recorded video (tier 3)** — an **operator-recorded** asset (the real wallet flow can't be agent-scripted).
   Plan specifies the _slot_ only: store under `docs/demo-assets/`, reference from `demo-script.md`, and add a
   rehearsal checklist step to record it. The agent does not produce the recording.
4. **Request B claim set** — **retarget `REQUEST_B` to `alice-payroll + alice-freelance`** (both non-recipient-
   gated → seed reliably on testnet; still two distinct sources, so the aggregation story holds). This is a
   demo-_calibration_ change in `config/demo.ts`, not a protocol/behavior change. `alice-stream` remains
   seeded/visible as a third portfolio claim where it seeds cleanly. Plan should still read live seeded state
   to confirm both are ELIGIBLE before the demo.
5. **Logo/favicon** — **leave the flat text "Matura" wordmark; add no asset.** The no-gradient constraint is
   satisfied by construction (zero SVGs/gradients today). Audit records: "flat wordmark, 0 gradients."
   Creating a logo is treated as a new asset outside the "no new feature" boundary.

**Remaining plan-time verification (evidence, not decisions):** confirm the live testnet seeded claims are
ELIGIBLE (payroll + freelance for Request B), and confirm the fallback flag cannot leak into a prod build.

---

## Success Criteria

- A cold reader (judge) understands what Matura is, why it needs a chain, and how to run it — from the README
  alone, with numbers that match the live app.
- The 3-minute script is rehearsable and lands ≤3:00 with optional beats marked.
- `pnpm … demo:smoke` (or equivalent) exits green iff the live/local state matches the fixture; a documented
  one-command reset restores a clean local rehearsal state.
- If the room's RPC dies mid-demo, the operator degrades gracefully to labeled recorded data without faking a tx.
- `docs/test-report.md` shows a real, timestamped quality-gate run; no fabricated coverage.
- Every README claim is traceable to code; no dead code or stale artifacts changed behavior.

---

## Next

Run `/workflows:plan` — it will auto-detect this brainstorm. The plan should sequence:
**(A)** fixture + smoke-test + reset wrapper → **(B)** README rewrite (numbers reconciled) →
**(C)** `docs/demo-script.md` → **(D)** copy/CTA/metadata/logo audit + dead-code sweep →
**(E)** full quality-gate run → `docs/test-report.md`.
