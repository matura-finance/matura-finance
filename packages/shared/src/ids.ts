import { z } from "zod";

const CLAIM_ID_REGEX = /^0x[0-9a-fA-F]{64}$/;

/**
 * A bytes32 claim identifier (`0x` + 64 hex characters), branded so it can't be
 * confused with an arbitrary hex string.
 */
export const ClaimId = z
  .string()
  .regex(CLAIM_ID_REGEX, "invalid claim id (expected 0x-prefixed bytes32)")
  .brand<"ClaimId">();

/** A validated, branded bytes32 claim id. */
export type ClaimId = z.infer<typeof ClaimId>;

/** Parse and brand a bytes32 claim id, throwing on invalid input. */
export function makeClaimId(value: string): ClaimId {
  return ClaimId.parse(value);
}
