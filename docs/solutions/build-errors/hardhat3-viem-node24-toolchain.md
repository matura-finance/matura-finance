---
title: "Hardhat 3 + viem contracts toolchain gotchas (Node 24, typecheck, ABI gate)"
category: build-errors
tags: [hardhat3, viem, node24, typescript, tsc, node-test, abis, turbo, ci]
module: "@matura/contracts, @matura/chain"
symptom: "Contract commands fail on the wrong Node; tsc reports 'Object is of type unknown'; the ABI-freshness CI gate always fails."
root_cause: "HH3 needs an even LTS Node; viem contract types come from generated artifact .d.ts that tsconfig didn't include; prettier reformats generated ABIs so the committed copy never matches a fresh export."
date: 2026-09-25
---

# Hardhat 3 + viem contracts toolchain gotchas

Four non-obvious things that bite when building/typechecking/CI-gating the
`@matura/contracts` (Hardhat 3 + viem + `node:test`) package and its ABI export
into `@matura/chain`. Each cost real time; each has a one-line fix.

## 1. Run contracts under Node 24 even when the machine runs Node 26

**Symptom:** `hardhat compile`/`test` behaves oddly or the engines check complains;
the dev machine's default `node` is 26 but the repo pins `<25`.

**Root cause:** Hardhat 3 requires an **even LTS** Node (22.13+/24). The repo pins
Node 24 (`.nvmrc`, engines `>=22.13 <25`). Node 24 is installed **keg-only** via
Homebrew, so it is NOT on the default PATH.

**Fix:** prefix every contracts command with the keg-only Node 24 bin:

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"   # v24.x
pnpm --filter @matura/contracts contracts:compile
```

`nvm use` also works if nvm is installed. Verify with `node -v` before running.

## 2. `network.connect()` is deprecated in HH 3.18 → use `network.create()`

**Symptom:** a deprecation warning at the end of `contracts:test`.

**Fix:** in test/fixtures use `const { viem, networkHelpers, ignition } = await network.create()`.
Both return the same `{ viem, networkHelpers, ignition, ... }`; `create()` always
spins a fresh in-process EDR sim (correct for isolated unit tests).

## 3. Typechecking the package: viem returns `unknown` without the artifact `.d.ts`

**Symptom:** `tsc --noEmit` reports dozens of `error TS2571: Object is of type 'unknown'`
/ `TS18046` on `contract.read.getClaim()` results, even though the tests pass at
runtime (the `node:test` runner **type-strips**, it does not type-check).

**Root cause:** viem's typed contract instances (`viem.deployContract("ClaimRegistry")`)
get their types from Hardhat's **generated** `artifacts/**/*.d.ts` module
augmentation. The self-contained `tsconfig.json` did not `include` them, so every
`.read/.write` degraded to `unknown`.

**Fix:** include the generated declarations and compile before typechecking:

```jsonc
// packages/contracts/tsconfig.json — include
[
  "hardhat.config.ts",
  "config/**/*.ts",
  "test/**/*.ts",
  "scripts/**/*.ts",
  "ignition/**/*.ts",
  "artifacts/**/*.d.ts",
]
```

```jsonc
// packages/contracts/package.json — script (compile first so the .d.ts exist)
"typecheck": "hardhat compile && tsc --noEmit"
```

Adding this typecheck to CI immediately **caught a real bug**: after packing the
`Mandate` struct (`uint32 maxDurationDays`), viem typed the field as `number` but
the fixtures still passed `180n` (bigint) — a `TS2322` the runtime had silently
coerced.

## 4. Generated ABIs + prettier make the ABI-freshness CI gate always fail

**Symptom:** the CI step that regenerates ABIs and runs `git diff --exit-code
packages/chain/src/abis` fails on a clean tree — the only diff is `name:` vs
`"name":` (unquoted vs quoted keys).

**Root cause:** the `export-abis` script emits raw `JSON.stringify(...) as const`
(quoted keys), but the lefthook `format` (prettier) step reformats the committed
files (unquoted keys). Committed ≠ freshly-generated, forever.

**Fix:** exclude the generated ABIs from prettier so committed == generated:

```
# .prettierignore
packages/chain/src/abis
```

Then the freshness gate is meaningful:

```yaml
- name: Contracts ABI export is fresh
  run: |
    pnpm --filter @matura/contracts contracts:export-abis
    git diff --exit-code packages/chain/src/abis
```

Note: `@matura/chain` is JIT raw-TS (no build step), so ABIs are **committed** as
`as const` `.ts`, generated from `packages/contracts/artifacts` by
`scripts/export-abis.ts` — never hand-copied, never read from `artifacts/` at runtime.

## Prevention

- Keep `typecheck` wired into `turbo run typecheck` for contracts so type
  regressions (like #3's `bigint`/`number` mismatch) fail CI, not production.
- Any struct-packing / field-narrowing change: re-run `contracts:typecheck` — viem
  maps `uint8/16/32` → `number` and `uint64+`/`uint256` → `bigint`, so narrowing a
  stored field can silently change the TS type a fixture must supply.
- After any event/error/struct change, regenerate ABIs (`contracts:export-abis`)
  and commit them; the CI gate enforces freshness.

## Cross-references

- `docs/architecture.md` — contracts ↔ chain ↔ api seams, ABI/enum single-source.
- `docs/deployment-runbook.md` (local-only) — deploy flow using Node 24.
- `docs/decisions.md` — why Node 24 / Hardhat 3 / viem.
- `CLAUDE.md` — the Node 24 rule + contracts commands, at a glance.
