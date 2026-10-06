# Brainstorm: Matura Documentation Website (`apps/docs`)

**Date:** 2026-10-06
**Status:** Captured — ready for `/workflows:plan`
**Reference:** [docs.comacard.xyz](https://docs.comacard.xyz/) · [comacard/apps/docs](https://github.com/comacard/comacard/tree/main/apps/docs)

---

## What We're Building

A new app, `apps/docs` (`@matura/docs`), a **comprehensive documentation website** for Matura — the
single reader-facing place that explains the protocol end-to-end: concepts, contracts, API, trust
model, and operations. It takes comacard's docs as the **content/structure reference** (a trust-and-
proof-oriented, verifiable, "names its source" ethos) but is built on **Fumadocs** rather than
comacard's hand-rolled `marked` setup, and is themed to match the Matura brand via `@matura/ui`.

It serves **three audiences at once**:

- **Judges / evaluators** — trust, proof-it-works, verified testnet addresses, demo runbook.
- **Developers / integrators** — API reference, contract ABIs, SIWE auth, best-execution routing.
- **Protocol newcomers** — what RWA/invoice financing is; how vaults, claims, and routing work.

Deployed to **docs.usematura.xyz** (EasyPanel/Docker, same pattern as `apps/landing` and `apps/app`),
cross-linked from the landing site.

## Why This Approach

- **Fumadocs over custom (or comacard's `marked` approach):** the whole monorepo is already Next.js 15
  - Tailwind v4 + React 19, so Fumadocs slots in natively. It gives us built-in search (local Orama),
    TOC, sidebar nav, MDX, and dark mode for free — the things a "comprehensive" site needs — instead of
    hand-building them like comacard did. We keep comacard's _content philosophy_ (verifiable, source-
    linked, honest about trust) without re-implementing its plumbing.
- **Hybrid content model** mirrors comacard's "render markdown straight from the repo" idea but fixes
  its weakness: the existing `docs/*.md` are internal-engineering-toned. So we **hand-write curated,
  reader-facing pages** (Overview, Concepts, API narrative, Quickstart) and **auto-render / adapt the
  deep-reference docs** (threat-model, routing, decisions, deployment, gas/test reports) from the repo
  as the source of truth. Reader-friendly on top, zero-drift underneath.
- **Brand match via Fumadocs theming:** reuse the Matura tokens (midnight/liquid-mint/mist, Geist
  Sans/Mono + Manrope) so docs feels like part of the product, not a bolt-on. Note this is _not_ a
  trivial `@import "@matura/ui/globals.css"` the way `apps/landing` does it — Fumadocs ships its own
  Tailwind preset, layout components, and CSS-variable theme. We map Matura's tokens onto Fumadocs'
  theming variables / override its preset (see open question #8), rather than layering two design
  systems on top of each other.
- **Wallet-free & static**, like landing — same locked-down CSP (`connect-src 'self'`), same
  `output: "standalone"` Dockerfile, same CI pickup via the workspace glob (no `turbo.json`/CI edits
  needed to build/lint/typecheck it).

## Proposed Information Architecture

Adapts comacard's sections (Overview → What it looks like → Contracts → What you're trusting → Trust →
Proof it works → Demo runbook → Indexer → Worker) into a Matura-shaped, multi-audience map:

1. **Overview** — Introduction (what Matura is), What it looks like (app screenshots: `/request`,
   `/account`, `/activity`, `/vaults`, `/issuer`), Quickstart (try the testnet demo / run locally).
2. **Concepts** — RWA invoice-financing primer · Vaults & liquidity · Claims (ClaimType/ClaimState
   lifecycle) · **Best-execution routing** (the differentiator, from `routing.md`) · Settlement ·
   Glossary (from `@matura/shared` branded types).
3. **Contracts** — Architecture overview · per-contract reference for the six core contracts
   (`MaturaRouter`, `SettlementManager`, `ClaimRegistry`, `VaultRegistry`, `IssuerRegistry`,
   `LiquidityVault`, + MockUSDT) · **Deployed addresses** (BSC Testnet / chain 97, verified BSCScan
   links from the `97.json` manifest) · on-chain security posture (CEI, SafeERC20,
   `ReentrancyGuardTransient`).
4. **API & Integration** — API overview (NestJS, read vs. write-prep) · SIWE authentication · read
   endpoints · write-preparation endpoints (unsigned calldata / EIP-712) · router endpoints
   (`optimize` / `prepare-execution`) · Indexer & Worker (how projections are built).
