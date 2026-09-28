import { describe, expect, it } from "vitest";

import {
  formatAmount,
  formatBps,
  parseAmountToBaseUnits,
  shortenAddress,
  shortenHex,
  txExplorerUrl,
} from "./format";

describe("format", () => {
  it("formatAmount renders base units as a decimal string (no float)", () => {
    expect(formatAmount("1500000")).toBe("1.5");
    expect(formatAmount("20000000000")).toBe("20000");
    expect(formatAmount("1")).toBe("0.000001");
  });

  it("parseAmountToBaseUnits round-trips human input", () => {
    expect(parseAmountToBaseUnits("1.5")).toBe("1500000");
    expect(parseAmountToBaseUnits("20000")).toBe("20000000000");
  });

  it("formatBps renders a percentage", () => {
    expect(formatBps(310)).toBe("3.10%");
    expect(formatBps(0)).toBe("0.00%");
  });

  it("shortenAddress truncates", () => {
    expect(shortenAddress("0x000000000000000000000000000000000000dEaD")).toBe("0x0000…dEaD");
  });

  it("shortenHex truncates a 32-byte value (claimId/txHash) WITHOUT throwing InvalidAddressError", () => {
    // A bytes32 is 64 hex chars — feeding it to shortenAddress (getAddress) would throw.
    const claimId = "0x2d3d03ac9da7991cf017493734a1e09856242ca3f90280458f4fab9229932945";
    expect(() => shortenHex(claimId)).not.toThrow();
    expect(shortenHex(claimId)).toBe("0x2d3d…2945");
  });

  it("txExplorerUrl points at bscscan on chain 97", () => {
    expect(txExplorerUrl("0xhash")).toBe("https://testnet.bscscan.com/tx/0xhash");
  });
});
