import { parseUnits } from "viem";

/// Seed liquidity for the demo vault (internal to this module's DEMO_MANDATE).
const LIQUIDITY_CAP = parseUnits("1000000", 6);

/// Demo vault mandate used by the test fixtures (`test/helpers/fixtures.ts`) and the contract unit
/// suite. NOTE: the vaults the protocol actually DEPLOYS use `config/vault-mandates.ts`
/// (STABLE_MANDATE / FLEX_MANDATE) — this single-vault mandate is a test fixture only. Keys match
/// ILiquidityVault.Mandate; `maxDurationDays` is a uint32 (number, not bigint).
export const DEMO_MANDATE = {
  supportedTypesBitmap: 0b111, // PAYROLL | FREELANCE_ESCROW | STREAM
  baseDiscountBps: 100,
  durationBpsPerDay: 5,
  maxDurationDays: 180,
  minFace: parseUnits("100", 6),
  maxFace: parseUnits("100000", 6),
  liquidityCap: LIQUIDITY_CAP,
  claimTypePremiumBps: [0, 50, 25] as [number, number, number],
} as const;
