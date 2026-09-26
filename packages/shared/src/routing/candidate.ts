import { z } from "zod";
import { ClaimId } from "../ids.js";
import { NormalizedAddress } from "../address.js";
import { BaseUnitAmount } from "../money.js";
import { ClaimType } from "../enums.js";

/**
 * One eligible financing option: a `(claim, vault)` pair that passed the
 * collector's hard-constraint checks (mandate type/duration, issuer + vault
 * active, `quoteAndCheck.ok`). All money is a decimal base-unit string; the
 * `vault` is a lowercased `NormalizedAddress` so per-vault liquidity aggregation
 * and canonical route hashing key on a stable form. Scalars are branded; the
 * object itself is not (branding an object adds friction without safety).
 *
 * `rateBps` is the size-independent discount rate recovered from a probe quote
 * (`discount * 10000 / face`). `maxFace` is already `min(mandate.maxFace,
 * remainingFace)`. `vaultFundable` is the vault's `fundableLiquidity()` snapshot
 * (settlement units), shared across every leg on that vault.
 */
export const RouteCandidate = z
  .object({
    claimId: ClaimId,
    vault: NormalizedAddress,
    claimType: ClaimType,
    /** Due date as Unix seconds (decimal string); drives the maturity tie-break. */
    dueDate: z.string().regex(/^\d+$/, "dueDate must be a Unix-seconds string"),
    /** faceValue − financedFaceValue. */
    remainingFace: BaseUnitAmount,
    /** Mandate minimum lot; a leg's face must be ≥ this or the vault rejects it. */
    minFace: BaseUnitAmount,
    /** min(mandate.maxFace, remainingFace) — the most this candidate can draw. */
    maxFace: BaseUnitAmount,
    /** fundableLiquidity(vault) snapshot, in settlement (advance) units. */
    vaultFundable: BaseUnitAmount,
    /** Size-independent discount rate in basis points (≤ MAX_DISCOUNT_BPS). */
    rateBps: z.number().int().min(0).max(3000),
    /** MAX_SLICES_PER_CLAIM − sliceCount; a claim with 0 cannot be financed. */
    slicesRemaining: z.number().int().min(0),
  })
  .strict();

/** A validated financing candidate. */
export type RouteCandidate = z.infer<typeof RouteCandidate>;
