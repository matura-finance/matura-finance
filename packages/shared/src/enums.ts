import { z } from "zod";

/**
 * Ordered, single source of truth for the claim-type enum. Solidity `uint8`
 * ordinals, the Zod enum, and the Prisma enum all derive from this order — the
 * enum-parity test in `apps/api` asserts they stay in sync.
 */
export const CLAIM_TYPES = ["PAYROLL", "FREELANCE_ESCROW", "STREAM"] as const;

/** Zod enum for claim types (value). Use `ClaimType` (type) for the union. */
export const ClaimType = z.enum(CLAIM_TYPES);

/** The claim-type union, inferred from the Zod enum (no hand-written union). */
export type ClaimType = z.infer<typeof ClaimType>;

/**
 * Ordered, single source of truth for the on-chain claim lifecycle states. The
 * order is the canonical Solidity ordinal order — do not reorder.
 */
export const CLAIM_STATES = [
  "ATTESTED",
  "ELIGIBLE",
  "PARTIALLY_FUNDED",
  "FUNDED",
  "MATURED",
  "PAID",
  "DELAYED",
  "DISPUTED",
  "DEFAULTED",
  "REJECTED",
  "REVOKED",
] as const;

/** Zod enum for claim states (value). Use `ClaimState` (type) for the union. */
export const ClaimState = z.enum(CLAIM_STATES);

/** The claim-state union, inferred from the Zod enum (no hand-written union). */
export type ClaimState = z.infer<typeof ClaimState>;
