import { describe, it, expect } from "vitest";
import { optimizeRoute } from "../optimize.js";
import { parseOptimizeInput, type OptimizeInput } from "../optimize-io.js";

const vault = (i: number): string => `0x${i.toString(16).padStart(40, "0")}`;
const claim = (i: number): string => `0x${i.toString(16).padStart(64, "0")}`;

interface RawCandidate {
  claimId: string;
  vault: string;
  claimType?: string;
  dueDate?: string;
  remainingFace: string;
  minFace?: string;
  maxFace: string;
  vaultFundable?: string;
  rateBps: number;
  slicesRemaining?: number;
}

function cand(c: RawCandidate): Record<string, unknown> {
  return {
    claimId: c.claimId,
    vault: c.vault,
    claimType: c.claimType ?? "PAYROLL",
    dueDate: c.dueDate ?? "1780000000",
    remainingFace: c.remainingFace,
    minFace: c.minFace ?? "1",
    maxFace: c.maxFace,
    vaultFundable: c.vaultFundable ?? "1000000000",
    rateBps: c.rateBps,
    slicesRemaining: c.slicesRemaining ?? 8,
  };
}

function mk(raw: {
  targetAdvance: string;
  candidates: RawCandidate[];
  maxTotalFace?: string;
  maxTotalCost?: string;
  maxLegs?: number;
}): OptimizeInput {
  return parseOptimizeInput({
    targetAdvance: raw.targetAdvance,
    maxTotalFace: raw.maxTotalFace,
    maxTotalCost: raw.maxTotalCost,
    maxLegs: raw.maxLegs,
    candidates: raw.candidates.map(cand),
  });
}

