import { defineConfig } from "tsup";

/**
 * `@matura/shared` is BUILT (not JIT) because the CommonJS `apps/api` `require()`s
 * it at runtime and cannot load a raw ESM `.ts` file. tsup emits dual ESM + CJS
 * bundles plus type declarations.
 *
 * The `outExtension` override forces the ESM output to `.mjs` (its `.d.ts` stays
 * `index.d.ts`) and the CJS output to `.cjs`, matching the `exports` map in
 * package.json exactly. Without it, tsup's default for a `"type": "module"`
 * package would emit the ESM bundle as `index.js`.
 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
