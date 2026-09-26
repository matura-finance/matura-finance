# Brainstorm — Matura Frontends (landing + product)

**Date:** 2026-09-26
**Author:** arjunamarcelino
**Status:** Ready for planning

## What We're Building

Two production-quality frontends in the existing Turborepo monorepo, built out on
foundations that already exist as honest scaffolds:

- **`apps/landing` → matura.xyz** — a fast, wallet-free public marketing/explanation
  site. Fully-approved copy hierarchy (hero → problem → unified account → how it works →
  best execution → why onchain → issuers → protocol proof → safety → final CTA → footer)
  plus supporting routes (`/how-it-works`, `/protocol`, `/for-issuers`, `/docs`,
  `/privacy`, `/terms`). SEO/OG/sitemap/robots/structured data; Lighthouse ≥90 perf,
  ≥95 A11y/BP/SEO. No wallet/chain deps in the bundle (already lint-enforced).
- **`apps/app` → app.matura.xyz** — the wallet-connected product. Routes: `/account`,
  `/request` (the central best-execution route-comparison interaction), `/activity`,
  `/issuer` (demo simulator), `/vaults`. Full SIWE auth, the complete transaction
  lifecycle state machine, and honest testnet/synthetic disclosures. Copy system is
  fully specified and must be used verbatim (never "borrow/loan/credit/guaranteed").

The approved copy, routes, brand tokens, and acceptance criteria are already specified in
the feature request — most of the _WHAT_ is fixed. This brainstorm resolves the handful of
build-shaping decisions the spec left open.

### Current state (reconnaissance summary)

**Present:** monorepo wiring; Tailwind v4 brand-token system (`--color-midnight/liquid-mint/mist/deep-night` + shadcn-style semantic layer, light+dark) and Manrope+Geist fonts in `packages/ui`; both Next 15 App-Router apps with all routes as placeholder `<Screen>` shells; `apps/landing` wallet-free (lint-guarded); `apps/app` wagmi+viem (BSC testnet only) + react-query providers + SSR cookie hydration; `@matura/shared` Zod domain/router types (`optimizeRoute`, `OptimizeResult`, `RouteLeg`, `Claim`, enums, money helpers); `@matura/chain` ABIs/EIP-712/chains/manifests/units; a complete authenticated NestJS API (`/auth`, `/account`, `/claims`, `/routes/optimize`, `/routes/:id/prepare-execution`, `/executions`, `/settlements`, `/vaults`, `/activity`, `/quotes/preview`); dev-only Swagger.

**Missing / to build:** live BSC-testnet addresses (`97.json` is all-zero, not deployed); a typed API client (none — Nest DTOs not exported); the wallet-connect + SIWE sign-in flow; all real page data/content (every product page is a placeholder); most UI primitives (only button/badge/container/stack exist — need card/input/form/table/dialog/tabs/toast/skeleton/etc.); Playwright + e2e; brand image assets (no logo/favicon/OG anywhere).

## Why This Approach

Chosen approach: **Local-first build, product app first, flip to live BSC testnet at the end.**

Build the product against a seeded local hardhat node + local API (`demo:local` already
does deploy→seed→verify) for a fast dev loop, keeping manifest/env swappable. Land
`apps/app` (highest-risk, highest-value, acceptance-critical surface) before the landing
site. As a late milestone, `deploy:bsc-testnet` + `seed:bsc-testnet` and flip the
`NEXT_PUBLIC_*` config so the real deliverable runs against live testnet with correct
explorer links and amounts.

**Why this over the alternatives:**

- _Testnet-first_ gives continuous honest validation but every dev iteration eats live
  RPC latency (finalized-tag polling) and faucet/gas friction against shared mutable
  state — too slow for the bulk of UI/state-machine work.
- _Fixtures-now-converge-later_ is fastest to polished UI but risks fixture↔reality drift
  and fails the correctness acceptance criteria until convergence. Local hardhat gives
  the same speed with _real_ execution semantics, so there's no drift to reconcile.
- Local≈testnet parity is high (same contracts, same API, same optimizer), so the final
  flip is one env change plus a deploy+seed, not a re-integration.

## Key Decisions

