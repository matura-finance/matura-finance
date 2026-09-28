---
title: "Codegen a typed fixture from @matura/contracts into @matura/shared (boundary + toolchain gotchas)"
category: build-errors
tags:
  [
    codegen,
    freshness-gate,
    zod,
    as-const-satisfies,
    nodenext,
    type-stripping,
    package-boundary,
    monorepo,
    noUncheckedIndexedAccess,
  ]
module: "packages/contracts, packages/shared, CI"
symptom: "Adding a generated `.ts` const (derived from contracts config) into another package trips tsc/import/boundary errors; the CI freshness gate flaps or can't run."
root_cause: "The @matura codegen pattern has non-obvious constraints: `as const satisfies` vs Zod array variance, contracts' tsconfig lacks `allowImportingTsExtensions`, the generator can't import the target package's schema (dep boundary), and NodeNext dislikes runtime JSON."
---

# Codegen a typed fixture from `@matura/contracts` into `@matura/shared`

## Problem

We needed a **single-source-of-truth demo fixture** — the judge-facing scenario numbers (claims,
Request A/B, vault mandates) — derived from `packages/contracts/config/demo.ts` and consumed by a
`@matura/shared` test (and, potentially, apps). This is the same shape as the repo's existing
generators (`export-abis`, `gen-deployments`), but adding a new one surfaced several toolchain and
package-boundary gotchas that each produce a confusing build/CI failure.

Use this pattern (and avoid these traps) any time you generate a typed artifact from one package into
another and guard it with a CI freshness gate.

## The working pattern (what to copy)

