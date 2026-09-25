import { describe, expect, it } from "vitest";
import { BaseUnitAmount, MAX_UINT256, makeBaseUnitAmount } from "../money.js";

describe("BaseUnitAmount", () => {
  it("accepts and preserves valid non-negative integer strings", () => {
    expect(String(makeBaseUnitAmount("0"))).toBe("0");
    expect(String(makeBaseUnitAmount("1000000"))).toBe("1000000");
  });

  it("accepts the uint256 maximum", () => {
    const max = MAX_UINT256.toString();
    expect(BaseUnitAmount.safeParse(max).success).toBe(true);
  });

  it("rejects floats", () => {
    expect(BaseUnitAmount.safeParse("1.5").success).toBe(false);
  });

  it("rejects negatives", () => {
    expect(BaseUnitAmount.safeParse("-1").success).toBe(false);
  });

  it("rejects non-numeric and empty strings", () => {
    expect(BaseUnitAmount.safeParse("abc").success).toBe(false);
    expect(BaseUnitAmount.safeParse("").success).toBe(false);
    expect(BaseUnitAmount.safeParse("12a").success).toBe(false);
  });

  it("rejects values greater than uint256 max", () => {
    const overflow = (MAX_UINT256 + 1n).toString();
    expect(BaseUnitAmount.safeParse(overflow).success).toBe(false);
  });

  it("rejects absurdly long digit strings before BigInt conversion", () => {
    expect(BaseUnitAmount.safeParse("9".repeat(1000)).success).toBe(false);
  });

  it("throws from the constructor on invalid input", () => {
    expect(() => makeBaseUnitAmount("1.5")).toThrow();
  });
});
