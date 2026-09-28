import { describe, expect, it } from "vitest";

import { DemoFixture, type DemoClaim, type DemoClaimType, type DemoVault } from "../demo.js";
import { DEMO_FIXTURE } from "../demo.generated.js";

/**
 * Locks the judge-facing demo numbers and their feasibility invariants. This does NOT re-run the
 * optimizer over synthetic prices: a `RouteCandidate`'s `rateBps` is recovered from an on-chain
 * probe quote, so faithful pricing needs a chain — which `packages/contracts/scripts/verify.ts`
 * exercises for real (asserting Request A/B are financeable against the deployed vaults). Here we
 * assert the fixture is internally consistent and that the demo scenarios are structurally viable,
 * all derived purely from the fixture data.
 */
describe("demo fixture", () => {
  it("validates against the schema (fails if the generated fixture drifts from its shape)", () => {
    expect(() => DemoFixture.parse(DEMO_FIXTURE)).not.toThrow();
  });

  const fixture = DemoFixture.parse(DEMO_FIXTURE);

  const claimByLabel = new Map<string, DemoClaim>(fixture.claims.map((c) => [c.label, c]));
  const getClaim = (label: string): DemoClaim => {
    const claim = claimByLabel.get(label);
    if (claim === undefined) throw new Error(`no fixture claim labelled ${label}`);
    return claim;
  };
  const getRequest = (key: "A" | "B") => {
    const request = fixture.requests.find((r) => r.key === key);
    if (request === undefined) throw new Error(`no fixture request ${key}`);
    return request;
  };
  const getVault = (name: "stable" | "flex"): DemoVault => {
    const vault = fixture.vaults.find((v) => v.name === name);
    if (vault === undefined) throw new Error(`no fixture vault ${name}`);
    return vault;
  };
  const vaultsAccepting = (type: DemoClaimType): DemoVault[] =>
    fixture.vaults.filter((v) => v.supportedTypes.includes(type));

  it("carries Alice's three claims with the seeded faces", () => {
    expect(getClaim("alice-payroll").faceUnits).toBe("20000000000"); // 20,000 · 1e6
    expect(getClaim("alice-freelance").faceUnits).toBe("15000000000"); // 15,000 · 1e6
    expect(getClaim("alice-stream").faceUnits).toBe("10000000000"); // ~10,000 vested · 1e6
  });

  it("Request A is a single partial payroll slice financeable on a vault", () => {
    const a = getRequest("A");
    expect(a.eligibleClaims).toEqual(["alice-payroll"]);
    const claim = getClaim(a.eligibleClaims[0] ?? "");
    // Partial slice: the target is strictly below the claim face, so it never needs the whole claim.
    expect(BigInt(a.targetAdvanceUnits)).toBeLessThan(BigInt(claim.faceUnits));
    // At least one vault accepts payroll (Stable, the cheapest — asserted below).
    expect(vaultsAccepting(claim.claimType).length).toBeGreaterThan(0);
  });

  it("Request B needs aggregation across payroll + freelance, within the face cap", () => {
    const b = getRequest("B");
    expect(b.eligibleClaims).toContain("alice-payroll");
    expect(b.eligibleClaims).toContain("alice-freelance");
    expect(b.eligibleClaims).not.toContain("alice-stream"); // retargeted off the gated stream claim
    expect(b.eligibleClaims.length).toBeGreaterThanOrEqual(2);

    const claims = b.eligibleClaims.map(getClaim);
    const target = BigInt(b.targetAdvanceUnits);
    // Aggregation required: each claim's face is an upper bound on its advance, and no single one
    // reaches the target — so the router MUST combine at least two claims.
    for (const claim of claims) expect(BigInt(claim.faceUnits)).toBeLessThan(target);
    // The selected set fits under the face cap.
    const totalFace = claims.reduce((sum, c) => sum + BigInt(c.faceUnits), 0n);
    expect(totalFace).toBeLessThanOrEqual(BigInt(b.maxTotalFaceUnits));
    // Each eligible claim is financeable on some vault.
    for (const claim of claims) expect(vaultsAccepting(claim.claimType).length).toBeGreaterThan(0);
  });

  it("Request B spans two vaults under best execution (payroll→Stable cheapest, freelance→Flex-only)", () => {
    const stable = getVault("stable");
    const flex = getVault("flex");
    // Freelance is FREELANCE_ESCROW: accepted only by Flex, never Stable.
    expect(stable.supportedTypes).not.toContain("FREELANCE_ESCROW");
    expect(flex.supportedTypes).toContain("FREELANCE_ESCROW");
    // Payroll is accepted by the cheaper Stable vault, so best execution routes it there while
    // freelance is forced onto Flex — the route therefore spans two competing pools.
    expect(stable.supportedTypes).toContain("PAYROLL");
    expect(stable.baseDiscountBps).toBeLessThan(flex.baseDiscountBps);
  });
});
