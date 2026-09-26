import type { z } from "zod";

import type {
  ClaimProjection,
  RouteExecution,
  RouteLegProjection,
  SettlementProjection,
} from "../generated/prisma/client";
import type { ClaimSchema, ExecutionLegSchema, ExecutionSchema, SettlementSchema } from "./dto";

type ClaimShape = z.infer<typeof ClaimSchema>;
type SettlementShape = z.infer<typeof SettlementSchema>;
type LegShape = z.infer<typeof ExecutionLegSchema>;
type ExecutionShape = z.infer<typeof ExecutionSchema>;

/** Map a projected claim row to the read DTO shape (dates → ISO, bigints omitted). */
export function mapClaim(row: ClaimProjection, pending?: boolean): ClaimShape {
  return {
    claimId: row.claimId,
    beneficiary: row.beneficiary,
    issuer: row.issuer,
    claimType: row.claimType,
    token: row.token,
    faceValue: row.faceValue,
    financedFaceValue: row.financedFaceValue,
    dueAt: row.dueAt.toISOString(),
    state: row.state,
    ...(pending === true ? { pending: true } : {}),
  };
}

export function mapSettlement(row: SettlementProjection): SettlementShape {
  return {
    claimId: row.claimId,
    amountReceived: row.amountReceived,
    vaultDistribution: row.vaultDistribution,
    userResidual: row.userResidual,
    protocolFee: row.protocolFee,
  };
}

export function mapExecution(
  row: RouteExecution & { legs: RouteLegProjection[] },
  finalizedThrough: string,
): ExecutionShape {
  const legs: LegShape[] = row.legs.map((leg) => ({
    claimId: leg.claimId,
    vault: leg.vault,
    faceAmount: leg.faceAmount,
    advanceAmount: leg.advanceAmount,
    discountAmount: leg.discountAmount,
  }));
  return {
    executionId: row.executionId,
    user: row.user,
    targetAdvance: row.targetAdvance,
    totalAdvance: row.totalAdvance,
    totalFaceAssigned: row.totalFaceAssigned,
    totalCost: row.totalCost,
    status: row.status,
    legs,
    finalizedThrough,
  };
}
