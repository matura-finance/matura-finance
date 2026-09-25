import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { STABLE_MANDATE, FLEX_MANDATE, type VaultMandate } from "../config/vault-mandates.js";

/// Coverage for the DEPLOYED vault mandates. DEMO_MANDATE is exercised throughout
/// LiquidityVault.test.ts, but STABLE_MANDATE / FLEX_MANDATE — the two the protocol actually
/// deploys (Ignition + seed) — were previously read by no test (review finding P2-5). Reading
/// getMandate() back and asserting every field locks tested config to deployed config.
describe("Vault mandates (deployed STABLE / FLEX)", () => {
  async function deployVaultWith(mandate: VaultMandate) {
    const { viem } = await network.create();
    // Narrow the first wallet (noUncheckedIndexedAccess makes array access `| undefined`).
    const [admin] = await viem.getWalletClients();
    if (admin === undefined) {
      throw new Error("Expected at least 1 wallet client from the test network.");
    }
    const usdt = await viem.deployContract("MockUSDT", []);
    // The mandate ctor arg is a plain object; spread the readonly-tuple premium into a mutable
    // array (same shape the Ignition module's `mandateArg` produces).
    const vault = await viem.deployContract("LiquidityVault", [
      admin.account.address,
      usdt.address,
      { ...mandate, claimTypePremiumBps: [...mandate.claimTypePremiumBps] },
    ]);
    return vault;
  }

  // `onChain` keeps viem's inferred getMandate() return type (no hand-written shadow interface —
  // see review finding P2-6); values are asserted field-by-field against the config.
  async function assertDeployedMandate(mandate: VaultMandate): Promise<void> {
    const vault = await deployVaultWith(mandate);
    const onChain = await vault.read.getMandate();
    assert.equal(onChain.supportedTypesBitmap, mandate.supportedTypesBitmap);
    assert.equal(onChain.baseDiscountBps, mandate.baseDiscountBps);
    assert.equal(onChain.durationBpsPerDay, mandate.durationBpsPerDay);
    assert.equal(onChain.maxDurationDays, mandate.maxDurationDays);
    assert.equal(onChain.minFace, mandate.minFace);
    assert.equal(onChain.maxFace, mandate.maxFace);
    assert.equal(onChain.liquidityCap, mandate.liquidityCap);
    assert.equal(onChain.claimTypePremiumBps.length, mandate.claimTypePremiumBps.length);
    for (let i = 0; i < mandate.claimTypePremiumBps.length; i++) {
      assert.equal(onChain.claimTypePremiumBps[i], mandate.claimTypePremiumBps[i]);
    }
  }

  it("STABLE_MANDATE: getMandate() equals the deployed config", async () => {
    await assertDeployedMandate(STABLE_MANDATE);
  });

  it("FLEX_MANDATE: getMandate() equals the deployed config", async () => {
    await assertDeployedMandate(FLEX_MANDATE);
  });
});
