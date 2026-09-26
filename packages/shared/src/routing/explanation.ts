import { z } from "zod";
import { ClaimId } from "../ids.js";
import { NormalizedAddress } from "../address.js";
import { BaseUnitAmount } from "../money.js";

/**
 * A deterministic, machine-derived explanation of a route decision — built from
 * the selected numbers only (never prose/LLM text), so identical inputs yield an
 * identical explanation. `steps` narrates the greedy allocation order.
 */
export const ExplanationStep = z
  .object({
    claimId: ClaimId,
    vault: NormalizedAddress,
    /** Face drawn from this leg. */
    faceAmount: BaseUnitAmount,
    /** Advance contributed by this leg. */
    advanceAmount: BaseUnitAmount,
    /** Size-independent discount rate applied. */
    rateBps: z.number().int(),
  })
  .strict();

export type ExplanationStep = z.infer<typeof ExplanationStep>;

export const Explanation = z
  .object({
    /** Which selection path ran: the optimal bounded exact search, or the greedy fallback. */
    strategy: z.enum(["bounded-exact", "greedy-degraded"]),
    /** Allocation steps in the order the optimizer selected them. */
    steps: z.array(ExplanationStep),
    /** Number of eligible candidates considered. */
    candidatesConsidered: z.number().int().min(0),
    /** targetAdvance the route was solving for. */
    targetAdvance: BaseUnitAmount,
    /** Advance actually assembled (≥ targetAdvance when executable). */
    achievedAdvance: BaseUnitAmount,
  })
  .strict();

/** A validated deterministic explanation. */
export type Explanation = z.infer<typeof Explanation>;
