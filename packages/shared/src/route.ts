import { z } from "zod";
import { EvmAddress } from "./address.js";
import { BaseUnitAmount } from "./money.js";
import { ClaimId } from "./ids.js";

const EXECUTION_ID_REGEX = /^0x[0-9a-fA-F]{64}$/;

/**
 * A single vault leg within a multi-vault execution route. The within-leg
 * invariant `advanceAmount == faceAmount - discountAmount` is enforced with
 * BigInt comparisons (never float).
 */
export const RouteLeg = z
  .object({
    claimId: ClaimId,
    vault: EvmAddress,
    faceAmount: BaseUnitAmount,
    advanceAmount: BaseUnitAmount,
    discountAmount: BaseUnitAmount,
  })
  .strict()
  .refine(
    (leg) => BigInt(leg.advanceAmount) === BigInt(leg.faceAmount) - BigInt(leg.discountAmount),
    {
      message: "advanceAmount must equal faceAmount - discountAmount",
      path: ["advanceAmount"],
    },
  );

/** A validated route leg. */
export type RouteLeg = z.infer<typeof RouteLeg>;

/**
 * A full execution route: an aggregate advance assembled from vault legs. The
 * route totals must equal the sum of the corresponding leg amounts (BigInt
 * comparisons, never float).
 */
export const ExecutionRoute = z
  .object({
    executionId: z
      .string()
      .regex(EXECUTION_ID_REGEX, "invalid execution id (expected 0x-prefixed bytes32)"),
    user: EvmAddress,
    targetAdvance: BaseUnitAmount,
    totalAdvance: BaseUnitAmount,
    totalFaceAssigned: BaseUnitAmount,
    totalCost: BaseUnitAmount,
    legs: z.array(RouteLeg),
  })
  .strict()
  .refine(
    (route) =>
      route.legs.reduce((sum, leg) => sum + BigInt(leg.faceAmount), 0n) ===
      BigInt(route.totalFaceAssigned),
    {
      message: "totalFaceAssigned must equal the sum of leg face amounts",
      path: ["totalFaceAssigned"],
    },
  )
  .refine(
    (route) =>
      route.legs.reduce((sum, leg) => sum + BigInt(leg.advanceAmount), 0n) ===
      BigInt(route.totalAdvance),
    {
      message: "totalAdvance must equal the sum of leg advance amounts",
      path: ["totalAdvance"],
    },
  )
  .refine(
    (route) =>
      route.legs.reduce((sum, leg) => sum + BigInt(leg.discountAmount), 0n) ===
      BigInt(route.totalCost),
    {
      message: "totalCost must equal the sum of leg discount amounts",
      path: ["totalCost"],
    },
  );

/** A validated execution route. */
export type ExecutionRoute = z.infer<typeof ExecutionRoute>;
