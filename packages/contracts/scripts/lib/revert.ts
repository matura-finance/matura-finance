import { BaseError, ContractFunctionRevertedError } from "viem";

/// True when `error` is a contract revert with the given custom-error name. Lets callers treat one
/// expected revert (e.g. `ClaimNotFound`) as a normal outcome while still surfacing every other
/// failure (RPC error, ABI decode error, an unrelated revert) instead of swallowing it.
export function isRevertNamed(error: unknown, name: string): boolean {
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    return revert instanceof ContractFunctionRevertedError && revert.data?.errorName === name;
  }
  return false;
}
