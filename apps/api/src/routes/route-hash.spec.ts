import { contentHash, quoteSnapshotHash, routeIdOf, type SnapshotCandidate } from "./route-hash";

const claim = (i: number): string => `0x${i.toString(16).padStart(64, "0")}`;
const vault = (i: number): string => `0x${i.toString(16).padStart(40, "0")}`;

describe("route-hash", () => {
  it("is deterministic and order-independent for object keys", () => {
    const a = contentHash({ x: "1", y: "2" });
    const b = contentHash({ y: "2", x: "1" });
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("throws on a bigint (must be stringified before hashing)", () => {
    expect(() => contentHash({ amount: 1n })).toThrow(/bigint/);
  });

  it("produces the same snapshot hash regardless of candidate order", () => {
    const c1: SnapshotCandidate = {
      claimId: claim(1),
      vault: vault(1),
      claimType: "PAYROLL",
      dueDate: "1780000000",
      remainingFace: "1000",
      minFace: "1",
      maxFace: "1000",
      vaultFundable: "999999",
      rateBps: 100,
      slicesRemaining: 8,
    };
    const c2: SnapshotCandidate = { ...c1, claimId: claim(2), vault: vault(2), rateBps: 200 };
    expect(quoteSnapshotHash(10n, [c1, c2])).toBe(quoteSnapshotHash(10n, [c2, c1]));
  });

  it("routeId is stable regardless of leg order and changes with inputs", () => {
    const legA = { claimId: claim(1), vault: vault(1), faceAmount: "500" };
    const legB = { claimId: claim(2), vault: vault(2), faceAmount: "600" };
    const base = {
      user: vault(9),
      quoteSnapshotHash: contentHash({ snap: "1" }),
      legs: [legA, legB],
      targetAdvance: "1000",
      maxTotalFace: null,
      maxTotalCost: null,
      routeDeadlineSeconds: 300,
    };
    const reordered = { ...base, legs: [legB, legA] };
    expect(routeIdOf(base)).toBe(routeIdOf(reordered));
    expect(routeIdOf(base)).not.toBe(routeIdOf({ ...base, targetAdvance: "1001" }));
  });
});
