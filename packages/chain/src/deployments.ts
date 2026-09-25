import { ZERO_ADDRESS, type AddressBook } from "./addresses.js";
import { MANIFESTS } from "./deployments.generated.js";
import type { DeploymentManifest, NamedVaults, Sources } from "./manifest.js";

/**
 * Canonical source of truth for deployed Matura contracts, keyed by chain id.
 * Loaded from the generated, Zod-validated `deployments.generated.ts` (itself
 * codegen'd from the committed `src/deployments/<chainId>.json` manifests — see
 * `scripts/gen-deployments.ts` and `docs/deployment-runbook.md`). A chain with no
 * deploy yet ships a zero-seed manifest so the shape exists before any deploy.
 *
 * Addresses live ONLY here (via the manifests) — env holds RPC endpoints and
 * secrets, never addresses (avoids two-sources drift).
 */

/**
 * The generated manifest map, widened to an index signature so it can be looked
 * up by an arbitrary runtime `chainId` (the `as const` literal type only permits
 * its known keys). `noUncheckedIndexedAccess` keeps the result `| undefined`.
 */
const manifests: Record<number, DeploymentManifest> = MANIFESTS;

/**
 * Resolve the full deployment manifest for a chain id. Throws if the chain has no
 * manifest, or if a manifest is mis-keyed (its `chainId` field disagrees with the
 * map key it was stored under) — a guard against a hand-corrupted generated file.
 */
export function getManifest(chainId: number): DeploymentManifest {
  const manifest: DeploymentManifest | undefined = manifests[chainId];
  if (manifest === undefined) {
    throw new Error(`No deployment manifest found for chain id ${String(chainId)}`);
  }
  if (manifest.chainId !== chainId) {
    throw new Error(
      `Deployment manifest for chain id ${String(chainId)} is mis-keyed ` +
        `(manifest.chainId is ${String(manifest.chainId)})`,
    );
  }
  return manifest;
}

/** True when every contract in the chain's address book has a non-zero address. */
export function isDeployed(chainId: number): boolean {
  const manifest: DeploymentManifest | undefined = manifests[chainId];
  if (manifest === undefined) {
    return false;
  }
  return Object.values(manifest.addresses).every((address) => address !== ZERO_ADDRESS);
}

/**
 * Resolve the address book for a chain id. Throws a typed error if the chain has
 * no manifest, or if the manifest is still the all-zero seed (not yet deployed) —
 * so a missing deploy fails fast instead of silently returning zero addresses.
 */
export function getDeployment(chainId: number): AddressBook {
  const manifest = getManifest(chainId);
  if (!isDeployed(chainId)) {
    throw new Error(
      `Contracts not yet deployed for chain id ${String(chainId)} (address book is zero-seeded)`,
    );
  }
  return manifest.addresses;
}

/**
 * Resolve the two named vaults for a chain id. Unlike `getDeployment`, this does
 * not enforce the deployed-check — on-chain the authoritative vault set is
 * `VaultRegistry.getVaults()`; these are a labeling convenience.
 */
export function getNamedVaults(chainId: number): NamedVaults {
  return getManifest(chainId).namedVaults;
}

/** Resolve the three source-obligor addresses for a chain id. */
export function getSources(chainId: number): Sources {
  return getManifest(chainId).sources;
}

/**
 * Resolve the block at which the protocol was deployed, as a `bigint`. The
 * manifest stores it as a `^\d+$` decimal string, so this single `BigInt(...)`
 * call site never throws.
 */
export function getDeploymentBlock(chainId: number): bigint {
  return BigInt(getManifest(chainId).deploymentBlock);
}
