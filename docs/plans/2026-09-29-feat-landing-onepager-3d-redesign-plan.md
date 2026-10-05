# Landing redesign — one-pager, 3D "income OS" (Sublevel layout)

**Date:** 2026-09-29
**Scope:** `apps/landing` only. No contract, API, or product-app changes.
**Status:** Plan — awaiting assets + a few decisions (see Open questions).

## Goal

Rebuild the marketing site as a single scrolling page with an immersive Three.js
experience, adapting the **layout** of ThreeUI's _Sublevel Studio_ template
(`https://threeui.com/landing-pages/sublevel-studio-landing-page`) — a monochrome
"tactile operating system." All **content and copy stay ours**, reusing the
already-approved copy from the current landing. Framing: Matura as an
**operating system for your future income.**

Sublevel was chosen over _Kage_ (temple/atmospheric scroll-story): its structured,
systems-like sections (modular cells, service diagnostics, terminal contact) map
cleanly onto real fintech content, whereas Kage has no natural home for
"how financing works," vaults, or metrics.

## Locked decisions

- **Layout source:** Sublevel Studio (layout/section rhythm only; our content).
- **Full 3D:** keep the Three.js experience (not a lightweight CSS adaptation).
- **Real testnet metrics:** the diagnostics section shows live on-chain data, not mockups.
- **One-pager:** all marketing content on `/`; dock nav = in-page anchors, no marketing routes.
- **Keep `/privacy` + `/terms`** as thin standalone routes (footer-linked). `/docs`
  becomes an external GitHub link, not a route.
- **Palette:** template stays monochrome black/white; inject the single existing
  `liquid-mint` accent, consistent with the product app.
- **Boundaries unchanged:** landing stays wallet-free and secret-free; the CI bundle
  grep (`@matura/e2e check:bundle`) must stay green.

## Section map — Sublevel → Matura (single page, top → bottom)

| #   | Sublevel element                | Matura section                                  | Anchor          | Copy source                                 |
| --- | ------------------------------- | ----------------------------------------------- | --------------- | ------------------------------------------- |
| 1   | Nav bar + floating utility dock | Dock nav (anchors) + `Open Matura`              | —               | `NAV_LINKS`                                 |
| 2   | Hero                            | "Liquidity for what you've already earned."     | `#top`          | current hero (verbatim)                     |
| 3   | Modular project cells           | Matura Account — 4 income-stream cells          | `#account`      | `CLAIM_LABELS`                              |
| 4   | (flow)                          | How it works — Verify→Compare→Route→Settle      | `#how-it-works` | `FLOW_STEPS` (from old `/how-it-works`)     |
| 5   | Service diagnostics             | Live protocol status — **real testnet metrics** | `#protocol`     | new + manifest (absorbs old `/protocol`)    |
| 6   | Lab experiments                 | Best-execution router differentiator            | `#execution`    | `EXECUTION_PROOF` + `ExecutionDiagram`      |
| 7   | Team profiles                   | For issuers (value + benefit cells)             | `#issuers`      | `ISSUER_BENEFITS` (from old `/for-issuers`) |
| 8   | Terminal contact close          | Final CTA + testnet disclaimer                  | `#contact`      | current final CTA + safety copy             |

**Dock → anchor map:** How it works `#how-it-works` · Protocol `#protocol` ·
For issuers `#issuers` · Docs → external GitHub · Open Matura → `app.usematura.xyz`.

Old marketing routes (`/how-it-works`, `/protocol`, `/for-issuers`) collapse into
sections above and are deleted. "Why onchain" folds into the `#protocol` header;
"safety/testnet scope" folds into the `#contact` disclaimer.

## Real testnet data (all public, wallet-free, secret-free)

