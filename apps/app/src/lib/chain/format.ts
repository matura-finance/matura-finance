import { fromBaseUnits, toBaseUnits, SETTLEMENT_DECIMALS } from "@matura/chain/units";
import { getAddress } from "viem";

import { env } from "../env";

/**
 * Display + input helpers. These NEVER touch the signing path (that uses raw
 * `BigInt(str)` in `bridge.ts`). `fromBaseUnits` = display only; `toBaseUnits`
 * = amount-input box only.
 */

/** Format a base-unit integer string for display (e.g. "1500000" → "1.5"). */
export function formatAmount(baseUnits: string): string {
  return fromBaseUnits(baseUnits);
}

/** Format a base-unit amount with a trailing token symbol. */
export function formatUsdt(baseUnits: string): string {
  return `${formatAmount(baseUnits)} USDT`;
}

/** Parse a human decimal string from an input box into a base-unit string. */
export function parseAmountToBaseUnits(human: string): string {
  return toBaseUnits(human, SETTLEMENT_DECIMALS).toString();
}

/** Format a percentage from basis points (e.g. 310 → "3.10%"). */
export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Truncate an address for compact display (0x1234…abcd). */
export function shortenAddress(address: string): string {
  const a = getAddress(address);
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** BSC-testnet explorer base, or null on chains without an explorer (local hardhat). */
const EXPLORER_BASE: Record<number, string> = {
  97: "https://testnet.bscscan.com",
};

/** Explorer URL for a tx hash, or null when the active chain has no explorer. */
export function txExplorerUrl(txHash: string): string | null {
  const base = EXPLORER_BASE[env.chainId];
  return base ? `${base}/tx/${txHash}` : null;
}

/** Explorer URL for an address, or null when the active chain has no explorer. */
export function addressExplorerUrl(address: string): string | null {
  const base = EXPLORER_BASE[env.chainId];
  return base ? `${base}/address/${address}` : null;
}
