import type { Hex } from "viem";

import type { TxErrorKind } from "../chain/errors";

/**
 * A per-transaction lifecycle state used by the `/request` execution flow (sign → submit →
 * confirm → index). It tracks PROGRESS; failure detail is a `TxErrorKind` from
 * `chain/errors.ts` (not duplicated as separate states). The issuer/settlement flows
 * currently use a simpler local status (they submit server-provided calldata with no
 * signature phase); adopting this primitive there is a possible future consolidation.
 */
export type TxState =
  | { status: "idle" }
  | { status: "awaitingWallet" } // wallet prompt open (signature and/or tx confirm)
  | { status: "broadcast"; hash: Hex } // tx sent, awaiting receipt
  | { status: "confirmed"; hash: Hex } // receipt.status === success
  | { status: "indexing"; hash: Hex } // confirmed on-chain, waiting for the projection
  | { status: "indexed"; hash: Hex } // projected — the only "done" state for indexed flows
  | { status: "failed"; error: TxErrorKind; hash?: Hex };

export type TxAction =
  | { type: "submit" }
  | { type: "broadcast"; hash: Hex }
  | { type: "confirmed"; hash: Hex }
  | { type: "indexing" }
  | { type: "indexed" }
  | { type: "fail"; error: TxErrorKind }
  | { type: "reset" };

export const initialTxState: TxState = { status: "idle" };

/** Pure transition function. Unknown transitions are ignored (state unchanged). */
export function txReducer(state: TxState, action: TxAction): TxState {
  switch (action.type) {
    case "submit":
      return { status: "awaitingWallet" };
    case "broadcast":
      return { status: "broadcast", hash: action.hash };
    case "confirmed":
      return { status: "confirmed", hash: action.hash };
    case "indexing":
      return state.status === "confirmed" ? { status: "indexing", hash: state.hash } : state;
    case "indexed":
      return state.status === "confirmed" || state.status === "indexing"
        ? { status: "indexed", hash: state.hash }
        : state;
    case "fail": {
      const hash = "hash" in state ? state.hash : undefined;
      return { status: "failed", error: action.error, hash };
    }
    case "reset":
      return initialTxState;
  }
}

/** True while a wallet/tx interaction is in flight — use to disable sign/submit buttons. */
export function isTxInFlight(state: TxState): boolean {
  return state.status === "awaitingWallet" || state.status === "broadcast";
}
