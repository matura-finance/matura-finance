---
title: "Multi-step wallet-tx dialog robustness: indexing lock-in, idempotent retry, mid-flight wallet switch, fixed-position tooltip"
category: integration-issues
tags:
  [
    apps-app,
    apps-api,
    wagmi,
    viem,
    react-hooks,
    tanstack-query,
    tx-flow,
    idempotency,
    siwe,
    a11y,
    tooltip,
    overflow-clipping,
    prisma,
    index,
    reown-appkit,
    bundle-size,
    env-validation,
  ]
module: "apps/app (request/issuer/ui dialogs, queries, auth), apps/api (claims read)"
symptom: "A multi-agent review of the wallet-connected product surfaced UX/correctness bugs in the Get-Liquidity and issuer-demo transaction dialogs: a modal you can't close after funds already moved; a retry that mints a second on-chain claim; a mid-flight wallet switch wiping the progress UI; a tooltip floating over the wrong table row; plus a 401 re-sign loop, a placeholder env that defeats fail-closed validation, and an unindexed issuer read."
root_cause: "waitForTransactionReceipt throwing does NOT mean the tx failed; bounded polls give up without transitioning state; persistently-mounted dialogs keep state across open/close; a dismiss-lock that covers post-receipt phases traps the user; identity generated inside the submit() closure changes on retry; chainId/account from useAccount() change at any time and pre-empt the render cascade; a position:fixed tooltip under an overflow-x-auto box is both clipped and pinned to stale coords; a loop-guard window shorter than the poll interval; z.string().min(1) passes on a placeholder; a Prisma findMany sorted on a non-covering index."
date: 2026-10-06
related:
  - docs/solutions/integration-issues/next15-wallet-frontend-siwe-eip712-e2e.md
  - docs/solutions/integration-issues/best-execution-router-mirror-intent-optimizer.md
  - docs/solutions/integration-issues/cross-stack-e2e-harness-instant-mine-chain.md
  - docs/threat-model.md
---

# Multi-step wallet-tx dialog robustness

Hardening lessons from the PR #13 review (see `docs/reviews/pr-13-review.md`). Each pattern below
recurs in any wagmi/viem dapp that drives a sign → submit → index flow inside a modal. The
unifying root cause: **an on-chain transaction's success is not observable from the client call
graph** — `waitForTransactionReceipt` can throw on a tx that mined, and a projection poll can give
up while the chain state is already final. Build the UI to reconcile with chain/projection state,
never to assume the happy path from "did my `await` resolve?".

Affected files (apps/app unless noted): `components/request/get-liquidity-dialog.tsx`,
`components/issuer/{create-claim,claim-action}-dialog.tsx`, `components/issuer/issuer-view.tsx`,
`components/ui/{dialog,tooltip,flow-visuals}.tsx`, `lib/queries/hooks.ts`,
`lib/auth/session-provider.tsx`, `lib/env.ts`, `lib/appkit-config.ts`,
`lib/chain/allowed-targets.ts`; `apps/api/src/claims/read/claims-read.service.ts`,
`apps/api/prisma/schema.prisma`.

---

## 1. Never lock a modal shut on a post-receipt phase (the "indexing trap")

**Symptom.** After the advance tx confirmed on-chain (funds arrived), the modal showed a spinner
"Confirmed — updating your positions" forever; backdrop click and Escape were both dead.

**Root cause.** `dismissable={!inFlight}` where `inFlight` included `confirmed`/`indexing`. The
projection poll (`useExecutionPoll`) returns `false` from `refetchInterval` after `POLL_MAX_TICKS`
but **nothing transitions the tx state** when it gives up, so the status sits at `indexing` and the
dismiss-lock never releases.

**Fix.** Lock dismissal only while the user is genuinely mid-action (signing/submitting), and give
the stall a dismissable terminal state:

```ts
// Lock only while signing/submitting. Post-receipt the tx is irreversible — locking only traps.
const inFlight = s === "awaitingWallet" || s === "broadcast" || prepare.isPending;

// After a bounded wait, flip to a reassuring, dismissable pane.
useEffect(() => {
  if (tx.state.status !== "indexing") {
    setIndexingSlow(false);
    return;
  }
  const t = setTimeout(() => setIndexingSlow(true), 45_000);
  return () => clearTimeout(t);
}, [tx.state.status]);
```

