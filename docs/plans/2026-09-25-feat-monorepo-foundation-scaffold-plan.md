---
title: Matura Monorepo Foundation Scaffold
type: feat
date: 2026-09-25
brainstorm: docs/brainstorms/2026-09-25-monorepo-foundation-brainstorm.md
status: ready-for-work
---

# ✨ Matura Monorepo Foundation Scaffold

## Enhancement Summary

**Deepened:** 2026-09-25 · **Reviewers:** architecture-strategist, code-simplicity, kieran-typescript, security-sentinel, data-integrity-guardian (5 parallel specialists).

### Key improvements applied

1. **Correctness fix (arch P1-1):** `@matura/shared` is **built** (tsup → dual CJS+ESM + `.d.ts`), not JIT raw-TS — the CommonJS `apps/api` consumes it at runtime and cannot `require()` an ESM `.ts` file. `ui`/`chain` stay JIT (only bundler apps consume them).
2. **Parallel-safety fix (arch P1-2):** **no git worktrees** for this scaffold; `pnpm-workspace.yaml` + catalog are **frozen in Wave 0** (agents route new catalog entries back to the Wave-0 owner); a single `pnpm install` runs at each wave boundary.
3. **Security hardening** (new [section](#security-hardening-foundation)): `.gitignore` committed first & verified, gitleaks pre-commit + CI, lint-enforced secret boundary in Next apps, first-class `ISSUER_PRIVATE_KEY` handling, `main.ts` helmet/CORS/throttler/body-limit, `.strict()` request schemas, sanitizing exception filter.
4. **Data-integrity schema refinements** (updated [Prisma schema](#prisma-schema)): `blockNumber`+`logIndex` on all projections, natural-key `@@unique` on legs, explicit `@relation`/`onDelete`, lexicographic-ordering caveat for String money, uint256 upper bound, composite indexes, single transactional persistence gateway.
5. **Naming unified** to `@matura/*` for **all** packages (config packages included).
6. **Forward-looking edges documented** (new [section](#forward-looking-architecture-edges)): the coming `api → chain` edge, the typed-ABI export mechanism, canonical address source, EIP-712 home, CI stub.

### Conflicts flagged — brief overrides simplicity review

The simplicity reviewer (working from the README, not the full brief) recommended cutting the Prisma projection entities, the composite Zod schemas, `/api/v1` versioning, Swagger, and the two docs. **These are explicit brief deliverables and are KEPT.** Non-conflicting simplifications were applied: trivial health endpoint (Terminus now optional), minimal/deferrable Playwright, and tests concentrated on pure functions. (The `library.json` tsconfig variant is **kept** — the TS review requires it to carry `verbatimModuleSyntax` for NodeNext packages, which can't live in `base.json`.)

---

## Overview

Stand up the complete, empty-but-wired foundation for the Matura MVP: a pnpm 10 +
Turborepo monorepo with three apps (`landing`, `app`, `api`), three domain
packages (`contracts`, `shared`, `chain`), and three tooling packages (`ui`,
`typescript-config`, `eslint-config`). **Interfaces and boundaries only** — no
business contracts, no routing/settlement logic, no polished UI. Success = every
root check passes and every app renders its placeholder routes.

This plan is **structured for parallel execution**: after a blocking foundation
wave, work splits into independent workstreams with explicit dependency edges
(see [Parallelization](#parallelization)). Each workstream lists exact files,
reference config, and its own tests.

**Directives baked in:** strict TypeScript with `@typescript-eslint/no-explicit-any: "error"`
repo-wide (no `any`), parallelizable workstreams, and tests per package.

---

## ⛔ Prerequisite (blocker) — Node version

The dev machine runs **Node 25.6.0**. **Hardhat 3 does not support Node 25** (it
requires an even LTS ≥ 22.13.0; Node 25 triggers a warning and ESM
`package.json#exports` resolution failures). Next.js/NestJS also officially target
even LTS lines.

**Action before any install:**

```bash
nvm install 24 && nvm use 24   # Node 24 Active LTS — recommended
node -v                        # must print v24.x (≥ 22.13 acceptable)
```

The repo pins this via `.nvmrc` (`24`) and `engines` (`>=22.13 <25`). `pnpm` stays
at the installed 10.29.2 (fine; pin `packageManager` accordingly).

---

## Architecture & Boundaries

```mermaid
flowchart TD
  subgraph apps
    L["apps/landing<br/>(matura.xyz)"]
    A["apps/app<br/>(app.matura.xyz)"]
    API["apps/api<br/>(NestJS + Prisma)"]
  end
  subgraph packages
    UI["packages/ui<br/>tokens + primitives"]
    SH["packages/shared<br/>Zod schemas + types"]
    CH["packages/chain<br/>viem chain + helpers"]
    C["packages/contracts<br/>Hardhat 3 / Solidity"]
    TSC["packages/typescript-config"]
    ESL["packages/eslint-config"]
  end

  L --> UI
  A --> UI
  A --> CH
  A --> SH
  API --> SH
  C -. "exports ABIs (later, generated)" .-> CH

  TSC -. extended by .-> L & A & API & UI & SH & CH
  ESL -. extended by .-> L & A & API & UI & SH & CH
```

**Hard boundary rules (enforced, from the brief):**

- `packages/shared` must NOT import NestJS, Next.js, Prisma, or Hardhat — pure TS + Zod only.
- `apps/landing` must NOT depend on `packages/chain` or any wallet library.
- No generated ABI is hand-copied — `packages/chain` is the only consumer of `packages/contracts` artifacts (wired in a later prompt; foundation ships an **empty deployment manifest**).
- Addresses: lowercase for DB lookup, checksum/preserve at display boundaries.
- Base-unit amounts cross APIs as **decimal strings**; dates as **ISO 8601**; contracts use **Unix seconds**.
- Cross-domain links use `NEXT_PUBLIC_LANDING_URL` / `NEXT_PUBLIC_APP_URL`, never hardcoded localhost.
- No private keys in bundles, logs, committed files, or API responses.

---

## Toolchain versions (verified 2026-09-25)

| Area              | Package(s)                           | Version                                      | Notes                                                                        |
| ----------------- | ------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------- |
| Runtime           | Node                                 | **24 LTS** (≥22.13)                          | Node 25 breaks Hardhat 3                                                     |
| PM                | pnpm                                 | 10.29.2 (`packageManager: pnpm@10.29.2`)     | catalogs + `onlyBuiltDependencies`                                           |
| Monorepo          | turbo                                | `^2.5.9`                                     | `tasks` schema (not `pipeline`)                                              |
| TS (apps/pkgs)    | typescript                           | `^5.9.3` (catalog)                           | —                                                                            |
| TS (contracts)    | typescript                           | `~5.8.3`                                     | HH3 targets 5.8; **not** TS 7                                                |
| Lint              | eslint / typescript-eslint           | `^9.39` / `^8.46`                            | flat config; `strictTypeChecked` + `projectService` (real no-`any`)          |
| Build (shared)    | tsup                                 | `^8`                                         | dual CJS+ESM+`.d.ts` for `@matura/shared` (API is CJS runtime)               |
| Secret scan       | gitleaks + lefthook                  | latest                                       | pre-commit `gitleaks protect --staged` + CI                                  |
| API hardening     | helmet, @nestjs/throttler            | `^8` / `^6`                                  | headers, rate limit, CORS allowlist, body limit                              |
| Format            | prettier                             | `^3.6`                                       | —                                                                            |
| Validation        | zod                                  | `^4.1` (catalog)                             | shared foundation for env + DTOs                                             |
| Web               | next / react / react-dom             | `^15` / `19.2.x` (catalog)                   | App Router, RSC                                                              |
| Styling           | tailwindcss / @tailwindcss/postcss   | `^4.3`                                       | CSS-first `@theme`; `tw-animate-css`                                         |
| UI kit            | shadcn/ui                            | latest CLI                                   | new-york, lucide, OKLCH, `data-slot`                                         |
| Fonts             | geist + next/font (Manrope)          | latest                                       | CSS vars into `@theme`                                                       |
| Wallet            | wagmi / viem / @tanstack/react-query | `^2` / `2.56.8` (no caret) / `^5`            | app only                                                                     |
| API               | @nestjs/*                            | core `^11.1.6`, config `^4`, swagger `^11.2` | CommonJS + Jest; `@nestjs/terminus` **optional** (trivial health by default) |
| API validation    | nestjs-zod                           | `^5.5`                                       | Zod DTOs + OpenAPI from Zod                                                  |
| ORM               | prisma / @prisma/client              | `^6.19`                                      | **`prisma-client`** generator (not `-js`)                                    |
| Tests (pkgs)      | vitest                               | `^3`                                         | shared, chain, ui                                                            |
| Tests (api)       | jest / ts-jest                       | `^30` / `^29`                                | Nest default                                                                 |
| Tests (contracts) | node:test + hardhat-viem-assertions  | via toolbox                                  | —                                                                            |
| E2E               | @playwright/test                     | `^1`                                         | landing + app route smoke                                                    |

> **viem is pinned exact (`2.56.8`, no caret)** via the pnpm catalog — viem does
> not semver its TS types, and it must match across `contracts`, `chain`, and `app`.

---

## Key Decisions

1. **Hand-authored minimal Next apps** (not `create-next-app`). Deterministic file
   sets are parallel-agent-friendly and avoid interactive prompts / boilerplate
   noise. shadcn primitives are produced by writing the exact files `shadcn init`
   would generate (no interactive CLI needed).
2. **`nestjs-zod` for API validation** over class-validator — keeps a single Zod
   foundation shared with `packages/shared` (env validation + request DTOs +
   OpenAPI all from Zod). Aligns with the brief's "shared = Zod" boundary.
3. **Prisma `prisma-client` generator** with `output = ../src/generated/prisma` —
   the `prisma-client-js` generator is deprecated and breaks under pnpm; the new
   generator removes all monorepo workarounds. Generated dir is git-ignored and
   regenerated on `postinstall`/CI.
4. **Build `@matura/shared` (tsup → CJS+ESM+`.d.ts`); keep `ui` JIT** (raw `.ts`
   via `exports`). **Rationale (corrected after review):** the CommonJS `apps/api`
   consumes `shared` at runtime and cannot `require()` a raw ESM `.ts` file — JIT
   would compile but crash at runtime. `ui` is consumed only by Next bundlers (add
   `transpilePackages: ["@matura/ui"]` to each `next.config.ts`). `chain` stays JIT
   for the foundation (app-only consumer) but **must switch to a build when the
   `api → chain` edge lands** (see [Forward-looking edges](#forward-looking-architecture-edges)).
   Turbo owns build ordering via `^build`; no TS project references.
5. **Monetary values as `String` base-units** in Prisma and as decimal strings
   across APIs — exact on-chain match, zero float risk.
6. **CommonJS for `apps/api`** (Jest/ts-jest/decorators "just work"); **ESM for
   `packages/contracts`** (Hardhat 3 is ESM-only). Rest are bundler-resolved.
7. **pnpm catalogs** for shared versions (react, zod, typescript, viem, wagmi) so
   versions can't drift across packages. **Frozen in Wave 0** — parallel agents
   never edit the catalog; new entries route through the Wave-0 owner (avoids
   lockfile/catalog merge races).
8. **No-`any` is enforced by type-aware linting, not just `no-explicit-any`**
   (review correction). `@typescript-eslint/no-explicit-any` bans only the keyword;
   leaked/implicit `any` (`JSON.parse`, untyped `.json()`, `catch`) slips through.
   The shared ESLint config extends `tseslint.configs.strictTypeChecked` (bundles
   all `no-unsafe-*`) + `no-non-null-assertion`, with `parserOptions.projectService:
true` (fast per-package type info). See [TS strictness addendum](#addendum-a--typescript-strictness--no-any-enforcement).
9. **All packages under one scope `@matura/*`** — including config packages
   (`@matura/typescript-config`, `@matura/eslint-config`). One on-brand scope.

---

## Parallelization

```mermaid
flowchart LR
  W0["Wave 0 — Foundation<br/>(BLOCKING)<br/>root config + tsconfig-pkg + eslint-pkg + install"]
  subgraph W1["Wave 1 — leaf packages (parallel ×4)"]
    W1a["A: packages/shared"]
    W1b["B: packages/chain"]
    W1c["C: packages/ui"]
    W1d["D: packages/contracts"]
  end
  subgraph W2["Wave 2 — apps (parallel ×3)"]
    W2a["E: apps/api"]
    W2b["F: apps/app"]
    W2c["G: apps/landing"]
  end
  W3["Wave 3 — docs + full verification (BLOCKING)"]

  W0 --> W1a & W1b & W1c & W1d
  W1a --> W2a & W2b
  W1b --> W2b
  W1c --> W2b & W2c
  W1a --> W2a
  W1 --> W3
  W2 --> W3
```

- **Wave 0** is sequential and must complete first (everything extends the config packages).
- **Wave 1** — 4 fully independent workstreams (A/B/C/D). No cross-edges.
- **Wave 2** — 3 workstreams: `api` needs `shared`; `app` needs `ui`+`chain`+`shared`; `landing` needs `ui` only.
- **Wave 3** — integration + verification, run once everything lands.

Recommended agent assignment: one agent per workstream letter, dispatched per wave. **Do NOT use git worktrees** — each gets its own `node_modules` + `pnpm-lock.yaml`, and reconciling divergent lockfiles across 4–7 worktrees is worse than the race it avoids. Instead: each agent authors **only its own `package.json` + source** (never the root `pnpm-workspace.yaml` or catalog — frozen in Wave 0), and a **single owner runs one `pnpm install` at each wave boundary**. New catalog entries route back to the Wave-0 owner (see [Risks](#risks)).

---

## Wave 0 — Foundation (blocking)

> **Order matters (security):** commit **`.gitignore` FIRST**, before any `pnpm install`,
> `.env`, or keystore can exist — a slipped order risks committing a real key.
> Verify with `git check-ignore -v apps/api/.env`. See [Security hardening](#security-hardening-foundation).

**Files:**

- `.gitignore` **(commit first)**
- `pnpm-workspace.yaml`
- `package.json` (root)
- `turbo.json`
- `.npmrc`
- `.nvmrc`
- `.prettierrc` + `.prettierignore`
- `.env.example`
- `lefthook.yml` + `.gitleaks.toml` (pre-commit secret scan)
- `.github/workflows/ci.yml` (stub: runs Wave-3 root verification on 24 LTS)
- `packages/typescript-config/{package.json,base.json,library.json,nextjs.json,nestjs.json}` (scope `@matura/*`)
- `packages/eslint-config/{package.json,base.js,next.js,react-internal.js}` (scope `@matura/*`)

**`pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"

onlyBuiltDependencies:
  - esbuild
  - "@prisma/client"
  - prisma
  - "@nomicfoundation/edr"
  - sharp

catalog:
  react: 19.2.0
  react-dom: 19.2.0
  typescript: ^5.9.3
  zod: ^4.1.12
  viem: 2.56.8 # exact — no caret
  wagmi: ^2.14.0
  "@tanstack/react-query": ^5.62.0
```

**`.npmrc`**

```
# Hardhat 3 (ESM) + pnpm: hoist the toolchain so plugin exports resolve
public-hoist-pattern[]=*hardhat*
public-hoist-pattern[]=*nomicfoundation*
engine-strict=true
```

> Escalate to `node-linker=hoisted` only if HH3 plugin resolution still fails.

**`turbo.json`** — `tasks` schema with all required scripts:

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"]
    },
    "dev": { "cache": false, "persistent": true },
    "lint": { "dependsOn": ["^lint"] },
    "typecheck": { "dependsOn": ["^build", "^typecheck"], "outputs": ["*.tsbuildinfo"] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] },
    "test:e2e": { "dependsOn": ["build"], "cache": false },
    "db:generate": { "cache": false },
    "db:migrate": { "cache": false },
    "contracts:compile": {
      "inputs": ["contracts/**", "hardhat.config.*"],
      "outputs": ["artifacts/**", "cache/**", "types/**"]
    },
    "contracts:test": { "dependsOn": ["contracts:compile"] }
  }
}
```

> **Env vars (security M5):** declare each needed var explicitly in `turbo.json`
> `globalEnv`/`env` (all `NEXT_PUBLIC_*`, `NODE_ENV`, `DATABASE_URL`, etc.) rather
> than globbing `.env*` into `inputs` — globbing hashes secret file contents into
> the cache key. **Do not enable Turbo remote caching** until the input/output
> surface is reviewed (local cache only for the MVP).

**Root `package.json`** scripts delegate to turbo (`dev`, `build`, `lint`,
`typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `contracts:compile`,
`contracts:test`, plus `format`); `packageManager: "pnpm@10.29.2"`; `engines`
`{ "node": ">=22.13 <25", "pnpm": ">=10" }`; devDeps `turbo`, `prettier`,
`typescript: catalog:`.

**`@matura/typescript-config`** — `base.json` is strict + the full flag set:
`strict`, `noUncheckedIndexedAccess`, `isolatedModules`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`,
`exactOptionalPropertyTypes`. **`verbatimModuleSyntax` is NOT in `base.json`** (so
`nestjs.json` can extend base safely). Variants: `library.json` (extends base;
NodeNext + `verbatimModuleSyntax: true` — for `shared`/`chain`); `nextjs.json`
(extends base; `moduleResolution: Bundler`, `jsx: preserve`, `plugins:[{name:"next"}]`,
`verbatimModuleSyntax: true`); `nestjs.json` (extends base; `module: commonjs`,
`emitDecoratorMetadata`, `experimentalDecorators`, **`verbatimModuleSyntax: false`** —
it elides `import type` symbols from `design:paramtypes`, silently breaking Nest DI).
See [Addendum A](#addendum-a--typescript-strictness--no-any-enforcement).

**`@matura/eslint-config`** — ESLint 9 flat config; `base.js` composes `@eslint/js`
recommended + **`tseslint.configs.strictTypeChecked`** + `stylisticTypeChecked` +
`eslint-config-prettier`, with `parserOptions.projectService: true` (fast typed
linting — required to actually catch implicit/leaked `any`, not just the keyword),
plus `no-non-null-assertion: "error"` and turbo's `no-undeclared-env-vars`.
`next.js` and `react-internal.js` extend base. **Do NOT include `eslint-plugin-only-warn`**
(it would downgrade the `no-any` errors to warnings).

**`.env.example`** — see [Environment](#environment).

**Then:**

```bash
nvm use 24
pnpm install     # writes pnpm-lock.yaml (COMMIT IT)
```

**Wave 0 acceptance:** `.gitignore` committed first & verified (`git check-ignore -v apps/api/.env`);
`pnpm install` succeeds; `pnpm-lock.yaml` committed; `gitleaks detect` clean;
`pnpm turbo run lint --filter=@matura/eslint-config` is no-op-clean.

---

## Wave 1 — Leaf packages (parallel ×4)

### Workstream A — `packages/shared`

Pure TS + Zod. Depends on: Wave 0 only.

**Files:**

- `package.json` (`name: @matura/shared`, `type: module`, **`tsup` build** →
  `exports: { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.mjs", "require": "./dist/index.cjs" } }`;
  `build`/`dev`/`typecheck`/`test`/`lint` scripts; deps `zod: catalog:`)
- `tsconfig.json` (extends `@matura/typescript-config/library.json`), `tsup.config.ts`
- `eslint.config.js`, `vitest.config.ts`
- `src/index.ts` (barrel — **split `export` values vs `export type`**; `isolatedModules` requires it)
- `src/enums.ts` — `ClaimType`, `ClaimState` **Zod enums** (`z.infer` unions; NOT TS `enum`/`const enum` — broken under isolatedModules). Single ordered source of truth for the enum ⇄ Prisma ⇄ Solidity parity test.
- `src/money.ts` — `BaseUnitAmount` = `z.string().regex(/^\d+$/).refine(≤ MAX_UINT256).brand<"BaseUnitAmount">()` + length cap before `BigInt()`; `makeBaseUnitAmount()` helper
- `src/address.ts` — **two distinct brands**: `EvmAddress` (validated, case-preserved, EIP-55 checksum-checked) and `NormalizedAddress` (lowercased DB key); `toNormalized()` + `toViemAddress()` adapters (viem `Address` is `` `0x${string}` `` — not brand-assignable, convert explicitly)
- `src/ids.ts` — `ClaimId` = bytes32 brand (`/^0x[0-9a-fA-F]{64}$/`)
- `src/issuer.ts` `Issuer` · `src/claim.ts` `Claim` · `src/vault.ts` `VaultSummary` · `src/quote.ts` `Quote` · `src/route.ts` `RouteLeg`,`ExecutionRoute` · `src/settlement.ts` `SettlementReceipt`
- `src/errors.ts` — API error envelope (`ApiError`, `ApiErrorResponse`)
- `src/__tests__/schemas.test.ts`, `src/__tests__/money.test.ts`, `src/__tests__/address.test.ts` — **tests**

**Schema notes:** every inferred type via `z.infer` (no `any`, no duplicate
interfaces). Branded value-types (`BaseUnitAmount`, `EvmAddress`, `NormalizedAddress`,
`ClaimId`) with `.brand()` **last**; ship `make*` constructors so tests never reach
for `as` (casting reintroduces `any`-adjacent unsafety). `ClaimState` = `ATTESTED |
ELIGIBLE | PARTIALLY_FUNDED | FUNDED | MATURED | PAID | DELAYED | DISPUTED |
DEFAULTED | REJECTED | REVOKED` (onchain). **State-coupled invariants via `z.refine`:**
`FUNDED ⇒ financedFaceValue == faceValue`; `PARTIALLY_FUNDED ⇒ 0 < financedFaceValue
< faceValue`; `financedFaceValue <= faceValue`. Dates ISO-8601 (`z.string().datetime()`);
request DTO schemas use `.strict()` (reject unknown keys).

**Why `shared` is built (not JIT):** the CommonJS `apps/api` `require()`s it at
runtime — raw ESM `.ts` would crash. tsup emits CJS+ESM+`.d.ts`.

**Tests (`vitest`):** valid+invalid parse for `Claim`/`Quote`/`ExecutionRoute`/
`SettlementReceipt`; `BaseUnitAmount` rejects floats/negatives/`> uint256`;
`EvmAddress` rejects bad length + validates checksum; `toNormalized` lowercases;
state-coupled refinements; `ApiError` shape.

**Acceptance:** `pnpm --filter @matura/shared build test typecheck lint` pass; no
import of nest/next/prisma/hardhat (ESLint `no-restricted-imports` guard).

### Workstream B — `packages/chain`

viem primitives. Depends on: Wave 0 only. **No dependency on `shared`.**

**Files:**

- `package.json` (`@matura/chain`, `type: module`, deps: `viem: catalog:`, `zod: catalog:`)
- `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`
- `src/index.ts`
- `src/chains.ts` — `bscTestnet` via viem `defineChain` (chainId 97, name, native BNB, RPC from env at call site)
- `src/addresses.ts` — `AddressBook` Zod schema (per-contract addresses) + `zeroAddresses` default
- `src/deployments.ts` — **empty deployment manifest** `{ [chainId]: AddressBook }` seeded with 97 → zero addresses. **Canonical source of truth for contract addresses** (populated from Ignition output post-deploy); env holds RPC/secrets only, never addresses (avoids two-sources drift).
- `src/clients.ts` — `createPublicClientFor(chainId, rpcUrl)` and `createWalletClientFor(...)` viem factories (accept RPC/account as params — never read private keys internally)
- `src/units.ts` — `toBaseUnits(human: string, decimals=6): bigint`, `fromBaseUnits(base: bigint|string, decimals=6): string`, `SETTLEMENT_DECIMALS = 6`
- `src/__tests__/units.test.ts` — **tests** (highest-value pure-logic tests in the plan)

**Unit-helper notes:** 6-decimal safe conversion, string-based, no float. `toBaseUnits("1.5")
=== 1500000n`; round-trip stability; reject >6 dp; handle `"0"`. Uses viem's `Address`
(`` `0x${string}` ``) type; conversions to/from `@matura/shared`'s branded
`EvmAddress`/`NormalizedAddress` go through the explicit adapters in `shared` (not `as`).

**Build:** JIT for the foundation (app-only consumer). **Switch to a tsup build the
moment `api → chain` lands** (indexer/EIP-712 signing) — the CJS API can't `require`
raw `.ts`. Future homes: `src/eip712.ts` (canonical viem typed-data) and
`@matura/contracts/abis` binding (see [Forward-looking edges](#forward-looking-architecture-edges)).

**Tests (`vitest`):** `toBaseUnits`/`fromBaseUnits` round-trips at 6dp, boundary
(0, large uint256), rejects excess precision; `AddressBook` schema parse;
`bscTestnet.id === 97`.

**Acceptance:** `pnpm --filter @matura/chain test typecheck lint` pass.

### Workstream C — `packages/ui`

Design tokens + low-level primitives. Depends on: Wave 0. `react`/`react-dom`/`tailwindcss`
as **peerDependencies** (not bundled — avoids duplicate Tailwind/React).

**Files:**

- `package.json` (`@matura/ui`, `type: module`, `exports`: `./globals.css`, `./components/*`, `./lib/*`; peers: react, react-dom, tailwindcss)
- `tsconfig.json`, `eslint.config.js`
- `components.json` (shadcn base, new-york, lucide, `css: src/styles/globals.css`)
- `src/styles/globals.css` — **single source of truth**: `@import "tailwindcss"; @import "tw-animate-css";` + brand `@theme` + shadcn `@theme inline` + `@custom-variant dark`
- `src/lib/utils.ts` — `cn()` (clsx + tailwind-merge)
- `src/components/button.tsx` — shadcn Button (React 19, `data-slot`, no `forwardRef`)
- `src/components/badge.tsx` — Badge
- `src/components/container.tsx`, `src/components/stack.tsx` — layout primitives
- `src/components/__tests__/button.test.tsx` — **tests** (vitest + @testing-library/react + jsdom)

**Brand `@theme` block** (from research):

```css
@theme {
  --color-midnight: #111827;
  --color-liquid-mint: #42e8b4;
  --color-mist: #f4f7f6;
  --color-deep-night: #080d17;
  --font-heading: var(--font-manrope), ui-sans-serif, system-ui, sans-serif;
  --font-ui: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --radius-card: 0.75rem;
  --radius-pill: 9999px;
  --spacing-gutter: 1.25rem;
  --spacing-section: 4rem;
}
```

**Tests (`vitest`):** Button renders children, variant classes apply, `cn()` merges

- dedupes conflicting utilities.

**Acceptance:** `pnpm --filter @matura/ui test typecheck lint` pass.

### Workstream D — `packages/contracts`

Hardhat 3, ESM. Depends on: Wave 0 only. **Self-contained** (own tsconfig ~5.8.3).

**Setup:** run `npx hardhat --init --template node-test-runner-viem` inside the
package, then **delete the samples** (`contracts/Counter.sol`, `contracts/Counter.t.sol`,
`test/Counter.ts`, `ignition/modules/Counter.ts`, `scripts/send-op-tx.ts`).

**Files (final):**

- `package.json` (`@matura/contracts`, `"type":"module"`, devDeps per version table, `@openzeppelin/contracts@5.6.1`, `typescript@~5.8.3`, `viem: catalog:`)
- `hardhat.config.ts` — ESM `defineConfig`; solidity 0.8.28 + optimizer; `hardhat` network `type: "edr-simulated"`; `bscTestnet` `type:"http"` chainId 97 reading `configVariable("BSC_TESTNET_RPC_URL")` + `configVariable("DEPLOYER_PRIVATE_KEY")` — **never hardcoded**
- `tsconfig.json` (from init)
- `contracts/.gitkeep` (empty — real contracts land in a later prompt)
- `test/.gitkeep`
- Scripts: `contracts:compile` → `hardhat compile`; `contracts:test` → `hardhat test`

**`hardhat.config.ts`** (reference):

```typescript
import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: { type: "edr-simulated", chainType: "l1" },
    bscTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 97,
      url: configVariable("BSC_TESTNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
});
```

**Tests:** none yet (no contracts). `hardhat compile` succeeds with empty
`contracts/`; `hardhat test` passes with 0 suites. A sample viem/`node:test` file
will be added alongside the first real contract in a later prompt.

**Acceptance:** with Node 24, `pnpm --filter @matura/contracts run contracts:compile`
succeeds; `contracts:test` exits 0.

---

## Wave 2 — Apps (parallel ×3)

### Workstream E — `apps/api` (NestJS + Prisma)

Depends on: `@matura/shared` (env + domain Zod schemas). CommonJS + Jest.

**Files:**

- `package.json` (`@matura/api`, deps per version table; `@matura/shared: workspace:*`; + `helmet`, `@nestjs/throttler`)
- `tsconfig.json` (extends `@matura/typescript-config/nestjs.json`), `tsconfig.build.json`
- `nest-cli.json`, `eslint.config.js`, `jest.config.ts`
- `prisma/schema.prisma` — see [Prisma schema](#prisma-schema)
- `.env` (git-ignored; **holds the ONLY secrets** — `DATABASE_URL`, `ISSUER_PRIVATE_KEY`; never fed to Next processes)
- `src/main.ts` — bootstrap: `setGlobalPrefix('api')`, URI versioning default `1`, **global `ZodValidationPipe` via `APP_PIPE` provider** (DI-correct), `helmet()`, **CORS allowlist** from env (`app.matura.xyz`/`matura.xyz` + localhost in dev, never `*`), `express.json({ limit: '100kb' })`, global throttler, **sanitizing exception filter** (maps to `ApiError`, logs detail server-side only, never serializes Prisma `error.meta`/env), Swagger at `/docs` (via `cleanupOpenApiDoc`) only when `NODE_ENV !== 'production'` (fail-closed on missing `NODE_ENV`)
- `src/app.module.ts` — `ConfigModule.forRoot({ isGlobal, validate })`, `ThrottlerModule`, `PrismaModule`, `HealthModule`
- `src/config/env.validation.ts` — Zod env schema + `validateEnv`; typed access via `ConfigService<z.infer<typeof EnvSchema>, true>` (no `any`); `ISSUER_PRIVATE_KEY` validated `/^0x[0-9a-fA-F]{64}$/`
- `src/common/{http-exception.filter.ts,api-error.ts}` — sanitizing filter → shared `ApiError`
- `src/prisma/{prisma.module.ts,prisma.service.ts}` — `PrismaService extends PrismaClient` (from `../generated/prisma`), connect/disconnect; no `query`-level logging in prod; ban `$queryRawUnsafe`/`$executeRawUnsafe` via ESLint `no-restricted-syntax`
- `src/health/{health.module.ts,health.controller.ts}` — **trivial thin controller** returning `{ status: 'ok' }` (Terminus/`PrismaHealthIndicator` optional — deferred to reduce a dep; add DB ping when a real readiness gate is needed). Must not echo config.
- `src/health/health.controller.spec.ts` — **unit test**
- `test/health.e2e-spec.ts` + `test/jest-e2e.json` — **e2e test**

**Env validation** uses `nestjs-zod` + Zod (`z.coerce.number` for PORT,
`z.string().url()` for `DATABASE_URL`, enum `NODE_ENV`). Request DTOs =
`class X extends createZodDto(Schema)` (branded `z.infer` flows into controllers,
fully typed, no `any`); typed responses via `@ZodResponse`. Note: `ZodValidationPipe`
does NOT replicate class-validator `whitelist` — unknown-key rejection comes from
`.strict()` on the shared request schemas.

**Tests:**

- Unit: `HealthController.check()` returns `{ status: 'ok' }`.
- e2e: `GET /api/v1/health` → 200 `{ status: 'ok' }` (test module; no real DB needed for the trivial handler).

**Acceptance:** `pnpm --filter @matura/api build typecheck lint` pass; `prisma
validate` + `prisma generate` succeed; `pnpm --filter @matura/api test` passes;
`GET /api/v1/health` responds; `/docs` served in dev only.

### Workstream F — `apps/app` (product, app.matura.xyz)

Depends on: `@matura/ui`, `@matura/chain`, `@matura/shared`. Wallet infra lives **only here**.

**Files:**

- `package.json` (next `^15`, react/react-dom `catalog:`, wagmi/viem/`@tanstack/react-query` `catalog:`, `@matura/ui|chain|shared: workspace:*`, geist, tailwindcss + @tailwindcss/postcss)
- `tsconfig.json` (extends `nextjs.json`), `next.config.ts` (**`transpilePackages: ["@matura/ui"]`** — required for the JIT UI package), `postcss.config.mjs`, `eslint.config.js`, `components.json`, `playwright.config.ts`
- `src/app/globals.css` — `@import "@matura/ui/globals.css"; @source "../../node_modules/@matura/ui/src";`
- `src/app/layout.tsx` — root layout: Manrope (`next/font/google`) + Geist (`geist/font/sans`) CSS vars on `<html>`; wagmi SSR hydration via `cookieToInitialState` → `<Providers>`
- `src/app/providers.tsx` — `'use client'`; `WagmiProvider` + `QueryClientProvider` (config from `src/lib/wagmi.ts`)
- `src/lib/wagmi.ts` — `createConfig({ chains:[bscTestnet from @matura/chain], ssr:true, storage: createStorage({storage: cookieStorage}), transports })`
- `src/components/app-nav.tsx` — nav across the 5 routes using `NEXT_PUBLIC_*` links
- Routes (typed placeholders + responsive shell): `src/app/account/page.tsx`, `request/page.tsx`, `activity/page.tsx`, `issuer/page.tsx`, `vaults/page.tsx`
- `e2e/routes.spec.ts` — **Playwright smoke** for all 5 routes

**Notes:** wallet/network infra confined to this app. Placeholder pages import
primitives from `@matura/ui`. Cross-links to landing use `NEXT_PUBLIC_LANDING_URL`.

**Secret boundary (lint-enforced):** `no-restricted-properties`/`no-restricted-syntax`
forbidding `process.env.DEPLOYER_PRIVATE_KEY`, `process.env.ISSUER_PRIVATE_KEY`,
`process.env.DATABASE_URL`, `process.env.BSC_TESTNET_RPC_URL` anywhere in the app.
Only `NEXT_PUBLIC_*` reach the browser; a keyed RPC must never be `NEXT_PUBLIC_*`
(keep a keyless public RPC for the browser, or proxy keyed RPC via `apps/api`).

**Tests (Playwright, `test:e2e`):** each of `/account /request /activity /issuer
/vaults` loads with 200 + no console errors + expected heading. `webServer` in
`playwright.config.ts` runs `next build && next start`. **Note:** `next build` already
fails on a broken route/import/type error, so it is the primary render check;
Playwright here is a thin confirming smoke and may be deferred if a wave runs long
(the root `test:e2e` script still exists per the brief).

**Acceptance:** `pnpm --filter @matura/app build typecheck lint` pass; all 5 routes
render without runtime errors; wallet provider mounts.

### Workstream G — `apps/landing` (marketing, matura.xyz)

Depends on: `@matura/ui` **only**. Statically optimizable. **No `@matura/chain`, no wallet libs.**

**Files:**

- `package.json` (next `^15`, react/react-dom `catalog:`, `@matura/ui: workspace:*`, geist, tailwind) — **no wagmi/viem/chain**
- `tsconfig.json`, `next.config.ts` (**`transpilePackages: ["@matura/ui"]`**), `postcss.config.mjs`, `eslint.config.js`, `components.json`, `playwright.config.ts`
- `src/app/globals.css` — imports `@matura/ui/globals.css` + `@source`
- `src/app/layout.tsx` — fonts + brand shell (no providers)
- `src/components/site-nav.tsx` — nav; CTA to `NEXT_PUBLIC_APP_URL`
- Routes: `src/app/page.tsx` (`/`), `how-it-works/page.tsx`, `protocol/page.tsx`, `for-issuers/page.tsx`, `docs/page.tsx`, `privacy/page.tsx`
- `e2e/routes.spec.ts` — **Playwright smoke** for all 6 routes (thin; `next build` is the primary check)

**Guard:** ESLint `no-restricted-imports` forbidding `wagmi`, `viem`,
`@matura/chain`, **and `@tanstack/react-query`** (the wallet stack pulls it in) in
this app, plus the same secret-env `no-restricted-properties` guard as `apps/app`.
Enforces the "no wallet, no secrets" boundary at lint time.

**Tests (Playwright, `test:e2e`):** all 6 routes load, no console errors,
statically rendered (no client wallet bundle).

**Acceptance:** `pnpm --filter @matura/landing build typecheck lint` pass; all 6
routes render; bundle contains no wallet libs.

---

## Wave 3 — Docs + full verification (blocking)

**Files:**

- `docs/architecture.md` — monorepo boundaries + the Mermaid component diagram above; boundary rules; per-package responsibilities.
- `docs/decisions.md` — short ADR-style rationale for **BSC Testnet, Hardhat 3, NestJS, viem, PostgreSQL** for a 7-day MVP (see [Decisions to record](#decisions-to-record)).
- Update root `README.md` "Development" section with real setup steps (nvm use 24 → pnpm install → per-app dev).

**Full verification (run from repo root, Node 24):**

```bash
node -v                      # v24.x
pnpm install                 # lockfile stable
pnpm build                   # all packages/apps
pnpm lint                    # 0 errors (no-any enforced)
pnpm typecheck               # 0 errors
pnpm contracts:compile       # HH3 compile OK
pnpm contracts:test          # exits 0
pnpm --filter @matura/api exec prisma validate
pnpm --filter @matura/api exec prisma generate
pnpm test                    # vitest + jest green
pnpm test:e2e                # playwright route smokes (needs build)
```

---

## Prisma schema

`apps/api/prisma/schema.prisma` — `prisma-client` generator, PostgreSQL, String
money (base units), lowercase addresses, indexes on `beneficiary`, `issuer`,
`state`, `dueAt`, and execution relations.

> **These are event-log PROJECTIONS.** For an idempotent, reorg-safe indexer (added
> later, but the columns must exist now — adding them later is a migration), every
> projected row carries `blockNumber` + `logIndex`, and rows have natural chain keys
> so replays upsert instead of duplicating. The refinements below (blockNumber/logIndex
> everywhere, leg natural key, FK `onDelete`) come from the data-integrity review.

```mermaid
erDiagram
  UserWallet {
    string id PK
    string address UK
    datetime createdAt
    datetime updatedAt
  }
  IssuerProjection {
    string id PK
    string chainIssuerId UK "chainId:address"
    string address
    string signer
    string name
    boolean active
    bigint lastSyncedBlock
  }
  ClaimProjection {
    string claimId PK
    string beneficiary "idx"
    string issuer "idx"
    ClaimType claimType
    string token
    string faceValue "base-units string"
    string financedFaceValue "base-units string"
    datetime dueAt "idx"
    ClaimState state "idx"
    string txHash
    bigint blockNumber
    int logIndex
    datetime createdAt
    datetime updatedAt
  }
  RouteExecution {
    string executionId PK
    string user "idx"
    string targetAdvance
    string totalAdvance
    string totalFaceAssigned
    string totalCost
    RouteStatus status
    string txHash
    bigint blockNumber
    int logIndex
    datetime createdAt
  }
  RouteLegProjection {
    string id PK
    string executionId FK
    string claimId FK
    string vault
    string faceAmount
    string advanceAmount
    string discountAmount
    bigint blockNumber
    int logIndex
  }
  ChainCursor {
    string consumerName "PK part"
    int chainId "PK part"
    bigint lastProcessedBlock
    string lastProcessedBlockHash
  }
  RouteExecution ||--o{ RouteLegProjection : has
  ClaimProjection ||--o{ RouteLegProjection : "referenced by"
```

**Schema-level integrity (declare in `schema.prisma`):**

- **Natural keys / idempotency:** `RouteLegProjection @@unique([executionId, claimId])`
  (upsert on replay, no duplicate legs); `@@unique([txHash, logIndex])` on
  `ClaimProjection` and `RouteExecution` for exactly-once event handling.
- **Relations + delete behavior (Prisma requires explicit; don't rely on defaults):**
  leg→execution `onDelete: Cascade`; leg→claim `onDelete: Restrict` (never orphan
  history). Postgres does **not** auto-index FK columns → add `@@index([executionId])`,
  `@@index([claimId])`.
- **Composite indexes for real access patterns:** `@@index([state, dueAt])`,
  `@@index([beneficiary, state])`, `@@index([issuer, state])`; `IssuerProjection
@@index([address])` (lowercase-lookup path).
- **`ChainCursor` PK `@@id([consumerName, chainId])`** (multi-chain-safe).
- **`RouteStatus` is an enum** (`PENDING | EXECUTED | FAILED`) for consistency with
  the claim enums (was a bare String).

**Constraints Prisma can't express → enforced in a single transactional persistence
gateway** that BOTH the API and the indexer call (controller-level `ZodValidationPipe`
only guards the HTTP path — the indexer bypasses it):

- Per-row: `financedFaceValue <= faceValue`; monetary strings `/^\d+$/` and `<= uint256`;
  state-coupled invariants (`FUNDED ⇒ financed == face`, etc.).
- Cross-row (inside ONE DB transaction): `totalFaceAssigned == Σ legs.faceAmount`,
  `totalAdvance == Σ legs.advanceAmount`, `totalCost == Σ legs.discountAmount`,
  per-leg `advanceAmount == faceAmount − discountAmount`; execution + its legs +
  `ChainCursor` advance commit atomically.
- **Monotonic funding state applies to the domain/API path only** — the reorg/
  re-projection path must overwrite freely (it replays canonical chain truth).
  Out-of-order projection: upsert a claim stub if a leg arrives before its claim.
- Addresses normalized to lowercase before persistence (EIP-55 checksum validated first).

> **String-money ordering caveat:** String columns sort **lexicographically**
> (`"9" > "10"`) — any SQL `ORDER BY`/range on a money column is silently wrong.
> Rule: no numeric SQL predicates on money columns; if a listing needs size sort,
> add an expression index `((("faceValue")::numeric))` and cast in the query.

`generator client { provider = "prisma-client"; output = "../src/generated/prisma" }`

- `datasource db { provider = "postgresql"; url = env("DATABASE_URL") }`. `ClaimType`
  and `ClaimState` enums declared in-schema. **Enum three-way sync:** `@matura/shared`
  is the single ordered source of truth (Solidity uint8 ⇄ Zod name ⇄ Prisma name); a
  unit test asserts the Prisma enum values === shared Zod enum values (Solidity ordinal
  parity added with the contracts). If the DB stores offchain `DRAFT` claims, the Prisma
  enum is a **superset** (offchain + onchain) — decide and document, don't rely on "mirrors".

---

## Environment

Root `.env.example` (mark server-only clearly). `NEXT_PUBLIC_*` are the ONLY
browser-exposed values.

```dotenv
# ── Server-only (NEVER exposed to the browser) ─────────────────
DATABASE_URL="postgresql://matura:matura@localhost:5432/matura?schema=public"
BSC_TESTNET_RPC_URL="https://data-seed-prebsc-1-s1.bnbchain.org:8545"
DEPLOYER_PRIVATE_KEY=""      # deploy account; use hardhat keystore in real runs
ISSUER_PRIVATE_KEY=""        # EIP-712 attestation signer; server/script only
API_URL="http://localhost:3000"

# ── Public (safe for browser bundles) ──────────────────────────
NEXT_PUBLIC_CHAIN_ID="97"
NEXT_PUBLIC_API_URL="http://localhost:3000/api/v1"
NEXT_PUBLIC_LANDING_URL="https://matura.xyz"
NEXT_PUBLIC_APP_URL="https://app.matura.xyz"

# Contract addresses (filled after deploy; empty ok for foundation)
NEXT_PUBLIC_MOCK_USDT_ADDRESS=""
NEXT_PUBLIC_ISSUER_REGISTRY_ADDRESS=""
NEXT_PUBLIC_CLAIM_REGISTRY_ADDRESS=""
NEXT_PUBLIC_ROUTER_ADDRESS=""
NEXT_PUBLIC_SETTLEMENT_MANAGER_ADDRESS=""
```

> `.gitignore` (committed FIRST) must exclude `.env`, `.env.*` (with `!.env.example`),
> `apps/*/.env*`, `apps/api/src/generated/`, `**/artifacts`, `**/cache`, `.turbo`,
> `node_modules`, `.next`, `dist`, `playwright-report`, `test-results`, and any
> project-local Hardhat keystore. Private keys never committed — prefer
> `hardhat keystore set`. Verify: `git check-ignore -v apps/api/.env`.

**Secret distribution rule:** `DEPLOYER_PRIVATE_KEY`/`ISSUER_PRIVATE_KEY`/`DATABASE_URL`
live ONLY in `apps/api/.env` and `packages/contracts` (or keystore). The Next apps get
a `.env` with **only `NEXT_PUBLIC_*`** (+ server-side `API_URL` if RSC needs it) — never
`dotenv -e ../../.env` a secret-laden file into a Next process. `ISSUER_PRIVATE_KEY`
(the EIP-712 attestation signer) is the most sensitive secret — treat it as top-tier
(keystore/CI secret store), validate its shape, and keep it out of every Next env schema.

---

## Addendum A — TypeScript strictness & no-`any` enforcement

The user's directive is **no `any` anywhere**. `no-explicit-any` bans only the keyword;
implicit/leaked `any` (`JSON.parse`, untyped `.json()`, `catch`, `any` from a dep) needs
**type-aware linting**.

**`@matura/eslint-config/base.js`:**

```js
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import turbo from "eslint-plugin-turbo";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked, // bundles all no-unsafe-* + no-explicit-any
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: { turbo },
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.config.*", "*.mjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error", // "!" is an any-adjacent escape hatch
      "turbo/no-undeclared-env-vars": "error",
    },
  },
  eslintConfigPrettier, // last
);
// NOTE: no eslint-plugin-only-warn — it would downgrade these errors to warnings.
```

**tsconfig flags — `base.json`** adds (beyond `strict` + `noUncheckedIndexedAccess`):
`isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`. **`verbatimModuleSyntax`
is NOT in base** — only in the NodeNext/Next variants; **forced `false` in `nestjs.json`**
(it elides `import type` symbols from `design:paramtypes`, silently breaking Nest DI).

**Branded types (`@matura/shared`):** `.brand()` last; `z.input` is not branded, so
provide `make*` constructors (thin `.parse` wrappers) — never `as`. Barrels split
`export { Schema }` (value) from `export type { T }` (type) — required under
`isolatedModules`. Keep `ClaimType`/`ClaimState` as Zod enums, not TS `enum`/`const enum`.

**nestjs-zod v5:** global pipe via `{ provide: APP_PIPE, useClass: ZodValidationPipe }`;
DTOs `class X extends createZodDto(Schema)`; typed config `ConfigService<Env, true>`;
`catch (e: unknown)`; Swagger via `cleanupOpenApiDoc(document)` + `@ZodResponse`.

---

## Security hardening (foundation)

From the security review — cheap now, expensive to retrofit:

1. **`.gitignore` first + verified** (above) and **secret distribution rule** (above).
2. **Secret scanning:** `lefthook` pre-commit running `gitleaks protect --staged`, plus
   `gitleaks detect` in CI. Backstop for the "key slips into git" threat model.
3. **Lint-enforced secret boundary** in `apps/app` + `apps/landing`: `no-restricted-properties`
   banning `process.env.{DEPLOYER,ISSUER}_PRIVATE_KEY`, `DATABASE_URL`, `BSC_TESTNET_RPC_URL`;
   `turbo/no-undeclared-env-vars` (every `NEXT_PUBLIC_*` declared in `turbo.json`).
4. **`apps/api` `main.ts`:** `helmet()`, **CORS allowlist from env** (not `*`), global
   `@nestjs/throttler`, `express.json({ limit: '100kb' })`, **sanitizing exception filter**
   (generic `ApiError` to client, full detail server-side only, never Prisma `error.meta`/env).
5. **Request schemas `.strict()`** (ZodValidationPipe lacks class-validator's `forbidNonWhitelisted`).
6. **Swagger fail-closed:** `NODE_ENV` a required enum; `/docs` only when `!== 'production'`.
7. **Ban raw SQL:** ESLint `no-restricted-syntax` on `$queryRawUnsafe`/`$executeRawUnsafe`;
   no `query`-level Prisma logging in prod.
8. **Turbo:** declare env vars explicitly (not `.env*` glob in inputs); **no remote cache**.
9. **Keyed RPC never `NEXT_PUBLIC_*`** — keyless public RPC for browser, or proxy via API.

---

## Forward-looking architecture edges

Not built in this foundation, but designed for now so later prompts don't hit boundary reworks:

- **`api → @matura/chain` edge is coming** — the event indexer (populates the projections)
  and EIP-712 attestation/quote signing both need viem server-side. Home: a NestJS module
  in `apps/api` (pragmatic 7-day choice). **When it lands, `chain` needs a tsup build** (CJS API).
- **Typed ABI export (no hand-copy):** post-`compile`, `packages/contracts` runs `abi:generate`
  (`@wagmi/cli` Hardhat plugin or a small extract script) emitting `export const xAbi = [...] as const`
  into a dedicated dir, exposed ONLY at subpath `@matura/contracts/abis` with **zero Hardhat
  runtime imports** (else `app → chain → contracts` pulls Hardhat into the bundle). `chain`
  imports that subpath, binds ABIs to `deployments.ts`. Add turbo edge `chain#typecheck
dependsOn contracts#contracts:compile` — at that point Wave-1 D→B independence ends; update the graph.
- **Canonical addresses:** `chain/src/deployments.ts` (from Ignition output), NOT env.
- **EIP-712 home:** `chain/src/eip712.ts` (canonical viem typed-data), mirrored in Solidity.
- **CI:** `.github/workflows/ci.yml` runs the Wave-3 root verification on Node 24 — cheapest
  guard against parallel-wave integration breaks.

---

## SpecFlow — gaps & edge cases (from research)

- **Node 25 blocker** (Hardhat 3) — covered by the prerequisite + `.nvmrc` + `engine-strict`.
- **pnpm 10 skips build scripts by default** → Prisma/esbuild/edr won't build. Covered by `onlyBuiltDependencies`.
- **Tailwind v4 monorepo scan** — shared UI renders unstyled unless each app's `globals.css` has `@source` pointing at `@matura/ui/src`. Covered per app.
- **ESLint `only-warn` trap** — would neuter `no-explicit-any: error`. Explicitly excluded.
- **Prisma generated dir** — must be git-ignored and regenerated (`postinstall` runs `db:generate`); import client from `src/generated/prisma`, not `@prisma/client` for model types.
- **Swagger + versioning** — mount UI at non-versioned `/docs`; use `ignoreGlobalPrefix` on `createDocument` (+ `cleanupOpenApiDoc`) to avoid `/api/v1` path duplication.
- **viem type drift** — pinned exact `2.56.8` via catalog across contracts/chain/app.
- **`reflect-metadata` import order** — first import in `main.ts` and Jest `setupFiles`.
- **`verbatimModuleSyntax` breaks Nest DI** — forced `false` in `nestjs.json` (see Addendum A).
- **`no-explicit-any` ≠ no-`any`** — needs `strictTypeChecked` + `projectService` (Addendum A).
- **`shared` JIT crash** — `apps/api` (CJS) can't `require` raw ESM `.ts`; `shared` is tsup-built.
- **JIT UI unstyled/uncompiled** — needs `transpilePackages: ["@matura/ui"]` + `@source` per app.
- **Landing/app boundaries** — enforced by `no-restricted-imports` (wagmi/viem/chain/react-query) + `no-restricted-properties` (secret env), not just convention.
- **Projection idempotency/reorg** — `blockNumber`+`logIndex` + natural keys on all projections; transactional persistence gateway (see Prisma schema).
- **Lockfile/catalog races in parallel install** — NO worktrees; agents edit only their own `package.json`; catalog frozen in Wave 0; single `pnpm install` per wave boundary (see Risks).

---

## Acceptance Criteria

### Functional

- [x] `pnpm install` succeeds; `pnpm-lock.yaml` committed.
- [x] `pnpm build`, `pnpm lint`, `pnpm typecheck` succeed from root (0 errors).
- [x] `apps/api` `GET /api/v1/health` runs; Swagger at `/docs` in non-prod only.
- [x] `apps/landing` renders `/ /how-it-works /protocol /for-issuers /docs /privacy`.
- [x] `apps/app` renders `/account /request /activity /issuer /vaults` without runtime errors.
- [x] `pnpm contracts:compile` succeeds (empty-but-valid HH3 setup); `contracts:test` exits 0.
- [x] `prisma validate` + `prisma generate` succeed.

### Non-functional / quality gates

- [x] No `any` anywhere — **type-aware** lint (`strictTypeChecked` + `projectService`, all `no-unsafe-*` + `no-non-null-assertion`) passes, not just `no-explicit-any`.
- [x] `@matura/shared` builds (tsup CJS+ESM+d.ts) and is `require`-able by the CJS API at runtime.
- [x] `@matura/shared` imports no nest/next/prisma/hardhat (lint-guarded).
- [x] `apps/landing` bundle contains no wallet libs (lint-guarded: wagmi/viem/chain/react-query) + verified.
- [x] Secret-env access lint-blocked in both Next apps; `.gitignore` committed first & verified; `gitleaks` clean (pre-commit + CI).
- [x] `apps/api` `main.ts` has helmet + CORS allowlist + throttler + body limit + sanitizing exception filter.
- [x] Prisma schema has `blockNumber`+`logIndex` on all projections, leg `@@unique`, explicit `@relation`/`onDelete`, composite indexes.
- [x] Enum parity test: Prisma `ClaimState`/`ClaimType` === `@matura/shared` Zod enums.
- [x] Per-package tests pass: `shared`/`chain`/`ui` (vitest), `api` (jest), route smoke (playwright, thin).
- [x] `docs/architecture.md` (with Mermaid diagram) and `docs/decisions.md` exist.
- [x] `.env.example` complete with server-only vars marked; no secrets committed.

---

## Decisions to record (`docs/decisions.md`)

- **BSC Testnet (chainId 97):** hackathon target chain; free faucet; EVM-equivalent so viem/Hardhat tooling applies unchanged; MockUSDT at 6 decimals.
- **Hardhat 3 + viem + node:test:** one client library (viem) across contracts and app; native HH3 toolchain; Solidity + TS tests in one runner.
- **NestJS 11:** batteries-included DI/validation/OpenAPI; thin-controller discipline; CommonJS+Jest = least friction for a 7-day build (defer NestJS 12/ESM).
- **viem (over ethers):** type-safe, tree-shakeable, shared between contracts tests and the product app; pinned exact for type stability.
- **PostgreSQL + Prisma:** relational projections of on-chain state; typed client; `prisma-client` generator is monorepo-clean; String base-units avoid float risk.

---

## Risks

| Risk                                         | Impact                                           | Mitigation                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Node 25 in shell                             | Hardhat compile fails                            | `.nvmrc=24` + `engine-strict=true`; prerequisite step; CI pins 24                                                                  |
| `shared` shipped as JIT raw-`.ts`            | CJS API crashes at runtime (`require` ESM `.ts`) | Build `shared` with tsup (CJS+ESM+d.ts); `transpilePackages` for JIT `ui`                                                          |
| `verbatimModuleSyntax` on Nest               | Silent DI/validation failure                     | Force `false` in `nestjs.json`; keep out of `base.json`                                                                            |
| `no-explicit-any` mistaken for full no-`any` | Implicit `any` slips the mandate                 | `strictTypeChecked` + `projectService` type-aware lint                                                                             |
| Private key → git/bundle/log                 | Key compromise                                   | `.gitignore` first + verified; gitleaks pre-commit+CI; secret-env lint guards; secrets never in Next env                           |
| Parallel install lockfile/catalog races      | Corrupt/looping installs                         | NO worktrees; agents edit only own `package.json`; catalog frozen in Wave 0; **single** `pnpm install` per wave (owner serializes) |
| Tailwind v4 unstyled shared UI               | Broken visuals                                   | `@source` in each app's globals.css; verify in Playwright smoke                                                                    |
| pnpm strictness (phantom deps)               | Import errors                                    | Every internal import declared `workspace:*`; every third-party dep in the package's own `package.json`                            |
| HH3 ESM + pnpm resolution                    | Plugin not found                                 | `public-hoist-pattern` for hardhat/nomicfoundation; escalate to `node-linker=hoisted` if needed                                    |
| viem version drift                           | TS build breaks                                  | Exact pin via catalog across all consumers                                                                                         |
| Prisma client path in monorepo               | Generate/import fails                            | `prisma-client` generator + explicit `output`; `postinstall` regeneration                                                          |

---

## References

**Internal**

- Brainstorm: `docs/brainstorms/2026-09-25-monorepo-foundation-brainstorm.md`
- Product brief: persistent project context (brand, contracts, domain rules)

**External (verified 2026-09-25)**

- Turborepo config / internal packages: https://turborepo.dev/docs/reference/configuration · https://turborepo.dev/docs/core-concepts/internal-packages
- pnpm workspaces / catalogs / settings: https://pnpm.io/pnpm-workspace_yaml · https://pnpm.io/catalogs · https://pnpm.io/settings
- typescript-eslint (flat config): https://typescript-eslint.io/getting-started
- Tailwind v4 (theme, `@source`, Next): https://tailwindcss.com/docs/theme · https://tailwindcss.com/docs/detecting-classes-in-source-files · https://tailwindcss.com/docs/installation/framework-guides/nextjs
- shadcn/ui (Tailwind v4, React 19, monorepo): https://ui.shadcn.com/docs/tailwind-v4 · https://ui.shadcn.com/docs/react-19 · https://ui.shadcn.com/docs/monorepo
- Next fonts / Geist: https://nextjs.org/docs/app/getting-started/fonts · https://vercel.com/font
- wagmi SSR (App Router): https://github.com/wevm/wagmi/blob/main/site/react/guides/ssr.md
- NestJS: versioning https://docs.nestjs.com/techniques/versioning · config https://docs.nestjs.com/techniques/configuration · terminus https://docs.nestjs.com/recipes/terminus · prisma https://docs.nestjs.com/recipes/prisma
- nestjs-zod: https://github.com/BenLorantfy/nestjs-zod
- Prisma generators (`prisma-client`): https://www.prisma.io/docs/orm/prisma-schema/overview/generators
- Hardhat 3: getting started https://hardhat.org/docs/getting-started · config https://hardhat.org/docs/reference/configuration · viem testing https://hardhat.org/docs/guides/testing/using-viem · Node support https://hardhat.org/docs/reference/nodejs-support
- OpenZeppelin Contracts: https://www.npmjs.com/package/@openzeppelin/contracts

---

## Next step

→ Implement with `/workflows:work docs/plans/2026-09-25-feat-monorepo-foundation-scaffold-plan.md`
(Wave 0 first, then dispatch one agent per Wave 1/2 workstream). **Run `nvm use 24` before anything.**
