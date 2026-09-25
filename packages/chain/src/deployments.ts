import { BSC_TESTNET_CHAIN_ID } from "./chains.js";
import { zeroAddressBook, type AddressBook } from "./addresses.js";

/**
 * Canonical source of truth for deployed Matura contract addresses, keyed by
 * chain id. Populated from deployment output post-deploy; seeded here with the
 * zero address book for BSC Testnet so the shape exists before any deploy.
 *
 * Addresses live ONLY here — env holds RPC endpoints and secrets, never
 * addresses (avoids two-sources drift).
 */
export const deployments: Record<number, AddressBook> = {
  [BSC_TESTNET_CHAIN_ID]: zeroAddressBook,
};

/**
 * Resolve the address book for a chain id, throwing a typed error if the chain
 * has no entry in the manifest.
 */
export function getDeployment(chainId: number): AddressBook {
  const addressBook = deployments[chainId];
  if (addressBook === undefined) {
    throw new Error(`No deployment found for chain id ${String(chainId)}`);
  }
  return addressBook;
}
