import { z } from "zod";

/**
 * Environment schema. `NODE_ENV` is a required enum (Swagger fails closed on
 * anything but an explicit non-production value). `ISSUER_PRIVATE_KEY` is the
 * top-tier EIP-712 signer secret — validated to a 32-byte hex key or empty.
 */
const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  DATABASE_URL: z.url(),
  API_CORS_ORIGINS: z.string().default(""),
  ISSUER_PRIVATE_KEY: z
    .string()
    .regex(/^$|^0x[0-9a-fA-F]{64}$/)
    .default(""),

  // Chain — the API/indexer read authoritative state from this chain + RPC.
  // Contract addresses are NEVER in env; they come from @matura/chain manifests.
  CHAIN_ID: z.coerce.number().int().positive().default(31337),
  RPC_URL: z.url().default("http://127.0.0.1:8545"),

  // Indexer — frontier is the `finalized` block tag when CONFIRMATIONS=0,
  // else (head - CONFIRMATIONS) for RPCs without the tag.
  INDEXER_CONFIRMATIONS: z.coerce.number().int().min(0).default(0),
  INDEXER_MAX_BLOCK_RANGE: z.coerce.number().int().positive().default(1000),
  INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(4000),

  // Health readiness — cursor is stale if it hasn't advanced within STALE_MS or
  // trails the finalized head by more than MAX_LAG_BLOCKS.
  CURSOR_STALE_MS: z.coerce.number().int().positive().default(30_000),
  CURSOR_MAX_LAG_BLOCKS: z.coerce.number().int().positive().default(200),

  // SIWE auth. JWT_SECRET must be a high-entropy CSPRNG value (min 32 chars).
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  SIWE_DOMAIN: z.string().min(1).default("localhost:3000"),
  SIWE_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(300),

  // Issuer demo signing — server signs attestations with ISSUER_PRIVATE_KEY. NOT z.coerce.boolean
  // ("false" would coerce to true). Hard-rejected in production by the refine below.
  DEMO_ISSUER_SIGNING_ENABLED: z.stringbool().default(false),
});

/**
 * Full env schema: the object + a cross-field guard. Demo issuer signing may ONLY be enabled
 * outside production and requires a configured signer key — fail-closed (§B1). Extend
 * `BaseEnvSchema` (not this) if you ever need `.shape`/`.extend`, then re-apply the refine.
 */
export const EnvSchema = BaseEnvSchema.refine(
  (env) =>
    !env.DEMO_ISSUER_SIGNING_ENABLED ||
    (env.NODE_ENV !== "production" && env.ISSUER_PRIVATE_KEY !== ""),
  {
    error:
      "DEMO_ISSUER_SIGNING_ENABLED requires NODE_ENV!=production and a non-empty ISSUER_PRIVATE_KEY",
    path: ["DEMO_ISSUER_SIGNING_ENABLED"],
  },
);

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
