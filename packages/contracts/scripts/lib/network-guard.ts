import type { PublicClient } from "viem";

const BSC_MAINNET_CHAIN_ID = 56;

/// Assert the connected chain id is one of `allowed`, and hard-stop on BSC Mainnet. Call this —
/// awaited — before the first state-changing action in every deploy/seed/reset/demo script.
/// Returns the verified chain id.
export async function assertChainId(
  publicClient: PublicClient,
  allowed: readonly number[],
): Promise<number> {
  const chainId = await publicClient.getChainId();
  if (chainId === BSC_MAINNET_CHAIN_ID) {
    throw new Error("Refusing to operate on BSC Mainnet (chainId 56). Hard stop.");
  }
  if (!allowed.includes(chainId)) {
    throw new Error(
      `Refusing to operate: connected chainId ${String(chainId)} is not in the allowed set ` +
        `[${allowed.map(String).join(", ")}]. Check your --network / RPC URL.`,
    );
  }
  return chainId;
}
