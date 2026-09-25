import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, type Address, type Hex } from "viem";
import { deployProtocol, makeRoute } from "../helpers/fixtures.js";
import { CLAIM_STATE } from "../helpers/constants.js";

function route(user: Address, claimId: Hex, vault: Address, faceAmount: bigint, now: bigint) {
  return makeRoute(user, [{ claimId, vault, faceAmount }], now);
}

describe("Integration: obligor self-settlement", () => {
  it("permissionless SourceObligor matures + settles a fully-financed claim: vault made whole, obligor pays face, zero residual", async () => {
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

    // A funded, permissionless obligor wired to the live protocol.
    const obligor = await viem.deployContract("SourceObligor", [
      usdt.address,
      settlement.address,
      claimRegistry.address,
    ]);

    const face = parseUnits("1000", 6);
    // Fee is 0 by default, so owed == faceValue; fund the obligor with exactly the face.
    await usdt.write.mint([obligor.address, face]);

    // Route the eligible claim to FUNDED (fully financed: faceAmount == faceValue).
    const { claimId } = await createEligibleClaim({ label: "obligor", faceValue: face });
    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.FUNDED);

    // Advance past the claim's dueDate (createEligibleClaim uses now + 30d).
    await networkHelpers.time.increase(31 * 86_400);

    const vaultBefore = await usdt.read.balanceOf([vault.address]);
    const userBefore = await usdt.read.balanceOf([accounts.user.account.address]);
    const obligorBefore = await usdt.read.balanceOf([obligor.address]);

    // Permissionless: any account may trigger settlement (matures then settles just-in-time).
    await obligor.write.settle([claimId], { account: accounts.other.account });

    // Claim is now PAID.
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    // Vault receives its full financed face back and its exposure is cleared.
    assert.equal((await usdt.read.balanceOf([vault.address])) - vaultBefore, face);
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
    // Obligor paid exactly faceValue + fee (fee == 0) out of its own balance.
    assert.equal(obligorBefore - (await usdt.read.balanceOf([obligor.address])), face);
    // Fully financed → beneficiary residual is zero.
    assert.equal(await usdt.read.balanceOf([accounts.user.account.address]), userBefore);
  });
});
