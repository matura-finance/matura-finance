---
title: "Security hardening: an adversarial red-team suite as the regression suite (contracts + API/indexer + frontend)"
category: integration-issues
tags:
  [
    security,
    threat-model,
    adversarial-tests,
    contracts,
    apps-api,
    indexer,
    reentrancy,
    eip712,
    route-intent,
    redaction,
    reconciliation,
    testnet,
  ]
module: "packages/contracts, apps/api (auth + indexer + routes), apps/{app,landing,e2e}"
symptom: "A pre-demo hardening pass over a codebase that is already strongly hardened: the risk isn't missing controls, it's controls asserted only by the threat model and never exercised by a test — plus a couple of off-chain surfaces (mirror parity, read-through error scope) that could hide a real P1."
root_cause: "Untested security claims drift from the code that is supposed to enforce them; off-chain approximations of on-chain validation can silently diverge; and 'never brick' tradeoffs (swallowed settlement returns, pause scope) create reconciliation surfaces that look like bugs unless documented."
date: 2026-09-27
related:
  - docs/threat-model.md
  - docs/plans/2026-09-27-security-hardening-pass-plan.md
  - docs/brainstorms/2026-09-27-security-hardening-pass-brainstorm.md
  - docs/solutions/integration-issues/best-execution-router-mirror-intent-optimizer.md
  - docs/solutions/integration-issues/cross-stack-e2e-harness-instant-mine-chain.md
  - docs/solutions/build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md
---

# Security hardening: adversarial suite as regression suite

> **Outcome:** the pass made **3 code fixes total** — 1 P1 (frontend
> pin-to-manifest defense-in-depth in `prepareRoute`) + 2 P2 (api 400/413 status
> correctness) — with **everything else confirmed as proof-of-control**. **No
> contract source changed** (+29 contract tests, 159 passing; all on-chain controls
> held on first assertion).

Hard-won, reusable patterns from the 2026-09-27 hardening pass over the Matura MVP.
The codebase was already unusually security-conscious (OZ `AccessControl`, EIP-712
nonces + deadlines, `ReentrancyGuardTransient`, single-block-pinned router mirror,
single-use route intents, fail-closed SIWE/JWT, atomic advisory-locked indexer
cursor). So the pass was **prove the controls hold + close documented gaps + fix
any real P0/P1** — not a rescue.

## 1. Adversarial tests ARE the regression suite

The most rigorous discovery method and the deliverable collapse into one artifact.
For each red-team scenario: **write the attack test first.** If the control holds,
keep the test as a **proof-of-control** regression guard. If it fails, that's a
confirmed P0/P1 → fix per the rubric + keep the same test as the regression.
Discovery, proof, and regression are the same file. This is strictly better than a
read-only manual audit, which leaves nothing behind.

Corollary: even for a COVERED control, name the assertion explicitly. "The nonce
is single-use" is a threat-model claim until a test with that title fails when you
break it.

## 2. Proof-of-pinning + proof-of-guard beats a full deploy-and-drain harness

The classic "malicious/reentrant ERC-20" harness tests an **unreachable** threat
here: the asset token is `immutable` and every registration path rejects a
non-settlement token (`ClaimRegistry.sol:65,126` → `TokenNotSettlement`;
`MaturaRouter.sol:127` → `TokenMismatch`). Building a deploy-and-drain rig against
that is wasted effort. Split it instead:

- **Proof-of-pinning** — assert the guards that make the malicious token
  unreachable (registration rejects non-settlement token; router rejects
  claim↔vault mismatch; asset immutables wired to the one token).
- **Proof-of-guard** — a tiny reentrant-callback token fixture (test-only,
  **excluded from ABI export + manifest**) confirming `nonReentrant` + CEI +
  `AlreadySettled` still hold on `fund` / `executeRoute` / `settleClaim` even if
  pinning were subverted.

Two small, meaningful tests instead of one large, theatrical one.

## 3. "Pause can't strand settlement" is a first-class invariant — test it

`SettlementManager` is deliberately **non-pausable** and its payer is
**permissionless**, precisely so a pause on `MaturaRouter`/`LiquidityVault` can
never trap a matured claim's funds. That is easy to "harden" into a bug by adding a
pause modifier. Lock it with a test: _settles a matured claim while router + vault
are PAUSED_. Likewise: `withdraw` drains only idle liquidity (payer-funded
settlement still succeeds after withdraw-all), and `writeOffClaim` moves zero
tokens (only exposure counters clear).

## 4. Swallowed settlement returns are a reconciliation surface, not a silent bug

`SettlementManager` wraps the vault return callback in try/catch and emits
`SettlementReturnFailed` on revert — the claim still reaches `PAID`, funds are not
stranded, but `principalByClaim` is left stale for an operator to reconcile. This
is an intentional "never brick settlement" tradeoff. The trap is reading it as a
defect. Correct handling: test the path (revoked `SETTLEMENT_ROLE` → event emitted,
claim `PAID`, no `ConservationViolation`, no double-decrement) **and** document it
in the threat model as an operator-visible reconciliation surface. Test + doc, not
a "fix."

## 5. The on-chain nonce is the replay guard; the RouteIntent is UX

