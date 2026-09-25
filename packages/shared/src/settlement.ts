import { z } from "zod";
import { BaseUnitAmount } from "./money.js";
import { ClaimId } from "./ids.js";

/**
 * The post-settlement distribution of a matured claim's received funds. The
 * received amount must equal the sum of the three payout components (BigInt
 * comparison, never float).
 */
export const SettlementReceipt = z
  .object({
    claimId: ClaimId,
    amountReceived: BaseUnitAmount,
    vaultDistribution: BaseUnitAmount,
    userResidual: BaseUnitAmount,
    protocolFee: BaseUnitAmount,
  })
  .strict()
  .refine(
    (receipt) =>
      BigInt(receipt.amountReceived) ===
      BigInt(receipt.vaultDistribution) +
        BigInt(receipt.userResidual) +
        BigInt(receipt.protocolFee),
    {
      message: "amountReceived must equal vaultDistribution + userResidual + protocolFee",
      path: ["amountReceived"],
    },
  );

/** A validated settlement receipt. */
export type SettlementReceipt = z.infer<typeof SettlementReceipt>;
