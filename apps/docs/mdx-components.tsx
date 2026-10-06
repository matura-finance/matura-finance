import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

/**
 * MDX component map. Spread Fumadocs' defaults, then allow per-call overrides (e.g. a
 * `createRelativeLink`-bound anchor in the catch-all page). Custom Matura components can be added
 * here later; they render with the app's Tailwind.
 */
export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...components,
  };
}
