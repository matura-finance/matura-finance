# Decisions

Short rationale for the foundation's technology choices, scoped to a 7-day BSC
Testnet hackathon MVP.

## Platform

- **BSC Testnet (chain ID 97).** Free faucet, EVM-equivalent so viem/Hardhat
  tooling applies unchanged, and it matches the hackathon track. Settlement token
  is MockUSDT at 6 decimals. No mainnet, no real funds.
- **PostgreSQL + Prisma.** The API stores relational **projections** of on-chain
  state (claims, executions, cursor). Prisma gives a typed client and a clear
  migration story. Monetary values are stored as **String base-units** (uint256),
  which exactly match on-chain values and avoid float/precision loss — with the
  caveat that money columns are never sorted/range-filtered lexicographically in
  SQL. Uses the new **`prisma-client`** generator (the `prisma-client-js` generator
  is deprecated and awkward under pnpm) emitting into `src/generated/prisma`.

## Contracts

- **Hardhat 3 + viem + `node:test`.** HH3's native toolchain keeps a single client
  library (viem) shared between contract tests and the product app, and runs
  Solidity + TypeScript tests in one runner. HH3 is ESM-only and requires an even
  LTS Node (22.13+/24) — hence the Node 24 pin.
- **viem over ethers.** Type-safe, tree-shakeable, one client across contracts,
  `@matura/chain`, and the app. Pinned to an exact version because viem does not
  semver its TypeScript types.

## API

- **NestJS 11 (CommonJS + Jest).** Batteries-included DI, validation, and OpenAPI
  with a thin-controller discipline. CommonJS + Jest is the least-friction path for
  a 7-day build; the NestJS 12 / full-ESM migration is deferred.
- **nestjs-zod for validation.** Keeps a single Zod foundation shared with
  `@matura/shared` — env validation, request DTOs, and OpenAPI models all derive
  from Zod, avoiding a parallel class-validator layer.
- **Trivial health endpoint.** A thin `{ status: "ok" }` handler meets the
  acceptance criterion; a Terminus/Prisma readiness check is deferred until there
  is a real dependency worth gating on.

## Frontend

- **Two separate Next.js 15 apps.** The marketing site (`landing`) stays wallet-free
  and statically optimizable; the product app (`app`) owns all wallet/network code.
  Splitting them keeps the landing bundle light and the security boundary clean.
- **Tailwind v4 (CSS-first) + shadcn-style primitives.** Design tokens live as CSS
  variables in a single `@matura/ui/globals.css` (`@theme`), consumed by both apps
  via `@source` scanning. React 19 component style (no `forwardRef`, `data-slot`).

## Monorepo & quality

- **pnpm + Turborepo, JIT internal packages.** Bundler-consumed packages ship raw
  TS (no build step); only `@matura/shared` is compiled (tsup) because the CommonJS
  API consumes it at runtime. Turbo owns build ordering — no TS project references.
- **No `any`, enforced by type-aware linting.** `@typescript-eslint/no-explicit-any`
  alone only bans the keyword; the shared ESLint config extends `strictTypeChecked`
  with `projectService` so leaked/implicit `any` is caught too.
- **Secrets never reach the browser or git.** `.gitignore` committed first, guarded
  `gitleaks` pre-commit + CI scan, lint-blocked secret-env access in the web apps,
  and `configVariable()`/keystore for contract keys.

## Notable local-environment note

The dev machine ran Node 25 (unsupported by Hardhat 3). We installed Node 24 via
Homebrew (keg-only) and run all repo commands under it; `.nvmrc` + `engines`
(`>=22.13 <25`) enforce the version going forward.