**Principle.** A safety lock that can't be dismissed is a cage. Only lock what is actually
reversible/pending; once the receipt is in, offer an explicit Close.

---

## 2. Make retry idempotent — a thrown receipt is not a failed tx

**Symptom.** Clicking "Try again" after a create-claim error produced a **second** on-chain claim.

**Root cause.** The claim identity (`claimId`, `dueAt`) was generated _inside_ `submit()`, so each
retry produced a new id. `waitForTransactionReceipt` throwing (RPC timeout, dropped-then-mined)
does not mean the first tx failed — it may have registered the claim.

**Fix.** Freeze the identity for the dialog session (retry re-sends the _same_ id), and treat the
server's "already exists" conflict as success:

```ts
const [identity, setIdentity] = useState<{ claimId: string; dueAt: string } | null>(null);
// ...in submit():
const id = identity ?? {
  claimId: keccak256(stringToHex(`matura-demo:${crypto.randomUUID()}`)),
  dueAt: new Date(Date.now() + minutes * 60_000).toISOString(),
};
if (identity === null) setIdentity(id);
// ...in catch:
if (e instanceof ApiError && e.code === "CLAIM_ALREADY_EXISTS") {
  /* the claim DOES exist → success */
}
```

**Generalize to any action** by reconciling with chain state on error, rather than re-sending
blindly. For settle/delay (direct writes), re-read the claim and treat "already in the target
state" as success:

```ts
async function reachedTarget(): Promise<boolean> {
  const c = await readContract(config, {
    address,
    abi: claimRegistryAbi,
    functionName: "getClaim",
    args: [claimId],
  });
  return action === "settle"
    ? CLAIM_STATES[c.state] === "PAID"
    : CLAIM_STATES[c.state] === "DELAYED";
}
// catch: if ((e instanceof ApiError && e.code === "ALREADY_SETTLED") || (await reachedTarget())) { success }
```

This also fixes the **stale confirm snapshot**: a dialog rendered from a frozen `claim` object can
act on state a background poll already moved; the on-error re-read reconciles it.

**Server contribution.** The pre-check that 409s a duplicate/already-done claim
(`CLAIM_ALREADY_EXISTS`, `ALREADY_SETTLED`) is what makes client idempotency clean — lean on
coded API errors (`ApiError.code`), not substring matching.

---

## 3. Don't let `useAccount()` changes pre-empt an in-flight flow

**Symptom.** Flipping network/account in the wallet mid-`indexing` replaced the progress UI with
"Wrong network" while the state machine kept running underneath.

**Root cause.** The content cascade checked `chainId !== target` _before_ the tx-state branches.
`chainId`/`address` come from `useAccount()` and change at any instant.

**Fix.** Gate the pre-condition guards to the idle phase; once a tx is in flight or done, render
purely from tx state:

```ts
const preFlight = s === "idle";
if (preFlight && chainId !== bscTestnet.id) {
  /* Wrong network */
} else if (preFlight && !isAuthenticated) {
  /* Sign in */
} else if (s === "failed") {
  /* ... */
} // tx-state branches win once not idle
```

---

## 4. `position: fixed` tooltip under `overflow-x-auto` — clipped AND stale

**Symptom.** The claim-ID tooltip either didn't appear at all, or floated over a different row.

**Root cause (two bugs).** (a) A table wrapped in `overflow-x-auto` **also clips vertically**
(per CSS, `overflow-x:auto` computes `overflow-y:auto`), so a normal absolutely-positioned bubble
is cut off. (b) A `position: fixed` bubble escapes the clip, but if its coords are captured once on
hover they go stale when a poll re-renders/reorders rows or the user scrolls.

**Fix.** Render the bubble `fixed` (escapes clipping) and re-measure the trigger each frame while
shown (follows scroll/resize/reorder), bailing the state update when unchanged:

```tsx
const open = pos !== null;
useEffect(() => {
  if (!open) return;
  let raf = 0;
  const tick = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r)
      setPos((p) => (p !== null && p.x === r.left && p.y === r.top ? p : { x: r.left, y: r.top }));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [open]);
```

