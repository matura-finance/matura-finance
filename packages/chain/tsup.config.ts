import { defineConfig } from "tsup";

/**
 * Dual ESM+CJS build with per-subpath entrypoints. `apps/api` is CommonJS (nest build →
 * tsc CJS) and cannot consume this package's raw ESM `.ts` sources, so we emit `.cjs`/`.mjs`
 * + `.d.ts` exactly like `@matura/shared`. Multi-entry preserves the 8 public subpaths.
 *
 * ABIs are exported `as const`; `dts: true` runs the TS declaration emitter which preserves
 * those literal tuple types into the `.d.ts`, so viem inference (and `decodeFunctionData`
 * struct typing) survives across the package boundary.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    chains: "src/chains.ts",
    units: "src/units.ts",
    clients: "src/clients.ts",
    deployments: "src/deployments.ts",
    addresses: "src/addresses.ts",
    abis: "src/abis/index.ts",
    contracts: "src/contracts.ts",
    eip712: "src/eip712.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  outExtension({ format }) {
    return { js: format === "esm" ? ".mjs" : ".cjs" };
  },
});
