import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** Discriminated failure kinds the transaction reducer / UI consume. */
export type TxErrorKind =
  "userRejected" | "nonceStale" | "reverted" | "insufficientFunds" | "unknown";

/**
 * Classify a thrown wallet/contract error into a stable union, never by string-matching.
 * `catch` is `unknown` → narrow with `instanceof BaseError` → `walk()` (which returns
 * `Error | null`, so re-narrow with `instanceof`).
 */
export function classifyTxError(error: unknown): TxErrorKind {
  if (!(error instanceof BaseError)) return "unknown";

  if (error.walk((e) => e instanceof UserRejectedRequestError) !== null) {
    return "userRejected";
  }

  const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
  if (revert instanceof ContractFunctionRevertedError) {
    const name = revert.data?.errorName;
    if (name === "InvalidAccountNonce") return "nonceStale";
    return "reverted";
  }

  // viem surfaces insufficient-gas as a message on the base error; a coarse check is fine
  // here since it only drives a "get testnet BNB" hint, never money logic.
  if (/insufficient funds/i.test(error.shortMessage)) return "insufficientFunds";

  return "unknown";
}

/** Human-facing copy for each failure kind (next-useful-action oriented). */
export const TX_ERROR_COPY: Record<TxErrorKind, { title: string; body: string }> = {
  userRejected: {
    title: "Request cancelled",
    body: "You declined the request in your wallet. You can try again when ready.",
  },
  nonceStale: {
    title: "Route out of date",
    body: "Your account state changed before this route was submitted. Refresh to compare current prices.",
  },
  reverted: {
    title: "Transaction reverted",
    body: "The transaction did not complete on-chain. Refresh to compare current prices and try again.",
  },
  insufficientFunds: {
    title: "Not enough BNB for gas",
    body: "You need testnet BNB to submit this transaction. Fund your wallet from the BNB Chain testnet faucet and try again.",
  },
  unknown: {
    title: "Something went wrong",
    body: "The request could not be completed. Please try again.",
  },
};
