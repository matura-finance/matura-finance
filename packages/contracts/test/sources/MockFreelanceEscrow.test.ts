import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, type Hex } from "viem";
import {
  deployProtocol,
  makeRoute,
  route,
  toBytes32,
  type DeployedProtocol,
} from "../helpers/fixtures.js";
import { ROLES, CLAIM_STATE, CLAIM_TYPE } from "../helpers/constants.js";

/// Deploy a MockFreelanceEscrow wired to the fixture stack, registered as its own issuer and
/// allowlisted on the demo vault (mirrors what the Ignition module + seed do in Slice 4).
async function withEscrow(ctx: DeployedProtocol) {
  const escrow = await ctx.viem.deployContract("MockFreelanceEscrow", [
    ctx.usdt.address,
    ctx.claimRegistry.address,
    ctx.settlement.address,
  ]);
  await ctx.issuerRegistry.write.registerIssuer([
    escrow.address,
    escrow.address,
    toBytes32("escrow-meta"),
  ]);
  await ctx.claimRegistry.write.grantRole([ROLES.SOURCE_REGISTRAR_ROLE, escrow.address]);
  await ctx.vault.write.setIssuerAllowed([escrow.address, true]);
  return escrow;
}

/// fund → approve → createPayout for the given engagement; returns the registered claimId.
async function createEngagementClaim(
  ctx: DeployedProtocol,
  escrow: Awaited<ReturnType<typeof withEscrow>>,
  params: { engagementId: bigint; amount: bigint },
): Promise<Hex> {
  const client = ctx.accounts.other;
  const beneficiary = ctx.accounts.user; // the freelancer + route signer
  await ctx.usdt.write.mint([client.account.address, params.amount]);
  await ctx.usdt.write.approve([escrow.address, params.amount], { account: client.account });
  await escrow.write.fundEngagement(
    [beneficiary.account.address, params.amount, ctx.now + 30n * 86_400n],
    {
      account: client.account,
    },
  );
  await escrow.write.approveWork([params.engagementId], { account: client.account });
  await escrow.write.createPayout([params.engagementId]);
  return (await escrow.read.getEngagement([params.engagementId])).claimId;
}

