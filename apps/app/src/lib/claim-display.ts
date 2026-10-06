import type { ClaimState, ClaimType } from "@matura/shared";
import type { BadgeProps } from "@matura/ui/components/badge";

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

/**
 * Human label + badge tone per on-chain claim state. Keyed on the shared `ClaimState` enum so a
 * new state fails compilation until copy is added. `MATURED`/`DELAYED` are the issuer's actionable
 * states (settle / delay), so they read as warning/destructive.
 */
export const CLAIM_STATE_DISPLAY: Record<
  ClaimState,
  { label: string; tone: BadgeProps["variant"] }
> = {
  ATTESTED: { label: "Awaiting review", tone: "secondary" },
  ELIGIBLE: { label: "Eligible to finance", tone: "secondary" },
  PARTIALLY_FUNDED: { label: "Partially financed", tone: "secondary" },
  FUNDED: { label: "Financed", tone: "default" },
  MATURED: { label: "Matured", tone: "warning" },
  PAID: { label: "Settled", tone: "success" },
  DELAYED: { label: "Delayed", tone: "destructive" },
  DISPUTED: { label: "Disputed", tone: "destructive" },
  DEFAULTED: { label: "Defaulted", tone: "destructive" },
  REJECTED: { label: "Rejected", tone: "outline" },
  REVOKED: { label: "Revoked", tone: "outline" },
};

/** A claim is settleable (repay financiers) when it has matured or is marked delayed. */
export function isSettleable(state: ClaimState): boolean {
  return state === "MATURED" || state === "DELAYED";
}

/** A claim can be marked delayed only from the matured state (mirrors ClaimRegistry.markDelayed). */
export function isDelayable(state: ClaimState): boolean {
  return state === "MATURED";
}
