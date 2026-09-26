import { type Hex } from "viem";

import { validateRouteLegs } from "./leg-mirror";
import type { PinnedReads } from "../chain/contracts.service";
import type { OnChainClaim } from "../chain/chain.service";

const hex = (fill: string): Hex => `0x${fill}`;
const WALLET = hex("a".repeat(40));
const ISSUER = hex("b".repeat(40));
const TOKEN = hex("c".repeat(40));
const VAULT = hex("d".repeat(40));
const VAULT2 = hex("e".repeat(40));
const CLAIM = hex("1".repeat(64));

function claim(overrides: Partial<OnChainClaim> = {}): OnChainClaim {
  return {
    beneficiary: WALLET,
    claimType: 0,
    state: 1, // ELIGIBLE
    sliceCount: 0,
    dueDate: 1_780_000_000n,
    issuer: ISSUER,
    token: TOKEN,
    faceValue: 1000n,
    financedFaceValue: 0n,
    ...overrides,
  };
}

function reads(
  overrides: Partial<PinnedReads> = {},
  claimResult: OnChainClaim | null = claim(),
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
    getMandate: () => Promise.reject(new Error("unused")),
    fundableLiquidity: () => Promise.resolve(1_000_000n),
    quoteAndCheck: () => Promise.resolve({ ok: true, advanceAmount: 500n, discountAmount: 10n }),
    ...overrides,
  };
}

const leg = (over: Partial<{ claimId: string; vault: string; faceAmount: string }> = {}) => ({
  claimId: CLAIM,
  vault: VAULT,
  faceAmount: "510",
  ...over,
});

describe("validateRouteLegs", () => {
  it("returns the fresh re-quoted advance for a valid leg", async () => {
    const out = await validateRouteLegs(reads(), WALLET, [leg()]);
    expect(out).toHaveLength(1);
    expect(out[0]?.advance).toBe(500n);
    expect(out[0]?.faceAmount).toBe(510n);
  });

  it("rejects over-assignment beyond remaining face (OverAssignment)", async () => {
    // remaining = 1000; ask for 1001.
    await expect(validateRouteLegs(reads(), WALLET, [leg({ faceAmount: "1001" })])).rejects.toThrow(
      /remaining/i,
    );
  });

  it("rejects a claim with no remaining slices (MaxSlicesExceeded)", async () => {
    await expect(
      validateRouteLegs(reads({}, claim({ sliceCount: 8 })), WALLET, [leg()]),
    ).rejects.toThrow(/slices/i);
  });

  it("rejects a beneficiary mismatch", async () => {
    await expect(
      validateRouteLegs(reads({}, claim({ beneficiary: hex("f".repeat(40)) })), WALLET, [leg()]),
    ).rejects.toThrow(/beneficiary/i);
  });

  it("rejects a token mismatch between claim and vault", async () => {
    await expect(
      validateRouteLegs(reads({ vaultToken: () => Promise.resolve(hex("9".repeat(40))) }), WALLET, [
        leg(),
      ]),
    ).rejects.toThrow(/token/i);
  });

  it("rejects a duplicate claim across legs", async () => {
    await expect(
      validateRouteLegs(reads(), WALLET, [leg({ vault: VAULT }), leg({ vault: VAULT2 })]),
    ).rejects.toThrow(/[Dd]uplicate/);
  });

  it("rejects when aggregate advance exceeds a vault's fundable liquidity", async () => {
    // Two legs on the same vault, each advancing 500 → 1000 > fundable 800.
    await expect(
      validateRouteLegs(reads({ fundableLiquidity: () => Promise.resolve(800n) }), WALLET, [
        leg({ claimId: hex("1".repeat(64)) }),
        leg({ claimId: hex("2".repeat(64)) }),
      ]),
    ).rejects.toThrow(/liquidity/i);
  });
});
