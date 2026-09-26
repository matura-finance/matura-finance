import { getAddress } from "viem";
import { describe, expect, it } from "vitest";

import { toAddress, toBigInt, toHex32 } from "./bridge";

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

  it("toHex32 prefixes and never double-prefixes", () => {
    expect(toHex32("abcd")).toBe("0xabcd");
    expect(toHex32("0xabcd")).toBe("0xabcd");
  });
});
