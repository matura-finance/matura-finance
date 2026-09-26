import { type Hex } from "viem";

import { collectCandidates } from "./quote-collector";
import type { PinnedReads, VaultMandate, VaultQuote } from "../chain/contracts.service";
import type { OnChainClaim } from "../chain/chain.service";

const hex = (fill: string): Hex => `0x${fill}`;
const WALLET = hex("a".repeat(40));
const ISSUER = hex("b".repeat(40));
const TOKEN = hex("c".repeat(40));
const VAULT = hex("d".repeat(40));
const CLAIM = hex("1".repeat(64));
const TS = 1_780_000_000n;

const mandate: VaultMandate = {
  supportedTypesBitmap: 0b101, // PAYROLL(0) | STREAM(2)
  baseDiscountBps: 100,
  durationBpsPerDay: 0,
  maxDurationDays: 365,
  minFace: 1n,
  maxFace: 1_000_000n,
  liquidityCap: 10_000_000n,
  claimTypePremiumBps: [0, 0, 0],
};

function claim(overrides: Partial<OnChainClaim> = {}): OnChainClaim {
  return {
    beneficiary: WALLET,
    claimType: 0, // PAYROLL
    state: 1, // ELIGIBLE
    sliceCount: 0,
    dueDate: TS + 30n * 86_400n,
    issuer: ISSUER,
    token: TOKEN,
    faceValue: 1000n,
    financedFaceValue: 0n,
    ...overrides,
  };
}

function fakeReads(
  claimResult: OnChainClaim | null,
  quote: VaultQuote = { ok: true, advanceAmount: 990n, discountAmount: 10n },
): PinnedReads {
  return {
    blockNumber: 10n,
    getClaim: () => Promise.resolve(claimResult),
    isIssuerActive: () => Promise.resolve(true),
    isVaultActive: () => Promise.resolve(true),
    vaultToken: () => Promise.resolve(TOKEN),
    routerPaused: () => Promise.resolve(false),
    routerNonce: () => Promise.resolve(0n),
    getVaults: () => Promise.resolve([VAULT]),
    getMandate: () => Promise.resolve(mandate),
    fundableLiquidity: () => Promise.resolve(5_000_000n),
    quoteAndCheck: () => Promise.resolve(quote),
  };
}

describe("collectCandidates", () => {
  it("produces an eligible candidate for an owned, financeable claim", async () => {
    const { candidates, rejected } = await collectCandidates(fakeReads(claim()), TS, WALLET, [
      CLAIM,
    ]);
    expect(rejected).toHaveLength(0);
    expect(candidates).toHaveLength(1);
    const c = candidates[0];
    expect(c?.vault).toBe(VAULT.toLowerCase());
    expect(c?.remainingFace).toBe("1000");
    expect(c?.rateBps).toBeGreaterThan(0);
    expect(c?.slicesRemaining).toBe(8);
  });

  it("rejects a claim not owned by the wallet", async () => {
    const other = hex("e".repeat(40));
    const { candidates, rejected } = await collectCandidates(
      fakeReads(claim({ beneficiary: other })),
      TS,
      WALLET,
      [CLAIM],
    );
    expect(candidates).toHaveLength(0);
    expect(rejected[0]?.reason).toBe("NOT_OWNED_BY_WALLET");
  });

  it("rejects an unsupported claim type", async () => {
    // FREELANCE_ESCROW(1) is not in the 0b101 bitmap.
    const { candidates, rejected } = await collectCandidates(
      fakeReads(claim({ claimType: 1 })),
      TS,
      WALLET,
      [CLAIM],
    );
    expect(candidates).toHaveLength(0);
    expect(rejected[0]?.reason).toBe("UNSUPPORTED_CLAIM_TYPE");
  });

  it("rejects a non-financeable state", async () => {
    const { candidates, rejected } = await collectCandidates(
      fakeReads(claim({ state: 3 })),
      TS,
      WALLET,
      [CLAIM],
    );
    expect(candidates).toHaveLength(0);
    expect(rejected[0]?.reason).toBe("CLAIM_NOT_FINANCEABLE");
  });

  it("rejects a mandate-rejected quote", async () => {
    const reads = fakeReads(claim(), { ok: false, advanceAmount: 0n, discountAmount: 0n });
    const { candidates, rejected } = await collectCandidates(reads, TS, WALLET, [CLAIM]);
    expect(candidates).toHaveLength(0);
    expect(rejected[0]?.reason).toBe("MANDATE_REJECTED");
  });
});