1. **Generator lives in the source package** (`packages/contracts/scripts/export-demo-fixture.ts`),
   imports only in-package config, and **writes a typed `.ts` const by relative fs path** into the
   consumer's `src/` — exactly like `gen-deployments.ts` writes `deployments.generated.ts`:

   ```ts
   const body =
     `// AUTO-GENERATED … do not edit by hand.\n` +
     `import type { DemoFixture } from "./demo.js";\n\n` +
     `export const DEMO_FIXTURE = ${JSON.stringify(fixture, null, 2)} as const satisfies DemoFixture;\n`;
   writeFileSync(outFile, body);
   ```

2. **Consumer package holds only the Zod schema + types** (`demo.ts`); the generated const carries the
   data. A test `.parse()`s it (runtime) and the `as const satisfies` checks it (compile time).

3. **CI freshness gate** mirrors the ABI/manifest gates exactly (in `.github/workflows/ci.yml`):

   ```yaml
   - name: Demo fixture is fresh
     run: |
       pnpm --filter @matura/contracts contracts:export-demo-fixture
       git diff --exit-code packages/shared/src/fixtures/demo.generated.ts
   ```

## The six gotchas (each = a specific failure)

### 1. `as const satisfies Schema` fails on arrays unless the Zod schema uses `.readonly()`

`as const` makes the generated object **deeply readonly** (readonly tuples). `z.array(...)` infers a
**mutable** `T[]`, and a `readonly T[]` is NOT assignable to `T[]` — so `satisfies` errors on every
array field. Fix: add `.readonly()` to every array in the schema so `z.infer` is `readonly T[]`.

```ts
claims: z.array(DemoClaim).min(1).readonly(),   // not z.array(DemoClaim).min(1)
```

(Object-property readonly-ness does NOT block `satisfies` — only array readonly-ness does. `gen-deployments`
never hit this because its manifest has no arrays.)

### 2. Contracts' tsconfig lacks `allowImportingTsExtensions` — use `.js` specifiers, not `.ts`

`gen-deployments.ts` (in `@matura/chain`) does `await import("../src/manifest.ts")` because **chain's
tsconfig sets `allowImportingTsExtensions: true`**. `@matura/contracts` does not, so a `.ts` dynamic
import fails `tsc` with `TS5097`. Use the repo's normal NodeNext convention: **`.js` specifiers** that
tsc resolves to the `.ts` source, and the copied resolve hook remaps `.js`→`.ts` at bare-`node` runtime:

```ts
const { ALICE_CLAIMS, REQUEST_A, REQUEST_B } = await import("../config/demo.js"); // not demo.ts
```

### 3. The generator must NOT import the consumer package (dep boundary)

`@matura/contracts` is self-contained (no `@matura/*` deps), so the generator **cannot import the
`DemoFixture` Zod schema** to validate at generation time (as `gen-deployments` does with its own
in-package schema). Validation is instead deferred to (a) the committed file's `as const satisfies`
(caught by the consumer's `tsc`) and (b) the consumer's Zod `.parse()` test (caught in CI) — both run
before the freshness gate. The generator's local TS interfaces are a hand-maintained mirror of the schema;
drift is caught downstream, never in the generator.

### 4. `noUncheckedIndexedAccess`: reverse-map with a total function, not a `Record` lookup

`const TYPE_NAME: Record<number, Name> = {…}; TYPE_NAME[ordinal]` yields `Name | undefined` under
`noUncheckedIndexedAccess`, which then won't satisfy a required enum field. Use a **total function that
throws** on an unknown ordinal so the result type is never `undefined`:

```ts
function typeName(ordinal: number): "PAYROLL" | "FREELANCE_ESCROW" | "STREAM" {
  switch (ordinal) { case CLAIM_TYPE.PAYROLL: return "PAYROLL"; /* … */ default: throw new Error(...); }
}
```

### 5. Emit a `.ts` const, not runtime-imported JSON

The repo never imports JSON at runtime. `@matura/shared` ships a **dual CJS/ESM tsup build** consumed by
CJS `apps/api`; a runtime `import x from "./f.json"` under NodeNext needs an import attribute and adds
dts-introspection risk. Emitting `export const … as const satisfies …` (like `deployments.generated.ts`)
gives compile-time validation, zero runtime parse, and no interop friction. Keep the artifact **off the
package's root barrel / tsup entry** if only a test consumes it, so it never ships in `dist`.

### 6. Generator hygiene for a stable diff gate

- Run it with **bare `node`** (not `hardhat run`) and plain `writeFileSync` (not atomic-write), so the CI
  gate runs **chain-less** — mirror `gen-deployments`, not the live-chain writers.
- **Add the generated file to `.prettierignore`** (next to `deployments.generated.ts`) or a format pass
  reflows it and `git diff --exit-code` flaps.
- Emit deterministic key order (`JSON.stringify(obj, null, 2)` over an insertion-ordered object).

## Bonus: local `31337.json` is ephemeral — never commit it

The committed `packages/chain/src/deployments/31337.json` is a **zero manifest** by design. `demo:local`
overwrites it with local deterministic addresses; **revert it** (`git checkout -- …/31337.json
…/deployments.generated.ts`) before committing or diffing, or you'll commit local addresses and, if you
resume-deploy after reverting, corrupt `deploymentBlock` (breaks `verify.ts`'s role-event enumeration
which reads events `fromBlock = deploymentBlock`). For a clean local re-validate: kill the node → wipe →
fresh node → `demo:local` → `smoke:local` → revert the manifest.

## Prevention checklist

- [ ] Schema arrays are `.readonly()` (so `as const satisfies` compiles).
- [ ] Generator dynamic-imports use `.js` specifiers + the `.js`→`.ts` resolve hook (contracts has no
      `allowImportingTsExtensions`).
- [ ] Generator does NOT import the consumer package; reverse-maps via a total throwing function.
- [ ] Output is a typed `.ts` const, added to `.prettierignore`, kept off the barrel unless a runtime
      consumer needs it.
- [ ] CI gate = bare-node regenerate + `git diff --exit-code`, placed with the other freshness gates.
- [ ] Revert ephemeral local `31337.json` before committing.

## Cross-references

- Precedent generators: `packages/chain/scripts/gen-deployments.ts`, `packages/contracts/scripts/export-abis.ts`
- This pipeline: `packages/contracts/scripts/export-demo-fixture.ts`, `packages/shared/src/fixtures/demo.ts`,
  `packages/shared/src/fixtures/__tests__/demo-fixture.test.ts`, CI gate in `.github/workflows/ci.yml`
- Related toolchain doc: `docs/solutions/build-errors/apps-api-cjs-chain-prisma-viem-toolchain.md`
  (CJS↔ESM chain consumption, dual tsup build)
- PR #11 (`chore: judge & 3-minute demo readiness`); plan `docs/plans/2026-09-28-chore-judge-demo-readiness-plan.md`
