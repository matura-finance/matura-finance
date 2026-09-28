import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PublicClient } from "viem";
import { assertChainId } from "../scripts/lib/network-guard.js";
import {
  ALLOWED_CHAIN_IDS,
  BSC_TESTNET_CHAIN_ID,
  LOCAL_CHAIN_ID,
} from "../scripts/lib/constants.js";

/// Pure unit coverage for the pre-flight chain guard — no chain, no node. This is the single
/// invariant every raw-key sender relies on ("chain 97 only; hard-refuse 56/unknown").

/// Minimal PublicClient double: `assertChainId` only ever calls `getChainId()`.
function clientReporting(chainId: number): PublicClient {
  return { getChainId: () => Promise.resolve(chainId) } as unknown as PublicClient;
}

describe("assertChainId (network guard)", () => {
  it("accepts chain 97 and returns it", async () => {
    const id = await assertChainId(clientReporting(BSC_TESTNET_CHAIN_ID), [BSC_TESTNET_CHAIN_ID]);
    assert.equal(id, BSC_TESTNET_CHAIN_ID);
  });

  it("accepts the local chain (31337) when allowed", async () => {
    const id = await assertChainId(clientReporting(LOCAL_CHAIN_ID), ALLOWED_CHAIN_IDS);
    assert.equal(id, LOCAL_CHAIN_ID);
  });

  it("hard-refuses BSC Mainnet (56) even if it were listed as allowed", async () => {
    await assert.rejects(
      () => assertChainId(clientReporting(56), [56, BSC_TESTNET_CHAIN_ID]),
      /Refusing to operate on BSC Mainnet/,
    );
  });

  it("refuses an unknown chain not in the allowed set", async () => {
    await assert.rejects(
      () => assertChainId(clientReporting(1), [BSC_TESTNET_CHAIN_ID]),
      /not in the allowed set/,
    );
  });
});
