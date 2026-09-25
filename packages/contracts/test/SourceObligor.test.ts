import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAddress, parseUnits, type Address, type Hex } from "viem";
import { deployProtocol, route, type DeployedProtocol } from "./helpers/fixtures.js";
import { CLAIM_STATE } from "./helpers/constants.js";

/// Deploy a SourceObligor wired to the fixture's protocol and pre-fund it with MockUSDT.
async function deployObligor(ctx: DeployedProtocol, funding: bigint) {
  const { viem, usdt, settlement, claimRegistry } = ctx;
  const obligor = await viem.deployContract("SourceObligor", [
    usdt.address,
    settlement.address,
    claimRegistry.address,
  ]);
  await usdt.write.mint([obligor.address, funding]);
  return obligor;
}

describe("SourceObligor", () => {
  it("wires its immutable dependencies from the constructor", async () => {
    const ctx = await deployProtocol();
    const obligor = await deployObligor(ctx, parseUnits("1000", 6));

    assert.equal(await obligor.read.token(), getAddress(ctx.usdt.address));
    assert.equal(await obligor.read.settlementManager(), getAddress(ctx.settlement.address));
    assert.equal(await obligor.read.claimRegistry(), getAddress(ctx.claimRegistry.address));
  });

  it("rejects the zero address in the constructor", async () => {
    const ctx = await deployProtocol();
    const { viem, usdt, settlement, claimRegistry } = ctx;
    const zero = "0x0000000000000000000000000000000000000000" as const;
    await assert.rejects(
      viem.deployContract("SourceObligor", [zero, settlement.address, claimRegistry.address]),
    );
    await assert.rejects(
      viem.deployContract("SourceObligor", [usdt.address, zero, claimRegistry.address]),
    );
    await assert.rejects(
      viem.deployContract("SourceObligor", [usdt.address, settlement.address, zero]),
    );
  });

  it("reverts settling an ELIGIBLE (unrouted) claim: not MATURED/DELAYED", async () => {
    const ctx = await deployProtocol();
    const { viem, settlement, createEligibleClaim } = ctx;
    const face = parseUnits("1000", 6);
    const { claimId } = await createEligibleClaim({ label: "eligible", faceValue: face });
    // Sanity: the claim is ELIGIBLE, so settle() skips markMatured and settleClaim rejects it.
    assert.equal((await ctx.claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.ELIGIBLE);

    const obligor = await deployObligor(ctx, face);

    await viem.assertions.revertWithCustomError(
      obligor.write.settle([claimId]),
      settlement,
      "NotMature",
    );
  });

  it("reverts settling a FUNDED-but-not-yet-due claim: NotMatured", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, claimRegistry, accounts, now, createEligibleClaim, signRoute } =
      ctx;
    const face = parseUnits("1000", 6);
    const { claimId } = await createEligibleClaim({ label: "funded", faceValue: face });

    // Fully fund the claim via a route (dueDate = now + 30d, NOT reached).
    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.FUNDED);

    const obligor = await deployObligor(ctx, face);

    // settle() calls markMatured, which reverts because block.timestamp < dueDate.
    await viem.assertions.revertWithCustomError(
      obligor.write.settle([claimId]),
      claimRegistry,
      "NotMatured",
    );
  });
});
