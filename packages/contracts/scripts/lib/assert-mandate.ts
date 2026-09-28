import type { VaultMandate } from "../../config/vault-mandates.js";

/// The on-chain shape a `LiquidityVault.getMandate()` returns as viem decodes it (uint16/32 →
/// `number`, uint256 → `bigint`, the per-type premium → a `number[]`). Structurally compatible with
/// viem's inferred `getMandate` return, so `await vault.read.getMandate()` slots straight in without
/// a cast. Shared by `verify.ts` + `check-deployment.ts` so the comparison can't drift between them.
export interface MandateView {
  readonly supportedTypesBitmap: number;
  readonly baseDiscountBps: number;
  readonly durationBpsPerDay: number;
  readonly maxDurationDays: number;
  readonly minFace: bigint;
  readonly maxFace: bigint;
  readonly liquidityCap: bigint;
  readonly claimTypePremiumBps: readonly number[];
}

/// True when an on-chain mandate matches the typed config exactly — every scalar plus the full
/// per-claim-type premium array (deployed config == tested config).
export function compareMandate(onChain: MandateView, want: VaultMandate): boolean {
  return (
    onChain.supportedTypesBitmap === want.supportedTypesBitmap &&
    onChain.baseDiscountBps === want.baseDiscountBps &&
    onChain.durationBpsPerDay === want.durationBpsPerDay &&
    onChain.maxDurationDays === want.maxDurationDays &&
    onChain.minFace === want.minFace &&
    onChain.maxFace === want.maxFace &&
    onChain.liquidityCap === want.liquidityCap &&
    onChain.claimTypePremiumBps.length === want.claimTypePremiumBps.length &&
    want.claimTypePremiumBps.every((v, i) => onChain.claimTypePremiumBps[i] === v)
  );
}
