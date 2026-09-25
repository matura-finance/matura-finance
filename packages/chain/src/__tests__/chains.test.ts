import { describe, expect, it } from "vitest";

import { BSC_TESTNET_CHAIN_ID, bscTestnet } from "../chains.js";

describe("bscTestnet", () => {
  it("has chain id 97", () => {
    expect(bscTestnet.id).toBe(97);
    expect(BSC_TESTNET_CHAIN_ID).toBe(97);
  });

  it("is flagged as a testnet", () => {
    expect(bscTestnet.testnet).toBe(true);
  });

  it("uses tBNB as the native currency", () => {
    expect(bscTestnet.nativeCurrency.symbol).toBe("tBNB");
    expect(bscTestnet.nativeCurrency.decimals).toBe(18);
  });

  it("exposes a default RPC endpoint", () => {
    expect(bscTestnet.rpcUrls.default.http[0]).toContain("bnbchain.org");
  });
});
