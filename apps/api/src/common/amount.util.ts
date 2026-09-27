import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Zod schema for a non-negative uint256 as a decimal string (base units). The
 * bound `refine` is guarded by the same digit test as the `regex`: Zod does not
 * short-circuit a failed prior check, so an unguarded `BigInt("1.5")` here would
 * throw a raw `SyntaxError` out of `safeParse` (→ a 500, not a clean 400) for any
 * malformed money value at the HTTP boundary. When the string isn't digits the
 * `regex` already reports it and the bound check is skipped.
 */
export const Uint256StringSchema = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer string")
  .refine((value) => !/^\d+$/.test(value) || BigInt(value) <= MAX_UINT256, {
    error: "exceeds uint256 max",
  });

/** Parse a uint256 base-unit string to bigint, or throw 400. */
export function parseUint256(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new BadRequestException(`Invalid ${label}: expected a non-negative integer string`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_UINT256) {
    throw new BadRequestException(`Invalid ${label}: exceeds uint256 max`);
  }
  return parsed;
}

/** Parse an ISO-8601 datetime to on-chain unix seconds (bigint), or throw 400. */
export function isoToUnix(value: string, label: string): bigint {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new BadRequestException(`Invalid ${label}: expected an ISO-8601 datetime`);
  }
  return BigInt(Math.floor(ms / 1000));
}

/** Ceil-division fee: ceil(faceValue * feeBps / 10000). */
export function ceilFee(faceValue: bigint, feeBps: number): bigint {
  const numerator = faceValue * BigInt(feeBps);
  return (numerator + 9999n) / 10_000n;
}
