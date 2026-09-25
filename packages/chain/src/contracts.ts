import type { AddressBook } from "./addresses.js";
import {
  mockUSDTAbi,
  issuerRegistryAbi,
  claimRegistryAbi,
  vaultRegistryAbi,
  maturaRouterAbi,
  settlementManagerAbi,
  liquidityVaultAbi,
  sourceObligorAbi,
} from "./abis/index.js";

/**
 * ABI for each `AddressBook` slot, keyed identically to the address book so a consumer can wire a
 * viem contract as `{ address: book[k], abi: contractAbis[k] }` without hand-reconciling names.
 *
 * `satisfies Record<keyof AddressBook, ...>` makes this a COMPILE-TIME alignment check: adding an
 * `AddressBook` slot without a matching ABI (or vice versa) fails typecheck.
 */
export const contractAbis = {
  mockUsdt: mockUSDTAbi,
  issuerRegistry: issuerRegistryAbi,
  claimRegistry: claimRegistryAbi,
  vaultRegistry: vaultRegistryAbi,
  router: maturaRouterAbi,
  settlementManager: settlementManagerAbi,
} as const satisfies Record<keyof AddressBook, readonly unknown[]>;

/**
 * LiquidityVault ABI. Not an `AddressBook` slot — vaults are enumerated on-chain via
 * `VaultRegistry.getVaults()`, so their addresses are discovered at runtime, not from the manifest.
 */
export const vaultAbi = liquidityVaultAbi;

/**
 * SourceObligor ABI. Not an `AddressBook` slot either — obligor addresses live in the manifest's
 * `sources` map (`getSources`), so this is exposed as a convenience binding alongside `vaultAbi`.
 */
export const sourceAbi = sourceObligorAbi;
