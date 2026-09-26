"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import type { Hex } from "viem";
import { useWaitForTransactionReceipt } from "wagmi";

import { classifyTxError } from "../chain/errors";
import { initialTxState, txReducer, type TxState } from "./machine";

export interface TxFlow {
  state: TxState;
  /** Run a submit fn that signs+sends and resolves to the tx hash; drives the reducer. */
  run: (submit: () => Promise<Hex>) => Promise<void>;
  /** Called by the caller once the on-chain receipt is confirmed and it starts polling. */
  markIndexing: () => void;
  /** Called by the caller once the API projection reports the execution indexed. */
  markIndexed: () => void;
  reset: () => void;
}

/**
 * A per-transaction orchestration hook: wraps the receipt watch + error classifier
 * around the pure reducer. The indexing phase is caller-injected (each flow decides
 * how "indexed" is observed — e.g. `/request` polls `GET /executions/:id`). This keeps
 * the primitive reusable across the route, issuer, and settlement flows.
 */
export function useTxFlow(): TxFlow {
  const [state, dispatch] = useReducer(txReducer, initialTxState);
  const [hash, setHash] = useState<Hex | undefined>(undefined);
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt === undefined) return;
    if (receipt.status === "success")
      dispatch({ type: "confirmed", hash: receipt.transactionHash });
    else dispatch({ type: "fail", error: "reverted" });
  }, [receipt]);

  useEffect(() => {
    if (receiptError !== null) dispatch({ type: "fail", error: classifyTxError(receiptError) });
  }, [receiptError]);

  const run = useCallback(async (submit: () => Promise<Hex>) => {
    dispatch({ type: "submit" });
    try {
      const h = await submit();
      setHash(h);
      dispatch({ type: "broadcast", hash: h });
    } catch (error) {
      dispatch({ type: "fail", error: classifyTxError(error) });
    }
  }, []);

  const markIndexing = useCallback(() => {
    dispatch({ type: "indexing" });
  }, []);
  const markIndexed = useCallback(() => {
    dispatch({ type: "indexed" });
  }, []);
  const reset = useCallback(() => {
    setHash(undefined);
    dispatch({ type: "reset" });
  }, []);

  return { state, run, markIndexing, markIndexed, reset };
}
