---
title: "feat: Matura documentation website (apps/docs)"
type: feat
date: 2026-10-06
brainstorm: docs/brainstorms/2026-10-06-docs-website-brainstorm.md
---

# ✨ feat: Matura Documentation Website (`apps/docs`)

## Overview

Add a new app, **`apps/docs`** (`@matura/docs`) — a comprehensive, reader-facing documentation
website for Matura, built on **Fumadocs** (pinned to the Next.js-15-compatible line), themed to match
the Matura brand via `@matura/ui`, and deployed to **docs.usematura.xyz** via EasyPanel/Docker exactly
like `apps/landing`. It explains the protocol end-to-end — concepts, contracts, API, trust model,
operations — for three audiences at once: **judges/evaluators, developers/integrators, and protocol
newcomers**. It takes [docs.comacard.xyz](https://docs.comacard.xyz/) as the content/structure
reference (verifiable, trust-and-proof-oriented, "names its source") but uses Fumadocs instead of
comacard's hand-rolled `marked` setup.

Content follows a **two-lane hybrid model**: hand-authored reader-facing MDX pages (committed) +
build-time-mirrored deep-reference pages generated from the existing repo `docs/` (gitignored,
auto-fresh). The docs site is **static and wallet-free** — no API/chain calls at runtime, no SIWE,
`connect-src 'self'` — and must pass the same wallet-free bundle guard as landing.

This plan supersedes the brainstorm's over-optimistic "brand match for free" framing and incorporates
the SpecFlow analysis, which caught two build-blocking issues (internal-doc leakage via glob; MDX
parse failures on raw `{`/`<`) and an accessibility regression (mint → `--color-fd-primary`).

## Problem Statement / Motivation

Matura's knowledge lives in a dozen internal `docs/*.md` files written in an engineering tone, plus a
23KB root `README.md`. There is **no single reader-facing place** that explains the protocol to
outsiders. For a hackathon/grant context (and for developer adoption), judges, integrators, and
newcomers each need a different entry point into the same material. A dedicated docs site:

- Gives **judges** a trust-and-proof narrative with verified testnet addresses and a demo runbook.
- Gives **developers** an API reference, contract reference, and SIWE/routing details.
- Gives **newcomers** a concepts primer (RWA invoice financing, vaults, claims, routing, settlement).
- Prevents drift by **generating** the volatile parts (contract addresses, deep-reference docs) from
  the repo at build time, so the site can never show stale infra.

## Proposed Solution

### Framework & version decision (must act on before coding)

**Pin `fumadocs-ui@15.8.5` + `fumadocs-core@15.8.5` + a matching `fumadocs-mdx`.** The current Fumadocs
`16.x` line requires **Next.js 16 + React 19.2 + Zod 4**; the whole monorepo is on **Next.js 15 /
React 19 / Tailwind v4**. The `15.8.5` line supports `next 14||15`, `react 18||19`, `tailwindcss
^3.4.14 || ^4.0.0` — the low-friction, monorepo-consistent path. **Do not `pnpm add fumadocs-ui`
unpinned** — it resolves to `16.x` and breaks on the `next@16`/`react@19.2`/`zod@4` peers.

> Future upgrade path (NON-GOAL now): when the monorepo moves to Next 16 + React 19.2 + Zod 4, bump
> `apps/docs` to the Fumadocs `16.x` line (default search engine becomes ZBSearch; typed-route helpers
> `PageProps<'/docs/[[...slug]]'>` become available).

### App shape (mirror `apps/landing`)

`@matura/docs`, `type: module`, Next.js `^15.5.0`, dev/start on **port 3003**, standalone output,
wallet-free. Copy landing's config nearly verbatim (see References for exact contents):

- `package.json` — rename to `@matura/docs`, ports `3001`→`3003`; deps add the pinned fumadocs trio +
  `gray-matter` (frontmatter inject in prebuild). Keep `@matura/ui` `workspace:*`, `geist`, `next`,
  `react`/`react-dom` (`catalog:`), the two shared config packages.
- `next.config.ts` — **as a Fumadocs app this becomes `next.config.mjs`** wrapping config with
  `createMDX()` from `fumadocs-mdx/next`. Keep `output: "standalone"`,
  `outputFileTracingRoot: path.join(import.meta.dirname, "../..")`, `transpilePackages: ["@matura/ui"]`,
  and landing's `headers()` CSP **verbatim** (strict: `script-src 'self' 'unsafe-inline'`,
  `connect-src 'self'`, `font-src 'self' data:`, `img-src 'self' data:`, `frame-ancestors 'none'`).
  **Drop** landing's `redirects()` entirely (including the stale `/docs → /`). Add
  `outputFileTracingIncludes` for the content/`.source` dirs only if server search is chosen (it is
  not — see Search).
