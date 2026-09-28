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
/// `dueInDays` is the normal (day-granularity) maturity offset; `dueInSeconds`, when present, wins
/// and expresses a SHORT second-granularity maturity — used only by the scripted proof claim so a
/// single testnet session can fund (needs `dueDate` in the future) and, after the window elapses,
/// settle (needs `dueDate` reached) the same claim without waiting whole days.
export interface SignedClaim {
  readonly kind: "signed";
  readonly label: string;
  readonly claimType: number;
  readonly faceValue: bigint;
  readonly dueInDays: number;
  readonly dueInSeconds?: number;
  /// EIP-712 attestation nonce (per-signer, single-use). Defaults to 0. Every signed claim SHARES
  /// the payroll issuer signer, so multiple signed claims MUST carry distinct nonces or the second
  /// registerClaim reverts NonceAlreadyUsed.
  readonly attestationNonce?: bigint;
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

/// Short maturity window (seconds) for the scripted proof claim: long enough to fund promptly after
/// seeding, short enough to settle within the same testnet session once it elapses. Tunable.
export const SCRIPTED_DUE_SECONDS = 1200;

/// The DEPLOYER-OWNED scripted claim driven by `demo-testnet-execute.ts` for the one real
/// execute+settle proof. Its label is DISTINCT from every interactive (Alice / SEED_BENEFICIARY)
/// claim so the two id spaces never collide even when both resolve to the deployer as beneficiary
/// (testnet with SEED_BENEFICIARY unset). A signed payroll attestation so the payroll SourceObligor
/// can self-settle it; a small face the pre-funded obligor easily covers; a short seconds-granularity
/// maturity (see SCRIPTED_DUE_SECONDS) so fund-then-settle fits one session.
export const SCRIPTED_DEPLOYER_PAYROLL: SignedClaim = {
  kind: "signed",
  label: "matura-scripted-deployer-payroll-2",
  claimType: CLAIM_TYPE.PAYROLL,
  faceValue: parseUnits("1000", 6),
  dueInDays: 0, // unused: dueInSeconds wins for this claim
  dueInSeconds: SCRIPTED_DUE_SECONDS,
  attestationNonce: 2n, // payroll issuer signer already used 0n (ALICE_PAYROLL) and 1n (original scripted claim) — 2n is the next free nonce
};

/// Resolve the demo beneficiary for the INTERACTIVE claims (payroll attestation + escrow payout).
/// `SEED_BENEFICIARY` (a 0x address; accepted lower/upper/checksummed, normalized here) overrides
/// the default so an operator can point the interactive demo at the wallet they will connect. When
/// unset or blank it falls back to `fallback` — Alice (wallet index 2) locally, the deployer on
/// testnet — preserving the existing 31337 behavior. Throws on a malformed / bad-checksum address
/// so a fat-fingered env fails fast at seed rather than minting a claim to an unusable address.
export function resolveBeneficiary(
  seedBeneficiary: string | undefined,
  fallback: Address,
): Address {
  if (seedBeneficiary === undefined) return fallback;
  const trimmed = seedBeneficiary.trim();
  if (trimmed === "") return fallback;
  try {
    return getAddress(trimmed);
  } catch {
    throw new Error(
      `SEED_BENEFICIARY is not a valid address: ${JSON.stringify(seedBeneficiary)}. ` +
        "Provide a 0x-prefixed 40-hex-digit address (lower-case, upper-case, or EIP-55 checksummed).",
    );
  }
}

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
/// `key` is the scenario label (mirrored in the demo fixture) — carried here so the fixture and any
/// consumer derive it from this source of truth rather than positionally.
export const REQUEST_A = {
  key: "A",
  targetAdvance: parseUnits("4800", 6),
  maxTotalFace: parseUnits("6000", 6),
  eligibleClaims: ["alice-payroll"],
} as const;

/// Request B calibration — requires ≥2 claims (targetAdvance exceeds the largest single claim face,
/// so no single claim's advance can ever reach it). Spans two sources AND two vaults: payroll is
/// cheapest on Stable, freelance (FREELANCE_ESCROW) is Flex-only — so the route demonstrates
/// best-execution across competing pools. Uses freelance (not the recipient-gated stream claim, which
/// the seed skips under a SEED_BENEFICIARY override) so scenario B always seeds ELIGIBLE on testnet.
export const REQUEST_B = {
  key: "B",
  targetAdvance: parseUnits("24000", 6),
  maxTotalFace: parseUnits("40000", 6),
  eligibleClaims: ["alice-payroll", "alice-freelance"],
} as const;
