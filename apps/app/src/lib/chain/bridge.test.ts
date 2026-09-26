import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import { toAddress, toBigInt, toHex32, toHexData } from "./bridge";

const BYTES32 = "0x1111111111111111111111111111111111111111111111111111111111111111";

describe("bridge", () => {
  it("toBigInt widens a base-unit string without scaling", () => {
    // 20000 USDT in 6-dp base units — must NOT be re-scaled (that's the toBaseUnits bug).
    expect(toBigInt("20000000000")).toBe(20_000_000_000n);
    expect(toBigInt("0")).toBe(0n);
  });

  it("toAddress checksums and narrows a lowercase manifest address", () => {
    const lower = "0x000000000000000000000000000000000000dead";
    expect(toAddress(lower)).toBe(getAddress(lower));
  });

  it("toHex32 accepts a 32-byte value with or without 0x prefix", () => {
    expect(toHex32(BYTES32)).toBe(BYTES32);
    expect(toHex32(BYTES32.slice(2))).toBe(BYTES32);
  });

  it("toHex32 rejects a value that is not 32 bytes", () => {
    expect(() => toHex32("0xabcd")).toThrow();
    expect(() => toHex32("")).toThrow();
  });

  it("toHexData normalizes arbitrary-length calldata without length check", () => {
    expect(toHexData("abcd")).toBe("0xabcd");
    expect(toHexData("0xdeadbeef")).toBe("0xdeadbeef");
  });
});
