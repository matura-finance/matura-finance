import { keccak256, parseUnits, toHex } from "viem";
import { CLAIM_TYPE } from "./constants.js";

/// Demo scenario data — the SINGLE source shared by the seed, verify, and demo scripts. All money
/// is a `parseUnits(x, 6)` bigint (6-dp MockUSDT base units); `dueInDays` is a plain `number`.

/// Actor role → wallet index. These indices are the local Hardhat DETERMINISTIC accounts (mirrors
/// how `test/helpers/fixtures.ts` destructures `viem.getWalletClients()`: `[admin, issuerSigner,
/// user, ...]` — here `deployer` == fixtures' `admin`, `alice` == fixtures' `user`). On testnet the
/// signing keys come from the Hardhat keystore, NOT these indices — only addresses are ever derived.
export const ACTORS = {
  deployer: 0,
  issuerSigner: 1,
  alice: 2,
} as const;

/// The shared issuer identity's metadata hash — a fixed bytes32 (keccak256 of a stable label).
/// The issuer ENTITY address and the SIGNER address are resolved at runtime: from `ACTORS` on the
/// local Hardhat chain, or from the keystore on testnet. Only addresses are resolved/committed —
/// NEVER private keys.
export const ISSUER_METADATA_HASH = keccak256(toHex("matura-demo-issuer"));

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

/// Alice's three claims registered by the seed (ELIGIBLE state only). `claimType` reuses the
/// shared `CLAIM_TYPE` ordinals; `faceValue` is a 6-dp bigint; `dueInDays` is days from seed time.
export const ALICE_CLAIMS = [
  {
    label: "alice-payroll",
    claimType: CLAIM_TYPE.PAYROLL,
    faceValue: parseUnits("20000", 6),
    dueInDays: 30,
  },
  {
    label: "alice-freelance",
    claimType: CLAIM_TYPE.FREELANCE_ESCROW,
    faceValue: parseUnits("15000", 6),
    dueInDays: 45,
  },
  {
    label: "alice-stream",
    claimType: CLAIM_TYPE.STREAM,
    faceValue: parseUnits("10000", 6),
    dueInDays: 60,
  },
] as const;
