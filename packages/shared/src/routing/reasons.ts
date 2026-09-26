import { z } from "zod";
import { ClaimId } from "../ids.js";
import { NormalizedAddress } from "../address.js";

/**
 * Ordered, single source of truth for rejection reasons. When several reasons
 * apply to one candidate, the earliest in this array wins (see {@link rank}), so
 * the reported reason is deterministic. Hard-constraint reasons (mandate / chain
 * state) precede economic ones (dominated / cap).
 */
export const REASON_PRECEDENCE = [
  "NOT_OWNED_BY_WALLET",
  "CLAIM_NOT_FINANCEABLE",
  "UNSUPPORTED_CLAIM_TYPE",
  "ISSUER_INACTIVE",
  "VAULT_INACTIVE",
  "TOKEN_MISMATCH",
  "EXCEEDS_DURATION",
  "BELOW_MIN_LOT",
  "ABOVE_MAX_LOT",
  "NO_SLICES_REMAINING",
  "MANDATE_REJECTED",
  "INSUFFICIENT_LIQUIDITY",
  "QUOTE_EXPIRED",
  "MAX_COST_EXCEEDED",
  "MAX_LEGS_REACHED",
  "HIGHER_MARGINAL_COST",
  "TARGET_UNSATISFIABLE",
  "NO_ELIGIBLE_CANDIDATES",
  "ROUTER_PAUSED",
] as const;

/** Zod enum for rejection reasons (value). Use `RejectionReason` for the union. */
export const RejectionReason = z.enum(REASON_PRECEDENCE);

/** The rejection-reason union, inferred from the ordered source-of-truth array. */
export type RejectionReason = z.infer<typeof RejectionReason>;

/**
 * Precedence rank of a reason (lower = higher priority). Derived from
 * `REASON_PRECEDENCE` so the enum and the ordering can never drift.
 */
export function rank(reason: RejectionReason): number {
  return REASON_PRECEDENCE.indexOf(reason);
}

/** A machine-readable rejected alternative: an eligible-but-unused candidate. */
export const RejectedAlternative = z
  .object({
    claimId: ClaimId,
    vault: NormalizedAddress,
    reason: RejectionReason,
  })
  .strict();

/** A validated rejected alternative. */
export type RejectedAlternative = z.infer<typeof RejectedAlternative>;
