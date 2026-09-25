import { parseUnits } from "viem";

/// Named vault mandates — the SINGLE source shared by the Ignition deploy module, the seed/verify
/// scripts, and `test/VaultMandates.test.ts`, so tested config can never drift from deployed
/// config (the deployed vaults read these exact objects). A hand-written interface plus
/// `satisfies` is the reliable gate (Ignition's arg typing is weaker). viem maps uint8/16/32 →
/// `number` and uint256 → `bigint`, so `maxDurationDays` is a plain `number` while every money
/// field MUST be a `parseUnits(x, 6)` bigint — never a `100e6` numeric literal (that is a
/// `number`, a latent uint256 bug). Field names/types mirror ILiquidityVault.Mandate exactly.
export interface VaultMandate {
  /// Bitmap of supported ClaimTypes (bit i ⇔ ordinal i): PAYROLL=0, FREELANCE_ESCROW=1, STREAM=2.
  readonly supportedTypesBitmap: number; // uint16 → number
  /// Flat discount applied to every route leg, in basis points.
  readonly baseDiscountBps: number; // uint16 → number
  /// Per-day duration discount, in basis points per day to due date.
  readonly durationBpsPerDay: number; // uint16 → number
  /// Maximum days-to-due a claim may have to be routable through this vault.
  readonly maxDurationDays: number; // uint32 → number
  /// Minimum per-leg face value accepted (6-dp base units).
  readonly minFace: bigint; // uint256 → bigint
  /// Maximum per-leg face value accepted (6-dp base units).
  readonly maxFace: bigint; // uint256 → bigint
  /// Total liquidity cap the vault will hold/deploy (6-dp base units).
  readonly liquidityCap: bigint; // uint256 → bigint
  /// Per-claim-type premium discount, indexed by ClaimTypes ordinal (cardinality = CLAIM_TYPES.length).
  readonly claimTypePremiumBps: readonly [number, number, number];
}

/// Conservative "Stable" vault: PAYROLL | STREAM only, tight faces, low discount.
export const STABLE_MANDATE = {
  supportedTypesBitmap: 0b101, // PAYROLL | STREAM = 5
  baseDiscountBps: 50,
  durationBpsPerDay: 3,
  maxDurationDays: 90,
  minFace: parseUnits("100", 6),
  maxFace: parseUnits("50000", 6),
  liquidityCap: parseUnits("500000", 6),
  claimTypePremiumBps: [0, 0, 25],
} as const satisfies VaultMandate;

/// Flexible "Flex" vault: all claim types, larger faces, higher discount + longer durations.
export const FLEX_MANDATE = {
  supportedTypesBitmap: 0b111, // PAYROLL | FREELANCE_ESCROW | STREAM = 7
  baseDiscountBps: 150,
  durationBpsPerDay: 6,
  maxDurationDays: 365,
  minFace: parseUnits("100", 6),
  maxFace: parseUnits("200000", 6),
  liquidityCap: parseUnits("1000000", 6),
  claimTypePremiumBps: [0, 75, 25],
} as const satisfies VaultMandate;
