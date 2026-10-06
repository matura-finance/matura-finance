import { fromBaseUnits, toBaseUnits, SETTLEMENT_DECIMALS } from "@matura/chain/units";
import { getAddress } from "viem";

import { env } from "../env";

/**
 * Display + input helpers. These NEVER touch the signing path (that uses raw
 * `BigInt(str)` in `bridge.ts`). `fromBaseUnits` = display only; `toBaseUnits`
 * = amount-input box only.
 */

/** Insert thousand separators into the integer part of a decimal string (display only). */
function withThousands(decimal: string): string {
  const negative = decimal.startsWith("-");
  const unsigned = negative ? decimal.slice(1) : decimal;
  const dot = unsigned.indexOf(".");
  const intPart = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const fracPart = dot === -1 ? "" : unsigned.slice(dot);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${fracPart}`;
}

/** Format a base-unit integer string for display with thousand separators (e.g. "1500000" → "1.5"). */
export function formatAmount(baseUnits: string): string {
  return withThousands(fromBaseUnits(baseUnits));
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

/**
 * Truncate ANY hex string for compact display (0x1234…abcd). Use for values that are NOT 20-byte
 * addresses — tx hashes and bytes32 ids (claimId) are 32 bytes, and running them through
 * `getAddress` (as `shortenAddress` does) throws `InvalidAddressError`.
 */
export function shortenHex(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/** Truncate a 20-byte address for compact display, EIP-55 checksummed (0x1234…abCd). */
export function shortenAddress(address: string): string {
  return shortenHex(getAddress(address));
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
