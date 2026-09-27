import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { CLAIM_TYPE } from "./constants.js";

/// Deterministic bytes32 claim id from a claim label — the derivation used for the SIGNED payroll
/// claim (registered via registerClaim). Same label ⇒ same id, so the seed is idempotent and other
/// scripts can find the claim without reading tx logs. Adapter claims derive their id on-chain
/// instead (see `escrowClaimId` / `streamClaimId`).
export function claimIdFor(label: string): Hex {
  return keccak256(toHex(`claim:${label}`));
}

/// Deterministic bytes32 external-id hash for a SIGNED claim label (attestation `externalIdHash`).
export function externalIdFor(label: string): Hex {
  return keccak256(toHex(`ext:${label}`));
}

/// The claimId a `MockFreelanceEscrow` derives for an engagement's payout — mirrors the contract's
/// `keccak256(abi.encode("MockFreelanceEscrow.claim", address(this), engagementId))` exactly.
export function escrowClaimId(escrow: Address, engagementId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "uint256" }],
      ["MockFreelanceEscrow.claim", getAddress(escrow), engagementId],
    ),
  );
}

/// The claimId a `MockStream` derives for a stream — mirrors the contract's
/// `keccak256(abi.encode("MockStream.claim", address(this), streamId))` exactly.
export function streamClaimId(stream: Address, streamId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "address" }, { type: "uint256" }],
      ["MockStream.claim", getAddress(stream), streamId],
    ),
  );
}

/// Demo scenario data — the SINGLE source shared by the seed, verify, and demo scripts. All money
/// is a `parseUnits(x, 6)` bigint (6-dp MockUSDT base units); day counts are plain `number`.

/// Actor role → wallet index. These indices are the local Hardhat DETERMINISTIC accounts (mirrors
/// how `test/helpers/fixtures.ts` destructures `viem.getWalletClients()`: `[admin, issuerSigner,
/// user, ...]` — here `deployer` == fixtures' `admin`, `alice` == fixtures' `user`). On testnet the
/// signing keys come from the Hardhat keystore, NOT these indices — only addresses are ever derived.
export const ACTORS = {
  deployer: 0,
  issuerSigner: 1,
  alice: 2,
} as const;

/// The shared (payroll) issuer identity's metadata hash — a fixed bytes32 (keccak256 of a stable
/// label). The issuer ENTITY address and the SIGNER address are resolved at runtime. Only addresses
/// are resolved/committed — NEVER private keys.
export const ISSUER_METADATA_HASH = keccak256(toHex("matura-demo-issuer"));
/// Metadata hashes for the two source-adapter issuer entities (each adapter is its own issuer).
export const ESCROW_METADATA_HASH = keccak256(toHex("matura-freelance-escrow"));
export const STREAM_METADATA_HASH = keccak256(toHex("matura-stream"));

/// A SIGNED claim (payroll): registered via an issuer EIP-712 attestation. `faceValue` is exact.
export interface SignedClaim {
  readonly kind: "signed";
  readonly label: string;
  readonly claimType: number;
  readonly faceValue: bigint;
  readonly dueInDays: number;
}

/// An ESCROW claim: a `MockFreelanceEscrow` engagement funded by the client and paid to Alice. The
/// registered face equals `amount` exactly (the escrow freezes faceValue = engagement amount).
export interface EscrowClaim {
  readonly kind: "escrow";
  readonly label: string;
  readonly engagementId: bigint;
  readonly claimType: number;
  readonly amount: bigint;
  readonly dueInDays: number;
}

/// A STREAM claim: a `MockStream` linear position assigned to the protocol. The registered face is
/// the claimable-at-registration (vested − withdrawn), so it is read from chain, not asserted exact.
/// `startOffsetDays` places the stream start in the past so a meaningful amount has already vested.
export interface StreamClaim {
  readonly kind: "stream";
  readonly label: string;
  readonly streamId: bigint;
  readonly claimType: number;
  readonly deposit: bigint;
  readonly startOffsetDays: number;
  readonly durationDays: number;
}

export type ClaimSource = SignedClaim | EscrowClaim | StreamClaim;

/// Alice's three claims (ELIGIBLE after seed): a signed payroll attestation, an escrow-adapter
/// freelance payout, and a stream-adapter position. `claimType` reuses the shared ordinals.
export const ALICE_PAYROLL: SignedClaim = {
  kind: "signed",
  label: "alice-payroll",
  claimType: CLAIM_TYPE.PAYROLL,
  faceValue: parseUnits("20000", 6),
  dueInDays: 30,
};
export const ALICE_FREELANCE: EscrowClaim = {
  kind: "escrow",
  label: "alice-freelance",
  engagementId: 1n,
  claimType: CLAIM_TYPE.FREELANCE_ESCROW,
  amount: parseUnits("15000", 6),
  dueInDays: 45,
};
export const ALICE_STREAM: StreamClaim = {
  kind: "stream",
  label: "alice-stream",
  streamId: 1n,
  claimType: CLAIM_TYPE.STREAM,
  deposit: parseUnits("20000", 6),
  startOffsetDays: 30, // stream started 30d ago …
  durationDays: 60, // … over a 60d schedule ⇒ ~50% vested at seed, stop = now + 30d (dueDate)
};

export const ALICE_CLAIMS: readonly ClaimSource[] = [ALICE_PAYROLL, ALICE_FREELANCE, ALICE_STREAM];

/// Resolve a claim's on-chain claimId: label-derived for the signed payroll claim, adapter-derived
/// (from the manifest source address + engagement/stream id) for the escrow/stream adapters.
export function resolveClaimId(
  claim: ClaimSource,
  sources: { freelance: Address; stream: Address },
): Hex {
  switch (claim.kind) {
    case "signed":
      return claimIdFor(claim.label);
    case "escrow":
      return escrowClaimId(sources.freelance, claim.engagementId);
    case "stream":
      return streamClaimId(sources.stream, claim.streamId);
  }
}

/// The exact expected face for a claim, or `undefined` when it must be read from chain (the stream
/// face is the vested-at-registration amount, which depends on the exact registration block).
export function expectedFace(claim: ClaimSource): bigint | undefined {
  switch (claim.kind) {
    case "signed":
      return claim.faceValue;
    case "escrow":
      return claim.amount;
    case "stream":
      return undefined;
  }
}

/// Request A calibration — a single PARTIAL payroll slice suffices (advance < face always holds).
export const REQUEST_A = {
  targetAdvance: parseUnits("4800", 6),
  maxTotalFace: parseUnits("6000", 6),
  eligibleClaims: ["alice-payroll"],
} as const;

/// Request B calibration — requires ≥2 claims (targetAdvance exceeds the largest single claim face,
/// so no single claim's advance can ever reach it).
export const REQUEST_B = {
  targetAdvance: parseUnits("24000", 6),
  maxTotalFace: parseUnits("40000", 6),
  eligibleClaims: ["alice-payroll", "alice-stream"],
} as const;