1. **Target environment: deploy + seed BSC testnet** (the real end-to-end deliverable).
   Satisfies "real explorer links + correct amounts", Request A (partial payroll slice)
   and Request B (combines ≥2 claims). Reached via the local-first path above.

2. **API client: a thin typed fetch layer that reuses `@matura/shared` Zod schemas.**
   Hand-written fetch + react-query hooks that validate responses against the already-
   exported shared schemas — no codegen, no drift (single source of truth is the shared
   package), matches the existing type-sharing pattern and the "never hand-copy types"
   rule. Where the API's wire shape isn't yet covered by `@matura/shared` (e.g. the
   `PrepareResponse` step envelope, `OptimizeResponseDto` wrapper, `ActivityPageDto`),
   add the missing schemas to `@matura/shared` rather than redefining them app-side.
   **Scope guard:** add only the schemas the frontend actually consumes — do not mirror
   the entire API wire surface.

3. **Sequencing: product app first, landing second.** The acceptance criteria center on
   the working product and the route-comparison interaction; landing is copy/design work
   that carries no chain risk and can follow.

4. **Brand assets: user will provide.** Reserve the slots (logo, favicon/app icons, OG
   image, the routing/flow illustration) with fixed dimensions + metadata and use honest
   placeholders (text wordmark + token visuals) until the approved flat-geometric assets
   land. Never gradient the core mark.

5. **Wallet connection: injected / EIP-6963 discovery only** (per spec) — hand-rolled
   connect UI, no WalletConnect/RainbowKit, to keep the product bundle lean and the
   landing bundle wallet-free.

6. **UI primitive boundary: shared low-level primitives grow in `packages/ui`;**
   app-specific compositions (route-comparison allocation bar, claim cards, transaction
   state panels) stay app-local. Both apps consume the same tokens + primitives but keep
   distinct information architecture, navigation, and bundles. **Scope guard:** build only
   the primitives the specified routes actually use — not a speculative general design
   system. Likely set from the specified screens: card, input, table/row, dialog/sheet,
   tabs, toast, skeleton, progress/allocation-bar — confirmed against real page needs in
   the plan, not built ahead of demand.

7. **SIWE session storage: header-bearer JWT, in-memory + `sessionStorage` rehydrate,
   re-SIWE on expiry.** The API guard reads `Authorization: Bearer` only (no cookie path),
   so an httpOnly cookie is not viable without a backend change. Keep the JWT in memory,
   mirror to `sessionStorage` so a reload doesn't force re-signing, and re-run the SIWE
   flow when the token's `expiresAt` passes. No API change.

8. **Execution flow uses the routes path only.** `POST /routes/optimize` → explicit review →
   `POST /routes/:routeId/prepare-execution` (returns exactly one EIP-712 `typed-data` step
   with `submitFunction: "executeRoute"`, no calldata step) → wallet signs → the frontend
   builds and sends `executeRoute(route, signature)` itself using the `maturaRouter` ABI
   from `@matura/chain`. The app **never** uses `/executions/prepare` (a legacy/power-user
   client-supplied-route surface). **Receipt detection:** poll `GET /executions/:executionId`
   for `status: EXECUTED`; since `executionId` is not a first-class field in the prepare
   response, recompute it client-side via viem `hashTypedData(typedData)` from the returned
   step (no API change) — falling back to `activity`/`account` polling if needed.

