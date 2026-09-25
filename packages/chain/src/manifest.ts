import { z } from "zod";

import { AddressBook, evmAddress, ZERO_ADDRESS, zeroAddressBook } from "./addresses.js";

/**
 * The two named vaults deployed by the protocol. These are a labeling
 * convenience only — on-chain the authoritative vault set is enumerated via
 * `VaultRegistry.getVaults()`. They are NOT `AddressBook` slots (which stay at
 * exactly 6 entries to preserve the `contracts.ts` ABI-parity invariant).
 */
export const NamedVaults = z.object({
  stableVault: evmAddress,
  flexVault: evmAddress,
});

/** The resolved addresses of the two named vaults for one chain. */
export type NamedVaults = z.infer<typeof NamedVaults>;

/**
 * The three self-paying source-simulator obligors deployed alongside the
 * protocol. Like `namedVaults`, these are labeling conveniences, not
 * `AddressBook` slots.
 */
export const Sources = z.object({
  payroll: evmAddress,
  freelance: evmAddress,
  stream: evmAddress,
});

/** The resolved addresses of the three source obligors for one chain. */
export type Sources = z.infer<typeof Sources>;

/**
 * The full deployment manifest for a single chain: the machine-written,
 * Zod-validated artifact that replaces the old hand-edited address record.
 * Serialized as JSON per chain in `src/deployments/<chainId>.json` and codegen'd
 * into the typed `src/deployments.generated.ts` consumed at runtime.
 *
 * `deploymentBlock` is a decimal string (bigint-safe; the on-chain value is a
 * `uint256` block number). `abiBuildId` is advisory — an identifier for the ABI
 * bundle the manifest was produced against — and stays a plain string: it is
 * NEVER refined, so a stale id never fails the build (it is warned about, not
 * enforced).
 */
export const DeploymentManifest = z.object({
  chainId: z.number().int(),
  deploymentBlock: z.string().regex(/^\d+$/),
  abiBuildId: z.string(),
  addresses: AddressBook,
  namedVaults: NamedVaults,
  sources: Sources,
});

/** A fully-validated deployment manifest for one chain. */
export type DeploymentManifest = z.infer<typeof DeploymentManifest>;

/**
 * Build the zero-seed manifest for a chain: every address is `ZERO_ADDRESS`,
 * `deploymentBlock` is `"0"`, and `abiBuildId` is empty. This is the committed
 * placeholder shape for a chain whose contracts have not been deployed yet, so
 * the JSON source, codegen, and loader all have a valid manifest to work with
 * before any deploy.
 */
export function zeroManifest(chainId: number): DeploymentManifest {
  return {
    chainId,
    deploymentBlock: "0",
    abiBuildId: "",
    addresses: zeroAddressBook,
    namedVaults: {
      stableVault: ZERO_ADDRESS,
      flexVault: ZERO_ADDRESS,
    },
    sources: {
      payroll: ZERO_ADDRESS,
      freelance: ZERO_ADDRESS,
      stream: ZERO_ADDRESS,
    },
  };
}
