import { z } from "zod";

/**
 * A viem-style EVM address: `0x` followed by 40 hex characters. Case is
 * preserved (EIP-55 checksums are validated at the `@matura/shared` boundary,
 * not here — this package deals in raw viem addresses).
 */
const evmAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");

/**
 * Zod schema for the set of Matura contract addresses on a single chain.
 * This is the shape stored per chain id in the deployment manifest.
 */
export const AddressBook = z.object({
  mockUsdt: evmAddress,
  issuerRegistry: evmAddress,
  claimRegistry: evmAddress,
  vaultRegistry: evmAddress,
  router: evmAddress,
  settlementManager: evmAddress,
});

/** The resolved set of contract addresses for one chain. */
export type AddressBook = z.infer<typeof AddressBook>;

/** The EVM zero address, used as the placeholder before contracts are deployed. */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * Default address book with every contract pointing at the zero address.
 * Used to seed the deployment manifest for a chain whose contracts have not
 * been deployed yet.
 */
export const zeroAddressBook: AddressBook = {
  mockUsdt: ZERO_ADDRESS,
  issuerRegistry: ZERO_ADDRESS,
  claimRegistry: ZERO_ADDRESS,
  vaultRegistry: ZERO_ADDRESS,
  router: ZERO_ADDRESS,
  settlementManager: ZERO_ADDRESS,
};
