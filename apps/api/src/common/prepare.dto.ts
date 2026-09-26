import { ClaimType } from "@matura/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { Uint256StringSchema } from "./amount.util";

// The uniform write-preparation envelope. Every */prepare returns this: an ordered list of
// signable/submittable steps + a human summary. `to`/`verifyingContract`/amounts come ONLY
// from the deployment manifest + server computation, never echoed from the request (§B4).

export const PrepareStepSchema = z.object({
  kind: z.enum(["typed-data", "transaction"]),
  to: z.string(),
  data: z.string().optional(),
  value: z.string().default("0"),
  verifyingContract: z.string().optional(),
  typedData: z
    .unknown()
    .optional()
    .describe("EIP-712 typed data { domain, types, primaryType, message } to sign"),
  expiry: z.string().optional(),
  nonce: z.string().optional(),
  /** The contract function to submit (message + signature) after signing a `typed-data` step. */
  submitFunction: z
    .string()
    .optional()
    .describe("Contract function to call with the signed message + signature (e.g. executeRoute)"),
  /** Present only when the isolated demo issuer signer signed the typed data (dev only). */
  signature: z.string().optional(),
});

export const PrepareResponseSchema = z.object({
  chainId: z.number(),
  steps: z.array(PrepareStepSchema),
  summary: z.string(),
  finalizedThrough: z
    .string()
    .describe("Decimal block number the read projection is complete through"),
});
export class PrepareResponseDto extends createZodDto(PrepareResponseSchema) {}

export type PrepareStep = z.infer<typeof PrepareStepSchema>;
export type PrepareResponse = z.infer<typeof PrepareResponseSchema>;

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected an address");
const Bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "expected bytes32");

// ---- Request DTOs ----

export const AttestationPrepareSchema = z.object({
  claimId: Bytes32Schema,
  beneficiary: AddressSchema,
  token: AddressSchema,
  faceValue: Uint256StringSchema,
  dueAt: z.iso.datetime(),
  claimType: ClaimType,
  externalIdHash: Bytes32Schema.optional(),
  evidenceHash: Bytes32Schema.optional(),
});
export class AttestationPrepareDto extends createZodDto(AttestationPrepareSchema) {}

export const ExecutionLegInputSchema = z.object({
  claimId: Bytes32Schema,
  vault: AddressSchema,
  faceAmount: Uint256StringSchema,
  minimumAdvanceAmount: Uint256StringSchema,
});

export const ExecutionPrepareSchema = z.object({
  legs: z.array(ExecutionLegInputSchema).min(1).max(8),
  targetAdvance: Uint256StringSchema,
  maxTotalFace: Uint256StringSchema.optional(),
  deadlineSeconds: z.coerce.number().int().positive().optional(),
});
export class ExecutionPrepareDto extends createZodDto(ExecutionPrepareSchema) {}

/** Build the uniform prepare envelope. */
export function buildPrepareResponse(
  chainId: number,
  steps: PrepareStep[],
  summary: string,
  finalizedThrough: string,
): PrepareResponse {
  return { chainId, steps, summary, finalizedThrough };
}