describe("optimizeRoute — core scenarios", () => {
  it("picks the single cheapest partial slice", () => {
    const result = optimizeRoute(
      mk({
        targetAdvance: "99",
        candidates: [
          {
            claimId: claim(1),
            vault: vault(1),
            remainingFace: "1000",
            maxFace: "1000",
            rateBps: 100,
          },
          {
            claimId: claim(1),
            vault: vault(2),
            remainingFace: "1000",
            maxFace: "1000",
            rateBps: 300,
          },
        ],
      }),
    );
    expect(result.executable).toBe(true);
    if (!result.executable) return;
    expect(result.approximation).toBe("exact");
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]?.vault).toBe(vault(1)); // cheaper rate
    expect(result.totalAdvance).toBe("99");
    expect(result.totalCost).toBe("1");
  });

  it("combines two claims to reach a larger target", () => {
    const result = optimizeRoute(
      mk({
        targetAdvance: "1500",
        candidates: [
          {
            claimId: claim(1),
            vault: vault(1),
            remainingFace: "1000",
            maxFace: "1000",
            rateBps: 0,
          },
          {
            claimId: claim(2),
            vault: vault(1),
            remainingFace: "1000",
            maxFace: "1000",
            rateBps: 0,
          },
        ],
      }),
    );
    expect(result.executable).toBe(true);
    if (!result.executable) return;
    expect(result.legs.length).toBeGreaterThanOrEqual(2);
    expect(BigInt(result.totalAdvance)).toBeGreaterThanOrEqual(1500n);
  });

  it("falls back to another claim when the cheapest vault lacks liquidity", () => {
    const result = optimizeRoute(
      mk({
        targetAdvance: "10",
        candidates: [
          // Cheapest, but its vault can only fund an advance of ~2.
          {
            claimId: claim(1),
            vault: vault(1),
            remainingFace: "1000",
            maxFace: "1000",
            vaultFundable: "2",
            rateBps: 0,
          },
          {
            claimId: claim(2),
            vault: vault(2),
            remainingFace: "1000",
            maxFace: "1000",
            rateBps: 0,
          },
        ],
      }),
    );
    expect(result.executable).toBe(true);
    if (!result.executable) return;
    expect(BigInt(result.totalAdvance)).toBeGreaterThanOrEqual(10n);
    // The liquidity-limited leg contributes at most its fundable amount.
    const v1 = result.legs.find((l) => l.vault === vault(1));
    if (v1) expect(BigInt(v1.advanceAmount)).toBeLessThanOrEqual(2n);
  });

  it("returns NO_ELIGIBLE_CANDIDATES for an empty candidate set", () => {
    const result = optimizeRoute(mk({ targetAdvance: "100", candidates: [] }));
    expect(result.executable).toBe(false);
    if (result.executable) return;
    expect(result.reasonCode).toBe("NO_ELIGIBLE_CANDIDATES");
  });

  it("returns TARGET_UNSATISFIABLE when no combination reaches the target", () => {
    const result = optimizeRoute(
      mk({
        targetAdvance: "100000",
        candidates: [
          { claimId: claim(1), vault: vault(1), remainingFace: "10", maxFace: "10", rateBps: 0 },
        ],
      }),
    );
    expect(result.executable).toBe(false);
    if (result.executable) return;
    expect(result.reasonCode).toBe("TARGET_UNSATISFIABLE");
    expect(result.maxAchievableAdvance).toBe("10");
    expect(BigInt(result.shortfallAdvance)).toBe(99990n);
  });

  it("returns MAX_COST_EXCEEDED when the cost cap makes the route infeasible", () => {
    const result = optimizeRoute(
      mk({
        targetAdvance: "95",
        maxTotalCost: "1", // the only route costs 5
        candidates: [
          {
            claimId: claim(1),
            vault: vault(1),
            remainingFace: "100",
            maxFace: "100",
            rateBps: 500,
          },
        ],
      }),
    );
    expect(result.executable).toBe(false);
    if (result.executable) return;
    expect(result.reasonCode).toBe("MAX_COST_EXCEEDED");
  });

  it("honours the min-lot floor with the smallest unavoidable overshoot", () => {
    // Need only ~1 advance but minFace forces a 50-face lot.
    const result = optimizeRoute(
      mk({
        targetAdvance: "1",
        candidates: [
          {
            claimId: claim(1),
            vault: vault(1),
            remainingFace: "1000",
            minFace: "50",
            maxFace: "1000",
            rateBps: 0,
          },
        ],
      }),
    );
    expect(result.executable).toBe(true);
    if (!result.executable) return;
    expect(result.legs[0]?.faceAmount).toBe("50"); // overshoot to the minimum lot
  });

  it("is deterministic for identical inputs", () => {
    const input = mk({
      targetAdvance: "500",
      candidates: [
        {
          claimId: claim(1),
          vault: vault(1),
          remainingFace: "1000",
          maxFace: "1000",
          rateBps: 100,
        },
        {
          claimId: claim(2),
          vault: vault(2),
          remainingFace: "1000",
          maxFace: "1000",
          rateBps: 100,
        },
      ],
    });
    expect(optimizeRoute(input)).toEqual(optimizeRoute(input));
  });

  it("breaks ties by earlier maturity then stable claim id", () => {
    const result = optimizeRoute(
      mk({
        targetAdvance: "99",
        candidates: [
          {
            claimId: claim(2),
            vault: vault(2),
            dueDate: "1790000000",
            remainingFace: "1000",
            maxFace: "1000",
            rateBps: 100,
          },
          {
            claimId: claim(1),
            vault: vault(1),
            dueDate: "1780000000",
            remainingFace: "1000",
            maxFace: "1000",
            rateBps: 100,
          },
        ],
      }),
    );
    expect(result.executable).toBe(true);
    if (!result.executable) return;
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0]?.claimId).toBe(claim(1)); // earlier dueDate wins the tie
  });

  it("[C1] bounded exact search beats greedy when the leg cap binds", () => {
    // Nine cheap claims (advance 2 each) can only reach 18 in 8 legs; one big claim
    // reaches the 20 target far more cheaply. Greedy-capped would report infeasible;
    // the exact search finds the min-cost feasible ≤8-leg subset.
    const candidates: RawCandidate[] = [];
    for (let i = 1; i <= 9; i++) {
      candidates.push({
        claimId: claim(i),
        vault: vault(1),
        remainingFace: "2",
        maxFace: "2",
        rateBps: 0,
      });
    }
    candidates.push({
      claimId: claim(100),
      vault: vault(2),
      remainingFace: "100",
      maxFace: "100",
      rateBps: 500,
    });

    const result = optimizeRoute(mk({ targetAdvance: "20", candidates }));
    expect(result.executable).toBe(true);
    if (!result.executable) return;
    expect(result.approximation).toBe("exact");
    expect(result.legs.length).toBeLessThanOrEqual(8);
    expect(BigInt(result.totalAdvance)).toBeGreaterThanOrEqual(20n);
    // Cheapest way to reach 20: as much rate-0 cheap face as possible + minimal big.
    expect(BigInt(result.totalCost)).toBe(1n);
  });
});
