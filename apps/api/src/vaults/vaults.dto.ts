import { ClaimType } from "@matura/shared";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";

export const VaultSummarySchema = z.object({
  address: z.string(),
  supportedTypes: z.array(ClaimType),
  baseDiscountBps: z.number(),
  durationBpsPerDay: z.number(),
  maxDurationDays: z.number(),
  minFace: z.string(),
  maxFace: z.string(),
  liquidityCap: z.string(),
  fundableLiquidity: z.string(),
});

export const VaultsResponseSchema = z.object({
  vaults: z.array(VaultSummarySchema),
  finalizedThrough: z.string(),
});
export class VaultsResponseDto extends createZodDto(VaultsResponseSchema) {}
