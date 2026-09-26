/**
 * Integer-only pricing arithmetic for the router optimizer. Mirrors the on-chain
 * `MaturaPricing` rounding (discount rounds UP, advance rounds DOWN) so an
 * off-chain selection agrees with `LiquidityVault.quoteAndCheck` at the exact
 * chosen face. Never uses floats — every value is a `bigint`.
 */

/** Basis-point denominator (matches Solidity `BPS_DENOMINATOR`). */
export const BPS_DENOMINATOR = 10_000n;

/**
 * Ceiling division `⌈a / b⌉` for non-negative integers, overflow-free (the
 * OpenZeppelin `Math.ceilDiv` form). Throws on a zero divisor.
 */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new Error("ceilDiv: division by zero");
  return a === 0n ? 0n : (a - 1n) / b + 1n;
}

/**
 * Advance for a given face at a size-independent discount rate: the vault pays
 * `face - ⌈face * bps / 10000⌉` (discount rounds up in the vault's favour, so
 * advance rounds down). `bps` is the total discount rate in basis points.
 */
export function advanceForFace(face: bigint, bps: number): bigint {
  const discount = ceilDiv(face * BigInt(bps), BPS_DENOMINATOR);
  return face - discount;
}

/** Discount for a given face: `face - advance` (always ≥ 0). */
export function discountForFace(face: bigint, bps: number): bigint {
  return face - advanceForFace(face, bps);
}

/**
 * Smallest face in `[0, faceCap]` whose advance is at least `targetAdvance`, or
 * `null` if even `faceCap` cannot reach it. Binary search over the monotonic
 * `advanceForFace` — no closed-form rounding reasoning, no float.
 */
export function minFaceForAdvance(
  targetAdvance: bigint,
  bps: number,
  faceCap: bigint,
): bigint | null {
  if (targetAdvance <= 0n) return 0n;
  if (advanceForFace(faceCap, bps) < targetAdvance) return null;
  let lo = 0n;
  let hi = faceCap;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (advanceForFace(mid, bps) >= targetAdvance) hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

/**
 * Largest face in `[0, faceCap]` whose advance does not exceed `advanceCap`
 * (used to respect a vault's remaining fundable liquidity, which is denominated
 * in advance/settlement units). Binary search over the monotonic curve.
 */
export function maxFaceForAdvanceCap(advanceCap: bigint, bps: number, faceCap: bigint): bigint {
  if (advanceCap <= 0n) return 0n;
  if (advanceForFace(faceCap, bps) <= advanceCap) return faceCap;
  let lo = 0n;
  let hi = faceCap;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (advanceForFace(mid, bps) <= advanceCap) lo = mid;
    else hi = mid - 1n;
  }
  return lo;
}

/**
 * Effective discount in basis points for a whole route: `⌊totalCost * 10000 /
 * totalFaceAssigned⌋`. Returns `0` when no face is assigned. The `Number(...)`
 * cast is safe (and the only one in the module) because the result is bounded by
 * `MAX_DISCOUNT_BPS` (≤ 3000).
 */
export function effectiveDiscountBps(totalCost: bigint, totalFaceAssigned: bigint): number {
  if (totalFaceAssigned === 0n) return 0;
  return Number((totalCost * BPS_DENOMINATOR) / totalFaceAssigned);
}

/**
 * Compare two size-independent rates `a` and `b` given as bps integers. Trivial
 * here (rates are integers), but kept as the single rate-comparison primitive so
 * a future fractional rate can switch to cross-multiplication without touching
 * call sites. Returns a `number` (never a `bigint`) for use in `Array.sort`.
 */
export function compareRateBps(a: number, b: number): number {
  return a - b;
}