9. **Seed & demo wallet: parameterize the beneficiary to a wallet you control.** The seed
   scenarios are already calibrated (no fixture changes): Request A = partial slice of the
   20,000 payroll claim (`targetAdvance 4,800`, `maxTotalFace 6,000`); Request B = payroll +
   stream combined (`targetAdvance 24,000`, exceeds any single claim's advance). Seeded
   liquidity (Stable 500k / Flex 1M) never binds. The one change needed for the testnet
   deliverable: add a seed option so the claim beneficiary is a specific browser wallet you
   control (today it hard-codes to Alice → the deployer address on testnet), keeping the
   deployer key out of the browser.

## Central Interaction (must be unmistakable)

`/request` is the product's core. The UI must make obvious that: the user requested **one
amount**, Matura selected **only parts** of existing claims (partial slicing), and Matura
Vaults offered **different executable prices** — surfaced via a compact allocation bar /
route breakdown with exact base-unit values (labels: You receive, Claim value assigned,
Total cost, Effective cost, Expected settlement, You retain, Selected vault) plus at least
one next-best/rejected alternative. Two-phase flow: `POST /routes/optimize` (estimate at
pinned block, single-use `RouteIntent`, 120s TTL) → explicit review → `POST
/routes/:routeId/prepare-execution` (authoritative re-quote, emits `ExecutionRoute` EIP-712
typed data) → sign → submit `executeRoute` → confirmed-but-indexing → indexed. Never show
success before a confirmed receipt.

## Transaction / UX State Machine (product)

disconnected · wrong chain · loading · empty account · RPC unavailable · quote expired ·
simulation failed · wallet rejection · pending signature · pending transaction · reverted ·
confirmed-but-indexing (bounded polling of the API projection: "Confirmed onchain. Updating
your Matura Account…") · indexed · delayed · settled. Errors explain the next useful action
and preserve entered amounts when safe. Money stays bigint/base-unit strings until display.

## Resolved Questions

All prior open questions are now resolved (codebase investigation + user confirmation):

- **Execution endpoint / `/executions/prepare` gap** → the app uses the routes flow only;
  `/executions/prepare` is never used (see Decision 8).
- **Receipt detection** → poll `GET /executions/:executionId` for `status: EXECUTED`;
  recompute `executionId` client-side via `hashTypedData` (see Decision 8).
- **SIWE session storage** → header-bearer JWT, in-memory + `sessionStorage` rehydrate,
  re-SIWE on expiry; no API change (see Decision 7).
- **Seed scenarios** → already calibrated for Request A and Request B; no fixture changes
  (see Decision 9).
- **Demo wallet identity on testnet** → parameterize the seed beneficiary to a wallet you
  control, keeping the deployer key out of the browser (see Decision 9).
- **Repo visibility / `/docs` route** → repo is **public**, so `/docs` renders concise
  on-site getting-started **and** links out to the public GitHub docs (`architecture.md`,
  `routing.md`, `threat-model.md`, `README.md`); the footer shows the GitHub link.
- **Landing contract links** → `/protocol` + footer "View contracts" link to real explorer
  addresses only after the testnet-deploy milestone; until then show "Contracts deploying
  soon" (no broken link).
- **Existing landing copy** → _replaced_ to match the approved 4-step hierarchy (the
  scaffold's 6-step flow is not carried forward); not additive on the current shell.
- **`/terms` route** → created as an honest prototype-level placeholder marked for legal
  review (only `/privacy` exists today).

## Remaining Dependencies (not blockers; gated to the testnet-flip milestone)

- **Testnet deploy/seed is user-executed at the flip milestone** (confirmed: you'll handle
  it). Prereqs: `DEPLOYER_PRIVATE_KEY` + `ISSUER_PRIVATE_KEY` in the Hardhat keystore,
  BSC-testnet BNB for gas, RPC URL. The plan documents the exact commands
  (`deploy:bsc-testnet` → `seed:bsc-testnet` → flip `NEXT_PUBLIC_*`) but does not block the
  build on them. The dev loop runs against a seeded local hardhat node + local API.
- **Brand assets** you will supply (logo, favicon/app icons, OG image, routing-flow
  illustration). Build reserves the slots with placeholders until they land.

## Acceptance Criteria (carried from the request)

Independently buildable/deployable apps; landing has no dead CTA / invented logo /
fabricated metric / fake testimonial / unsupported regulatory claim; landing copy matches
the approved hierarchy; no browser exposure of server secrets and no floating-point money;
Request A shows a partial payroll slice and Request B combines ≥2 claims; tx links/amounts/
costs/retained balances are correct; both apps pass lint, typecheck, production build, and
their tests (incl. Playwright landing path and product happy path).

## Next Step

Run `/workflows:plan` to turn this into an implementation plan (it will auto-detect this
brainstorm). Suggested plan spine: shared primitives + API-client layer → product SIWE +
account/vaults/activity → the `/request` best-execution flow + full state machine → issuer
simulator → landing build + SEO/assets → Playwright e2e → testnet deploy/seed/flip.
