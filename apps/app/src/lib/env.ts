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
  walletConnectProjectId: z.string().min(1),
});

export type PublicEnv = z.infer<typeof EnvSchema>;

/**
 * A Docker build-arg that's declared-but-unset bakes an EMPTY string into the `NEXT_PUBLIC_*`
 * literal — and `??` only falls back on `undefined`, never on `""`, while `z.url()` rejects `""`.
 * Left unguarded, an omitted URL var makes `EnvSchema.parse` throw a ZodError and the app 500s on
 * every render. Treat empty-after-trim as absent so the `??` fallbacks fire and optionals stay
 * undefined. (`||` is banned here by `@typescript-eslint/prefer-nullish-coalescing`.)
 */
function orUndefined(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

export const env: PublicEnv = EnvSchema.parse({
  apiUrl: orUndefined(process.env.NEXT_PUBLIC_API_URL) ?? "http://localhost:3000/api/v1",
  chainId: orUndefined(process.env.NEXT_PUBLIC_CHAIN_ID) ?? "97",
  appUrl: orUndefined(process.env.NEXT_PUBLIC_APP_URL) ?? "http://localhost:3002",
  landingUrl: orUndefined(process.env.NEXT_PUBLIC_LANDING_URL) ?? "http://localhost:3001",
  rpcUrl: orUndefined(process.env.NEXT_PUBLIC_RPC_URL),
  // Public Reown/WalletConnect project id (safe to expose; it's an identifier, not a secret).
  // The placeholder lets the app build and render in dev; injected/EIP-6963 wallets connect without
  // it. Gated to non-production so a prod deploy that forgets NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
  // fails closed (the id stays undefined → `.min(1)` throws) rather than silently booting with a
  // non-functional WalletConnect QR path. Set a real id from cloud.reown.com in production.
  walletConnectProjectId:
    orUndefined(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) ??
    (process.env.NODE_ENV === "production" ? undefined : "PLACEHOLDER_REOWN_PROJECT_ID"),
});
