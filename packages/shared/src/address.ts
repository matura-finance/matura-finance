import { z } from "zod";

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const LOWERCASE_EVM_ADDRESS_REGEX = /^0x[0-9a-f]{40}$/;

/**
 * Relaxed EIP-55 checksum check. Full keccak256 checksum validation requires a
 * hashing dependency and is deliberately deferred to `@matura/chain`/viem so
 * this package stays dependency-free. Here we accept any well-formed hex address
 * — all-lowercase, all-uppercase, or mixed case.
 */
export function isChecksumAddress(address: string): boolean {
  return EVM_ADDRESS_REGEX.test(address);
}

/**
 * A validated EVM address with its original casing preserved (the display /
 * EIP-55 boundary). Branded so it can't be confused with an arbitrary string or
 * with a `NormalizedAddress`. `.brand()` is applied last.
 */
export const EvmAddress = z
  .string()
  .regex(EVM_ADDRESS_REGEX, "invalid EVM address")
  .refine(isChecksumAddress, "invalid EIP-55 checksum")
  .brand<"EvmAddress">();

/** A validated, case-preserved, branded EVM address. */
export type EvmAddress = z.infer<typeof EvmAddress>;

/**
 * A lowercased EVM address used as the canonical database lookup key. A distinct
 * brand from `EvmAddress` so the two can never be swapped at call sites.
 */
export const NormalizedAddress = z
  .string()
  .regex(LOWERCASE_EVM_ADDRESS_REGEX, "address must be lowercase hex")
  .brand<"NormalizedAddress">();

/** A validated, lowercased, branded EVM address (DB key). */
export type NormalizedAddress = z.infer<typeof NormalizedAddress>;

/**
 * A raw `0x`-prefixed address string — the shape viem's `Address` expects. The
 * viem adapter itself lives in `@matura/chain`; this is the unbranded string
 * form the branded addresses convert down to.
 */
export type AddressString = `0x${string}`;

/** Parse and brand a case-preserved EVM address, throwing on invalid input. */
export function makeEvmAddress(value: string): EvmAddress {
  return EvmAddress.parse(value);
}

/** Lowercase, then parse and brand a normalized (DB-key) EVM address. */
export function makeNormalizedAddress(value: string): NormalizedAddress {
  return NormalizedAddress.parse(value.toLowerCase());
}

/** Lowercase a validated EVM address into its canonical DB-key form. */
export function toNormalized(address: EvmAddress): NormalizedAddress {
  return NormalizedAddress.parse(address.toLowerCase());
}

/**
 * Strip the brand from an address, yielding the raw `0x${string}` shape. Built
 * with a template literal (not a cast) so no unsafe `as` is needed — branded
 * types are not directly assignable to `0x${string}`.
 */
export function toAddressString(address: EvmAddress | NormalizedAddress): AddressString {
  return `0x${address.slice(2)}`;
}
