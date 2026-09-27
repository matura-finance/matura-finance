import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { network } from "hardhat";
import { parseUnits } from "viem";
import { deployProtocol, route, toBytes32, type DeployedProtocol } from "../helpers/fixtures.js";
import { ROLES, CLAIM_STATE, CLAIM_TYPE } from "../helpers/constants.js";

const UNIT = parseUnits("1", 6);

/// Deploy a MockStream wired to the fixture stack, registered as its own issuer and allowlisted on
/// the demo vault (mirrors the Ignition module + seed wiring in Slice 4).
async function withStream(ctx: DeployedProtocol) {
  const stream = await ctx.viem.deployContract("MockStream", [
    ctx.usdt.address,
    ctx.claimRegistry.address,
    ctx.settlement.address,
  ]);
  await ctx.issuerRegistry.write.registerIssuer([
    stream.address,
    stream.address,
    toBytes32("stream-meta"),
  ]);
  await ctx.claimRegistry.write.grantRole([ROLES.SOURCE_REGISTRAR_ROLE, stream.address]);
  await ctx.vault.write.setIssuerAllowed([stream.address, true]);
  return stream;
}

/// Fund a stream from `other` to the recipient (`user`), over [now, now+duration].
async function createStream(
  ctx: DeployedProtocol,
  stream: Awaited<ReturnType<typeof withStream>>,
  deposit: bigint,
  durationSec: bigint,
): Promise<void> {
  const funder = ctx.accounts.other;
  await ctx.usdt.write.mint([funder.account.address, deposit]);
  await ctx.usdt.write.approve([stream.address, deposit], { account: funder.account });
  await stream.write.createStream(
    [ctx.accounts.user.account.address, deposit, ctx.now, ctx.now + durationSec],
    { account: funder.account },
  );
}

