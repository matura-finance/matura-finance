import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits, parseEventLogs, type Hex } from "viem";
import { deployProtocol, makeRoute as baseRoute, toBytes32 } from "./helpers/fixtures.js";
import { ROLES, CLAIM_STATE } from "./helpers/constants.js";

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
});
