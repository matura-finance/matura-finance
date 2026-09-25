import { BSC_TESTNET_CHAIN_ID } from "./chains.js";
import { zeroAddressBook, ZERO_ADDRESS, type AddressBook } from "./addresses.js";

/**
 * Canonical source of truth for deployed Matura contract addresses, keyed by
 * chain id. Populated from Ignition output post-deploy (see
 * `docs/deployment-runbook.md`); seeded here with the zero address book for BSC
 * Testnet so the shape exists before any deploy.
 *
 * Addresses live ONLY here — env holds RPC endpoints and secrets, never
 * addresses (avoids two-sources drift).
 */
export const deployments: Record<number, AddressBook> = {
  [BSC_TESTNET_CHAIN_ID]: zeroAddressBook,
};

/** True when every contract in the chain's address book has a non-zero address. */
export function isDeployed(chainId: number): boolean {
  const addressBook = deployments[chainId];
  if (addressBook === undefined) {
    return false;
  }
  return Object.values(addressBook).every((address) => address !== ZERO_ADDRESS);
}

/**
 * Resolve the address book for a chain id. Throws a typed error if the chain has
 * no entry, or if the entry is still the all-zero seed (not yet deployed) — so a
 * missing deploy fails fast instead of silently returning zero addresses.
 */
export function getDeployment(chainId: number): AddressBook {
  const addressBook = deployments[chainId];
  if (addressBook === undefined) {
    throw new Error(`No deployment found for chain id ${String(chainId)}`);
  }
  if (!isDeployed(chainId)) {
    throw new Error(
      `Contracts not yet deployed for chain id ${String(chainId)} (address book is zero-seeded)`,
    );
  }
  return addressBook;
}
