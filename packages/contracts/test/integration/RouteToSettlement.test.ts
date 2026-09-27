import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAddress, parseUnits, type Address, type Hex } from "viem";
import { deployProtocol, route } from "../helpers/fixtures.js";
import { CLAIM_STATE, ROLES } from "../helpers/constants.js";

type Ctx = Awaited<ReturnType<typeof deployProtocol>>;

/// Route → mature a fully-financed claim, leaving it MATURED and settleable. Returns the claimId.
async function fundAndMature(ctx: Ctx, label: string, face: bigint): Promise<Hex> {
  const {
    router,
    vault,
    claimRegistry,
    networkHelpers,
    accounts,
    now,
    createEligibleClaim,
    signRoute,
  } = ctx;
  const { claimId } = await createEligibleClaim({ label, faceValue: face });
  const r = route(accounts.user.account.address, claimId, vault.address, face, now);
  await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
  await networkHelpers.time.increase(31 * 86_400);
  await claimRegistry.write.markMatured([claimId]);
  return claimId;
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

  // A2 — settlement edge paths.
  it("A2: emits SettlementReturnFailed when the vault callback reverts (revoked SETTLEMENT_ROLE); claim still PAID, no ConservationViolation", async () => {
    const ctx = await deployProtocol();
    const { viem, vault, usdt, claimRegistry, settlement, accounts } = ctx;
    const face = parseUnits("1000", 6);
    const claimId = await fundAndMature(ctx, "srf", face);

    // Break the vault's accounting callback by revoking the settlement manager's SETTLEMENT_ROLE.
    await vault.write.revokeRole([ROLES.SETTLEMENT_ROLE, settlement.address]);

    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: payer.account });

    const vaultBefore = await usdt.read.balanceOf([vault.address]);
    // The callback reverts (AccessControlUnauthorizedAccount) but is swallowed → SettlementReturnFailed.
    await viem.assertions.emitWithArgs(
      settlement.write.settleClaim([claimId], { account: payer.account }),
      settlement,
      "SettlementReturnFailed",
      [claimId, getAddress(vault.address)],
    );
    // The vault still received its face (transfer precedes the callback) and the claim is PAID.
    assert.equal((await usdt.read.balanceOf([vault.address])) - vaultBefore, face);
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    assert.equal(await settlement.read.isSettled([claimId]), true);
  });

  it("A2: underfunded payer reverts atomically — claim stays settleable (isSettled == false)", async () => {
    const ctx = await deployProtocol();
    const { claimRegistry, settlement, accounts } = ctx;
    const claimId = await fundAndMature(ctx, "under", parseUnits("1000", 6));

    // Payer has neither balance nor allowance → safeTransferFrom reverts, rolling back _settled=true.
    await assert.rejects(
      settlement.write.settleClaim([claimId], { account: accounts.issuer.account }),
    );
    assert.equal(await settlement.read.isSettled([claimId]), false);
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.MATURED);
  });

  it("A2: approving the wrong token cannot fund settlement — the pull is pinned to the immutable token", async () => {
    const ctx = await deployProtocol();
    const { viem, settlement, accounts } = ctx;
    const face = parseUnits("1000", 6);
    const claimId = await fundAndMature(ctx, "wrongtok", face);

    // Payer funds + approves an UNRELATED token; the settlement token pull still finds no allowance.
    const wrong = await viem.deployContract("MockUSDT", []);
    await wrong.write.mint([accounts.issuer.account.address, face]);
    await wrong.write.approve([settlement.address, face], { account: accounts.issuer.account });

    await assert.rejects(
      settlement.write.settleClaim([claimId], { account: accounts.issuer.account }),
    );
    assert.equal(await settlement.read.isSettled([claimId]), false);
  });

  it("A2: raising feeBps after the payer approved reverts settlement with no partial state (still settleable)", async () => {
    const ctx = await deployProtocol();
    const { claimRegistry, settlement, usdt, accounts } = ctx;
    const face = parseUnits("1000", 6);
    const claimId = await fundAndMature(ctx, "feebump", face);

    const payer = accounts.issuer;
    // Payer approves exactly the zero-fee amount.
    await usdt.write.mint([payer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: payer.account });

    // Admin raises the fee AFTER the approval → required surcharge exceeds the allowance.
    await settlement.write.setFeeBps([500]);
    await assert.rejects(settlement.write.settleClaim([claimId], { account: payer.account }));
    assert.equal(await settlement.read.isSettled([claimId]), false);
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.MATURED);

    // Still settleable once the payer tops up the surcharge.
    const fee = (face * 500n) / 10_000n;
    await usdt.write.mint([payer.account.address, fee]);
    await usdt.write.approve([settlement.address, face + fee], { account: payer.account });
    await settlement.write.settleClaim([claimId], { account: payer.account });
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
  });

  // A3 — pause scope & no-confiscation invariants (C1).
  it("A3: settles a matured claim while router AND vault are PAUSED (pause cannot strand funds)", async () => {
    const ctx = await deployProtocol();
    const { router, vault, usdt, claimRegistry, settlement, accounts } = ctx;
    const face = parseUnits("1000", 6);
    const claimId = await fundAndMature(ctx, "paused", face);

    // Admin holds PAUSER_ROLE on both (granted in their constructors).
    await router.write.pause();
    await vault.write.pause();

    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: payer.account });

    // Settlement is intentionally NOT pausable and onSettlementReturn has no pause gate.
    await settlement.write.settleClaim([claimId], { account: payer.account });
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
  });

  it("A3: admin withdraw drains idle liquidity yet payer-funded settlement still succeeds after withdraw-all", async () => {
    const ctx = await deployProtocol();
    const { vault, usdt, claimRegistry, settlement, accounts } = ctx;
    const face = parseUnits("1000", 6);
    const claimId = await fundAndMature(ctx, "drain", face);

    // Drain ALL idle liquidity to the admin; the outstanding advance is now unbacked in-vault.
    const idle = await vault.read.availableLiquidity();
    await vault.write.withdraw([accounts.admin.account.address, idle]);
    assert.equal(await vault.read.availableLiquidity(), 0n);

    // The permissionless payer funds settlement; the vault is made whole from the payer's tokens.
    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: payer.account });
    await settlement.write.settleClaim([claimId], { account: payer.account });

    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    assert.equal(await usdt.read.balanceOf([vault.address]), face);
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
  });

  it("A3: writeOff(A) then external settle(A) emits SettlementReturnFailed, marks PAID, and does not double-decrement principal", async () => {
    const ctx = await deployProtocol();
    const { viem, vault, usdt, claimRegistry, settlement, accounts } = ctx;
    const face = parseUnits("1000", 6);
    const claimId = await fundAndMature(ctx, "wo-settle", face);

    // Admin writes the claim off: exposure counters cleared, outstanding decremented to zero.
    await vault.write.writeOffClaim([claimId]);
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
    assert.equal(await vault.read.faceByClaim([claimId]), 0n);

    const payer = accounts.issuer;
    await usdt.write.mint([payer.account.address, face]);
    await usdt.write.approve([settlement.address, face], { account: payer.account });

    // onSettlementReturn now reverts ReturnMismatch (faceByClaim==0) → swallowed as SettlementReturnFailed.
    await viem.assertions.emitWithArgs(
      settlement.write.settleClaim([claimId], { account: payer.account }),
      settlement,
      "SettlementReturnFailed",
      [claimId, getAddress(vault.address)],
    );
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    // No double-decrement: outstanding stays at zero (writeOff already cleared it; the callback reverted).
    assert.equal(await vault.read.outstandingPrincipal(), 0n);
  });
});
