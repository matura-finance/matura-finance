import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { advanceForFace, ceilDiv, minFaceForAdvance, maxFaceForAdvanceCap } from "../arithmetic.js";

/**
 * Parity for the reimplemented pricing formula against the on-chain MaturaPricing
 * reference (`discount = ceil(face·totalBps/1e4)`, `advance = face − discount`).
 *
 * A full Hardhat differential generator (real `quoteAndCheck` vectors + a
 * freshness CI gate) is a documented follow-up; here we (a) hand-pin exact
 * vectors and (b) cross-check `advanceForFace` against an INDEPENDENT ceil
 * expression across many sizes/rates — which also pins the size-independence
 * (linearity) + favorable-drift assumptions the optimizer's optimality rests on.
 */

/** Independent ceil-discount (different expression from arithmetic.ceilDiv). */
function refAdvance(face: bigint, bps: number): bigint {
  const discount = (face * BigInt(bps) + 9_999n) / 10_000n;
  return face - discount;
}

describe("arithmetic — pricing parity", () => {
  it("matches hand-computed golden vectors (discount rounds up)", () => {
    // face, bps, expected advance = face - ceil(face*bps/1e4)
    expect(advanceForFace(1_000n, 100)).toBe(990n); // ceil(10.00) = 10
    expect(advanceForFace(1_000n, 105)).toBe(989n); // ceil(10.50) = 11
    expect(advanceForFace(1n, 1)).toBe(0n); // ceil(0.0001) = 1
    expect(advanceForFace(1_000_000n, 250)).toBe(975_000n); // ceil(25000) = 25000
    expect(advanceForFace(0n, 3000)).toBe(0n);
  });

  it("equals an independent ceil formula for all sizes/rates", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 18n }),
        fc.integer({ min: 0, max: 3000 }),
        (face, bps) => {
          return advanceForFace(face, bps) === refAdvance(face, bps);
        },
      ),
      { seed: 0x5eed, numRuns: 2000 },
    );
  });

  it("advance is monotonic non-decreasing in face (size-independent rate → linearity)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.bigInt({ min: 0n, max: 10n ** 6n }),
        fc.integer({ min: 0, max: 3000 }),
        (face, delta, bps) => {
          return advanceForFace(face + delta, bps) >= advanceForFace(face, bps);
        },
      ),
      { seed: 0x5eed, numRuns: 1000 },
    );
  });

  it("advance is non-decreasing as the rate falls (favorable drift as maturity nears)", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        fc.integer({ min: 0, max: 3000 }),
        (face, bps) => {
          const lower = bps > 0 ? bps - 1 : 0;
          return advanceForFace(face, lower) >= advanceForFace(face, bps);
        },
      ),
      { seed: 0x5eed, numRuns: 1000 },
    );
  });

  it("ceilDiv throws on a zero divisor", () => {
    expect(() => ceilDiv(1n, 0n)).toThrow();
  });

  it("minFace/maxFace inversions are consistent with advanceForFace", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        fc.integer({ min: 0, max: 3000 }),
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        (cap, bps, targetRaw) => {
          const target = targetRaw % (advanceForFace(cap, bps) + 1n);
          const f = minFaceForAdvance(target, bps, cap);
          if (f === null) return advanceForFace(cap, bps) < target;
          // Smallest face meeting the target: advance(f) ≥ target and advance(f-1) < target.
          if (advanceForFace(f, bps) < target) return false;
          return f === 0n || advanceForFace(f - 1n, bps) < target;
        },
      ),
      { seed: 0x5eed, numRuns: 1000 },
    );
  });

  it("maxFaceForAdvanceCap never exceeds the advance cap", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 9n }),
        fc.integer({ min: 0, max: 3000 }),
        fc.bigInt({ min: 1n, max: 10n ** 9n }),
        (advCap, bps, cap) => {
          const f = maxFaceForAdvanceCap(advCap, bps, cap);
          return f <= cap && advanceForFace(f, bps) <= advCap;
        },
      ),
      { seed: 0x5eed, numRuns: 1000 },
    );
  });
});
