import { z } from "zod";

/** Maximum value of a Solidity `uint256` (2^256 - 1). */
export const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * `MAX_UINT256` is a 78-digit decimal. Reject anything longer *before* calling
 * `BigInt()` so a pathological input can't force an unbounded bigint allocation.
 */
const MAX_UINT256_DIGITS = 78;

/**
 * A non-negative integer amount in a token's smallest base unit, carried as a
 * decimal string across API boundaries (never a float — exact on-chain match,
 * zero float risk). Branded so a raw string can't stand in for a validated
 * amount. `.brand()` is applied last, after all validation.
 */
export const BaseUnitAmount = z
  .string()
  .regex(/^\d+$/, "must be a non-negative integer string")
  .max(MAX_UINT256_DIGITS, "exceeds uint256 range")
  // Guard the BigInt() conversion: Zod v4 still runs this refinement even when
  // the regex/max checks above failed, so skip the numeric bound for input that
  // isn't a plain digit string (it has already been rejected).
  .refine((value) => !/^\d+$/.test(value) || BigInt(value) <= MAX_UINT256, "exceeds uint256")
  .brand<"BaseUnitAmount">();

/** A validated, branded base-unit amount. */
export type BaseUnitAmount = z.infer<typeof BaseUnitAmount>;

/** Parse and brand a decimal base-unit string, throwing on invalid input. */
export function makeBaseUnitAmount(value: string): BaseUnitAmount {
  return BaseUnitAmount.parse(value);
}
