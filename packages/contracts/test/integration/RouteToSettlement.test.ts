import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, getAddress, type Address, type Hex } from "viem";
import { deployProtocol } from "../helpers/fixtures.js";
import { CLAIM_STATE } from "../helpers/constants.js";

function route(user: Address, claimId: Hex, vault: Address, faceAmount: bigint, now: bigint) {
  return {
    user: getAddress(user),
    targetAdvance: 1n,
    maxTotalFace: parseUnits("1000000", 6),
    deadline: now + 3_600n,
    nonce: 0n,
    legs: [{ claimId, vault: getAddress(vault), faceAmount, minimumAdvanceAmount: 0n }],
  };
}

describe("Integration: route → mature → settle", () => {
  it("settles a fully-financed claim: vault made whole, zero residual, conservation holds", async () => {
    const ctx = await deployProtocol();
    const {
      router,
      vault,
      usdt,
      claimRegistry,
      settlement,
      networkHelpers,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;
    const face = parseUnits("1000", 6);
    const { claimId } = await createEligibleClaim({ label: "full", faceValue: face });

    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.FUNDED);

    await networkHelpers.time.increase(31 * 86_400);
    await claimRegistry.write.markMatured([claimId]);

    // Payer (the issuer in practice) pays exactly faceValue (fee = 0).
    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: payer.account });

    const vaultBefore = await usdt.read.balanceOf([vault.address]);
    const userBefore = await usdt.read.balanceOf([accounts.user.account.address]);

    await settlement.write.settleClaim([claimId], { account: payer.account });

    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    // Vault receives its full financed face back.
    assert.equal((await usdt.read.balanceOf([vault.address])) - vaultBefore, face);
    // Fully financed → beneficiary residual is zero.
    assert.equal(await usdt.read.balanceOf([accounts.user.account.address]), userBefore);
    // Vault exposure cleared.
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
  });

  it("settles a partially-financed claim: vault gets its slice, residual to beneficiary", async () => {
    const ctx = await deployProtocol();
    const {
      router,
      vault,
      usdt,
      claimRegistry,
      settlement,
      networkHelpers,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;
    const face = parseUnits("1000", 6);
    const financed = parseUnits("400", 6);
    const { claimId } = await createEligibleClaim({ label: "part", faceValue: face });

    const r = route(accounts.user.account.address, claimId, vault.address, financed, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    assert.equal(
      (await claimRegistry.read.getClaim([claimId])).state,
      CLAIM_STATE.PARTIALLY_FUNDED,
    );

    await networkHelpers.time.increase(31 * 86_400);
    await claimRegistry.write.markMatured([claimId]);

    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: payer.account });

    const vaultBefore = await usdt.read.balanceOf([vault.address]);
    const userBefore = await usdt.read.balanceOf([accounts.user.account.address]);
    await settlement.write.settleClaim([claimId], { account: payer.account });

    assert.equal((await usdt.read.balanceOf([vault.address])) - vaultBefore, financed);
    assert.equal(
      (await usdt.read.balanceOf([accounts.user.account.address])) - userBefore,
      face - financed,
    );
  });

  it("charges a protocol fee as a surcharge and keeps conservation exact", async () => {
    const ctx = await deployProtocol();
    const {
      router,
      vault,
      usdt,
      claimRegistry,
      settlement,
      networkHelpers,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;
    const face = parseUnits("1000", 6);
    const { claimId } = await createEligibleClaim({ label: "fee", faceValue: face });
    await settlement.write.setFeeBps([500]); // 5%

    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    await networkHelpers.time.increase(31 * 86_400);
    await claimRegistry.write.markMatured([claimId]);

    const fee = (face * 500n) / 10_000n; // exact (no remainder at these values)
    const total = face + fee;
    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, total]);
    await usdt.write.approve([settlement.address, total], { account: payer.account });

    const treasuryBefore = await usdt.read.balanceOf([accounts.treasury.account.address]);
    await settlement.write.settleClaim([claimId], { account: payer.account });
    assert.equal(
      (await usdt.read.balanceOf([accounts.treasury.account.address])) - treasuryBefore,
      fee,
    );
  });

  it("rejects double settlement", async () => {
    const ctx = await deployProtocol();
    const {
      viem,
      router,
      vault,
      usdt,
      claimRegistry,
      settlement,
      networkHelpers,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;
    const face = parseUnits("1000", 6);
    const { claimId } = await createEligibleClaim({ label: "dbl", faceValue: face });
    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    await networkHelpers.time.increase(31 * 86_400);
    await claimRegistry.write.markMatured([claimId]);

    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, face * 2n]);
    await usdt.write.approve([settlement.address, face * 2n], { account: payer.account });
    await settlement.write.settleClaim([claimId], { account: payer.account });
    await viem.assertions.revertWithCustomError(
      settlement.write.settleClaim([claimId], { account: payer.account }),
      settlement,
      "AlreadySettled",
    );
  });

  it("rejects settlement before maturity", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, usdt, settlement, accounts, now, createEligibleClaim, signRoute } =
      ctx;
    const face = parseUnits("1000", 6);
    const { claimId } = await createEligibleClaim({ label: "early", faceValue: face });
    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    await usdt.write.mint([accounts.issuer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: accounts.issuer.account });
    await viem.assertions.revertWithCustomError(
      settlement.write.settleClaim([claimId], { account: accounts.issuer.account }),
      settlement,
      "NotMature",
    );
  });
});
