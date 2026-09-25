import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getAddress, type Address } from "viem";
import type { DeploymentManifestData } from "./manifest-types.js";
import { ZERO_ADDRESS } from "./constants.js";

/// Directory where the committed per-chain manifests live in `@matura/chain` (reached by relative
/// fs path — `@matura/contracts` never imports `@matura/chain`, so this coupling is a path string,
/// not a module edge). If `@matura/chain` relocates `src/deployments`, this asserts loudly.
const DEPLOYMENTS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../chain/src/deployments",
);
if (!existsSync(DEPLOYMENTS_DIR)) {
  throw new Error(
    `Expected @matura/chain deployments dir at ${DEPLOYMENTS_DIR} (cross-package fs coupling — ` +
      "update this path if @matura/chain moved src/deployments).",
  );
}

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ADDRESS_KEYS = [
  "mockUsdt",
  "issuerRegistry",
  "claimRegistry",
  "vaultRegistry",
  "router",
  "settlementManager",
] as const;
const NAMED_VAULT_KEYS = ["stableVault", "flexVault"] as const;
const SOURCE_KEYS = ["payroll", "freelance", "stream"] as const;

export function manifestPath(chainId: number): string {
  return join(DEPLOYMENTS_DIR, `${String(chainId)}.json`);
}

/// Structurally validate a parsed manifest (the contracts package has no `zod`, so this is a
/// hand-rolled shape guard — the authoritative Zod validation runs chain-side in `gen-deployments`).
/// Throws on any missing/mistyped field or malformed address so a truncated or hand-edited manifest
/// fails fast here rather than as an opaque `getContractAt(..., undefined)` deep in a run.
function assertValidManifest(
  parsed: unknown,
  chainId: number,
  path: string,
): DeploymentManifestData {
  const fail = (why: string): never => {
    throw new Error(`Invalid manifest ${path}: ${why}`);
  };
  if (typeof parsed !== "object" || parsed === null) return fail("not an object");
  const m = parsed as Record<string, unknown>;
  if (m.chainId !== chainId)
    return fail(`mis-keyed (file is ${String(chainId)}.json, chainId is ${String(m.chainId)})`);
  if (typeof m.deploymentBlock !== "string" || !/^\d+$/.test(m.deploymentBlock)) {
    return fail("deploymentBlock must be a decimal string");
  }
  if (typeof m.abiBuildId !== "string") return fail("abiBuildId must be a string");
  const group = (value: unknown, keys: readonly string[], label: string): void => {
    if (typeof value !== "object" || value === null) fail(`${label} missing`);
    const obj = value as Record<string, unknown>;
    for (const key of keys) {
      const addr = obj[key];
      if (typeof addr !== "string" || !ADDRESS_RE.test(addr))
        fail(`${label}.${key} is not an address`);
    }
  };
  group(m.addresses, ADDRESS_KEYS, "addresses");
  group(m.namedVaults, NAMED_VAULT_KEYS, "namedVaults");
  group(m.sources, SOURCE_KEYS, "sources");
  return parsed as DeploymentManifestData;
}

/// Read + structurally validate a committed manifest by chain id, or `undefined` if the file is
/// absent (i.e. no deploy has written it yet).
export function readManifest(chainId: number): DeploymentManifestData | undefined {
  const path = manifestPath(chainId);
  if (!existsSync(path)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return assertValidManifest(parsed, chainId, path);
}

/// Every deployed address in the manifest — the 6 core slots + both named vaults + all 3 sources —
/// checksum-normalized. Use this for a complete `getCode` liveness probe (not just the 6 core slots).
export function manifestAddresses(manifest: DeploymentManifestData): Address[] {
  return [
    ...ADDRESS_KEYS.map((k) => getAddress(manifest.addresses[k])),
    ...NAMED_VAULT_KEYS.map((k) => getAddress(manifest.namedVaults[k])),
    ...SOURCE_KEYS.map((k) => getAddress(manifest.sources[k])),
  ];
}

/// True when every address slot (core + named vaults + sources) is non-zero — a full deploy, not a
/// zero-seed placeholder or a partial deploy.
export function isManifestDeployed(manifest: DeploymentManifestData): boolean {
  return manifestAddresses(manifest).every(
    (address) => getAddress(address) !== getAddress(ZERO_ADDRESS),
  );
}
