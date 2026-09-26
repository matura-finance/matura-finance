import {
  createPublicClient,
  createWalletClient,
  http,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";

/**
 * Create a viem public (read-only) client for a chain over the given RPC URL.
 * The RPC URL is a parameter — this factory never reads it from the
 * environment.
 */
export function createPublicClientFor(
  chain: Chain,
  rpcUrl: string,
  options?: { batch?: boolean },
): PublicClient {
  return createPublicClient({
    chain,
    // JSON-RPC request batching (many calls → one HTTP request). Safe everywhere,
    // including a local Hardhat node (unlike Multicall3 aggregation). Opt-in so
    // deploy/seed scripts keep their original one-call-per-request semantics.
    transport: http(rpcUrl, options?.batch === true ? { batch: true } : undefined),
  });
}

/**
 * Create a viem wallet (signing) client for a chain over the given RPC URL.
 *
 * The account is passed in as a viem `Account` or a private-key `Hex` — this
 * factory NEVER reads private keys or RPC endpoints from the environment. Key
 * handling stays at the call site (server/script only).
 */
export function createWalletClientFor(
  chain: Chain,
  rpcUrl: string,
  account: Account | Hex,
): WalletClient {
  return createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
}