5. **Trust & Security** — Threat model (`threat-model.md`) · What you're trusting (issuer key, trust
   assumptions) · Accepted risks + testnet-only warning (`SECURITY.md`) · **Proof it works** (verified
   contracts, `test-report.md`, `gas-report.md`).
6. **Operations & Demo** — Demo runbook (≤3-min script from `demo-script.md`) · Deployment
   (EasyPanel/Docker, from `deployment.md`) · Local development · Design decisions / architecture
   (`decisions.md` ADRs + `architecture.md` Mermaid map).

## Key Decisions

| Decision      | Choice                                                                 | Rationale                                                                             |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Framework     | **Fumadocs**                                                           | Next.js-native, batteries-included (search/TOC/nav/MDX/dark), matches monorepo stack. |
| Content model | **Hybrid**                                                             | Curated reader-facing pages + auto-adapted repo deep-reference = no drift, better UX. |
| Audience      | **All three** (judges, devs, newcomers)                                | IA layers general→technical so each finds its path.                                   |
| Scope         | **Full comprehensive build**                                           | User wants the complete detail site, not a stub.                                      |
| Deployment    | **docs.usematura.xyz** via EasyPanel/Docker                            | Same proven pattern as landing/app; cross-link from landing.                          |
| Branding      | Import `@matura/ui` tokens + Geist/Manrope                             | Visual parity with product/landing.                                                   |
| App shape     | `@matura/docs`, Next 15, port **3003**, wallet-free, standalone output | Mirrors `apps/landing` conventions exactly.                                           |

## Source Material Mapping (repo → docs page)

- `docs/architecture.md` → Architecture (Mermaid component map)
- `docs/decisions.md` → Design decisions (ADRs)
- `docs/routing.md` → Concepts: Best-execution routing
- `docs/threat-model.md` + root `SECURITY.md` → Trust & Security
- `docs/deployment.md` + runbooks → Operations: Deployment
- `docs/demo-script.md` → Operations: Demo runbook
- `docs/test-report.md`, `docs/gas-report.md` → Proof it works
- `packages/contracts/*.sol` + `packages/contracts/README.md` → Contracts reference
- `packages/chain/src/deployments/97.json` → Deployed addresses
- `@matura/shared` schemas/enums → Concepts glossary

## Open Questions (resolve during planning)

1. **Hybrid pipeline mechanics (HOW):** render existing `docs/*.md` by (a) pointing `fumadocs-mdx` at
   additional content dirs, (b) a build-time copy/transform step, or (c) manual MDX that embeds/links
   the repo files. Needs a decision in `/workflows:plan`.
2. **Addresses & ABIs freshness:** should deployed-address and ABI pages read live from the
   `97.json` manifest / generated ABIs at build time (auto-fresh, like the ABI-freshness gate), or be
   hand-maintained? Prefer generated to avoid drift.
3. **Screenshots** for "What it looks like" — capture fresh from the running app, or reuse existing
   assets? Where do they live (`public/screens/` like comacard)?
4. **Search** — Fumadocs default local Orama (static, no external service, keeps us wallet/secret-free)
   vs. hosted. Lean Orama.
5. **Versioning** — single "current" version for the MVP, or set up Fumadocs versioning now? Lean
   single version (YAGNI).
6. **API reference generation** — hand-written from the Nest controllers, or generate from an OpenAPI
   spec if one exists/can be added? Investigate during planning.
7. **Landing cross-link + nav** — add a "Docs" link in `apps/landing` nav and a `NEXT_PUBLIC_DOCS_URL`
   to `turbo.json` build env + `apps/landing/src/lib/site.ts`.
8. **Fumadocs ↔ `@matura/ui` theming integration (HOW):** decide how to apply Matura's brand tokens
   within Fumadocs — map tokens onto Fumadocs' CSS theme variables, override its Tailwind preset, and
   wire the Geist/Manrope fonts into its layout. Confirm `@matura/ui` components can be used inside MDX
   without its preset clashing with Fumadocs'. This is the main theming risk; resolve early in planning.

## Non-Goals (YAGNI)

- No multi-version/i18n docs for the MVP.
- No CMS or external auth — static, public, wallet-free.
- Not re-documenting internal process dirs (`docs/brainstorms/`, `docs/plans/`, `docs/reviews/`,
  `docs/solutions/`) — those stay internal.
- No interactive API playground / live wallet calls (keeps CSP locked and bundle secret-free).
