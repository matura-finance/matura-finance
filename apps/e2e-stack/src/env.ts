import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Hex } from "viem";

/// Repo root (…/apps/e2e-stack/src → ../../..).
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/// Local chain + service coordinates. The API/worker read contract addresses from the
/// @matura/chain manifest (never env), so only chain-id/rpc/db/auth are configured here.
export const CHAIN_ID = 31337;
export const RPC_URL = "http://127.0.0.1:8545";
export const API_PORT = 3999;
export const API_BASE_URL = `http://127.0.0.1:${String(API_PORT)}/api/v1`;
export const SIWE_DOMAIN = `127.0.0.1:${String(API_PORT)}`;
/// A fixed high-entropy value — this is a throwaway local secret, never a real credential.
export const JWT_SECRET = "e2e-stack-local-jwt-secret-value-32chars-min-000";
export const INDEXER_POLL_INTERVAL_MS = 500;

/// Hardhat deterministic accounts. Alice (#2) is the seeded claim beneficiary — she must sign SIWE
/// and the ExecutionRoute, or optimize returns NOT_OWNED_BY_WALLET.
export const DEPLOYER_KEY: Hex =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const ALICE_KEY: Hex = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

/// The manifest files the local deploy dirties — restored on teardown (they are committed all-zero
/// and guarded by manifest-parity.test.ts), after which @matura/chain is rebuilt from the restored
/// src (dist is gitignored, so `git checkout` alone would leave stale compiled addresses).
export const DIRTIED_MANIFEST_PATHS = [
  "packages/chain/src/deployments/31337.json",
  "packages/chain/src/deployments.generated.ts",
] as const;

/// Typed env for the spawned worker/API child processes. All values are strings (a child env is
/// `Record<string, string>`); numbers/bigints are stringified at the boundary.
export function childEnv(
  databaseUrl: string,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: databaseUrl,
    CHAIN_ID: String(CHAIN_ID),
    RPC_URL,
    // Local EDR has no `finalized` tag → use the (head - N) frontier path.
    INDEXER_CONFIRMATIONS: "1",
    INDEXER_POLL_INTERVAL_MS: String(INDEXER_POLL_INTERVAL_MS),
    JWT_SECRET,
    SIWE_DOMAIN,
    ...extra,
  };
}
