import type { Hex } from "viem";

/** Common on-chain log identity carried by every parsed event. */
export interface EventMeta {
  blockNumber: bigint;
  logIndex: number;
  txHash: Hex;
}

/** Decoded, projection-ready event — a discriminated union keyed by `kind`. */
export type ParsedEvent = EventMeta &
  (
    | {
        kind: "ClaimRegistered";
        claimId: string;
        issuer: string;
        beneficiary: string;
        claimType: number;
        token: string;
        faceValue: bigint;
        dueDate: bigint;
      }
    | { kind: "ClaimStateChanged"; claimId: string; newState: number }
    | { kind: "ClaimSliceReserved"; claimId: string; financedFaceValue: bigint }
    | { kind: "ClaimSliceReleased"; claimId: string; financedFaceValue: bigint }
    | {
        kind: "RouteExecuted";
        executionId: string;
        user: string;
        totalAdvance: bigint;
        totalFaceAssigned: bigint;
        totalCost: bigint;
      }
    | {
        kind: "RouteLegExecuted";
        executionId: string;
        claimId: string;
        vault: string;
        faceAmount: bigint;
        advanceAmount: bigint;
        discountAmount: bigint;
      }
    | {
        kind: "ClaimSettled";
        claimId: string;
        amountReceived: bigint;
        vaultDistribution: bigint;
        userResidual: bigint;
        protocolFee: bigint;
      }
  );

/** Minimal shape of a viem log's on-chain identity (nullable only for pending logs). */
export interface RawLogMeta {
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hex | null;
}

/** Extract a non-null `EventMeta` from a mined log, or null if the log is still pending. */
export function extractMeta(log: RawLogMeta): EventMeta | null {
  if (log.blockNumber === null || log.logIndex === null || log.transactionHash === null) {
    return null;
  }
  return { blockNumber: log.blockNumber, logIndex: log.logIndex, txHash: log.transactionHash };
}

/** Lowercase an address/bytes32 for storage (projections are lowercase). */
export function lower(value: string): string {
  return value.toLowerCase();
}
