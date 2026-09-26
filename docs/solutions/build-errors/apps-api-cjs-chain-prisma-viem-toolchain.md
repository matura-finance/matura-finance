---
title: "apps/api toolchain gotchas: consuming @matura/chain (CJS↔ESM), prisma-client types, strict viem"
category: build-errors
tags: [nestjs, commonjs, tsup, viem, prisma, prisma-client, typescript, strictTypeChecked, noUncheckedIndexedAccess, zod, esm, node16, migrations]
module: "apps/api, @matura/chain"
symptom: "apps/api (NestJS CommonJS) can't import @matura/chain ('Cannot find module' or raw-ESM .ts); Prisma model types resolve to '…Omit' not the row type; viem block/quote reads fail strict lint; z.coerce.boolean('false') is true; prisma migrate dev needs a DB that isn't running."
root_cause: "@matura/chain shipped raw ESM .ts with no build; node10 moduleResolution ignores package.json exports; the prisma-client generator exports row types from client.ts (not the models barrel); strictTypeChecked + noUncheckedIndexedAccess change how viem's inferred types must be consumed; z.coerce.boolean is Boolean(str)."
date: 2026-09-26
---

# apps/api toolchain gotchas (NestJS CJS + @matura/chain + Prisma + strict viem)

Standing up `apps/api` (NestJS 11, **CommonJS + Jest**) against the `@matura/chain` /
`@matura/shared` / viem / Prisma stack surfaced six non-obvious integration traps. Each cost
real time; each has a one-line fix. Sibling to
`docs/solutions/build-errors/hardhat3-viem-node24-toolchain.md` (run everything under Node 24).

## 1. A CommonJS app can't consume raw-ESM `@matura/chain` — give chain a tsup build, import via the barrel

**Symptom:** `tsc` in `apps/api` reports `Cannot find module '@matura/chain'` / `'viem'`, or at
runtime the raw `.ts` sources can't be required.

**Root cause (two layers):**
1. `@matura/chain` shipped **raw `.ts` ESM** (`exports` pointed at `./src/*.ts`, `noEmit`), which
   only bundler/loader runtimes (Next.js, `tsx`) can consume. A `nest build` (tsc → CommonJS) app
   cannot. `@matura/shared` already solved this with a **tsup dual CJS/ESM+types build** — mirror it.
2. `apps/api`'s tsconfig extends the NestJS base which uses `moduleResolution: "Node"` (**node10**).
   **node10 does not read the package.json `exports` map** — only `main`/`types`. So even with a
   built chain, subpath imports like `@matura/chain/contracts` fail `tsc`.

**Fix:**
- Add a multi-entry tsup build to `@matura/chain` (mirror `packages/shared/tsup.config.ts`):
  `format: ["esm","cjs"]`, `dts: true`, `outExtension` `.mjs`/`.cjs`, one `entry` per public subpath;
  set `main`/`module`/`types` + conditional `exports` per subpath.
- **Re-export the symbols `apps/api` needs from the barrel `src/index.ts`** (e.g. `contractAbis`,
  `vaultAbi`, EIP-712 helpers) and **import only from `@matura/chain`** (the `.` export, which
  node10 resolves via `main`/`types`). Avoid `@matura/chain/<subpath>` from `apps/api`.
