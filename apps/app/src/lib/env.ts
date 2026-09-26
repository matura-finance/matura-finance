import { z } from "zod";

/**
 * Typed, validated public environment. Only `NEXT_PUBLIC_*` values ever reach the
 * browser (secret env is lint-banned in this app). Next inlines these literals at
 * build time; we validate once here so the rest of the app never `!`-asserts or
 * reads `process.env` directly. Every var read here is declared in `turbo.json`.
 */
const EnvSchema = z.object({
  apiUrl: z.url(),
  chainId: z.coerce.number().int().positive(),
  appUrl: z.url(),
  landingUrl: z.url(),
  rpcUrl: z.url().optional(),
});

export type PublicEnv = z.infer<typeof EnvSchema>;

export const env: PublicEnv = EnvSchema.parse({
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1",
  chainId: process.env.NEXT_PUBLIC_CHAIN_ID ?? "97",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002",
  landingUrl: process.env.NEXT_PUBLIC_LANDING_URL ?? "http://localhost:3001",
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
});
