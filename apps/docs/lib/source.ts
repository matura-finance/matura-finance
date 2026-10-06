import { docs, meta } from "@/.source";
import { loader } from "fumadocs-core/source";
import { createMDXSource, resolveFiles } from "fumadocs-mdx";

// fumadocs-mdx@11.10.0 ↔ fumadocs-core@15.8.5 impedance mismatch (core is pinned by
// fumadocs-ui@15.8.5, the last Next-15 line):
//   • core's `loader` consumes `source.files` as an eager ARRAY (it iterates it immediately).
//   • mdx's `createMDXSource` returns `files` as a lazy FUNCTION at runtime (the newer Source
//     shape) — which core can't consume ("files.map is not a function") — even though its declared
//     return type (Source<…>) still types `files` as the rich array.
// So we take the RICH TYPE from createMDXSource and the EAGER ARRAY runtime from resolveFiles.
// Revisit when the app moves to Next 16 + Fumadocs 16.x (where this is one call).
type RichFiles = ReturnType<
  typeof createMDXSource<(typeof docs)[number], (typeof meta)[number]>
>["files"];

export const source = loader({
  baseUrl: "/docs",
  source: {
    files: resolveFiles({ docs, meta }) as RichFiles,
  },
});
