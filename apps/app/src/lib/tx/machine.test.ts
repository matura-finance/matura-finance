import { describe, expect, it } from "vitest";

import { initialTxState, isTxInFlight, txReducer, type TxState } from "./machine";

const HASH = "0xabc" as const;

describe("txReducer", () => {
  it("submit → awaitingWallet", () => {
    expect(txReducer(initialTxState, { type: "submit" })).toEqual({ status: "awaitingWallet" });
  });

  it("full happy path to indexed", () => {
    let s: TxState = initialTxState;
    s = txReducer(s, { type: "submit" });
    s = txReducer(s, { type: "broadcast", hash: HASH });
    expect(s).toEqual({ status: "broadcast", hash: HASH });
    s = txReducer(s, { type: "confirmed", hash: HASH });
    expect(s).toEqual({ status: "confirmed", hash: HASH });
    s = txReducer(s, { type: "indexing" });
    expect(s).toEqual({ status: "indexing", hash: HASH });
    s = txReducer(s, { type: "indexed" });
    expect(s).toEqual({ status: "indexed", hash: HASH });
  });

  it("indexed directly after confirmed (skips indexing) is allowed", () => {
    const confirmed: TxState = { status: "confirmed", hash: HASH };
    expect(txReducer(confirmed, { type: "indexed" })).toEqual({ status: "indexed", hash: HASH });
  });

  it("indexing only applies from confirmed", () => {
    expect(txReducer(initialTxState, { type: "indexing" })).toEqual(initialTxState);
  });

  it("fail carries the error kind and preserves the hash", () => {
    const broadcast: TxState = { status: "broadcast", hash: HASH };
    expect(txReducer(broadcast, { type: "fail", error: "reverted" })).toEqual({
      status: "failed",
      error: "reverted",
      hash: HASH,
    });
  });

  it("fail from idle has no hash", () => {
    expect(txReducer(initialTxState, { type: "fail", error: "userRejected" })).toEqual({
      status: "failed",
      error: "userRejected",
    });
  });

  it("reset returns to idle", () => {
    const failed: TxState = { status: "failed", error: "unknown" };
    expect(txReducer(failed, { type: "reset" })).toEqual(initialTxState);
  });

  it("isTxInFlight is true only while awaiting wallet or broadcasting", () => {
    expect(isTxInFlight({ status: "awaitingWallet" })).toBe(true);
    expect(isTxInFlight({ status: "broadcast", hash: HASH })).toBe(true);
    expect(isTxInFlight({ status: "confirmed", hash: HASH })).toBe(false);
    expect(isTxInFlight(initialTxState)).toBe(false);
  });
});