- `postcss.config.mjs` — copy verbatim (`@tailwindcss/postcss`).
- `tsconfig.json` — copy verbatim (`extends @matura/typescript-config/nextjs.json`).
- `eslint.config.js` — spread `nextJsConfig` from `@matura/eslint-config/next`. Re-add the wallet-free
  `no-restricted-imports` block banning `wagmi`/`viem`/`@matura/chain`/`@tanstack/react-query`
  (docs must stay wallet-free — do NOT relax these; the Contracts data comes from `fs` at build, §Content).
- `Dockerfile` — clone landing's: `turbo prune @matura/docs --docker`, `--filter=@matura/docs`, COPY
  paths `apps/landing`→`apps/docs`, `PORT`/`EXPOSE` `3001`→`3003`, `CMD ["node","apps/docs/server.js"]`,
  ARG/ENV set = `NEXT_PUBLIC_DOCS_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LANDING_URL` (no
  wallet/chain/API/secret vars).

### Theming (map Matura tokens onto Fumadocs `fd` variables)

Fumadocs ships a Tailwind-v4 CSS preset (`fumadocs-ui/css/preset.css` + a color theme file) and
exposes `--color-fd-*` variables (the `fd` namespace isolates it from other design systems). The docs
CSS entry imports:

```css
@import "tailwindcss";
@import "fumadocs-ui/css/neutral.css"; /* base theme we override */
@import "fumadocs-ui/css/preset.css";
@import "@matura/ui/globals.css"; /* brings in Matura tokens */
@source "../../../../packages/ui/src"; /* depth-identical to landing */
```

Then an `@theme`/`:root`/`.dark` block maps `fd` vars onto Matura tokens. **Critical accessibility
constraint** (`packages/ui/CONTRAST.md`): Liquid Mint on light = 1.45–1.56 → **FAILS AA**; it is legal
only as a _filled chip with a dark label_ or as _text on dark surfaces_. Fumadocs uses
`--color-fd-primary` for links, active sidebar item, TOC highlight, and anchor hover — all
**text-on-light** on the default light theme. So:

| Fumadocs var                             | Light theme                        | Dark theme                         |
| ---------------------------------------- | ---------------------------------- | ---------------------------------- |
| `--color-fd-primary` (links, active nav) | **Midnight** (`#111827`) — AA-safe | Liquid Mint (text on dark = legal) |
| `--color-fd-background`                  | Mist (`#f4f7f6`)                   | Deep Night (`#080d17`)             |
| `--color-fd-foreground`                  | Midnight                           | near-white                         |
| `--color-fd-muted` / `-foreground`       | from `@matura/ui` muted layer      | `.dark` muted layer                |
| `--color-fd-border` / `--color-fd-ring`  | UI border/ring tokens              | ditto                              |
| filled CTA chip                          | Mint fill + Midnight label (legal) | Mint fill + Midnight label         |

**Fonts** self-hosted via `next/font` in the root layout (CSP blocks the Google Fonts CDN): `GeistSans`
/ `GeistMono` from `geist`, `Manrope` from `next/font/google` — same wiring as landing's `layout.tsx`
(`--font-geist-sans`, `--font-geist-mono`, `--font-manrope`), applied to `<body>` so they cascade into
Fumadocs' `RootProvider`. Point Fumadocs' mono/body slots at these vars; do not let it load its default
CDN font. **Typography conflict watch-out:** Fumadocs' preset bundles a _forked_ Tailwind Typography
(`prose`); if `@matura/ui` also registers `@tailwindcss/typography`, use one with a custom `className`
to avoid double-registration.

### Content model — two explicit lanes (resolves the brainstorm's "copied vs adapted" ambiguity)

**Lane A — Verbatim mirror (gitignored, auto-fresh, build-copied).** Deep-reference docs whose
engineering tone is acceptable and whose value is fidelity. A `prebuild` Node script copies an
**explicit allowlist** (never a glob) from `docs/` into `apps/docs/content/docs/reference/`, injecting
frontmatter. **The full `docs/` tree was inventoried and classified (see the table below)** — the
Lane A allowlist is exactly these six, all confirmed tracked + secret-free:

- `architecture.md` · `routing.md` · `threat-model.md` · `decisions.md` · `test-report.md` ·
  `gas-report.md`.