| Source                                            | Data surfaced                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/v1/vaults` (`@Public()`)                | Live vaults + mandates + **fundable liquidity** (Stable Vault, Flex Vault) |
| Manifest `packages/chain/src/deployments/97.json` | 6 core contracts + 2 vaults + 3 sources — all BscScan-verifiable           |
| `deploymentBlock: 133632667`                      | "Live since block" figure                                                  |
| BscScan (`testnet.bscscan.com`)                   | Every address links to on-chain proof                                      |

**Metrics delivery (DECISION — default: live fetch + static fallback):**
The landing is currently 100% static. To show _live_ liquidity the diagnostics
section does one client-side `fetch()` to the public `/api/v1/vaults` (no wallet,
no secret — passes the bundle grep). On fetch failure it degrades gracefully to
manifest addresses + BscScan links (still real, just not live balances). The
manifest is imported at build time via a **build-time constant** (landing cannot
import `@matura/chain`; mirror the `CONTRACTS_DEPLOYED` pattern in `lib/site.ts` —
inject addresses through `NEXT_PUBLIC_*` or a small generated constants file so no
chain code enters the bundle).

## Technical approach

- **Next 15 + static export stays.** The 3D scene is a client component
  (`"use client"` + `dynamic(() => import(...), { ssr: false })`) so Three.js never
  runs at build/SSR and the page shell stays static + SEO-crawlable.
- **Three.js** added as a dependency of `apps/landing` only. Provide a
  `prefers-reduced-motion` + no-WebGL fallback (static hero visual) so content is
  never gated behind the canvas. Reserve canvas layout to avoid CLS.
- **Bundle guard:** confirm `@matura/e2e check:bundle` still passes — Three.js is
  visual-only (no wallet/chain code, no secret _values_). If the grep flags any
  Three.js token, tighten the grep to secret/wallet patterns, not size.
- **Accessibility/SEO:** all copy lives in real DOM (not only inside the canvas);
  the 3D layer is decorative (`aria-hidden`). Preserve existing metadata, OG,
  sitemap, robots, JSON-LD.
- **Palette:** reuse existing tokens (`midnight`, `mist`, `liquid-mint`, vault
  colors) from `@matura/ui`; render the template monochrome with mint as the lone accent.

## File changes (apps/landing)

- `src/app/page.tsx` — rewrite as the 8-section one-pager with anchor ids.
- `src/components/` — new: `hero-scene.tsx` (3D, client-only), `diagnostics.tsx`
  (live metrics fetch + fallback), `dock-nav.tsx` (anchor scroll nav);
  reuse `ExecutionDiagram`, `AllocationBar`, marketing primitives.
- `src/lib/site.ts` — add `API_URL` (public read origin) + manifest address
  constants (build-time inlined); keep `CONTRACTS_DEPLOYED`.
- Delete route dirs: `src/app/how-it-works`, `src/app/protocol`, `src/app/for-issuers`.
- `src/app/docs/page.tsx` — either delete (dock links straight to GitHub) or keep
  as a redirect; **default: delete**, dock → GitHub.
- Keep `src/app/privacy`, `src/app/terms`; update footer links.
- `src/components/site-nav.tsx`, `mobile-nav.tsx`, `site-footer.tsx` — anchors not routes.
- `sitemap.ts` — drop deleted routes, keep `/`, `/privacy`, `/terms`.
- `package.json` — add `three` (+ types).

## Phases

1. **Scaffold one-pager** — flatten routes into anchored sections with existing copy
   (no 3D yet); update nav/footer/sitemap; delete old routes. Ship-able baseline.
2. **Live diagnostics** — wire `GET /api/v1/vaults` + manifest constants + BscScan
   links + graceful fallback.
3. **3D layer** — Sublevel-style scene as client-only canvas with reduced-motion /
   no-WebGL fallback; palette pass to monochrome + mint.
4. **Polish + guards** — CLS/perf, a11y, `check:bundle`, Playwright landing suite,
   OG/metadata, Lighthouse.

## Risks

- **Bundle weight:** Three.js is heavy on a currently-lean site — mitigate with
  dynamic import, code-split, reduced-motion fallback.
- **Static + live fetch tension:** one runtime fetch is a small shift from fully
  static; fallback keeps it robust if the API is down at demo time.
- **Bundle grep false-positive** on Three.js tokens — verify early (phase 1).
- **Demo reliability:** diagnostics must not blank out if the API lags — fallback
  to manifest is mandatory.

## Open questions / assets needed

1. **Logo** — SVG, light + dark variants. _(blocking phase 3 polish)_
2. **Section 6** — issuers (default) vs a real team section (needs names/roles/photos)?
3. **Metrics** — confirm live-fetch + fallback (default) vs addresses-only static.
4. **3D art direction** — adapt Sublevel's default scene recolored to our palette
   (default), or a specific concept?
5. **OG/share image** — new direction, or keep current?
