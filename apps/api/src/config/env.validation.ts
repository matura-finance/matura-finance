import { z } from "zod";

/**
 * Environment schema. `NODE_ENV` is a required enum (Swagger fails closed on
 * anything but an explicit non-production value). `ISSUER_PRIVATE_KEY` is the
 * top-tier EIP-712 signer secret — validated to a 32-byte hex key or empty.
 */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.url(),
  API_CORS_ORIGINS: z.string().default(""),
  ISSUER_PRIVATE_KEY: z
    .string()
    .regex(/^$|^0x[0-9a-fA-F]{64}$/)
    .default(""),
});

/** Validated, coerced environment. */
export type Env = z.infer<typeof EnvSchema>;

/**
 * `ConfigModule.forRoot({ validate })` hook. Throws with a human-readable
 * report (via `z.prettifyError`) on any invalid variable so the process
 * fails fast at boot rather than surfacing an obscure runtime error later.
 */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
