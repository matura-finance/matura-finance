import { parseEther } from "viem";

/// Minimum deployer tBNB balance (wei) the BSC-testnet pre-flight requires before a deploy: enough
/// gas headroom for the full deploy → wire → seed → one scripted execute+settle sequence on the
/// public testnet, with slack for public-RPC gas spikes. A soft OPERATIONAL floor (tune per gas
/// conditions / faucet output), NOT a protocol constant.
export const MIN_DEPLOYER_BALANCE_WEI = parseEther("0.05");

/// True when `balance` (wei) is at or above `min` — the boundary (`balance === min`) is a PASS.
/// Pure + side-effect-free so `PreflightGuard.test.ts` can exercise the threshold at its boundary
/// without a live chain.
export function meetsMinBalance(balance: bigint, min: bigint): boolean {
  return balance >= min;
}
