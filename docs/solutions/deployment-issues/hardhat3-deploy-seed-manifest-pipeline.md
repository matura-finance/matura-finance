---
title: "Hardhat 3 deploy/seed manifest pipeline gotchas (event-scan block, node .js→.ts script imports, noUncheckedIndexedAccess + viem)"
category: deployment-issues
tags:
  [
    hardhat3,
    ignition,
    viem,
    deployment,
    manifest,
    event-scan,
    getlogs,
    roles,
    node24,
    esm,
    module-resolution,
    noUncheckedIndexedAccess,
    idempotency,
  ]
module: "@matura/contracts, @matura/chain"
symptom: "verify's RoleGranted enumeration returns 0 holders (fails) only on a SECOND deploy/seed run; a plain-`node` codegen script throws ERR_MODULE_NOT_FOUND for a dependency's internal `.ts`; enabling noUncheckedIndexedAccess makes viem `getWalletClients()` destructuring `| undefined` inside closures."
root_cause: "deploymentBlock was recorded AFTER deploy (too-high `fromBlock`) and its '0' zero-seed placeholder collided with a legitimate genesis-block deploy; a `.js`→`.ts` resolve hook remapped a dependency's own `.js` imports too; control-flow narrowing of destructured consts does not reach nested closures."
date: 2026-09-26
---

# Hardhat 3 deploy/seed manifest pipeline gotchas

