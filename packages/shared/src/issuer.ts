import { z } from "zod";
import { EvmAddress } from "./address.js";

/**
 * An on-chain claim issuer (employer / payer) as projected off-chain. `.strict()`
 * rejects unknown keys at the API boundary.
 */
export const Issuer = z
  .object({
    address: EvmAddress,
    signer: EvmAddress,
    name: z.string().min(1),
    active: z.boolean(),
  })
  .strict();

/** A validated issuer record. */
export type Issuer = z.infer<typeof Issuer>;
