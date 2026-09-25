import { describe, expect, it } from "vitest";

import { SETTLEMENT_DECIMALS, fromBaseUnits, toBaseUnits } from "../units.js";

describe("units", () => {
  it("uses 6 settlement decimals", () => {
    expect(SETTLEMENT_DECIMALS).toBe(6);
  });

  describe("toBaseUnits", () => {
    it("converts a decimal string to base units at 6dp", () => {
      expect(toBaseUnits("1.5")).toBe(1_500_000n);
    });

    it("handles zero", () => {
      expect(toBaseUnits("0")).toBe(0n);
    });

    it("handles a whole number", () => {
      expect(toBaseUnits("100")).toBe(100_000_000n);
    });

    it("handles full 6dp precision", () => {
      expect(toBaseUnits("0.000001")).toBe(1n);
    });

    it("rejects excess precision (>6dp)", () => {
      expect(() => toBaseUnits("1.0000001")).toThrow(/decimal places/);
    });

    it("rejects negative amounts", () => {
      expect(() => toBaseUnits("-1")).toThrow(/Invalid amount/);
    });

    it("rejects non-numeric input", () => {
      expect(() => toBaseUnits("abc")).toThrow(/Invalid amount/);
    });

    it("honours a custom decimals argument", () => {
      expect(toBaseUnits("1.5", 18)).toBe(1_500_000_000_000_000_000n);
    });
  });

  describe("fromBaseUnits", () => {
    it("converts base units back to a decimal string", () => {
      expect(fromBaseUnits(1_500_000n)).toBe("1.5");
    });

    it("handles zero", () => {
      expect(fromBaseUnits(0n)).toBe("0");
    });

    it("accepts a base-unit string", () => {
      expect(fromBaseUnits("1500000")).toBe("1.5");
    });

    it("rejects an invalid base-unit string", () => {
      expect(() => fromBaseUnits("1.5")).toThrow(/Invalid base-unit amount/);
    });
  });

  describe("round-trip", () => {
    it("is stable across toBaseUnits -> fromBaseUnits", () => {
      for (const human of ["0", "1.5", "100", "0.000001", "999999.999999"]) {
        expect(fromBaseUnits(toBaseUnits(human))).toBe(human);
      }
    });

    it("handles large uint256-scale values", () => {
      const base = 123_456_789_000_000n;
      expect(toBaseUnits(fromBaseUnits(base))).toBe(base);
    });
  });
});
