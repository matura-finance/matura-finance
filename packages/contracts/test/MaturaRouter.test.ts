import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAddress, parseUnits, parseEventLogs, type Hex } from "viem";
import { deployProtocol, makeRoute as baseRoute, toBytes32 } from "./helpers/fixtures.js";
import { ROLES, CLAIM_STATE, MAX_LEGS } from "./helpers/constants.js";
import { routerDomain, EXECUTION_ROUTE_TYPES } from "./helpers/eip712.js";

type Ctx = Awaited<ReturnType<typeof deployProtocol>>;

/// Sum RouteLegExecuted advances from the emitting tx's receipt (not a windowless log scan).
async function legAdvancesTotal(ctx: Ctx, hash: Hex): Promise<bigint> {
  const receipt = await ctx.publicClient.getTransactionReceipt({ hash });
  const logs = parseEventLogs({
    abi: ctx.router.abi,
    eventName: "RouteLegExecuted",
    logs: receipt.logs,
  });
  let total = 0n;
  for (const log of logs) total += log.args.advanceAmount;
  return total;
}

describe("MaturaRouter", () => {
  it("funds a single-leg route atomically (relayer submits, funds go to the signer)", async () => {
    const ctx = await deployProtocol();
    const { router, vault, usdt, claimRegistry, accounts, now, createEligibleClaim, signRoute } =
      ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "c1",
      faceValue: parseUnits("1000", 6),
    });

    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    const sig = await signRoute(route);

    const before = await usdt.read.balanceOf([accounts.user.account.address]);
    const hash = await router.write.executeRoute([route, sig], { account: accounts.other.account }); // relayer submits
    const after = await usdt.read.balanceOf([accounts.user.account.address]);

    const advanced = await legAdvancesTotal(ctx, hash);
    assert.ok(advanced > 0n);
    assert.equal(after - before, advanced);
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.FUNDED);
    const allocs = await ctx.settlement.read.getAllocations([claimId]);
    assert.equal(allocs.length, 1);
    const [alloc] = allocs;
    assert.ok(alloc);
    assert.equal(alloc.faceAmount, faceValue);
  });

  it("funds a two-leg multi-claim route atomically", async () => {
    const ctx = await deployProtocol();
    const { router, vault, usdt, accounts, now, createEligibleClaim, signRoute } = ctx;
    const a = await createEligibleClaim({ label: "a", faceValue: parseUnits("500", 6) });
    const b = await createEligibleClaim({ label: "b", faceValue: parseUnits("300", 6) });

    const route = baseRoute(
      accounts.user.account.address,
      [
        { claimId: a.claimId, vault: vault.address, faceAmount: a.faceValue },
        { claimId: b.claimId, vault: vault.address, faceAmount: b.faceValue },
      ],
      now,
    );
    const before = await usdt.read.balanceOf([accounts.user.account.address]);
    const hash = await router.write.executeRoute([route, await signRoute(route)], {
      account: accounts.user.account,
    });
    const after = await usdt.read.balanceOf([accounts.user.account.address]);
    assert.equal(after - before, await legAdvancesTotal(ctx, hash));
  });

  it("supports partial funding (PARTIALLY_FUNDED)", async () => {
    const ctx = await deployProtocol();
    const { router, vault, claimRegistry, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId } = await createEligibleClaim({ label: "p", faceValue: parseUnits("1000", 6) });
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: parseUnits("400", 6) }],
      now,
    );
    await router.write.executeRoute([route, await signRoute(route)], {
      account: accounts.user.account,
    });
    assert.equal(
      (await claimRegistry.read.getClaim([claimId])).state,
      CLAIM_STATE.PARTIALLY_FUNDED,
    );
  });

  it("reverts RouteExpired / ZeroTargetAdvance / EmptyRoute", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "e",
      faceValue: parseUnits("1000", 6),
    });

    const expired = {
      ...baseRoute(
        accounts.user.account.address,
        [{ claimId, vault: vault.address, faceAmount: faceValue }],
        now,
      ),
      deadline: now - 1n,
    };
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([expired, await signRoute(expired)], {
        account: accounts.user.account,
      }),
      router,
      "RouteExpired",
    );

    const zero = {
      ...baseRoute(
        accounts.user.account.address,
        [{ claimId, vault: vault.address, faceAmount: faceValue }],
        now,
      ),
      targetAdvance: 0n,
    };
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([zero, await signRoute(zero)], { account: accounts.user.account }),
      router,
      "ZeroTargetAdvance",
    );

    const empty = { ...baseRoute(accounts.user.account.address, [], now) };
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([empty, await signRoute(empty)], {
        account: accounts.user.account,
      }),
      router,
      "EmptyRoute",
    );
  });

  it("reverts on forged signature and replayed nonce", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "r",
      faceValue: parseUnits("1000", 6),
    });
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );

    // forged: signed by someone other than route.user
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route, accounts.other)], {
        account: accounts.user.account,
      }),
      router,
      "InvalidRouteSignature",
    );

    // replay: execute once, then again with the same nonce
    const sig = await signRoute(route);
    await router.write.executeRoute([route, sig], { account: accounts.user.account });
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, sig], { account: accounts.user.account }),
      router,
      "InvalidAccountNonce",
    );
  });

  it("reverts DuplicateClaimInRoute", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId } = await createEligibleClaim({ label: "d", faceValue: parseUnits("1000", 6) });
    const route = baseRoute(
      accounts.user.account.address,
      [
        { claimId, vault: vault.address, faceAmount: parseUnits("100", 6) },
        { claimId, vault: vault.address, faceAmount: parseUnits("100", 6) },
      ],
      now,
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "DuplicateClaimInRoute",
    );
  });

  it("reverts MaxLegsExceeded for >8 legs", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, signRoute } = ctx;
    const legs = Array.from({ length: 9 }, (_, i) => ({
      claimId: toBytes32(`x${i}`),
      vault: vault.address,
      faceAmount: parseUnits("100", 6),
    }));
    const route = baseRoute(accounts.user.account.address, legs, now);
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "MaxLegsExceeded",
    );
  });

  it("reverts BeneficiaryMismatch", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "bm",
      faceValue: parseUnits("1000", 6),
      beneficiary: accounts.beneficiary.account.address, // not `user`
    });
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "BeneficiaryMismatch",
    );
  });

  it("reverts VaultNotActive and IssuerInactive", async () => {
    const ctx = await deployProtocol();
    const {
      viem,
      router,
      vault,
      vaultRegistry,
      issuerRegistry,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "va",
      faceValue: parseUnits("1000", 6),
    });
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );

    await vaultRegistry.write.setVaultActive([vault.address, false]);
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "VaultNotActive",
    );
    await vaultRegistry.write.setVaultActive([vault.address, true]);

    await issuerRegistry.write.setIssuerActive([accounts.issuer.account.address, false]);
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "IssuerInactive",
    );
  });

  it("reverts MandateRejected when the vault disallows the issuer", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "mr",
      faceValue: parseUnits("1000", 6),
    });
    await vault.write.setIssuerAllowed([accounts.issuer.account.address, false]);
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "MandateRejected",
    );
  });

  it("reverts AdvanceBelowMinimum / TargetAdvanceNotMet / MaxFaceExceeded", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "b2",
      faceValue: parseUnits("1000", 6),
    });

    const belowMin = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue, min: parseUnits("10000", 6) }],
      now,
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([belowMin, await signRoute(belowMin)], {
        account: accounts.user.account,
      }),
      router,
      "AdvanceBelowMinimum",
    );

    const target = {
      ...baseRoute(
        accounts.user.account.address,
        [{ claimId, vault: vault.address, faceAmount: faceValue }],
        now,
      ),
      targetAdvance: parseUnits("100000", 6),
    };
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([target, await signRoute(target)], {
        account: accounts.user.account,
      }),
      router,
      "TargetAdvanceNotMet",
    );

    const maxFace = {
      ...baseRoute(
        accounts.user.account.address,
        [{ claimId, vault: vault.address, faceAmount: faceValue }],
        now,
      ),
      maxTotalFace: parseUnits("100", 6),
    };
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([maxFace, await signRoute(maxFace)], {
        account: accounts.user.account,
      }),
      router,
      "MaxFaceExceeded",
    );
  });

  it("reverts InsufficientLiquidity when the vault is drained", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, usdt, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "il",
      faceValue: parseUnits("1000", 6),
    });
    // Drain the vault to below the advance.
    const bal = await usdt.read.balanceOf([vault.address]);
    await vault.write.withdraw([accounts.admin.account.address, bal - parseUnits("1", 6)]);
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "InsufficientLiquidity",
    );
  });

  it("blocks execution when paused", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "pz",
      faceValue: parseUnits("1000", 6),
    });
    await router.write.grantRole([ROLES.PAUSER_ROLE, accounts.admin.account.address]);
    await router.write.pause();
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "EnforcedPause",
    );
  });

  // A1 — EIP-712 domain hardening: an ExecutionRoute is bound to (chainId, verifyingContract) via
  // the domain separator, so a signature produced under any foreign domain recovers to a key other
  // than route.user → InvalidRouteSignature.
  it("A1: rejects a route signed under a foreign chainId (InvalidRouteSignature)", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, chainId, createEligibleClaim } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "fc",
      faceValue: parseUnits("1000", 6),
    });
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    const foreignSig = await accounts.user.signTypedData({
      account: accounts.user.account,
      domain: routerDomain(chainId + 1, router.address), // wrong chainId
      types: EXECUTION_ROUTE_TYPES,
      primaryType: "ExecutionRoute",
      message: route,
    });
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, foreignSig], { account: accounts.user.account }),
      router,
      "InvalidRouteSignature",
    );
  });

  it("A1: rejects a route signed for a different verifyingContract (InvalidRouteSignature)", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, accounts, now, chainId, createEligibleClaim } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "fv",
      faceValue: parseUnits("1000", 6),
    });
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    const foreignSig = await accounts.user.signTypedData({
      account: accounts.user.account,
      domain: routerDomain(chainId, getAddress(accounts.other.account.address)), // wrong verifyingContract
      types: EXECUTION_ROUTE_TYPES,
      primaryType: "ExecutionRoute",
      message: route,
    });
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, foreignSig], { account: accounts.user.account }),
      router,
      "InvalidRouteSignature",
    );
  });

  // A5 — multi-leg routing atomicity (C5): a mid-route failure rolls back EVERY leg (no partial
  // reservation) and does NOT burn the user's nonce, so the identical signed route is retryable
  // once the transient condition (here: liquidity) is resolved.
  it("A5: mid-route leg failure rolls back all legs and does not burn the nonce (retryable)", async () => {
    const ctx = await deployProtocol();
    const {
      viem,
      router,
      vault,
      usdt,
      claimRegistry,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;
    const face = parseUnits("1000", 6);
    const a = await createEligibleClaim({ label: "roll-a", faceValue: face });
    const b = await createEligibleClaim({ label: "roll-b", faceValue: face });

    // Drain the vault so the FIRST leg's advance is fundable but the two combined are not.
    const bal = await usdt.read.balanceOf([vault.address]);
    await vault.write.withdraw([accounts.admin.account.address, bal - parseUnits("1000", 6)]);

    const route = baseRoute(
      accounts.user.account.address,
      [
        { claimId: a.claimId, vault: vault.address, faceAmount: face },
        { claimId: b.claimId, vault: vault.address, faceAmount: face },
      ],
      now,
    );
    const sig = await signRoute(route);

    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, sig], { account: accounts.user.account }),
      router,
      "InsufficientLiquidity",
    );

    // Atomic rollback: neither claim reserved anything, and the nonce was not consumed.
    assert.equal((await claimRegistry.read.getClaim([a.claimId])).financedFaceValue, 0n);
    assert.equal((await claimRegistry.read.getClaim([b.claimId])).financedFaceValue, 0n);
    assert.equal(await router.read.nonces([accounts.user.account.address]), 0n);
    assert.equal((await claimRegistry.read.getClaim([a.claimId])).state, CLAIM_STATE.ELIGIBLE);

    // Restore liquidity and retry the SAME signed route → succeeds; nonce advances to 1.
    await usdt.write.mint([vault.address, parseUnits("2000", 6)]);
    await router.write.executeRoute([route, sig], { account: accounts.user.account });
    assert.equal((await claimRegistry.read.getClaim([a.claimId])).state, CLAIM_STATE.FUNDED);
    assert.equal((await claimRegistry.read.getClaim([b.claimId])).state, CLAIM_STATE.FUNDED);
    assert.equal(await router.read.nonces([accounts.user.account.address]), 1n);
  });

  it("A5: MAX_LEGS legs succeed; MAX_LEGS+1 reverts MaxLegsExceeded; 0 legs reverts EmptyRoute", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, claimRegistry, accounts, now, createEligibleClaim, signRoute } =
      ctx;

    // Exactly MAX_LEGS (8) distinct eligible claims, one leg each.
    const legs = [];
    const claimIds: Hex[] = [];
    for (let i = 0; i < MAX_LEGS; i++) {
      const { claimId } = await createEligibleClaim({
        label: `ml-${i}`,
        faceValue: parseUnits("100", 6),
      });
      claimIds.push(claimId);
      legs.push({ claimId, vault: vault.address, faceAmount: parseUnits("100", 6) });
    }
    const okRoute = baseRoute(accounts.user.account.address, legs, now);
    await router.write.executeRoute([okRoute, await signRoute(okRoute)], {
      account: accounts.user.account,
    });
    for (const claimId of claimIds) {
      assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.FUNDED);
    }

    // MAX_LEGS + 1 fabricated legs → MaxLegsExceeded (bound checked before per-leg work).
    const tooMany = Array.from({ length: MAX_LEGS + 1 }, (_, i) => ({
      claimId: toBytes32(`over-${i}`),
      vault: vault.address,
      faceAmount: parseUnits("100", 6),
    }));
    const overRoute = baseRoute(accounts.user.account.address, tooMany, now, { nonce: 1n });
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([overRoute, await signRoute(overRoute)], {
        account: accounts.user.account,
      }),
      router,
      "MaxLegsExceeded",
    );

    // Zero legs → EmptyRoute.
    const emptyRoute = baseRoute(accounts.user.account.address, [], now, { nonce: 1n });
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([emptyRoute, await signRoute(emptyRoute)], {
        account: accounts.user.account,
      }),
      router,
      "EmptyRoute",
    );
  });

  it("A5: two legs on one vault whose combined advance exceeds fundable revert InsufficientLiquidity (no stale snapshot)", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, usdt, accounts, now, createEligibleClaim, signRoute } = ctx;
    const face = parseUnits("1000", 6);
    const c = await createEligibleClaim({ label: "snap-c", faceValue: face });
    const d = await createEligibleClaim({ label: "snap-d", faceValue: face });

    // Leave enough for exactly ONE leg's advance, not two — the per-vault reserved accumulator in
    // _validateLegs must catch the second leg against the SAME cached fundable snapshot.
    const bal = await usdt.read.balanceOf([vault.address]);
    await vault.write.withdraw([accounts.admin.account.address, bal - parseUnits("1000", 6)]);

    const both = baseRoute(
      accounts.user.account.address,
      [
        { claimId: c.claimId, vault: vault.address, faceAmount: face },
        { claimId: d.claimId, vault: vault.address, faceAmount: face },
      ],
      now,
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([both, await signRoute(both)], { account: accounts.user.account }),
      router,
      "InsufficientLiquidity",
    );

    // Proof it was the accumulation, not leg C itself: a single-leg route on the drained vault
    // succeeds (nonce 0 was never consumed by the reverted two-leg route).
    const single = baseRoute(
      accounts.user.account.address,
      [{ claimId: c.claimId, vault: vault.address, faceAmount: face }],
      now,
    );
    await router.write.executeRoute([single, await signRoute(single)], {
      account: accounts.user.account,
    });
  });

  // A8 — TOCTOU & concurrent financing.
  it("A8: quote then admin drains the vault then executeRoute reverts InsufficientLiquidity", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, usdt, accounts, now, createEligibleClaim, signRoute } = ctx;
    const { claimId, faceValue } = await createEligibleClaim({
      label: "toctou",
      faceValue: parseUnits("1000", 6),
    });
    // Quote + sign first (the user's signature is produced against a well-funded vault).
    const route = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: faceValue }],
      now,
    );
    const sig = await signRoute(route);
    // Admin drains the vault AFTER the quote but BEFORE execution.
    const bal = await usdt.read.balanceOf([vault.address]);
    await vault.write.withdraw([accounts.admin.account.address, bal - parseUnits("1", 6)]);
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, sig], { account: accounts.user.account }),
      router,
      "InsufficientLiquidity",
    );
  });

  it("A8: a second route financing the same claim beyond its face reverts OverAssignment", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vault, claimRegistry, accounts, now, createEligibleClaim, signRoute } =
      ctx;
    const face = parseUnits("1000", 6);
    const { claimId } = await createEligibleClaim({ label: "over-assign", faceValue: face });

    // Route 1 finances 600 of the 1000 face → PARTIALLY_FUNDED.
    const r1 = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: parseUnits("600", 6) }],
      now,
    );
    await router.write.executeRoute([r1, await signRoute(r1)], { account: accounts.user.account });
    assert.equal(
      (await claimRegistry.read.getClaim([claimId])).state,
      CLAIM_STATE.PARTIALLY_FUNDED,
    );

    // Route 2 tries to finance another 500 (> 400 remaining) → reserveSlice reverts OverAssignment.
    const r2 = baseRoute(
      accounts.user.account.address,
      [{ claimId, vault: vault.address, faceAmount: parseUnits("500", 6) }],
      now,
      { nonce: 1n },
    );
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([r2, await signRoute(r2)], { account: accounts.user.account }),
      claimRegistry,
      "OverAssignment",
    );
    // Financed face unchanged from route 1 (atomic rollback of the failed second route).
    assert.equal(
      (await claimRegistry.read.getClaim([claimId])).financedFaceValue,
      parseUnits("600", 6),
    );
  });
});
