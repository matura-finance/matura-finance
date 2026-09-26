import { OptimizeResult, RejectionReason } from "@matura/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { Uint256StringSchema } from "../common/amount.util";
import { PrepareResponseSchema } from "../common/prepare.dto";

/** DoS bound: reject oversized requests BEFORE any chain read (H2). */
export const MAX_CLAIM_IDS = 20;
/** Ceiling for the client-requested on-chain route validity. */
export const MAX_ROUTE_DEADLINE_SECONDS = 3600;

const Bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected bytes32");

// ---- POST /routes/optimize ----

export const OptimizeRequestSchema = z.object({
  claimIds: z.array(Bytes32Schema).min(1).max(MAX_CLAIM_IDS),
  targetAdvance: Uint256StringSchema,
  maxTotalFace: Uint256StringSchema.optional(),
  maxTotalCost: Uint256StringSchema.optional(),
  routeDeadlineSeconds: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_ROUTE_DEADLINE_SECONDS)
    .optional(),
});
export class OptimizeRequestDto extends createZodDto(OptimizeRequestSchema) {}

export const OptimizeResponseSchema = z.object({
  chainId: z.number(),
  /** The pinned finalized block every read in this request used. */
  blockNumber: z.string(),
  finalizedThrough: z.string(),
  /** Present (with `expiresAt`) only when the route is executable. */
  routeId: z.string().nullable(),
  expiresAt: z.string().nullable(),
  /**
   * The optimizer result. Advance/cost figures are estimate-at-`blockNumber`; the
   * authoritative re-quote + mirror happens at prepare-execution.
   */
  result: OptimizeResult,
  /**
   * Candidates filtered out by hard constraints at collection (with reasons). Plain strings.
   * `vault` is null for claim-level rejections (no specific vault applies — e.g. not owned,
   * or the router is paused).
   */
  filteredOut: z.array(
    z
      .object({ claimId: z.string(), vault: z.string().nullable(), reason: RejectionReason })
      .strict(),
  ),
});
export class OptimizeResponseDto extends createZodDto(OptimizeResponseSchema) {}

export type OptimizeResponse = z.infer<typeof OptimizeResponseSchema>;

// ---- POST /routes/:routeId/prepare-execution ----
// Reuses the uniform prepare envelope (typed-data ExecutionRoute step).
export class PrepareExecutionResponseDto extends createZodDto(PrepareResponseSchema) {}
