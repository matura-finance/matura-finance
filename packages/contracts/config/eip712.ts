import type { Address, TypedDataDomain, TypedData } from "viem";
import { CLAIM_REGISTRY_DOMAIN_NAME, ROUTER_DOMAIN_NAME, DOMAIN_VERSION } from "./constants.js";

/// EIP-712 typed-data definitions. Field order + types mirror the Solidity typehashes exactly.
/// `as const` keeps literal inference so viem type-checks the signed message.

export const CLAIM_ATTESTATION_TYPES = {
  ClaimAttestation: [
    { name: "claimId", type: "bytes32" },
    { name: "issuer", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "token", type: "address" },
    { name: "faceValue", type: "uint256" },
    { name: "dueDate", type: "uint256" },
    { name: "claimType", type: "uint8" },
    { name: "externalIdHash", type: "bytes32" },
    { name: "evidenceHash", type: "bytes32" },
    { name: "signerEpoch", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const satisfies TypedData;

const ROUTE_LEG_TYPE = [
  { name: "claimId", type: "bytes32" },
  { name: "vault", type: "address" },
  { name: "faceAmount", type: "uint256" },
  { name: "minimumAdvanceAmount", type: "uint256" },
] as const;

export const EXECUTION_ROUTE_TYPES = {
  ExecutionRoute: [
    { name: "user", type: "address" },
    { name: "targetAdvance", type: "uint256" },
    { name: "maxTotalFace", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "legs", type: "RouteLeg[]" },
  ],
  RouteLeg: ROUTE_LEG_TYPE,
} as const satisfies TypedData;

export function claimRegistryDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: CLAIM_REGISTRY_DOMAIN_NAME, version: DOMAIN_VERSION, chainId, verifyingContract };
}

export function routerDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: ROUTER_DOMAIN_NAME, version: DOMAIN_VERSION, chainId, verifyingContract };
}
