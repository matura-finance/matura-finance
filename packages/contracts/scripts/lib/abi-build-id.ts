import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/// Path to the generated ABI directory in `@matura/chain` (written by `scripts/export-abis.ts`).
/// Reached by relative fs path — contracts never imports `@matura/chain` as a module.
const ABIS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../chain/src/abis");

/// Deterministic identifier for the ABI set shipped in `@matura/chain`: sha256 over the sorted
/// exported ABI file names + contents. Recorded in the manifest so a consumer can detect
/// address/ABI skew. Advisory only (a mismatch is a warning, never fatal — addresses stay valid).
export function computeAbiBuildId(): string {
  const files = readdirSync(ABIS_DIR)
    .filter((name) => name.endsWith(".ts"))
    .sort();
  const hash = createHash("sha256");
  for (const name of files) {
    hash.update(name);
    hash.update("\0");
    hash.update(readFileSync(join(ABIS_DIR, name)));
  }
  return `sha256:${hash.digest("hex")}`;
}