- Add `viem` as a **direct** dependency of `apps/api` (a transitive dep via `@matura/chain` is not
  importable under pnpm's strict `node_modules`).
- `as const` ABI literals survive tsup's `dts` (contracts `.d.ts` stays ~120 KB), so viem inference
  (incl. `decodeFunctionData` struct typing) works across the package boundary. If the dts step ever
  OOMs/widens on the large tuples, fall back to `tsc --emitDeclarationOnly`.

## 2. `prisma-client` generator: import row types from `client.ts`, not the models barrel

**Symptom:** `import type { ClaimProjection } from "../generated/prisma/models"` →
`has no exported member named 'ClaimProjection'. Did you mean 'ClaimProjectionOmit'?`

**Root cause:** the new `prisma-client` generator (not `prisma-client-js`) exports the model **row**
types from `generated/prisma/client.ts` (`export type ClaimProjection = Prisma.ClaimProjectionModel`).
The `models` barrel only re-exports the `…Model`/`…Omit` helper types.

**Fix:** import row types (and `Prisma`) from the generated **`client`** entry:

```ts
import type { ClaimProjection, Prisma } from "../generated/prisma/client";
type PrismaTx = Prisma.TransactionClient; // for interactive $transaction callbacks (no `any`)
```

Also set the generator `moduleFormat = "cjs"` to match `apps/api` (esm output uses `import.meta.url`).
The `PrismaService` imports `PrismaClient` from `../generated/prisma/client`.

## 3. strict viem: block/quote reads and read-through under `noUncheckedIndexedAccess`

- **`getBlock({ blockTag: "finalized" })` types `number`/`hash` as NON-null** (only `pending`
  yields null). A defensive `if (raw.hash === null)` trips `@typescript-eslint/no-unnecessary-condition`.
  Don't guard it. (Guard the *args*: `Block.number` for arbitrary tags may be null.)
- **Multi-output view fns return a positional tuple** even when the outputs are named
  (`quoteAndCheck` → `readonly [boolean, bigint, bigint]`). Destructure `const [ok, adv, disc] = …`
  (fixed-length tuple destructure is undefined-safe under the flag). `getMandate` (single struct) →
  named object.
- **Read-through must distinguish a contract revert from a transport error.** A catch-all
  `catch { return null }` masks an RPC blip as a 404. Use viem's error walk:

  ```ts
  import { BaseError, ContractFunctionRevertedError, ContractFunctionZeroDataError } from "viem";
  function isNotFoundRevert(e: unknown): boolean {
    return e instanceof BaseError &&
      e.walk((x) => x instanceof ContractFunctionRevertedError || x instanceof ContractFunctionZeroDataError) !== null;
  }
  // getClaim(): catch (e) { if (isNotFoundRevert(e)) return null; throw e; }
  ```
- **BigInt never reaches `res.json`.** Prisma `BigInt` columns (`blockNumber`, cursor) are JS
  `bigint` → `TypeError: Do not know how to serialize a BigInt`. Map every row through a DTO with
  `.toString()`; never return raw Prisma rows. Keep `typedData.domain.chainId` a plain `number`
  (`claimRegistryDomain(chainId: number, …)`) so the `z.unknown()` typed-data escape hatch can't
  smuggle a bigint into JSON.

## 4. `z.stringbool()` for env booleans — `z.coerce.boolean()` is fail-OPEN

**Symptom:** `DEMO_ISSUER_SIGNING_ENABLED=false` *enables* the flag.

**Root cause:** `z.coerce.boolean()` is `Boolean(value)`, and `Boolean("false") === true`. On a
security-sensitive flag this fails open.

**Fix:** `z.stringbool()` (Zod 4), or `z.enum(["true","false"]).transform(v => v === "true")`.

## 5. Author Prisma migrations WITHOUT a running dev DB (no shadow DB)

**Symptom:** `prisma migrate dev` wants a database + shadow DB you don't have locally.

**Fix:** diff the live/committed state to the schema and hand-place the SQL:

```bash
# from an already-migrated DB (or --from-migrations) to the edited schema:
prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script \
  > prisma/migrations/<n>_<name>/migration.sql
printf 'provider = "postgresql"\n' > prisma/migrations/migration_lock.toml   # once
prisma migrate deploy    # applies + records; the reproducible CI/prod path
```

`prisma generate` needs **no** DB. Commit `prisma/migrations/**` + `migration_lock.toml`; never
`db push` for the tracked DB.

## 6. Reorg full-wipe must reset the cursor atomically (and hold the lock)

When an indexer reacts to a block-hash mismatch by wiping projections and reindexing from the
deployment block, the **cursor reset must be in the same transaction as the projection deletes**
(and take the same `pg_advisory_xact_lock`). Otherwise `finalizedThrough` (read from the cursor)
advertises a stale-high block over an empty dataset during the rebuild, and a second instance can
interleave. Extract one `resetProjections(tx, chainId)` reused by the reorg path and the reindex CLI.
Also: a `RouteLegExecuted` whose parent claim was skipped (unknown enum ordinal) will FK-abort the
whole batch and wedge the indexer forever at the same block — guard the leg with a `findUnique` and
skip, don't let the FK throw.

## Prevention checklist (new NestJS-CJS package consuming the chain/prisma stack)

- [ ] Shared workspace pkg consumed by a CJS app → tsup dual build; app imports the barrel `.`; add `viem` as a direct dep.
- [ ] Prisma row types from `generated/prisma/client`; `Prisma.TransactionClient` for tx callbacks; `moduleFormat` matches the app.
- [ ] No BigInt in responses — map through DTOs; env booleans use `z.stringbool()`.
- [ ] Migrations authored via `migrate diff` when no dev DB; commit `migrations/**` + lock; run everything under Node 24.
