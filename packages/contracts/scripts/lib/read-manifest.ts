import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DeploymentManifestData } from "./manifest-types.js";

/// Directory where the committed per-chain manifests live in `@matura/chain` (reached by relative
/// fs path — contracts never imports `@matura/chain`).
const DEPLOYMENTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../chain/src/deployments",
);

export function manifestPath(chainId: number): string {
  return join(DEPLOYMENTS_DIR, `${String(chainId)}.json`);
}

/// Read a committed manifest by chain id, or `undefined` if the file is absent. The file is our
/// own generated artifact (Zod-validated chain-side on load); a light chainId cross-check guards a
/// mis-keyed file. Callers must still `getCode`-probe the addresses before trusting them on-chain.
export function readManifest(chainId: number): DeploymentManifestData | undefined {
  const path = manifestPath(chainId);
  if (!existsSync(path)) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const manifest = parsed as DeploymentManifestData;
  if (manifest.chainId !== chainId) {
    throw new Error(
      `Manifest ${path} is mis-keyed: file is ${String(chainId)}.json but chainId is ` +
        `${String(manifest.chainId)}.`,
    );
  }
  return manifest;
}
