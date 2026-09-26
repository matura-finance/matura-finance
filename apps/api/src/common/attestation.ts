import { randomBytes } from "node:crypto";
import type { Hex } from "viem";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as const;

/** The EIP-712 `ClaimAttestation` message (field order mirrors the Solidity typehash). */
export interface ClaimAttestationMessage {
  claimId: Hex;
  issuer: Hex;
  beneficiary: Hex;
  token: Hex;
  faceValue: bigint;
  dueDate: bigint;
  claimType: number;
  externalIdHash: Hex;
  evidenceHash: Hex;
  signerEpoch: bigint;
  nonce: bigint;
  deadline: bigint;
}

export interface AttestationInputs {
  claimId: Hex;
  issuer: Hex;
  beneficiary: Hex;
  token: Hex;
  faceValue: bigint;
  dueDate: bigint;
  claimType: number;
  externalIdHash?: Hex;
  evidenceHash?: Hex;
  signerEpoch: bigint;
  nonce: bigint;
  deadline: bigint;
}

/** A fresh, unordered 256-bit attestation nonce (ClaimRegistry uses an unused-set, not a counter). */
export function randomNonce(): bigint {
  return BigInt(`0x${randomBytes(32).toString("hex")}`);
}

export function buildAttestation(inputs: AttestationInputs): ClaimAttestationMessage {
  return {
    claimId: inputs.claimId,
    issuer: inputs.issuer,
    beneficiary: inputs.beneficiary,
    token: inputs.token,
    faceValue: inputs.faceValue,
    dueDate: inputs.dueDate,
    claimType: inputs.claimType,
    externalIdHash: inputs.externalIdHash ?? ZERO_BYTES32,
    evidenceHash: inputs.evidenceHash ?? ZERO_BYTES32,
    signerEpoch: inputs.signerEpoch,
    nonce: inputs.nonce,
    deadline: inputs.deadline,
  };
}

/** JSON-safe view of the attestation (bigints → decimal strings) for the response body. */
export function serializeAttestation(message: ClaimAttestationMessage): Record<string, unknown> {
  return {
    claimId: message.claimId,
    issuer: message.issuer,
    beneficiary: message.beneficiary,
    token: message.token,
    faceValue: message.faceValue.toString(),
    dueDate: message.dueDate.toString(),
    claimType: message.claimType,
    externalIdHash: message.externalIdHash,
    evidenceHash: message.evidenceHash,
    signerEpoch: message.signerEpoch.toString(),
    nonce: message.nonce.toString(),
    deadline: message.deadline.toString(),
  };
}