**Lane B — Authored MDX (committed, hand-written for an external audience).** The reader-facing
narrative that owns its tone and _references_ concepts rather than mirroring internal prose:
Overview/Introduction, "What it looks like", Quickstart, Concepts primer, the **API reference**
(authored from the controller table — no OpenAPI spec exists), per-contract reference pages, Trust &
Security narrative, Proof-it-works, and an authored **Demo runbook** + **Deployment overview**
(condensed from `demo-script.md` / `deployment.md`, which are NOT mirrored whole).

#### Full `docs/` classification (decided — drives the allowlist)

| File                                                        | Size  | Tracked?      | Disposition                  | Why                                                                                                                                                |
| ----------------------------------------------------------- | ----- | ------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture.md`                                           | 11KB  | ✅            | **Lane A (mirror)**          | System map + Mermaid; secret-free. Mermaid→SVG.                                                                                                    |
| `routing.md`                                                | 16KB  | ✅            | **Lane A (mirror)**          | Best-execution router — the differentiator concept.                                                                                                |
| `threat-model.md`                                           | 35KB  | ✅            | **Lane A (mirror)**          | Trust story judges want; secret-free (env _names_ only).                                                                                           |
| `decisions.md`                                              | 3.5KB | ✅            | **Lane A (mirror)**          | ADR rationale.                                                                                                                                     |
| `test-report.md`                                            | 6.7KB | ✅            | **Lane A (mirror)**          | Proof-it-works.                                                                                                                                    |
| `gas-report.md`                                             | 381B  | ✅            | **Lane A (mirror)**          | Proof-it-works (tiny).                                                                                                                             |
| `demo-script.md`                                            | 15KB  | ✅            | **Lane B source**            | Author a clean "Demo runbook" page from it; don't mirror verbatim.                                                                                 |
| `deployment.md`                                             | 38KB  | ✅            | **Lane B source**            | Secret-free but an _operator_ runbook (EasyPanel service names, ports, DNS). Author a condensed "Deployment overview"; don't expose full topology. |
| root `README.md`                                            | 23KB  | ✅            | **Lane B source**            | Overview/Introduction.                                                                                                                             |
| `packages/contracts/*.sol` + `packages/contracts/README.md` | —     | ✅            | **Lane B source**            | Per-contract reference pages.                                                                                                                      |
| `@matura/shared` enums/branded types                        | —     | ✅            | **Lane B source**            | Concepts glossary (ClaimType/ClaimState, BaseUnitAmount, ExecutionRoute).                                                                          |
| `apps/api` controllers                                      | —     | ✅            | **Lane B source**            | API reference (no OpenAPI spec).                                                                                                                   |
| `deployment-trackb-runbook.md`                              | 13KB  | ✅            | **INTERNAL — never publish** | Operator runbook: `.env` key-placeholder template, GO gates, secret-handling steps.                                                                |
| `demo-operator-checklist.md`                                | 7.3KB | ✅            | **INTERNAL — never publish** | Pre-demo env sanity (boot-refusal conditions, secret-echo checks).                                                                                 |
| `code-review.md`                                            | 23KB  | ❌ gitignored | **INTERNAL — never publish** | Internal review notes.                                                                                                                             |
| `deployment-runbook.md`                                     | 2KB   | ❌ gitignored | **INTERNAL — never publish** | Live addresses + secrets.                                                                                                                          |
| `docs/reviews/**`                                           | —     | ❌ gitignored | **INTERNAL — never publish** | Per-PR review docs.                                                                                                                                |
| `docs/brainstorms/**`, `docs/plans/**`, `docs/solutions/**` | —     | ✅            | **INTERNAL — never publish** | Engineering process/history.                                                                                                                       |

> The two tracked-but-internal runbooks (`deployment-trackb-runbook.md`, `demo-operator-checklist.md`)
> are protected simply by **not being on the allowlist** — the glob ban (C1) plus the explicit list
> keeps them out even though they aren't gitignored. The prebuild's disjoint-from-gitignore assertion
> is the extra net for the gitignored set.

**Generated Contracts data.** The prebuild script also reads
`packages/chain/src/deployments/97.json` via `fs` (Node, **build-time only — never bundled, no
`@matura/chain` import**, keeping the bundle guard green) and emits an MDX table of verified BSC-Testnet
(chain 97) addresses with BSCScan links. **Skip `31337.json`** (ephemeral local).

**Gitignore + always-regenerate (no committed generated content, no freshness gate needed).** Add
`apps/docs/content/docs/reference/**` and the generated contracts page to `.gitignore`. Wire the
prebuild as a `predev`/`prebuild` step in the turbo `build` graph so drift at deploy is _impossible_.
(If the team later wants committed generated content for diff review, add a CI gate that re-runs
prebuild + `git diff --exit-code` — but default is gitignore.)

### Prebuild script requirements (`apps/docs/scripts/sync-reference-docs.mjs`)

1. **Allowlist only.** Hardcoded list; **fail loudly** if a listed file is missing, and **assert the
   copy set is disjoint** from gitignored/`reviews/`/`brainstorms/`/`plans/`/`code-review.md`/
   `*-runbook.md` paths (C1 — the top security risk).
2. **Frontmatter injection + H1 dedup (C3).** Parse the first `# H1` → emit `title:` and a
   `description:` (first paragraph or a curated map); **strip the leading H1** from the body so it
   isn't rendered twice; **fail** if a file has no H1.
3. **Plain-Markdown processing (C2 — the top build-break risk).** Configure fumadocs-mdx so mirrored
   `reference/**` files are compiled as **CommonMark/plain Markdown (remark, no MDX expression/JSX
   parsing)**, so bare `<25`, `{optimize,arithmetic}`, `<T>` in prose don't blow up the compiler.
   (Authored Lane B pages remain full MDX.) Add a build-time smoke that compiles every mirrored file.
4. **Mermaid → static SVG (I4).** `architecture.md`'s single Mermaid diagram renders to inline SVG at
   build (`rehype-mermaid` pre-render, or pre-commit the SVG) so **no runtime `eval`** is needed and
   the strict CSP (`script-src` without `unsafe-eval`) stays intact. `img-src 'self' data:` permits
   inline SVG.
5. **Link checker (I3).** After compile, validate every in-page anchor resolves (GitHub's slugifier ≠
   rehype-slug — `deployment.md` has 6 `#...` anchors with leading digits/`&`); **fail** on dangling
   anchors or broken relative links.

### Information Architecture (`meta.json` fixes order — six sections)

```
Overview            → introduction, what-it-looks-like (screenshots), quickstart
Concepts            → rwa-invoice-financing, vaults-and-liquidity, claims (ClaimType/ClaimState),
                      best-execution-routing, settlement, glossary
Contracts           → overview+architecture, per-contract (MaturaRouter, SettlementManager,
                      ClaimRegistry, VaultRegistry, IssuerRegistry, LiquidityVault, MockUSDT),
                      deployed-addresses (generated from 97.json), on-chain-security
API & Integration   → overview, authentication (SIWE), read-endpoints, write-preparation,
                      best-execution-routing-endpoints, indexer-and-worker
Trust & Security     → threat-model (mirror), what-you-are-trusting, accepted-risks (testnet-only),
                      proof-it-works (verified contracts, test-report, gas-report mirrors)
Operations & Demo   → demo-runbook, deployment, local-development, architecture (mirror) + decisions (mirror)
```

### API reference (authored from the controller table — no OpenAPI spec)

Swagger UI is **dev-only** (`/docs`, guarded by `!isProduction`) and **no spec file is committed**.
Author the reference by hand from the Nest controllers. All routes are under **`/api/v1`**; auth is a
fail-closed global SIWE/JWT guard with `@Public()` opt-outs:

- **Auth (SIWE):** `GET /auth/nonce` (Public) → `POST /auth/verify` (Public, returns JWT).
- **Read (Public):** `GET /health`, `GET /health/ready`, `GET /account/:wallet`,
  `GET /activity/:wallet`, `GET /vaults`, `GET /claims/:claimId`, `GET /executions/:executionId`,
  `POST /quotes/preview`.
- **Write-preparation (Bearer, non-custodial — return unsigned calldata / EIP-712):**
  `POST /claims/registration/prepare`, `POST /issuer/attestations/prepare`,
  `POST /executions/prepare`, `POST /settlements/:claimId/prepare`, `GET /claims/issued`.
- **Best-execution routing (Bearer):** `POST /routes/optimize` → `POST /routes/:routeId/prepare-execution`.

Add N4 safeguard: a "last verified against commit `<sha>`" note on the API reference page, plus an
optional lightweight CI check listing current controller routes vs. the documented set.

### Search — local Orama (server route now; static index a Phase-4 option)

Phase 1 ships **server-mode local Orama search** (`/api/search` via `createFromSource(source)`), which
is fully local (no external service, no API key) and verified working (dev + `next build` + `next
start`). The static-index variant (`staticGET` + client `type: "static"`) initially crashed during
index build — the real cause was the loader impedance bug below, not static-vs-server; it is now a
possible Phase-4 optimization if the server index proves heavy under `output: standalone`. Either
way search stays wallet-free and same-origin (`connect-src 'self'`).

### Deploy & CI wiring

- **EasyPanel:** Build Path = repo root, Dockerfile = `apps/docs/Dockerfile`, domain
  `docs.usematura.xyz`, healthcheck `/` (docs has no `/api/v1/health`). Bake
  `NEXT_PUBLIC_DOCS_URL=https://docs.usematura.xyz` (+ `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_LANDING_URL`) as build ARGs.
- **turbo.json:** add `NEXT_PUBLIC_DOCS_URL` to `tasks.build.env` (others already allowlisted). Workspace
  glob auto-registers the app for `build`/`lint`/`typecheck` — no other turbo change.
- **Bundle guard (I8):** parameterize `apps/e2e/scripts/check-landing-bundle.mjs` /
  `lib/scan-bundle.mjs` into a reusable scanner; add a `@matura/docs` `check:bundle` with the same
  FORBIDDEN set (`wagmi`, `walletconnect`, `@matura/chain`, `viem`, SIWE/`writeContract`, secret
  substrings) against `apps/docs/.next/static`; run it in the same CI stage as landing's.
- **Node 24:** builds run under Node 24 (`.nvmrc` = `24`; `node:24-slim` in Docker) like the rest of
  the monorepo.

### Cross-linking (landing ↔ docs)

- **Remove** landing's stale `/docs → /` redirect in `apps/landing/next.config.ts`.
- Add a cross-origin **"Docs"** link in landing's `site-nav.tsx` / `site-footer.tsx` as a plain
  `<a href={DOCS_URL}>` (keeps landing's bundle guard green). Add `DOCS_URL` to
  `apps/landing/src/lib/site.ts` via the existing `envUrl(process.env.NEXT_PUBLIC_DOCS_URL, "https://docs.usematura.xyz")`
  pattern, and add `NEXT_PUBLIC_DOCS_URL` to landing's Dockerfile ARGs + turbo `build.env`.
- Reverse links from docs → `app.usematura.xyz` / `usematura.xyz` via `NEXT_PUBLIC_APP_URL` /
  `NEXT_PUBLIC_LANDING_URL`.
- **SEO parity:** OG/canonical/sitemap/robots/JSON-LD on the new domain, canonical from
  `NEXT_PUBLIC_DOCS_URL` (mirror landing's `metadata` object).

## Technical Approach — Implementation Phases

### Phase 1 — Scaffold the app & prove the toolchain (foundation) ✅ DONE

> **Completed 2026-10-06.** `@matura/docs` builds/lints/typechecks; `/docs` renders themed with nav +
> TOC, `/`→`/docs` redirects, local Orama search returns results, strict CSP/headers present, bundle
> verified wallet/secret-free. **Key learning:** fumadocs-ui/core **15.8.5** (last Next-15 line) +
> fumadocs-mdx **11.10.0** have a Source-interface impedance mismatch — core's `loader` wants
> `source.files` as an eager array, mdx's `createMDXSource` returns a lazy function → "files.map is
> not a function". Fix in `lib/source.ts`: rich type from `createMDXSource`, eager array runtime from
> `resolveFiles({ docs, meta })`. Also: `declaration:false` in the docs tsconfig (base sets it on,
> which trips TS2742 on the generated `.source`); `next.config.ts` (not `.mjs`, so Node globals lint
> cleanly). Candidate for a `docs/solutions/` writeup in Phase 4.

- Create `apps/docs` with the landing-derived config (`package.json`, `next.config.mjs` w/
  `createMDX()`, `postcss.config.mjs`, `tsconfig.json`, `eslint.config.js`, `Dockerfile`).
- Install the **pinned** fumadocs trio + `gray-matter`, `rehype-slug`, `rehype-mermaid` (build-time).
- Wire Fumadocs: `lib/source.ts`, `source.config.ts` (two collections: authored `content/docs` MDX +
  mirrored `content/docs/reference` plain-Markdown), `mdx-components`, `app/layout.tsx`
  (`RootProvider` + self-hosted fonts), `app/docs/layout.tsx` (`DocsLayout` + page tree),
  `app/docs/[[...slug]]/page.tsx` (catch-all + `generateStaticParams` + themed 404), static Orama
  search route/client.
- **Deliverable / success:** `pnpm --filter @matura/docs dev` serves a themed "Hello docs" at :3003;
  `pnpm --filter @matura/docs build && lint && typecheck` pass; bundle grep (no wallet/chain) passes.

### Phase 2 — Content pipeline (the risky core) ✅ DONE

> **Completed 2026-10-06.** `scripts/sync-reference-docs.mjs` mirrors the 6-file Lane A allowlist into
> gitignored `content/docs/reference/` as MDX-safe `.md` with injected frontmatter, stripped H1, a
> GitHub source-link note, Mermaid→committed-SVG swaps, and a link checker (proven to catch dangling
> anchors). Wired as `prebuild`/`predev`; Dockerfile now `COPY docs` + the chain manifest so it runs
> in-image. Build/lint/typecheck green; all 6 reference pages SSG + searchable; diagrams load via
> `next/image` under the strict CSP. Resolved C1 (allowlist+forbidden-path+git-ignore), C2 (`.md`
> format tolerates `{`/`<`), C3 (frontmatter+H1), I3 (link checker), I4 (static SVG).

- Write `scripts/sync-reference-docs.mjs` with all five requirements (allowlist+disjoint assert,
  frontmatter+H1 dedup, plain-Markdown mode, Mermaid→SVG, link checker). Wire as `prebuild`/`predev`.
- Review each allowlisted source doc for public-suitability; finalize the Lane A set.
- **Deliverable / success:** build mirrors the allowlisted docs with zero MDX-parse errors (incl.
  `architecture.md` Mermaid as SVG, `routing.md`, `threat-model.md`); link checker green; a glob or a
  gitignored path in the allowlist **fails the build**.

### Phase 3 — Authored content (Lane B) + generated Contracts

- Write the authored MDX for all six sections' reader-facing pages (Overview, Concepts, API reference
  from the controller table, per-contract pages, Trust/Proof narrative, Demo runbook). Draw FROM
  `architecture.md`, `routing.md`, `threat-model.md`, `decisions.md`, `demo-script.md`, root
  `README.md`, `packages/contracts/*.sol` + its README, and `@matura/shared` enums/branded types
  (glossary).
- Generate the deployed-addresses table from `97.json` (fs, build-time).
- "What it looks like": capture fresh screenshots of the running app (`/request`, `/account`,
  `/activity`, `/vaults`, `/issuer`) into `apps/docs/public/screens/`.
- Define `meta.json` for all six sections (fixed order).
- **Deliverable / success:** all six sections navigable with real content; search returns results;
  contrast check passes (no mint-on-light text token).

### Phase 4 — Deploy, CI, cross-link, verify

- Add `@matura/docs check:bundle` (parameterized scanner) to CI; add `NEXT_PUBLIC_DOCS_URL` to
  `turbo.json`.
- Remove landing's `/docs` redirect; add the Docs nav/footer link + `DOCS_URL` to landing.
- Build & run the standalone Docker image locally (`node apps/docs/server.js` on :3003); confirm
  **search works in the container**, static assets load, CSP headers present.
- Deploy to EasyPanel at `docs.usematura.xyz`; smoke the live site.
- **Deliverable / success:** all acceptance criteria below green; live site reachable; landing links to
  it; CI (build→lint→typecheck→test→bundle-grep) passes.

## Alternative Approaches Considered

| Approach                                             | Why rejected                                                                                                                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mirror comacard exactly (custom Next + `marked`)** | Re-implements search/TOC/sidebar/nav by hand; the monorepo is already Next 15 + Tailwind v4, so Fumadocs slots in natively. (Chosen in brainstorm.)                                                |
| **Nextra**                                           | More opinionated theming; harder to match Matura's `@matura/ui` tokens cleanly.                                                                                                                    |
| **Fumadocs `16.x` (latest)**                         | Requires Next 16 + React 19.2 + Zod 4; monorepo is Next 15. Deferred to a future upgrade.                                                                                                          |
| **Sibling `../docs` as a fumadocs `dir`**            | Complicates Turborepo caching + Docker file-tracing; `dir` is one path, not a glob. Build-time copy into `content/docs` is more robust.                                                            |
| **Import `@matura/chain` for addresses**             | Pulls chain code into the bundle → trips the wallet-free guard. Read `97.json` via `fs` at build instead.                                                                                          |
| **Static Orama index (vs server route) for Phase 1** | Deferred — the initial crash was a loader impedance bug, not static-vs-server. Server-mode local Orama ships now; static index revisited in Phase 4 if the server index is heavy under standalone. |
| **Commit generated content + freshness gate**        | More moving parts; gitignore + always-regenerate makes drift impossible with less machinery.                                                                                                       |

## Acceptance Criteria

### Content pipeline

- [x] Prebuild copies **only** an explicit allowlist; build **fails** if it would touch any
      gitignored / `reviews/` / `brainstorms/` / `plans/` / `code-review.md` / `*-runbook.md` path.
      _(Phase 2.)_
- [x] Every mirrored file gets injected `title` (+ `description`) and its leading `# H1` is stripped;
      build **fails** on a file with no H1. _(Phase 2.)_
- [x] `pnpm --filter @matura/docs build` compiles **every** mirrored + authored page with zero
      MDX-parse errors (verified on `architecture.md`, `routing.md`, `threat-model.md`). _(Phase 2 — `.md`
      `format:'md'` tolerates raw `{`/`<`.)_
- [x] `architecture.md`'s Mermaid (2 diagrams) renders as **static SVG** (`public/diagrams/` via
      `next/image`); **no `unsafe-eval`** added to CSP. _(Phase 2.)_
- [x] Build-time link-checker passes: zero dangling in-page anchors, zero broken relative links.
      _(Phase 2 — proven to have teeth via a negative test.)_

### Freshness / addresses

- [ ] Contracts page generated from `packages/chain/src/deployments/97.json` at build; changing an
      address + rebuilding changes the table with no hand edits. `31337.json` not surfaced.
- [x] Generated content (`content/docs/reference/**`, contracts page) is **gitignored** and
      regenerated on every build (no committed generated content; no gate needed). _(Phase 2 — reference
      mirror gitignored + `prebuild`/`predev` hooks; Dockerfile `COPY docs` so the prebuild runs in-image.)_

### Security / boundaries

- [ ] `@matura/docs` bundle grep (same FORBIDDEN set as landing) passes against `apps/docs/.next/static`
      in CI; docs imports **no** `@matura/chain`/wallet code.
- [x] Docs ships landing's security headers/CSP **verbatim**; fonts load under `font-src 'self' data:`
      (self-hosted `next/font`); search works under the strict CSP. _(Phase 1 — verified via `next start`.)_
- [ ] Docs standalone Docker image serves on **:3003**, boots with `node apps/docs/server.js`, and
      **search returns results in the container** (not just dev).
- [x] Docs makes **no** runtime API/chain calls; `connect-src 'self'`; no SIWE/CORS; no API dependency. _(Phase 1.)_

### Brand / accessibility

- [ ] Contrast review confirms **no Fumadocs text token resolves to Liquid-Mint-on-light**;
      `--color-fd-primary` = Midnight on light, mint only on dark/filled — verified in both themes.

### IA / navigation / SEO

- [ ] `meta.json` fixes the six-section order; unknown slug renders the **themed 404**; deep-links to
      headings resolve; TOC renders on every page.
- [ ] OG/canonical/sitemap/robots/JSON-LD present; canonical uses `NEXT_PUBLIC_DOCS_URL`.

### Cross-linking / env

- [ ] Landing's `/docs → /` redirect removed; cross-origin **Docs** link added to landing nav+footer;
      landing bundle guard still green.
- [ ] `NEXT_PUBLIC_DOCS_URL` added to `turbo.json build.env` and to both Dockerfiles' ARG/ENV.

## Success Metrics

- All six sections reachable and searchable; a judge can go from landing → docs → verified testnet
  address on BSCScan in < 3 clicks.
- Zero stale addresses possible (generated from manifest).
- CI green end-to-end including the docs bundle grep; live at `docs.usematura.xyz`.

## Dependencies & Prerequisites

- Pinned `fumadocs-ui@15.8.5`, `fumadocs-core@15.8.5`, matching `fumadocs-mdx`; `gray-matter`,
  `rehype-slug`, `rehype-mermaid` (+ its headless-browser build dep — budget for it, or pre-commit the
  single SVG).
- `@matura/ui` tokens + `CONTRAST.md` (brand/a11y source of truth).
- `packages/chain/src/deployments/97.json` (addresses source).
- Node 24 toolchain; EasyPanel project + `docs.usematura.xyz` DNS.

## Risk Analysis & Mitigation

| Risk                                                          | Severity | Mitigation                                                                                   |
| ------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| **Glob leaks internal/gitignored docs to a public site** (C1) | High     | Hardcoded allowlist + disjoint-from-gitignore assertion; per-file public-suitability review. |
| **MDX parse failure on raw `{`/`<` in prose** (C2)            | High     | Mirrored docs compiled as plain Markdown (no MDX JSX/expr); compile smoke over every file.   |
| Copied-vs-adapted ambiguity → mid-build rework (I1)           | Med      | Two explicit lanes (verbatim-mirror vs authored); decision table in plan.                    |
| Mint → `--color-fd-primary` ships AA regression (I7)          | Med      | Midnight on light, mint on dark/filled; contrast check in acceptance.                        |
| Search empty in Docker (I6)                                   | Med      | Static Orama index; Docker smoke that queries search.                                        |
| Fumadocs `prose` vs `@matura/ui` typography double-register   | Low      | Single typography plugin / `className` workaround.                                           |
| rehype-mermaid headless-browser build weight                  | Low      | Pre-commit the one SVG instead if build cost is too high.                                    |

## Non-Goals (scope-creep guards)

1. No OpenAPI generation / interactive API playground — API ref hand-authored from controllers.
2. No versioned docs, no i18n.
3. No runtime API/chain calls from docs — static, wallet-free.
4. No blind sync of all `docs/` — curated allowlist only.
5. No committed generated content (unless a freshness gate is later added).
6. No local/local-chain (31337) addresses — testnet (97) only.
7. No Mermaid interactivity — static SVG only.
8. No Fumadocs `16.x` / Next 16 upgrade in this effort.
9. Not re-documenting internal process dirs (`brainstorms/`, `plans/`, `reviews/`, `solutions/`).

## Documentation Plan

- Update `CLAUDE.md`: add `apps/docs` to the app list, its `dev`/`build` commands (port 3003), and the
  prebuild/content-lane model.
- Update `docs/architecture.md` component map to include `apps/docs`.
- Add a short `apps/docs/README.md` (content lanes, prebuild, how to add a page, deploy).
- Record a `docs/solutions/` entry if the content pipeline surfaces reusable gotchas (MDX plain-mode,
  Mermaid-SVG under CSP, static search in Docker).

## References & Research

### Internal (copy-ready sources)

- `apps/landing/next.config.ts` — CSP/security headers, standalone, `transpilePackages`,
  `outputFileTracingRoot`, the stale `/docs` redirect to remove.
- `apps/landing/postcss.config.mjs`, `apps/landing/tsconfig.json`, `apps/landing/eslint.config.js`
  (wallet-free `no-restricted-imports`), `apps/landing/package.json` (scripts/deps), `apps/landing/Dockerfile`.
- `apps/landing/src/app/globals.css` (`@import "@matura/ui/globals.css"` + `@source`),
  `apps/landing/src/app/layout.tsx` (font wiring + metadata/JSON-LD),
  `apps/landing/src/lib/site.ts` (`envUrl`, URL exports, `NAV_LINKS`, `GITHUB_DOCS`),
  `apps/landing/src/components/site-nav.tsx`, `site-footer.tsx`.
- `apps/api/src/main.ts` (Swagger dev-only at `/docs`, global prefix `api`, URI versioning v1) + the
  controller table (§API reference).
- `turbo.json` (`tasks.build.env` allowlist), `.nvmrc` (`24`), root `package.json` engines.
- `apps/e2e/scripts/check-landing-bundle.mjs` + `lib/scan-bundle.mjs` (bundle guard to parameterize).
- `packages/ui/CONTRAST.md` (Liquid-Mint AA constraint), `packages/ui/src/styles/globals.css`
  (`@theme` tokens), `packages/chain/src/deployments/97.json` (addresses).
- Source docs (Lane A candidates): `docs/architecture.md` (Mermaid), `docs/routing.md`,
  `docs/threat-model.md`, `docs/decisions.md`, `docs/test-report.md`, `docs/gas-report.md`,
  `docs/demo-script.md`, `docs/deployment.md`.
- Learnings: `docs/solutions/integration-issues/next15-wallet-frontend-siwe-eip712-e2e.md`,
  `docs/solutions/deployment-issues/bsc-testnet-live-deploy-easypanel.md`,
  `docs/solutions/build-errors/hardhat3-viem-node24-toolchain.md`.
- Brainstorm: `docs/brainstorms/2026-10-06-docs-website-brainstorm.md`.

### External (Fumadocs, year-2026 current, cite in code comments)

- Manual install (Next.js): https://www.fumadocs.dev/docs/manual-installation/next
- MDX / getting started: https://www.fumadocs.dev/docs/mdx · Collections: https://www.fumadocs.dev/docs/mdx/collections
- Themes (Tailwind v4, `--color-fd-*`): https://www.fumadocs.dev/docs/ui/theme
- Orama search: https://www.fumadocs.dev/docs/headless/search/orama · Static build: https://www.fumadocs.dev/docs/deploying/static
- Deploying: https://www.fumadocs.dev/docs/deploying · Docker discussion: https://github.com/fuma-nama/fumadocs/discussions/1133
- Version peers: https://www.npmjs.com/package/fumadocs-ui · https://www.npmjs.com/package/fumadocs-mdx
- Reference site: https://docs.comacard.xyz/ · https://github.com/comacard/comacard/tree/main/apps/docs

### AI-era notes

- Research done via parallel agents (repo-research, learnings, framework-docs, spec-flow) on
  2026-10-06. Human review required on: the Lane A public-suitability decision per file (C1), the final
  `--color-fd-*` → token mapping against `CONTRAST.md` (I7), and the plain-Markdown vs sanitize choice
  for mirrored docs (C2).
