import { z } from "zod";
import { EvmAddress } from "./address.js";
import { BaseUnitAmount } from "./money.js";
import { ClaimId } from "./ids.js";
import { ClaimType, ClaimState } from "./enums.js";

/**
 * A financeable claim (payroll / freelance escrow / stream) with its funding
 * state. State-coupled invariants are enforced via `.refine` using BigInt
 * comparisons on the decimal base-unit strings (never float):
 *
 * - `financedFaceValue <= faceValue` (always);
 * - `FUNDED` ⇒ `financedFaceValue == faceValue`;
 * - `PARTIALLY_FUNDED` ⇒ `0 < financedFaceValue < faceValue`.
 */
export const Claim = z
  .object({
    claimId: ClaimId,
    beneficiary: EvmAddress,
    issuer: EvmAddress,
    claimType: ClaimType,
    token: EvmAddress,
    faceValue: BaseUnitAmount,
    financedFaceValue: BaseUnitAmount,
    dueAt: z.iso.datetime(),
    state: ClaimState,
  })
  .strict()
  .refine((claim) => BigInt(claim.financedFaceValue) <= BigInt(claim.faceValue), {
    message: "financedFaceValue must not exceed faceValue",
    path: ["financedFaceValue"],
  })
  .refine(
    (claim) =>
      claim.state !== "FUNDED" || BigInt(claim.financedFaceValue) === BigInt(claim.faceValue),
    {
      message: "FUNDED claims must be fully financed (financedFaceValue == faceValue)",
      path: ["financedFaceValue"],
    },
  )
  .refine(
    (claim) => {
      if (claim.state !== "PARTIALLY_FUNDED") {
        return true;
      }
      const financed = BigInt(claim.financedFaceValue);
      return financed > 0n && financed < BigInt(claim.faceValue);
    },
    {
      message: "PARTIALLY_FUNDED claims require 0 < financedFaceValue < faceValue",
      path: ["financedFaceValue"],
    },
  );

/** A validated claim. */
export type Claim = z.infer<typeof Claim>;
