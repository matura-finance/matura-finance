import { z } from "zod";
import { EvmAddress } from "./address.js";
import { BaseUnitAmount } from "./money.js";
import { ClaimId } from "./ids.js";

/**
 * A signed advance quote binding a user, claim, and vault for a fixed window.
 * `expiry` is an ISO 8601 datetime string; `nonce` is a non-negative integer
 * string. `.strict()` rejects unknown keys at the API boundary.
 */
export const Quote = z
  .object({
    chainId: z.number().int().positive(),
    vault: EvmAddress,
    user: EvmAddress,
    claimId: ClaimId,
    faceAmount: BaseUnitAmount,
    advanceAmount: BaseUnitAmount,
    expiry: z.iso.datetime(),
    nonce: z.string().regex(/^\d+$/, "nonce must be a non-negative integer string"),
  })
  .strict();

/** A validated advance quote. */
export type Quote = z.infer<typeof Quote>;