Three non-obvious problems hit while building the `@matura/contracts` deploy → seed → verify
pipeline (Hardhat 3 Ignition + viem, manifest codegen'd into `@matura/chain`). Each produced a
confusing symptom far from its cause; each has a small, principled fix. See also the companion
toolchain doc: `docs/solutions/build-errors/hardhat3-viem-node24-toolchain.md`.

---

## 1. Role-event enumeration silently misses grants — the event-scan lower bound

**Symptom.** `verify` enumerates role holders via `getEvents.RoleGranted({role}, {fromBlock})` and
asserts `holders == {router}` etc. It PASSES on a fresh chain but FAILS ("0 holders", "not exactly
one admin") **only on a second `demo:local` run against the same running node**, and leaves the
manifest with a permanently-wrong `deploymentBlock` until reset.

**Two root causes, both about the `fromBlock` used to scan events:**

1. **Recording the block AFTER deploy.** The manifest's `deploymentBlock` (used as the event-scan
   `fromBlock`) was snapshotted with `getBlockNumber()` _after_ `ignition.deploy(...)` completed —
   i.e. the LAST block. But `RoleGranted` events were emitted in EARLIER blocks during deployment,
   so scanning `fromBlock = lastBlock` misses them all. **Fix:** snapshot the block _before_
   deploying and use that as the lower bound (events land in the blocks that follow):

   ```ts
   const preDeployBlock = await publicClient.getBlockNumber(); // BEFORE ignition.deploy
   const d = await ignition.deploy(MaturaProtocol, { deploymentId });
   // …manifest.deploymentBlock = preDeployBlock.toString()
   ```

2. **An overloaded `"0"` sentinel.** Idempotent re-runs must PRESERVE the original `deploymentBlock`
   (addresses are stable), so the code kept the prior value "if it isn't the zero-seed placeholder":
   `prior.deploymentBlock !== "0" ? prior… : preDeployBlock`. But on a **fresh local `hardhat node`,
   genesis = block 0**, so a legitimate first deploy records `"0"` — indistinguishable from the
   zero-seed placeholder. A second run then takes the else branch and **re-snapshots the current
   tip** (say block 30), pushing `fromBlock` past the grant events → enumeration finds nothing.
   **Fix:** key "already recorded" on **deployed-ness (addresses non-zero)**, never on the block
   sentinel:
   ```ts
   const deploymentBlock =
     prior !== undefined && prior.addresses.mockUsdt !== ZERO_ADDRESS
       ? prior.deploymentBlock // preserve across idempotent re-runs
       : preDeployBlock.toString();
   ```

**Why it hid.** BSC-Testnet block numbers are large/non-zero, so neither bug triggers there — it is
chain-31337-only, and only on the _second_ run. A fresh single run is green, which masks it.

**Prevention.**

- An event-scan `fromBlock` must be **≤ the block of the first event you need**. For deploy-time
  events, snapshot **before** the deploy.
- **Never overload a sentinel value that is also a valid datum.** "not deployed" is a property of
  the address book, not of the block number. Test idempotency by running the one-command flow
  **twice against the same node** (a single run won't catch it).

---

## 2. A plain-`node` TS codegen script that imports the repo's `.js`-specifier'd ESM source

**Context.** `@matura/chain` ships raw TS with NodeNext `.js` import specifiers that actually point
at `.ts` sources (repo convention). A codegen script (`gen-deployments.ts`) run via bare
`node scripts/gen-deployments.ts` (Node 24 type-stripping, no `tsx`) needs to `import` the Zod
schema from `../src/manifest.ts` → which imports `./addresses.js`. Plain `node` does NOT remap
`.js` → `.ts`, so a static import fails `ERR_MODULE_NOT_FOUND`.

**Working approach — a minimal in-process resolve hook**, then a dynamic import:

```ts
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(
      "export async function resolve(spec, ctx, next) {" +
        "  const fromDep = ctx.parentURL && ctx.parentURL.includes('/node_modules/');" +
        "  if (!fromDep && (spec.startsWith('./') || spec.startsWith('../')) && spec.endsWith('.js')) {" +
        "    return next(spec.slice(0, -3) + '.ts', ctx);" + // remap OUR src imports
        "  }" +
        "  return next(spec, ctx);" +
        "}",
    ),
  import.meta.url,
);
const { DeploymentManifest } = await import("../src/manifest.ts");
```

Also needs `tsconfig.json`: `"allowImportingTsExtensions": true` + `scripts` in `include`.

**The subtle bug (cost a debug cycle).** An _unconditional_ `.js`→`.ts` remap ALSO rewrites a
dependency's own internal imports — e.g. zod's `index.js` imports `./v4/classic/external.js`, which
became `external.ts` (nonexistent) → `ERR_MODULE_NOT_FOUND` deep in `node_modules`. The **`fromDep`
guard (skip when `ctx.parentURL` is under `node_modules`)** is essential.

> An earlier version wrapped the remap in `try { … } catch { /* fall through */ }`, which "worked"
> by silently falling back to the real `.js` — but that swallowed genuinely-broken imports of our
> own code. Scope the remap to non-`node_modules` importers and let it THROW; don't swallow.

**Prevention.** Prefer a maintained TS runner where dependencies allow; if hand-rolling a loader
hook, always scope remaps to your own package (`ctx.parentURL`) and never blanket-catch resolution
errors.

---

## 3. `noUncheckedIndexedAccess` + viem `getWalletClients()` destructuring

**Symptom.** Turning on `noUncheckedIndexedAccess` (to match the repo's shared strict base) makes
`const [admin, issuer] = await viem.getWalletClients()` yield `WalletClient | undefined` elements —
~200 `TS18048` errors across existing tests, and crucially the narrowing you add doesn't reach
**nested closures** (fixtures' `createEligibleClaim` / `signRoute` still see `| undefined`).

**Root cause.** A control-flow guard narrows a destructured `const` in straight-line code, but a
closure captures the variable's **declared** type, so the narrowing is lost inside it.

**Fix — assign narrowed values to fresh consts** (their _declared_ type is then non-`undefined`, so
closures capture that):

```ts
const [w0, w1, w2] = await viem.getWalletClients();
if (w0 === undefined || w1 === undefined || w2 === undefined) {
  throw new Error("Expected at least 3 wallet clients from the test network.");
}
const admin = w0;
const issuer = w1;
const user = w2; // declared type WalletClient → safe in closures
```

**Related widening.** `arr.map(...)` returns `T[]`, so `PREMIUM[CLAIM_TYPE.PAYROLL]` is `T | undefined`
even indexed by a literal. Build a fixed tuple instead (`[a, b, c] as const`) so literal indices stay
defined. And `allocs[0]` after `assert.equal(allocs.length, 1)` is still `| undefined` — narrow with
`const [x] = allocs; assert.ok(x);`.

**Prevention.** No `!` non-null assertions (repo rule). Fix at the boundary (destructure → guard →
fresh consts / tuples) so narrowing propagates. When a package can't extend the shared tsconfig
(here `@matura/contracts` must stay self-contained), copy the strict flag directly rather than
leaving new code written _as if_ the flag were on.

---

## Cross-references

- Companion: `docs/solutions/build-errors/hardhat3-viem-node24-toolchain.md`
- Design/rationale: `docs/plans/2026-09-25-feat-deployment-seed-system-plan.md`
- Code: `packages/contracts/scripts/{deploy,verify}.ts`, `packages/chain/scripts/gen-deployments.ts`,
  `packages/contracts/test/helpers/fixtures.ts`