describe("MockFreelanceEscrow", () => {
  it("registers a payout claim from verified escrow state (issuer == escrow, FREELANCE_ESCROW)", async () => {
    const ctx = await deployProtocol();
    const escrow = await withEscrow(ctx);
    const face = parseUnits("500", 6);
    const claimId = await createEngagementClaim(ctx, escrow, { engagementId: 1n, amount: face });

    const claim = await ctx.claimRegistry.read.getClaim([claimId]);
    assert.equal(claim.state, CLAIM_STATE.ATTESTED);
    assert.equal(claim.claimType, CLAIM_TYPE.FREELANCE_ESCROW);
    assert.equal(claim.faceValue, face);
    assert.equal(claim.issuer.toLowerCase(), escrow.address.toLowerCase()); // provenance = the escrow
    assert.equal(claim.beneficiary.toLowerCase(), ctx.accounts.user.account.address.toLowerCase());
  });

  it("enforces the state machine: approve/createPayout out of order revert BadState", async () => {
    const ctx = await deployProtocol();
    const escrow = await withEscrow(ctx);
    const client = ctx.accounts.other;
    const face = parseUnits("500", 6);
    await ctx.usdt.write.mint([client.account.address, face]);
    await ctx.usdt.write.approve([escrow.address, face], { account: client.account });

    // createPayout before funding (engagement None) → BadState.
    await ctx.viem.assertions.revertWithCustomError(
      escrow.write.createPayout([1n]),
      escrow,
      "BadState",
    );
    await escrow.write.fundEngagement(
      [ctx.accounts.user.account.address, face, ctx.now + 30n * 86_400n],
      {
        account: client.account,
      },
    );
    // createPayout before approval (Funded, not Approved) → BadState.
    await ctx.viem.assertions.revertWithCustomError(
      escrow.write.createPayout([1n]),
      escrow,
      "BadState",
    );
    // approveWork by a non-client → BadState.
    await ctx.viem.assertions.revertWithCustomError(
      escrow.write.approveWork([1n], { account: ctx.accounts.treasury.account }),
      escrow,
      "BadState",
    );
  });

  it("dedups: a second createPayout for the same engagement reverts BadState", async () => {
    const ctx = await deployProtocol();
    const escrow = await withEscrow(ctx);
    await createEngagementClaim(ctx, escrow, { engagementId: 1n, amount: parseUnits("500", 6) });
    await ctx.viem.assertions.revertWithCustomError(
      escrow.write.createPayout([1n]),
      escrow,
      "BadState",
    );
  });

  it("finances then settles: vault made whole, escrow pays exactly the face, residual to beneficiary", async () => {
    const ctx = await deployProtocol();
    const escrow = await withEscrow(ctx);
    const { usdt, vault, claimRegistry, router, networkHelpers, accounts, now, signRoute } = ctx;

    const face = parseUnits("500", 6);
    const claimId = await createEngagementClaim(ctx, escrow, { engagementId: 1n, amount: face });
    await claimRegistry.write.markEligible([claimId]);

    // Fully finance via the router (faceAmount == faceValue → FUNDED).
    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.FUNDED);

    await networkHelpers.time.increase(31 * 86_400);
    const vaultBefore = await usdt.read.balanceOf([vault.address]);
    const escrowBefore = await usdt.read.balanceOf([escrow.address]);

    await escrow.write.settle([claimId], { account: accounts.treasury.account }); // permissionless payer

    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    assert.equal((await usdt.read.balanceOf([vault.address])) - vaultBefore, face);
    assert.equal(escrowBefore - (await usdt.read.balanceOf([escrow.address])), face);
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
    assert.equal((await escrow.read.getEngagement([1n])).state, 3); // Settled
  });

  it("bound obligor (P1-2): settle(unknownClaim) reverts, and one engagement cannot drain another", async () => {
    const ctx = await deployProtocol();
    const escrow = await withEscrow(ctx);
    const { usdt, vault, claimRegistry, router, networkHelpers, accounts, now, signRoute } = ctx;

    // settle for a claim this escrow never registered → UnknownClaim (cannot touch its funds at all).
    await ctx.viem.assertions.revertWithCustomError(
      escrow.write.settle([toBytes32("not-mine")]),
      escrow,
      "UnknownClaim",
    );

    // Two independent engagements, both financed + matured.
    const faceA = parseUnits("500", 6);
    const faceB = parseUnits("300", 6);
    const claimA = await createEngagementClaim(ctx, escrow, { engagementId: 1n, amount: faceA });
    const claimB = await createEngagementClaim(ctx, escrow, { engagementId: 2n, amount: faceB });
    const legs = [
      [claimA, faceA],
      [claimB, faceB],
    ] as const;
    for (let i = 0; i < legs.length; i++) {
      const [claimId, face] = legs[i]!;
      await claimRegistry.write.markEligible([claimId]);
      const r = makeRoute(
        accounts.user.account.address,
        [{ claimId, vault: vault.address, faceAmount: face }],
        now,
        {
          nonce: BigInt(i),
        },
      );
      await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    }
    await networkHelpers.time.increase(31 * 86_400);

    // Settling B spends ONLY B's funds; engagement A's funds remain in escrow and A stays settleable.
    await escrow.write.settle([claimB]);
    assert.equal(await usdt.read.balanceOf([escrow.address]), faceA);
    assert.equal((await escrow.read.getEngagement([1n])).state, 2); // A still Approved
    await escrow.write.settle([claimA]); // A settles from its own funds
    assert.equal(await usdt.read.balanceOf([escrow.address]), 0n);
  });

  it("requires feeBps == 0 (fail closed): settle reverts FeeNotZero when a surcharge is set", async () => {
    const ctx = await deployProtocol();
    const escrow = await withEscrow(ctx);
    const { vault, claimRegistry, router, settlement, networkHelpers, accounts, now, signRoute } =
      ctx;

    const face = parseUnits("500", 6);
    const claimId = await createEngagementClaim(ctx, escrow, { engagementId: 1n, amount: face });
    await claimRegistry.write.markEligible([claimId]);
    const r = route(accounts.user.account.address, claimId, vault.address, face, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    await networkHelpers.time.increase(31 * 86_400);

    await settlement.write.setFeeBps([50]); // 0.5% surcharge
    await ctx.viem.assertions.revertWithCustomError(
      escrow.write.settle([claimId]),
      escrow,
      "FeeNotZero",
    );
  });
});
