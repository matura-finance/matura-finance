import { describe, it } from "vitest";
import fc from "fast-check";
import { optimizeRoute } from "../optimize.js";
import { parseOptimizeInput } from "../optimize-io.js";
import { referenceMinCost } from "./brute-force-reference.js";

const vault = (i: number): string => `0x${i.toString(16).padStart(40, "0")}`;
const claim = (i: number): string => `0x${i.toString(16).padStart(64, "0")}`;

/** Pinned config: deterministic, reproducible CI (fast-check's default seed is Date.now()). */
const CONFIG: fc.Parameters<unknown[]> = { seed: 0x5eed, numRuns: 500 };

/**
 * Tiny portfolio: ≤3 claims, each with 1–2 vault options, small integer faces —
 * kept small so the brute-force reference (full face enumeration) stays cheap.
 * Ample vault liquidity so the reference's per-vault check never binds.
 */
const portfolioArb = fc
  .array(
    fc.array(
      fc.record({
        rateBps: fc.integer({ min: 0, max: 500 }),
        face: fc.integer({ min: 1, max: 6 }),
      }),
      {
        minLength: 1,
        maxLength: 2,
      },
    ),
    { minLength: 1, maxLength: 3 },
  )
  .map((claims) => {
    let vaultId = 1;
    const candidates = claims.flatMap((vaultsForClaim, claimIdx) =>
      vaultsForClaim.map((v) => ({
        claimId: claim(claimIdx + 1),
        vault: vault(vaultId++),
        claimType: "PAYROLL",
        dueDate: "1780000000",
        remainingFace: String(v.face),
        minFace: "1",
        maxFace: String(v.face),
        vaultFundable: "1000000",
        rateBps: v.rateBps,
        slicesRemaining: 8,
      })),
    );
    return candidates;
  });

describe("optimizeRoute — property: matches the brute-force reference", () => {
  it("optimizer cost equals the reference minimum (or both agree it is infeasible)", () => {
    fc.assert(
      fc.property(portfolioArb, fc.integer({ min: 1, max: 40 }), (candidates, target) => {
        const input = parseOptimizeInput({ targetAdvance: String(target), candidates });
        const reference = referenceMinCost(input);
        const result = optimizeRoute(input);

        if (reference === null) {
          // No feasible route exists → optimizer must not fabricate one.
          return !result.executable;
        }
        // A feasible route exists → optimizer must find one at the minimum cost.
        if (!result.executable) return false;
        return BigInt(result.totalCost) === reference.cost;
      }),
      CONFIG,
    );
  });

  it("every executable route is feasible (invariants hold)", () => {
    fc.assert(
      fc.property(portfolioArb, fc.integer({ min: 1, max: 40 }), (candidates, target) => {
        const input = parseOptimizeInput({ targetAdvance: String(target), candidates });
        const result = optimizeRoute(input);
        if (!result.executable) return true;

        // targetAdvance met; sums reconcile; one vault per claim; ≤ MAX legs.
        if (BigInt(result.totalAdvance) < BigInt(String(target))) return false;
        if (result.legs.length > input.maxLegs) return false;
        const claimsSeen = new Set<string>();
        let sumAdvance = 0n;
        let sumFace = 0n;
        let sumCost = 0n;
        for (const leg of result.legs) {
          if (claimsSeen.has(leg.claimId)) return false; // one vault per claim
          claimsSeen.add(leg.claimId);
          if (BigInt(leg.advanceAmount) !== BigInt(leg.faceAmount) - BigInt(leg.discountAmount))
            return false;
          sumAdvance += BigInt(leg.advanceAmount);
          sumFace += BigInt(leg.faceAmount);
          sumCost += BigInt(leg.discountAmount);
        }
        return (
          sumAdvance === BigInt(result.totalAdvance) &&
          sumFace === BigInt(result.totalFaceAssigned) &&
          sumCost === BigInt(result.totalCost)
        );
      }),
      CONFIG,
    );
  });

  it("is deterministic: identical inputs yield identical results", () => {
    fc.assert(
      fc.property(portfolioArb, fc.integer({ min: 1, max: 40 }), (candidates, target) => {
        const input = parseOptimizeInput({ targetAdvance: String(target), candidates });
        return JSON.stringify(optimizeRoute(input)) === JSON.stringify(optimizeRoute(input));
      }),
      CONFIG,
    );
  });
});
