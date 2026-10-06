import { defineDocs, defineConfig } from "fumadocs-mdx/config";

// Single docs collection. `content/docs` holds both the hand-authored MDX (Lane B, committed) and
// the build-mirrored reference pages (Lane A, gitignored under content/docs/reference — produced by
// scripts/sync-reference-docs.mjs). Both live under one tree so they share nav, search, and theming.
export const { docs, meta } = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
