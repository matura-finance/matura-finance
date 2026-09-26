import { ClaimState, ClaimType } from "@matura/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// Read-model DTOs. Plain Zod at the HTTP boundary (money/addresses as strings) so OpenAPI
// renders cleanly — the branded @matura/shared schemas are for internal invariants. Enums are
// reused from @matura/shared (single source of ordinals).

export const ClaimSchema = z.object({
  claimId: z.string(),
  beneficiary: z.string(),
  issuer: z.string(),
  claimType: ClaimType,
  token: z.string(),
  faceValue: z.string(),
  financedFaceValue: z.string(),
  dueAt: z.string(),
  state: ClaimState,
  /** True when served via read-through from the chain (not yet in the projection). */
  pending: z.boolean().optional(),
});
export class ClaimDto extends createZodDto(ClaimSchema) {}

export const SettlementSchema = z.object({
  claimId: z.string(),
  amountReceived: z.string(),
  vaultDistribution: z.string(),
  userResidual: z.string(),
  protocolFee: z.string(),
});

export const ClaimDetailSchema = ClaimSchema.extend({
  settlement: SettlementSchema.nullable(),
  finalizedThrough: z.string(),
});
export class ClaimDetailDto extends createZodDto(ClaimDetailSchema) {}

export const PortfolioSchema = z.object({
  wallet: z.string(),
  claims: z.array(ClaimSchema),
  finalizedThrough: z.string(),
});
export class PortfolioDto extends createZodDto(PortfolioSchema) {}

export const ExecutionLegSchema = z.object({
  claimId: z.string(),
  vault: z.string(),
  faceAmount: z.string(),
  advanceAmount: z.string(),
  discountAmount: z.string(),
});

export const ExecutionSchema = z.object({
  executionId: z.string(),
  user: z.string(),
  targetAdvance: z.string().nullable(),
  totalAdvance: z.string(),
  totalFaceAssigned: z.string(),
  totalCost: z.string(),
  status: z.enum(["PENDING", "EXECUTED", "FAILED"]),
  legs: z.array(ExecutionLegSchema),
  finalizedThrough: z.string(),
});
export class ExecutionDto extends createZodDto(ExecutionSchema) {}

export const ActivityEventSchema = z.object({
  kind: z.string(),
  claimId: z.string().nullable(),
  executionId: z.string().nullable(),
  payload: z.unknown(),
  txHash: z.string(),
  blockNumber: z.string(),
  logIndex: z.number(),
});

export const ActivityPageSchema = z.object({
  wallet: z.string(),
  items: z.array(ActivityEventSchema),
  nextCursor: z.string().nullable(),
  finalizedThrough: z.string(),
});
export class ActivityPageDto extends createZodDto(ActivityPageSchema) {}

export const ActivityQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export class ActivityQueryDto extends createZodDto(ActivityQuerySchema) {}
