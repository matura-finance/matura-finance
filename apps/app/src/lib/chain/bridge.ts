import { getAddress, type Address, type Hex } from "viem";

/**
 * The single place branded `@matura/shared` values and raw manifest strings are
 * widened to viem's `Address`/`Hex`/`bigint` types. Keeping every brand-strip here
 * means no `as any`/`as Hex` scatter across the app, and the coercions are testable.
 *
 * - Money (`BaseUnitAmount`, or any base-unit integer string) → `bigint` via `BigInt`.
 *   NB: this is NOT `toBaseUnits` — API money is ALREADY base units; `toBaseUnits`
 *   (human ×10^decimals) would double-scale.
 * - Manifest addresses are plain `string` → `Address` via viem `getAddress` (checksums
 *   + narrows, no cast).
 * - `bytes32` ids (`ClaimId`, executionId) → `Hex` via a template literal (produces
 *   `0x${string}` with no cast).
 */

/** Widen a base-unit integer string to `bigint`. Throws on a non-integer string. */
export function toBigInt(baseUnits: string): bigint {
  return BigInt(baseUnits);
}

/** Checksum + narrow a raw address string (e.g. a manifest slot) to viem `Address`. */
export function toAddress(value: string): Address {
  return getAddress(value);
}

/** Narrow a `0x`-prefixed bytes32 string (claimId / executionId) to viem `Hex`.
 *  Template literal produces `0x${string}` — no cast needed. Throws if not 32 bytes,
 *  so a malformed id fails here rather than deep inside viem. */
export function toHex32(value: string): Hex {
  const body = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-fA-F]{64}$/.test(body)) {
    throw new Error(`Expected a 32-byte hex value, got "${value}"`);
  }
  return `0x${body}`;
}

/** Normalize arbitrary-length hex calldata to `0x`-prefixed `Hex` (no length assertion —
 *  use this for transaction `data`, not for bytes32 ids). */
export function toHexData(value: string): Hex {
  return `0x${value.startsWith("0x") ? value.slice(2) : value}`;
}
