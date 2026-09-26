import type { ClaimType } from "@matura/shared";

/**
 * Display labels for claim types, co-located and keyed on the shared `ClaimType` enum so a
 * new claim type fails compilation until both audiences get copy. Two audiences intentionally
 * differ: the Account view speaks to the beneficiary; the issuer simulator to the operator.
 */
export const CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  PAYROLL: "Earned salary",
  FREELANCE_ESCROW: "Approved freelance payout",
  STREAM: "Onchain stream",
};

export const ISSUER_CLAIM_TYPE_LABEL: Record<ClaimType, string> = {
  PAYROLL: "Payroll claim",
  FREELANCE_ESCROW: "Freelance payout",
  STREAM: "Stream claim",
};