A single-use `RouteIntent` (create-or-ignore, consumed by an atomic `updateMany`
guard, pruned **expired-only**) prevents off-chain double-submit, but the real
replay guard is the per-user on-chain nonce + deadline in the signed
`ExecutionRoute`. Say so in code and in the threat model so nobody "hardens" the
intent table into a race (pruning `CONSUMED` rows reintroduces a single-use
bypass — see the router learnings doc §3). Test both the happy consume and the
concurrent double-consume (one row wins, the loser gets `null` and is marked
`FAILED`, never left `PENDING`).

## 6. There is ONE off-chain `_validateLegs` mirror — parity is a live defect risk

The prepare flow mirrors on-chain `_validateLegs` off-chain so it never hands the
user typed data that reverts. Two items were treated as _suspected defects_ and
**both were already correct** — the mirror already rejects an **inactive issuer**
(`ISSUER_INACTIVE`) and **inactive vault** (`VAULT_INACTIVE`); `getVaults()` returns
all vaults, so active-state is per-vault. Converted to proof-of-control regression
tests, no fix needed. Keep exactly one shared predicate (`common/leg-mirror.ts`);
forking it per prepare flow is the documented drift trap. (Note: the coded error is
`VAULT_INACTIVE` — the plan text's `VAULT_NOT_ACTIVE` was a guess; tests assert the
real name.)

## 7. A read-through must not mask transport faults as "not found"

Chain read-through endpoints commonly `catch` a revert and return a 404
(`CLAIM_NOT_FOUND`). If that catch is too broad it swallows **transport** errors
(RPC down/timeout) into a 404, which is a correctness bug — the client thinks the
claim is gone when the node is merely unreachable. Narrow the catch on
`BaseError.walk` (contract revert) and let everything else surface as 5xx.
**Outcome:** already correct in `chain.service.ts` (narrows on `BaseError.walk`;
transport errors propagate as 5xx) — converted to a regression test, no fix needed.

## 8. Indexer DB-down recovery is a crisp pass/fail

The strongest indexer test is boring to state and hard to fake: **API/DB
unavailable while the chain advances, then restored → projection == on-chain,
cursor past the tx block, no duplicate rows.** It exercises the durable cursor, the
advisory-locked atomic batch (cursor + projections commit together), idempotent
upserts, and the reorg full-wipe path in one scenario. Adjacent trap worth its own
test: a child event whose parent ordinal is unknown must **skip, not FK-abort**, or
one odd event wedges the whole worker.

## 9. HTTP redaction: assert the client body, not the log

Redaction bugs hide in the response body. Assert directly that a raw
`PrismaClientKnownRequestError` becomes a generic 500 with **no** `meta` / stack /
SQL, and that a thrown `Error("…secret…")` message never reaches the client.
Testing the log is not enough — the leak is what crosses the wire.

## 10. Fail-closed env parsing: `z.stringbool`, not `z.coerce.boolean`

`z.coerce.boolean("false")` is `true` (non-empty string) — a fail-**open** flag
that silently enables a demo signer. Use `z.stringbool` so `"false"` → `false`.
Pair it with the boot-refusal regression: `ISSUER_PRIVATE_KEY` set +
`NODE_ENV=production` must throw at boot. Both are one-line regressions guarding a
credential-exposure footgun.

---

## Appendix — `TODO|FIXME|placeholder|mock|XXX|HACK` classification

Repo-wide scan (2026-09-27), excluding `node_modules`, `dist`, `.next`,
`artifacts`, `.turbo`, `coverage`; over `*.ts/tsx/sol/js/mjs/json`. **110 matches;
zero are core-logic placeholders.** Breakdown:

- **`TODO` / `FIXME` / `XXX` / `HACK` — 0 matches.** None anywhere in source.
- **`placeholder` — 9 matches, all legitimate:**
  - `packages/ui/src/components/input.tsx` — the CSS `placeholder:` pseudo-class
    and HTML input placeholder attribute.
  - `packages/ui/src/components/skeleton.tsx` — a loading-skeleton component doc
    ("loading placeholder").
  - `apps/app/src/components/request/request-view.tsx`,
    `.../issuer/issuer-view.tsx` — HTML `placeholder="…"` form-input attributes.
  - `packages/chain/src/addresses.ts`, `manifest.ts`,
    `packages/contracts/scripts/lib/read-manifest.ts` — the **zero-address**
    deploy placeholder (the manifest shape before contracts are deployed). Legit
    domain concept, not an unfinished stub.
- **`mock` — ~101 matches, all legitimate:**
  - `Mock*` **demo/test contract names**:
    `packages/contracts/contracts/token/MockUSDT.sol`,
    `sources/MockFreelanceEscrow.sol`, `sources/MockStream.sol`, and the
    generated ABIs / deployment slots / manifest entries for them
    (`packages/chain/src/abis`, `deployments`, `__tests__`).
  - `mockUsdt` **address-slot references** in `apps/api` (`chain.service.ts`,
    `settlements/prepare/…`) — the settlement-token address slot, not a stub.
  - `jest.mock(...)` / hand-rolled **mock signers + services** in `apps/api`
    `*.spec.ts` and the `apps/e2e` **mock-wallet** EIP-6963 injector — test
    doubles, expected.
  - `apps/landing` copy referencing the demo/mock nature of the MVP.

**No misleading core-logic placeholder found.** Every match is a legitimate
`Mock*`/skeleton/zero-address-placeholder name in a demo contract, test double,
UI skeleton, or generated artifact — consistent with the plan's expectation of
zero core placeholders.
