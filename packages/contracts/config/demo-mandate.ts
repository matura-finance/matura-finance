import { parseUnits } from "viem";

/// Seed liquidity for the demo vault.
export const LIQUIDITY_CAP = parseUnits("1000000", 6);

/// Demo vault mandate — the SINGLE source shared by the test fixtures and the Ignition deploy
/// module, so the tested config can never drift from the deployed config. Keys match
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
