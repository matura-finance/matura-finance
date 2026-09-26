import { type Hex, hashTypedData } from "viem";
import { EXECUTION_ROUTE_TYPES, routerDomain } from "@matura/chain";

/** The on-chain `ExecutionRoute` struct as viem/EIP-712 expects it — bigints intact. */
export interface ExecutionRouteMessage {
  user: Hex;
  targetAdvance: bigint;
  maxTotalFace: bigint;
  deadline: bigint;
  nonce: bigint;
  legs: { claimId: Hex; vault: Hex; faceAmount: bigint; minimumAdvanceAmount: bigint }[];
}

/**
 * JSON-safe view of the typed-data message (bigints → decimal strings) for the
 * HTTP response body only. NEVER hash this: `executionId` / `hashTypedData` must
 * always be computed from the bigint {@link ExecutionRouteMessage}, or the digest
 * is wrong-but-plausible.
 */
export function serializeExecutionRouteMessage(
  message: ExecutionRouteMessage,
): Record<string, unknown> {
  return {
    user: message.user,
    targetAdvance: message.targetAdvance.toString(),
    maxTotalFace: message.maxTotalFace.toString(),
    deadline: message.deadline.toString(),
    nonce: message.nonce.toString(),
    legs: message.legs.map((leg) => ({
      claimId: leg.claimId,
      vault: leg.vault,
      faceAmount: leg.faceAmount.toString(),
      minimumAdvanceAmount: leg.minimumAdvanceAmount.toString(),
    })),
  };
}

/**
 * Build the EIP-712 typed data for an ExecutionRoute: the JSON-safe `typedData`
 * for the prepare step (message serialized), plus the `executionId` digest
 * computed from the BIGINT message (never the serialized view). Shared by the
 * routes and executions prepare flows so the digest can't diverge.
 */
export function buildExecutionRouteTypedData(
  chainId: number,
  verifyingContract: Hex,
  message: ExecutionRouteMessage,
): { typedData: Record<string, unknown>; executionId: Hex } {
  const domain = routerDomain(chainId, verifyingContract);
  const executionId = hashTypedData({
    domain,
    types: EXECUTION_ROUTE_TYPES,
    primaryType: "ExecutionRoute",
    message,
  });
  return {
    typedData: {
      domain,
      types: EXECUTION_ROUTE_TYPES,
      primaryType: "ExecutionRoute",
      message: serializeExecutionRouteMessage(message),
    },
    executionId,
  };
}
