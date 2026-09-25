---
date: 2026-09-25
topic: monorepo-foundation
---

# Matura Monorepo Foundation

## What We're Building

The complete, empty-but-wired foundation for the Matura MVP: a pnpm +
Turborepo monorepo with three apps (`landing`, `app`, `api`), three domain
packages (`contracts`, `shared`, `chain`), and shared tooling packages (`ui`,
reusable ESLint config, reusable TS config). This prompt establishes
**interfaces and boundaries only** — no business contracts, no polished UI, no
routing/settlement logic. The goal is a repo where `pnpm install`, `build`,
`lint`, `typecheck`, contract compile, and Prisma validate/generate all pass,
and every app renders its placeholder routes without runtime errors.

## Why This Approach

The monorepo shape, package boundaries, entities, and interface rules were fully
specified in the brief, so the exploration focused on the **toolchain decisions**
that ripple across every package rather than on structure. We deliberately keep
`packages/shared` framework-free, isolate wallet/chain code to `apps/app` +
`packages/chain`, and forbid hand-copied ABIs — these boundaries are what make
the later feature work parallelizable and prevent the landing site from pulling
in wallet weight. YAGNI applied: `packages/ui` holds only tokens + low-level
primitives; complex page sections stay in each app.

## Key Decisions

- **Contract toolchain: Hardhat 3 + viem + `node:test`.** Rationale: HH3's native
  default; one client library (viem) shared across contracts and the product
  app; avoids adding ethers as a second stack.
- **Tailwind v4 (CSS-first).** Rationale: native CSS-variable design tokens map
  cleanly onto the Matura token system across `packages/ui` and both apps;
  shadcn/ui supports v4.
- **Monetary values stored as String base-units in Prisma.** Rationale: uint256
  token base-units stored verbatim as strings — exact match to on-chain values
  and the "decimal strings across APIs, never JS numbers" rule; zero precision
  loss, no float risk. Human-unit conversion happens only at display boundaries.
- **Vitest for TypeScript packages** (`shared`, `chain`) and app unit tests;
  **NestJS keeps its Jest default** in `apps/api`. Rationale: fast ESM-native
  testing for pure-logic packages without fighting Jest's ESM config.
- **Default toolchain picks (lead engineer's call, not requiring sign-off):**
  Node 20 LTS + pnpm 9 (pinned via `packageManager`), Next.js 15 / React 19,
  wagmi v2 + viem v2, ESLint 9 flat config, per-package `tsconfig` extending a
  shared base, shadcn/ui scoped to `apps/app` only.

## Interface & Boundary Invariants (carried from brief)

- `packages/shared` must not import NestJS, Next.js, Prisma, or Hardhat.
- No generated ABI is hand-copied into apps/api — consumed via `packages/chain`.
- `apps/landing` must not depend on `packages/chain` or wallet libs.
- Addresses: lowercase for DB lookup, checksum/preserved at display boundaries.
- Base-unit amounts cross APIs as decimal strings; dates as ISO 8601; contracts
  use Unix seconds.
- Cross-domain links use configured public URLs (`NEXT_PUBLIC_LANDING_URL`,
  `NEXT_PUBLIC_APP_URL`), never hardcoded localhost.
- No private keys embedded anywhere; server-only env vars clearly marked.

## Open Questions

Genuinely unresolved — needs an answer during or before planning:

- **None that block scaffolding.** All toolchain choices are settled; the
  foundation prompt is execution-ready.

## Deferred (decided now, revisit only if the trigger fires)

- **shadcn in landing** — scoped to `apps/app` only. Revisit if a landing page
  needs interactive primitives.
- **ESLint config style** — flat config (ESLint 9). Revisit only if a dependency
  forces legacy `.eslintrc` compat.
- **Prisma `faceValue` column type** — `String`/`text`. Revisit (add a `Decimal`
  shadow column) only if we need DB-side range queries on amounts.
- **Turbo remote caching** — off; local cache only for a 7-day MVP.

## Acceptance Criteria (from brief — unchanged)

- `pnpm install` succeeds; lockfile committed.
- `pnpm build`, `lint`, `typecheck` pass from repo root.
- API `/api/v1` health endpoint runs; Swagger in non-prod.
- Landing renders `/`, `/how-it-works`, `/protocol`, `/for-issuers`, `/docs`,
  `/privacy`; product app renders `/account`, `/request`, `/activity`, `/issuer`,
  `/vaults`.
- Hardhat compile succeeds (sample replaced by empty valid setup).
- Prisma validate + generate succeed.
- `docs/architecture.md` (Mermaid component diagram) and `docs/decisions.md`
  (why BSC Testnet, Hardhat 3, NestJS, viem, PostgreSQL) exist.

## Next Steps

→ `/workflows:plan` for the implementation sequence and file-level changes.
