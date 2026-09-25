import { formatUnits, parseUnits } from "viem";

/**
 * Decimal precision for settlement-token amounts (USDT-style, 6 decimals).
 * Base-unit conversions default to this.
 */
export const SETTLEMENT_DECIMALS = 6 as const;

/**
 * Convert a human-readable decimal string (e.g. `"1.5"`) into base units.
 *
 * String-based, no float arithmetic. Rejects inputs with more fractional
 * digits than `decimals` (silent truncation is a money bug). `"0"` maps to
 * `0n`.
 *
 * @example toBaseUnits("1.5") === 1500000n
 */
export function toBaseUnits(human: string, decimals: number = SETTLEMENT_DECIMALS): bigint {
  if (!/^\d+(\.\d+)?$/.test(human)) {
    throw new Error(`Invalid amount "${human}": expected a non-negative decimal string`);
  }

  const [, fraction] = human.split(".");
  if (fraction !== undefined && fraction.length > decimals) {
    throw new Error(`Amount "${human}" has more than ${String(decimals)} decimal places`);
  }

  return parseUnits(human, decimals);
}

/**
 * Convert a base-unit amount back into a human-readable decimal string.
 * Accepts a `bigint` or a numeric string of base units.
 *
 * @example fromBaseUnits(1500000n) === "1.5"
 */
export function fromBaseUnits(
  base: bigint | string,
  decimals: number = SETTLEMENT_DECIMALS,
): string {
  const value = typeof base === "bigint" ? base : parseBaseUnitString(base);
  return formatUnits(value, decimals);
}

function parseBaseUnitString(base: string): bigint {
  if (!/^\d+$/.test(base)) {
    throw new Error(`Invalid base-unit amount "${base}": expected a non-negative integer string`);
  }
  return BigInt(base);
}
