# @matura/docs

The Matura documentation site (`docs.usematura.xyz`) — a **Fumadocs** (Next.js 15) app, static and
wallet-free, themed to the Matura brand via `@matura/ui`. Dev port **3003**.

> Framework is pinned to the **Next-15-compatible Fumadocs line** (`fumadocs-ui@15.8.5`,
> `fumadocs-core@15.8.5`, `fumadocs-mdx@11.10.0`). Do **not** `pnpm add fumadocs-ui` unpinned — it
> resolves to the 16.x line, which requires Next 16. See `lib/source.ts` for the one version-impedance
> shim this pairing needs.

## Commands

```bash
pnpm --filter @matura/docs dev        # next dev -p 3003 (runs the prebuild first)
pnpm --filter @matura/docs build      # next build (runs the prebuild first)
pnpm --filter @matura/docs lint
pnpm --filter @matura/docs typecheck
pnpm --filter @matura/docs sync-reference   # regenerate the Reference + contracts pages only
```

## Content model — two lanes

**Lane A — generated, gitignored.** `scripts/sync-reference-docs.mjs` runs as a `prebuild`/`predev`
step and generates two things, both **gitignored and regenerated every build** (so they can never
drift at deploy):

- `content/docs/reference/**` — an explicit **allowlist** of repo `docs/*.md` (architecture, routing,
  threat-model, decisions, test-report, gas-report), mirrored as MDX-safe `.md` with injected
  frontmatter, stripped leading H1, Mermaid fences swapped for committed SVGs
  (`public/diagrams/`), and a build-time link check. Edit the **source** docs in the repo root, not
  these pages.
- `content/docs/contracts/deployed-addresses.md` — generated from
  `packages/chain/src/deployments/97.json` via Node `fs` (never imports `@matura/chain`, so the bundle
  stays wallet-free). Changing an address in the manifest + rebuilding updates the table.

**Lane B — authored, committed.** Everything else under `content/docs/**` is hand-written MDX for an
external audience (Overview, Concepts, Contracts, API & Integration, Trust & Security, Operations &
Demo). Nav order is set by the `meta.json` in each folder.

## Adding a page

1. Create `content/docs/<section>/<page>.mdx` with `title` + `description` frontmatter.
2. Add its slug to that section's `meta.json` `pages` array (controls order).
3. Cross-link with absolute `/docs/...` paths. Run `pnpm --filter @matura/docs build` — the
   internal-link audit and MDX compile will catch mistakes.

To add a new **Lane A** mirror, append to the `ALLOWLIST` in `scripts/sync-reference-docs.mjs` (the
file must be tracked + secret-free; the script refuses gitignored/forbidden paths). If it contains
Mermaid, pre-render each diagram to `public/diagrams/` and map it in the allowlist entry's `mermaid`
array (order matters).

## Deploy

EasyPanel + Docker, same pattern as `apps/landing` (standalone output, strict CSP, non-root runner).
Build context = repo root, Dockerfile = `apps/docs/Dockerfile`, domain `docs.usematura.xyz`. The
Dockerfile `COPY`s the repo `docs/` + chain manifest so the prebuild runs in-image. Bake
`NEXT_PUBLIC_DOCS_URL` (+ `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_LANDING_URL`) as build args. The docs
bundle must pass the wallet-free guard: `node apps/e2e/scripts/check-docs-bundle.mjs` (wired into
`pnpm --filter @matura/e2e check:bundle`). Full procedure: `docs/deployment.md`.
