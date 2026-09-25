import { z } from "zod";
import { EvmAddress } from "./address.js";
import { BaseUnitAmount } from "./money.js";

/**
 * A liquidity-vault summary surfaced to the app / API. Monetary values are
 * base-unit decimal strings; `discountRateBps` is basis points (0–10000).
 */
export const VaultSummary = z
  .object({
    vault: EvmAddress,
    token: EvmAddress,
    chainId: z.number().int().positive(),
    totalAssets: BaseUnitAmount,
    availableLiquidity: BaseUnitAmount,
    discountRateBps: z.number().int().min(0).max(10_000),
  })
  .strict();

/** A validated vault summary. */
export type VaultSummary = z.infer<typeof VaultSummary>;
