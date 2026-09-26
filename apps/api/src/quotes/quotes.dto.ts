import { ClaimType } from "@matura/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

import { Uint256StringSchema } from "../common/amount.util";

// Quotes is a public read-style endpoint (not a write-prepare), so its DTOs live here rather
// than in the write-preparation envelope module.

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "expected an address");

export const QuotePreviewSchema = z.object({
  issuer: AddressSchema,
  claimType: ClaimType,
  faceValue: Uint256StringSchema,
  dueAt: z.iso.datetime(),
});
export class QuotePreviewDto extends createZodDto(QuotePreviewSchema) {}

export const QuotesResponseSchema = z.object({
  quotes: z.array(
    z.object({
      vault: z.string(),
      ok: z.boolean(),
      advanceAmount: z.string(),
      discountAmount: z.string(),
    }),
  ),
  finalizedThrough: z.string(),
});
export class QuotesResponseDto extends createZodDto(QuotesResponseSchema) {}
