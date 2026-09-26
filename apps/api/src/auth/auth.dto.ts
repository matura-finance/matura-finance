import { createZodDto } from "nestjs-zod";
import { z } from "zod";

// SIWE auth DTOs. Plain Zod at the HTTP boundary so OpenAPI renders cleanly.

export const NonceResponseSchema = z.object({
  nonce: z.string(),
  domain: z.string(),
  chainId: z.number(),
});
export class NonceResponseDto extends createZodDto(NonceResponseSchema) {}

export const VerifyRequestSchema = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "expected 0x-hex"),
});
export class VerifyRequestDto extends createZodDto(VerifyRequestSchema) {}

export const SessionResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});
export class SessionResponseDto extends createZodDto(SessionResponseSchema) {}