**A11y companion.** The bubble isn't in the DOM until hover, so screen readers never saw it — add
an always-present `sr-only` copy referenced by `aria-describedby` and mark the visual bubble
`aria-hidden`. Modal dialogs likewise need a focus trap + initial focus + `aria-label`.

---

## 5. Loop-guard windows must exceed the fastest poll they guard

**Symptom.** A persistently-rejected token re-prompted SIWE every ~6s.

**Root cause.** The 401 → re-sign cooldown was 5s, but `useIssuedClaims` polls every 6s, so each
tick slipped past the guard. **The cooldown that collapses retry bursts must be ≥ the shortest
authed poll interval** (here widened to 30s).

---

## 6. A placeholder that satisfies validation defeats fail-closed env

`walletConnectProjectId: z.string().min(1)` with a `?? "PLACEHOLDER_…"` fallback always passes, so
a prod deploy that forgot the real id booted silently broken. Gate the placeholder to
non-production so the schema throws in prod:

```ts
walletConnectProjectId:
  orUndefined(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ??
  (process.env.NODE_ENV === "production" ? undefined : "PLACEHOLDER_REOWN_PROJECT_ID"),
```

**Related (Reown/AppKit):** the connection stack imports `bscTestnet` from
`@reown/appkit/networks` while signing paths use `@matura/chain/chains` — two chain objects that
must agree. Assert id equality at boot (widen to `number`, else the type-checker flags the always-
true literal comparison). AppKit also adds a heavy bundle: measured First Load JS was ~104 kB base
but 587–639 kB on wallet routes — acceptable for a testnet MVP; lazy-load if targeting prod perf.

---

## 7. Index the sort, not just the filter (and cap the payload)

An issuer-scoped read `findMany({ where:{issuer}, orderBy:[{blockNumber:'desc'},{logIndex:'desc'}] })`
was filtered by `@@index([issuer])` but **sorted in memory** (no covering index) and unbounded —
re-run on every 6s poll. Add the composite index and a cap:

```prisma
@@index([issuer, blockNumber, logIndex])   // mirror the existing beneficiary index
```

```ts
this.prisma.claimProjection.findMany({ where: { issuer }, orderBy: [...], take: MAX_ISSUED_CLAIMS });
```

Hand-write the migration when you can't run `prisma migrate dev` (no DB) — match Prisma's default
index name `ClaimProjection_issuer_blockNumber_logIndex_idx` — then `prisma migrate deploy` applies it.

---

## 8. Finish your extractions (shared visuals / guards)

Two "abstraction created but original left behind" smells: the Get-Liquidity dialog kept byte-identical
copies of the step visuals after they were extracted into `ui/flow-visuals.tsx`; and the manifest
target allowlist (a security-relevant guard) was duplicated across both issuer dialogs. Collapse to
one source (`StepBar/StatusPane/…` import; `lib/chain/allowed-targets.ts` with
`manifestAllowedTargets`/`assertAllowedTarget`/`UNEXPECTED_TARGET_MESSAGE`). Duplicated guards drift.

---

## Prevention checklist

- [ ] A modal's dismiss-lock covers only genuinely-pending phases, never post-receipt ones.
- [ ] Any poll that "gives up" must transition UI state, or the UI will hang on it.
- [ ] Tx retry re-sends the **same** identity (frozen outside the submit closure) and reconciles
      with chain/projection state (coded 409s, `readContract` re-read) before reporting failure.
- [ ] Persistently-mounted dialogs reset all state explicitly on close (identity, phase, slow-flags).
- [ ] Pre-condition guards (network/auth) don't pre-empt an in-flight tx — gate them to idle.
- [ ] Any retry/debounce cooldown window ≥ the fastest poll it collaborates with.
- [ ] `fixed`-position overlays inside `overflow` ancestors re-measure while shown; add
      `aria-describedby`/`sr-only` for AT and focus-trap modals.
- [ ] Env placeholders never satisfy fail-closed validation in production.
- [ ] Prisma reads are backed by a sort-covering index and bounded with `take`.
- [ ] When you extract shared UI/guards, migrate the original too.