describe("MockStream", () => {
  it("assignment is one-shot and locks out the old recipient's withdraw", async () => {
    const ctx = await deployProtocol();
    const stream = await withStream(ctx);
    await createStream(ctx, stream, 1_000n * UNIT, 100n * 86_400n);

    // Before assignment the recipient can withdraw vested funds.
    await ctx.networkHelpers.time.increase(50 * 86_400);
    const claimableMid = await stream.read.claimableOf([1n]);
    assert.ok(claimableMid > 0n);
    await stream.write.withdraw([1n, 1n * UNIT], { account: ctx.accounts.user.account });

    await stream.write.assignToProtocol([1n], { account: ctx.accounts.user.account });
    assert.equal((await stream.read.getStream([1n])).assigned, true);

    // Second assignment reverts; post-assignment withdraw reverts.
    await ctx.viem.assertions.revertWithCustomError(
      stream.write.assignToProtocol([1n], { account: ctx.accounts.user.account }),
      stream,
      "AlreadyAssigned",
    );
    await ctx.viem.assertions.revertWithCustomError(
      stream.write.withdraw([1n, 1n * UNIT], { account: ctx.accounts.user.account }),
      stream,
      "AlreadyAssigned",
    );
    // Non-recipient cannot assign a fresh stream.
    await createStream(ctx, stream, 500n * UNIT, 100n * 86_400n);
    await ctx.viem.assertions.revertWithCustomError(
      stream.write.assignToProtocol([2n], { account: ctx.accounts.treasury.account }),
      stream,
      "NotRecipient",
    );
  });

  it("createClaim requires assignment, freezes face = claimable, and is one-per-stream", async () => {
    const ctx = await deployProtocol();
    const stream = await withStream(ctx);
    const deposit = 1_000n * UNIT;
    const duration = 100n * 86_400n;
    await createStream(ctx, stream, deposit, duration); // start == ctx.now

    // Not assigned yet → NotAssigned.
    await ctx.viem.assertions.revertWithCustomError(
      stream.write.createClaim([1n]),
      stream,
      "NotAssigned",
    );

    await stream.write.assignToProtocol([1n], { account: ctx.accounts.user.account });
    // Pin the createClaim block to exactly start + 40d so the frozen face is deterministic:
    // deposit * 40d / 100d = 40% of deposit, exact integer division.
    const elapsed = 40n * 86_400n;
    await ctx.networkHelpers.time.setNextBlockTimestamp(ctx.now + elapsed);
    await stream.write.createClaim([1n]);
    const expectedFace = (deposit * elapsed) / duration;

    const claimId = (await stream.read.getStream([1n])).claimId;
    const claim = await ctx.claimRegistry.read.getClaim([claimId]);
    assert.equal(claim.claimType, CLAIM_TYPE.STREAM);
    assert.equal(claim.issuer.toLowerCase(), stream.address.toLowerCase());
    assert.equal(claim.faceValue, expectedFace); // face frozen at claimable-at-registration

    // Second createClaim on the same stream reverts (cumulative-face solvency bound).
    await ctx.viem.assertions.revertWithCustomError(
      stream.write.createClaim([1n]),
      stream,
      "AlreadyClaimed",
    );

    // Face does not move as time advances.
    await ctx.networkHelpers.time.increase(20 * 86_400);
    assert.equal((await ctx.claimRegistry.read.getClaim([claimId])).faceValue, expectedFace);
  });

  it("finances then settles: vault made whole, stream pays exactly the frozen face", async () => {
    const ctx = await deployProtocol();
    const stream = await withStream(ctx);
    const { usdt, vault, claimRegistry, router, networkHelpers, accounts, signRoute } = ctx;

    const deposit = 1_000n * UNIT;
    await createStream(ctx, stream, deposit, 100n * 86_400n);
    await networkHelpers.time.increase(40 * 86_400);
    await stream.write.assignToProtocol([1n], { account: accounts.user.account });
    await stream.write.createClaim([1n]);
    const claimId = (await stream.read.getStream([1n])).claimId;
    const face = (await claimRegistry.read.getClaim([claimId])).faceValue;

    await claimRegistry.write.markEligible([claimId]);
    // Fresh route deadline — the fixture `now` is 40d stale after the vest warp above.
    const routeNow = BigInt(await networkHelpers.time.latest());
    const r = route(accounts.user.account.address, claimId, vault.address, face, routeNow);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.FUNDED);

    // dueDate = stop = now + 100d; advance past it.
    await networkHelpers.time.increase(101 * 86_400);
    const vaultBefore = await usdt.read.balanceOf([vault.address]);
    const streamBefore = await usdt.read.balanceOf([stream.address]);

    await stream.write.settle([claimId]);

    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    assert.equal((await usdt.read.balanceOf([vault.address])) - vaultBefore, face);
    assert.equal(streamBefore - (await usdt.read.balanceOf([stream.address])), face);
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
  });

  it("settle reverts UnknownClaim for a stream it never claimed, and FeeNotZero under a surcharge", async () => {
    const ctx = await deployProtocol();
    const stream = await withStream(ctx);
    const { vault, claimRegistry, router, settlement, networkHelpers, accounts, signRoute } = ctx;

    await ctx.viem.assertions.revertWithCustomError(
      stream.write.settle([toBytes32("not-mine")]),
      stream,
      "UnknownClaim",
    );

    const deposit = 1_000n * UNIT;
    await createStream(ctx, stream, deposit, 100n * 86_400n);
    await networkHelpers.time.increase(40 * 86_400);
    await stream.write.assignToProtocol([1n], { account: accounts.user.account });
    await stream.write.createClaim([1n]);
    const claimId = (await stream.read.getStream([1n])).claimId;
    const face = (await claimRegistry.read.getClaim([claimId])).faceValue;
    await claimRegistry.write.markEligible([claimId]);
    const routeNow = BigInt(await networkHelpers.time.latest());
    const r = route(accounts.user.account.address, claimId, vault.address, face, routeNow);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    await networkHelpers.time.increase(101 * 86_400);

    await settlement.write.setFeeBps([50]);
    await ctx.viem.assertions.revertWithCustomError(
      stream.write.settle([claimId]),
      stream,
      "FeeNotZero",
    );
  });

  it("property: linear vesting is monotonic, clamped, round-down, and never underflows claimable", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 1n, max: 1_000_000n }), // deposit in UNIT
        fc.integer({ min: 1, max: 365 * 86_400 }), // duration seconds
        fc.array(fc.integer({ min: 1, max: 40 * 86_400 }), { minLength: 1, maxLength: 8 }), // warp deltas
        async (depositUnits, durationSec, warps) => {
          const { viem, networkHelpers } = await network.create();
          const [funder] = await viem.getWalletClients();
          if (funder === undefined) throw new Error("no wallet");
          const usdt = await viem.deployContract("MockUSDT", []);
          // claimRegistry/settlement are unused by the vesting-math path exercised here.
          const stream = await viem.deployContract("MockStream", [
            usdt.address,
            usdt.address,
            usdt.address,
          ]);

          const deposit = depositUnits * UNIT;
          const start = BigInt(await networkHelpers.time.latest()) + 10n;
          const stop = start + BigInt(durationSec);
          await usdt.write.mint([funder.account.address, deposit]);
          await usdt.write.approve([stream.address, deposit], { account: funder.account });
          await stream.write.createStream([funder.account.address, deposit, start, stop], {
            account: funder.account,
          });

          let prevStreamed = 0n;
          for (const delta of warps) {
            await networkHelpers.time.increase(delta);
            const streamed = await stream.read.streamedOf([1n]);
            const claimable = await stream.read.claimableOf([1n]);
            const remaining = await stream.read.remainingOf([1n]);
            assert.ok(streamed >= prevStreamed, "streamed monotonic");
            assert.ok(streamed <= deposit, "streamed clamped to deposit");
            assert.equal(streamed + remaining, deposit, "streamed + remaining == deposit");
            assert.ok(claimable >= 0n, "claimable never underflows");
            assert.ok(claimable <= deposit, "claimable bounded by deposit");
            prevStreamed = streamed;
          }
          // At/after stop, the full deposit is vested exactly (clamp closes the rounding gap).
          const nowT = BigInt(await networkHelpers.time.latest());
          if (nowT >= stop) {
            assert.equal(await stream.read.streamedOf([1n]), deposit);
          }
        },
      ),
      { numRuns: 10 },
    );
  });
});
