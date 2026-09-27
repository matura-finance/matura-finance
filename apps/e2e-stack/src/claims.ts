import { keccak256, toHex, type Hex } from "viem";

/// The signed payroll claim's id is label-derived (mirrors `packages/contracts/config/demo.ts`,
/// which is not an importable package). The adapter (escrow/stream) claimIds are NOT derived
/// off-chain — they are read straight from the adapter contracts at runtime (the adapter is the
/// authority on its own claimId), avoiding any derivation drift.
export function payrollClaimId(): Hex {
  return keccak256(toHex("claim:alice-payroll"));
}
