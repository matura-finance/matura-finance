import type { Address, TypedData, TypedDataDomain } from "viem";

/**
 * EIP-712 typed-data definitions for the Matura protocol, colocated with the ABIs/manifests they
 * bind to. Field order + types mirror the Solidity typehashes exactly; `as const satisfies
 * TypedData` keeps literal inference so viem type-checks the signed message and
 * `hashTypedData(...)` reproduces the on-chain `_hashTypedDataV4` digest byte-for-byte.
 *
 * `@matura/contracts/config/eip712.ts` keeps its own copy (that package must stay self-contained,
 * no `@matura/*` deps); a parity test guards the two against drift.
 */

/** EIP-712 domain name for ClaimRegistry — matches its `EIP712(name, version)` constructor. */
export const CLAIM_REGISTRY_DOMAIN_NAME = "MaturaClaimRegistry";
/** EIP-712 domain name for MaturaRouter. */
export const ROUTER_DOMAIN_NAME = "MaturaRouter";
/** EIP-712 domain version, shared by both contracts. */
export const DOMAIN_VERSION = "1";

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

/** Build the ClaimRegistry EIP-712 domain for a chain + verifying contract. */
export function claimRegistryDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: CLAIM_REGISTRY_DOMAIN_NAME, version: DOMAIN_VERSION, chainId, verifyingContract };
}

/** Build the MaturaRouter EIP-712 domain for a chain + verifying contract. */
export function routerDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: ROUTER_DOMAIN_NAME, version: DOMAIN_VERSION, chainId, verifyingContract };
}
