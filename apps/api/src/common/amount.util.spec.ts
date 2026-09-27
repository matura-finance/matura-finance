import { BadRequestException } from "@nestjs/common";

import { Uint256StringSchema, isoToUnix, parseUint256 } from "./amount.util";
import { ActivityQuerySchema } from "./dto";

const MAX_UINT256 = (1n << 256n) - 1n;

describe("parseUint256", () => {
  it.each(["1.5", "1e9", "", "-5", "0x10", " 10", "10 ", "abc", "1,000"])(
    "rejects the non-integer money string %p with 400",
    (value) => {
      expect(() => parseUint256(value, "faceAmount")).toThrow(BadRequestException);
    },
  );

  it("accepts a canonical base-unit string", () => {
    expect(parseUint256("0", "faceAmount")).toBe(0n);
    expect(parseUint256("20000000000", "faceAmount")).toBe(20_000_000_000n);
  });

  it("rejects a value above uint256 max", () => {
    expect(() => parseUint256((MAX_UINT256 + 1n).toString(), "faceAmount")).toThrow(
      /exceeds uint256 max/,
    );
  });

  it("accepts exactly uint256 max", () => {
    expect(parseUint256(MAX_UINT256.toString(), "faceAmount")).toBe(MAX_UINT256);
  });
});

describe("Uint256StringSchema", () => {
  it.each(["1.5", "1e9", "", "-5", "0x10"])("fails to parse %p", (value) => {
    expect(Uint256StringSchema.safeParse(value).success).toBe(false);
  });

  it("parses a valid base-unit string", () => {
    expect(Uint256StringSchema.safeParse("1000").success).toBe(true);
  });

  it("rejects a value above uint256 max", () => {
    expect(Uint256StringSchema.safeParse((MAX_UINT256 + 1n).toString()).success).toBe(false);
  });
});

describe("isoToUnix", () => {
  it("rejects a non-ISO datetime with 400", () => {
    expect(() => isoToUnix("not-a-date", "dueDate")).toThrow(BadRequestException);
  });

  it("converts an ISO datetime to unix seconds", () => {
    expect(isoToUnix("2026-01-01T00:00:00.000Z", "dueDate")).toBe(1_767_225_600n);
  });
});

describe("ActivityQuerySchema.limit bounds", () => {
  it("defaults to 25 when absent", () => {
    const parsed = ActivityQuerySchema.parse({});
    expect(parsed.limit).toBe(25);
  });

  it("rejects a limit below 1", () => {
    expect(ActivityQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
  });

  it("rejects a limit above 100", () => {
    expect(ActivityQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });

  it("accepts the inclusive bounds 1 and 100", () => {
    expect(ActivityQuerySchema.parse({ limit: "1" }).limit).toBe(1);
    expect(ActivityQuerySchema.parse({ limit: "100" }).limit).toBe(100);
  });
});
