import { describe, expect, it } from "vitest";
import {
  EvmAddress,
  NormalizedAddress,
  isChecksumAddress,
  makeEvmAddress,
  makeNormalizedAddress,
  toAddressString,
  toNormalized,
} from "../address.js";

const CHECKSUMMED = "0x52908400098527886E0F7030069857D2E4169EE7";
const LOWER = "0x52908400098527886e0f7030069857d2e4169ee7";

describe("EvmAddress", () => {
  it("accepts a well-formed 20-byte hex address", () => {
    expect(EvmAddress.safeParse(CHECKSUMMED).success).toBe(true);
    expect(EvmAddress.safeParse(LOWER).success).toBe(true);
  });

  it("rejects an address with the wrong length", () => {
    expect(EvmAddress.safeParse("0x1234").success).toBe(false);
    expect(EvmAddress.safeParse(`${LOWER}00`).success).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(EvmAddress.safeParse("0xZZ908400098527886e0f7030069857d2e4169ee7").success).toBe(false);
  });

  it("rejects a missing 0x prefix", () => {
    expect(EvmAddress.safeParse(LOWER.slice(2)).success).toBe(false);
  });

  it("preserves original casing", () => {
    expect(String(makeEvmAddress(CHECKSUMMED))).toBe(CHECKSUMMED);
  });
});

describe("isChecksumAddress", () => {
  it("accepts lower, upper, and mixed case well-formed addresses", () => {
    expect(isChecksumAddress(LOWER)).toBe(true);
    expect(isChecksumAddress(CHECKSUMMED)).toBe(true);
    expect(isChecksumAddress(LOWER.toUpperCase().replace("0X", "0x"))).toBe(true);
  });

  it("rejects malformed input", () => {
    expect(isChecksumAddress("0x123")).toBe(false);
  });
});

describe("toNormalized", () => {
  it("lowercases a validated address", () => {
    const normalized = toNormalized(makeEvmAddress(CHECKSUMMED));
    expect(String(normalized)).toBe(LOWER);
  });
});

describe("NormalizedAddress", () => {
  it("rejects a non-lowercase address", () => {
    expect(NormalizedAddress.safeParse(CHECKSUMMED).success).toBe(false);
  });

  it("accepts a lowercase address", () => {
    expect(NormalizedAddress.safeParse(LOWER).success).toBe(true);
  });

  it("makeNormalizedAddress lowercases mixed-case input", () => {
    expect(String(makeNormalizedAddress(CHECKSUMMED))).toBe(LOWER);
  });
});

describe("toAddressString", () => {
  it("returns the raw 0x string form", () => {
    expect(toAddressString(makeEvmAddress(CHECKSUMMED))).toBe(CHECKSUMMED);
    expect(toAddressString(makeNormalizedAddress(CHECKSUMMED))).toBe(LOWER);
  });
});
