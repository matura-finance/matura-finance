import { type Hex, keccak256, stringToHex } from "viem";

import type { CollectedCandidate } from "./quote-collector";

/**
 * Deterministic canonical serialization for content hashing: object keys sorted,
 * only JSON scalars. Throws on `bigint`/`undefined` so a stray non-string can't
 * silently break byte-identical determinism (all money must be pre-stringified).
 */
function canonical(value: unknown): string {
  if (typeof value === "bigint")
    throw new Error("canonical: bigint must be stringified before hashing");
  if (value === undefined) throw new Error("canonical: undefined is not serializable");
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  throw new Error("canonical: unsupported value type");
}

/** keccak256 of the canonical serialization (full-width 0x hex). */
export function contentHash(value: unknown): Hex {
  return keccak256(stringToHex(canonical(value)));
}

/**
 * A quote candidate as it feeds the snapshot hash. Reuses `CollectedCandidate`
 * verbatim so a new candidate field can't silently drop out of the snapshot hash
 * (which would be a determinism bug, not a type error).
 */
export type SnapshotCandidate = CollectedCandidate;

/** Hash the pinned quote snapshot: the block + every candidate (sorted for stability). */
export function quoteSnapshotHash(blockNumber: bigint, candidates: SnapshotCandidate[]): Hex {
  const sorted = [...candidates].sort((a, b) =>
    a.claimId !== b.claimId
      ? a.claimId < b.claimId
        ? -1
        : 1
      : a.vault < b.vault
        ? -1
        : a.vault > b.vault
          ? 1
          : 0,
  );
  return contentHash({ blockNumber: blockNumber.toString(), candidates: sorted });
}

/** Leg identity that feeds the routeId (routerNonce excluded — bound at prepare). */
export interface RouteIdLeg {
  claimId: string;
  vault: string;
  faceAmount: string;
}

/**
 * Deterministic route id: a content hash over the wallet, quote snapshot, chosen
 * legs, target and caps. Identical inputs → identical id (idempotent optimize).
 * `chainId` is intentionally omitted: the RouteIntent DB is per-deployment and the
 * session JWT is chain-bound, so a routeId can't be replayed across chains.
 */
export function routeIdOf(parts: {
  user: string;
  quoteSnapshotHash: string;
  legs: RouteIdLeg[];
  targetAdvance: string;
  maxTotalFace: string | null;
  maxTotalCost: string | null;
  routeDeadlineSeconds: number;
}): Hex {
  const legs = [...parts.legs].sort((a, b) =>
    a.claimId !== b.claimId
      ? a.claimId < b.claimId
        ? -1
        : 1
      : a.vault < b.vault
        ? -1
        : a.vault > b.vault
          ? 1
          : 0,
  );
  return contentHash({ ...parts, legs });
}
