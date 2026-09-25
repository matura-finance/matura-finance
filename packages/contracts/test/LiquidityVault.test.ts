import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, getAddress } from "viem";
import { ROLES, CLAIM_TYPE } from "./helpers/constants.js";
import { ceilDiv, demoMandate, toBytes32 } from "./helpers/fixtures.js";

/// Pure mirror of MaturaPricing (discount rounds UP, advance = face - discount).
function computeQuote(
  face: bigint,
  daysToDue: bigint,
  base: bigint,
  day: bigint,
  premium: bigint,
): { totalBps: bigint; discount: bigint; advance: bigint } {
  const totalBps = base + day * daysToDue + premium;
  const discount = ceilDiv(face * totalBps, 10_000n);
  return { totalBps, discount, advance: face - discount };
}

const BASE = BigInt(demoMandate.baseDiscountBps); // 100
const DAY = BigInt(demoMandate.durationBpsPerDay); // 5
const PREMIUM = demoMandate.claimTypePremiumBps.map((p) => BigInt(p)); // [0, 50, 25]

/// LiquidityVault in isolation: MockUSDT + vault with the demo mandate, ROUTER_ROLE and
/// SETTLEMENT_ROLE granted to test EOAs so fund/onSettlementReturn can be driven directly.
describe("LiquidityVault", () => {
  async function deployVault(mandate: typeof demoMandate = demoMandate, seed?: bigint) {
    const { viem, networkHelpers } = await network.create();
    const [admin, router, settler, user, other] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    const usdt = await viem.deployContract("MockUSDT", []);
    const vault = await viem.deployContract("LiquidityVault", [
      admin.account.address,
      usdt.address,
      mandate,
    ]);

    await vault.write.grantRole([ROLES.ROUTER_ROLE, router.account.address]);
    await vault.write.grantRole([ROLES.SETTLEMENT_ROLE, settler.account.address]);

    const toSeed = seed ?? BigInt(mandate.liquidityCap);
    if (toSeed > 0n) await usdt.write.mint([vault.address, toSeed]);

    const now = BigInt(await networkHelpers.time.latest());
    const dueIn = (n: bigint) => now + n * 86_400n + 3_600n; // +1h buffer => floor(daysToDue) === n

    return {
      viem,
      networkHelpers,
      publicClient,
      usdt,
      vault,
      admin,
      router,
      settler,
      user,
      other,
      now,
      dueIn,
    };
  }

  describe("previewQuote", () => {
    it("is deterministic across identical calls", async () => {
      const { vault, dueIn } = await deployVault();
      const face = parseUnits("1000", 6);
      const [a1, d1] = await vault.read.previewQuote([CLAIM_TYPE.PAYROLL, face, dueIn(30n)]);
      const [a2, d2] = await vault.read.previewQuote([CLAIM_TYPE.PAYROLL, face, dueIn(30n)]);
      assert.equal(a1, a2);
      assert.equal(d1, d2);

      const expected = computeQuote(face, 30n, BASE, DAY, PREMIUM[CLAIM_TYPE.PAYROLL]);
      assert.equal(d1, expected.discount);
      assert.equal(a1, expected.advance);
    });

    it("rounds the discount UP at a ±1 boundary", async () => {
      const { vault, dueIn } = await deployVault();
      // face=333, daysToDue=1 => totalBps=105 => 333*105/10000 = 3.4965 -> ceil 4 (floor 3).
      const face = 333n;
      const [advance, discount] = await vault.read.previewQuote([
        CLAIM_TYPE.PAYROLL,
        face,
        dueIn(1n),
      ]);

      const product = face * 105n;
      const floorDisc = product / 10_000n; // 3
      const ceilDisc = ceilDiv(product, 10_000n); // 4
      assert.equal(floorDisc, 3n);
      assert.equal(ceilDisc, 4n);
      assert.equal(discount, ceilDisc); // rounds UP, never the floor
      assert.equal(advance, face - ceilDisc);
    });

    it("reverts ClaimTypeUnsupported for an invalid claim-type ordinal", async () => {
      const { viem, vault, dueIn } = await deployVault();
      await viem.assertions.revertWithCustomError(
        vault.read.previewQuote([3, parseUnits("1000", 6), dueIn(30n)]),
        vault,
        "ClaimTypeUnsupported",
      );
    });
  });

  describe("quoteAndCheck (never reverts)", () => {
    it("ok=false for an unsupported/invalid claim type", async () => {
      const { vault, user, dueIn } = await deployVault();
      const [ok, advance, discount] = await vault.read.quoteAndCheck([
        user.account.address,
        3,
        parseUnits("1000", 6),
        dueIn(30n),
      ]);
      assert.equal(ok, false);
      assert.equal(advance, 0n);
      assert.equal(discount, 0n);
    });

    it("ok=false for a disallowed issuer, ok=true once allowed", async () => {
      const { vault, user, dueIn } = await deployVault();
      const face = parseUnits("1000", 6);

      const [okBefore] = await vault.read.quoteAndCheck([
        user.account.address,
        CLAIM_TYPE.PAYROLL,
        face,
        dueIn(30n),
      ]);
      assert.equal(okBefore, false);

      await vault.write.setIssuerAllowed([user.account.address, true]);

      const [okAfter, advance, discount] = await vault.read.quoteAndCheck([
        user.account.address,
        CLAIM_TYPE.PAYROLL,
        face,
        dueIn(30n),
      ]);
      assert.equal(okAfter, true);
      const expected = computeQuote(face, 30n, BASE, DAY, PREMIUM[CLAIM_TYPE.PAYROLL]);
      assert.equal(advance, expected.advance);
      assert.equal(discount, expected.discount);
    });

    it("ok=false for face below min and face above max", async () => {
      const { vault, user, dueIn } = await deployVault();
      await vault.write.setIssuerAllowed([user.account.address, true]);

      const [okLow] = await vault.read.quoteAndCheck([
        user.account.address,
        CLAIM_TYPE.PAYROLL,
        demoMandate.minFace - 1n,
        dueIn(30n),
      ]);
      assert.equal(okLow, false);

      const [okHigh] = await vault.read.quoteAndCheck([
        user.account.address,
        CLAIM_TYPE.PAYROLL,
        BigInt(demoMandate.maxFace) + 1n,
        dueIn(30n),
      ]);
      assert.equal(okHigh, false);
    });

    it("ok=false when dueDate is in the past", async () => {
      const { vault, user, now } = await deployVault();
      await vault.write.setIssuerAllowed([user.account.address, true]);
      const [ok] = await vault.read.quoteAndCheck([
        user.account.address,
        CLAIM_TYPE.PAYROLL,
        parseUnits("1000", 6),
        now - 1n,
      ]);
      assert.equal(ok, false);
    });
  });

  describe("fund", () => {
    it("transfers the advance and updates outstandingPrincipal + availableLiquidity", async () => {
      const { viem, usdt, vault, router, user, dueIn } = await deployVault();
      const face = parseUnits("1000", 6);
      const claimId = toBytes32("claim-1");
      const { advance } = computeQuote(face, 30n, BASE, DAY, PREMIUM[CLAIM_TYPE.PAYROLL]);

      const availBefore = await vault.read.availableLiquidity();

      await viem.assertions.emitWithArgs(
        vault.write.fund([claimId, user.account.address, CLAIM_TYPE.PAYROLL, face, dueIn(30n)], {
          account: router.account,
        }),
        vault,
        "VaultFunded",
        [claimId, getAddress(user.account.address), face, advance],
      );

      assert.equal(await usdt.read.balanceOf([user.account.address]), advance);
      assert.equal(await vault.read.outstandingPrincipal(), advance);
      assert.equal(await vault.read.availableLiquidity(), availBefore - advance);
      assert.equal(await vault.read.principalByClaim([claimId]), advance);
      assert.equal(await vault.read.faceByClaim([claimId]), face);
    });

    it("writeOffClaim clears a defaulted claim's exposure (admin only)", async () => {
      const { viem, vault, router, user, dueIn } = await deployVault();
      const face = parseUnits("1000", 6);
      const claimId = toBytes32("claim-wo");
      await vault.write.fund(
        [claimId, user.account.address, CLAIM_TYPE.PAYROLL, face, dueIn(30n)],
        {
          account: router.account,
        },
      );
      assert.ok((await vault.read.outstandingPrincipal()) > 0n);

      await viem.assertions.revertWithCustomError(
        vault.write.writeOffClaim([claimId], { account: user.account }),
        vault,
        "AccessControlUnauthorizedAccount",
      );
      await vault.write.writeOffClaim([claimId]); // admin = default account
      assert.equal(await vault.read.outstandingPrincipal(), 0n);
      assert.equal(await vault.read.principalByClaim([claimId]), 0n);
      await viem.assertions.revertWithCustomError(
        vault.write.writeOffClaim([claimId]),
        vault,
        "NothingToWriteOff",
      );
    });

    it("reverts InsufficientLiquidity when the vault is underfunded", async () => {
      const { viem, vault, router, user, dueIn } = await deployVault(
        demoMandate,
        parseUnits("100", 6),
      );
      await viem.assertions.revertWithCustomError(
        vault.write.fund(
          [
            toBytes32("claim-x"),
            user.account.address,
            CLAIM_TYPE.PAYROLL,
            parseUnits("1000", 6),
            dueIn(30n),
          ],
          {
            account: router.account,
          },
        ),
        vault,
        "InsufficientLiquidity",
      );
    });

    it("reverts LiquidityCapExceeded when the mandate cap would be breached", async () => {
      const capMandate = { ...demoMandate, liquidityCap: parseUnits("100", 6) };
      // Seed plenty of liquidity so the cap (not the balance) is the binding constraint.
      const { viem, vault, router, user, dueIn } = await deployVault(
        capMandate,
        parseUnits("1000000", 6),
      );
      await viem.assertions.revertWithCustomError(
        vault.write.fund(
          [
            toBytes32("claim-cap"),
            user.account.address,
            CLAIM_TYPE.PAYROLL,
            parseUnits("1000", 6),
            dueIn(30n),
          ],
          {
            account: router.account,
          },
        ),
        vault,
        "LiquidityCapExceeded",
      );
    });

    it("reverts when the caller lacks ROUTER_ROLE", async () => {
      const { viem, vault, user, dueIn } = await deployVault();
      await viem.assertions.revertWithCustomError(
        vault.write.fund(
          [
            toBytes32("claim-y"),
            user.account.address,
            CLAIM_TYPE.PAYROLL,
            parseUnits("1000", 6),
            dueIn(30n),
          ],
          {
            account: user.account,
          },
        ),
        vault,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("is blocked by pause (EnforcedPause)", async () => {
      const { viem, vault, router, user, dueIn } = await deployVault();
      await vault.write.pause();
      await viem.assertions.revertWithCustomError(
        vault.write.fund(
          [
            toBytes32("claim-p"),
            user.account.address,
            CLAIM_TYPE.PAYROLL,
            parseUnits("1000", 6),
            dueIn(30n),
          ],
          {
            account: router.account,
          },
        ),
        vault,
        "EnforcedPause",
      );
    });
  });

  describe("onSettlementReturn", () => {
    it("clears exposure and emits SettlementReturned", async () => {
      const { viem, vault, router, settler, user, dueIn } = await deployVault();
      const face = parseUnits("1000", 6);
      const claimId = toBytes32("claim-settle");
      const { advance } = computeQuote(face, 30n, BASE, DAY, PREMIUM[CLAIM_TYPE.PAYROLL]);

      await vault.write.fund(
        [claimId, user.account.address, CLAIM_TYPE.PAYROLL, face, dueIn(30n)],
        {
          account: router.account,
        },
      );
      assert.equal(await vault.read.outstandingPrincipal(), advance);

      await viem.assertions.emitWithArgs(
        vault.write.onSettlementReturn([claimId, face], { account: settler.account }),
        vault,
        "SettlementReturned",
        [claimId, face, advance],
      );

      assert.equal(await vault.read.outstandingPrincipal(), 0n);
      assert.equal(await vault.read.principalByClaim([claimId]), 0n);
      assert.equal(await vault.read.faceByClaim([claimId]), 0n);
    });

    it("reverts ReturnMismatch on a wrong face amount", async () => {
      const { viem, vault, router, settler, user, dueIn } = await deployVault();
      const face = parseUnits("1000", 6);
      const claimId = toBytes32("claim-mismatch");

      await vault.write.fund(
        [claimId, user.account.address, CLAIM_TYPE.PAYROLL, face, dueIn(30n)],
        {
          account: router.account,
        },
      );

      await viem.assertions.revertWithCustomError(
        vault.write.onSettlementReturn([claimId, face + 1n], { account: settler.account }),
        vault,
        "ReturnMismatch",
      );
      await viem.assertions.revertWithCustomError(
        vault.write.onSettlementReturn([claimId, 0n], { account: settler.account }),
        vault,
        "ReturnMismatch",
      );
    });
  });

  describe("withdraw", () => {
    it("lets the admin withdraw idle liquidity and emits LiquidityWithdrawn", async () => {
      const { viem, usdt, vault, other } = await deployVault();
      const amount = parseUnits("500", 6);
      const availBefore = await vault.read.availableLiquidity();

      await viem.assertions.emitWithArgs(
        vault.write.withdraw([other.account.address, amount]),
        vault,
        "LiquidityWithdrawn",
        [getAddress(other.account.address), amount],
      );

      assert.equal(await usdt.read.balanceOf([other.account.address]), amount);
      assert.equal(await vault.read.availableLiquidity(), availBefore - amount);
    });

    it("reverts InsufficientLiquidity when withdrawing more than the balance", async () => {
      const { viem, vault, other } = await deployVault(demoMandate, parseUnits("100", 6));
      await viem.assertions.revertWithCustomError(
        vault.write.withdraw([other.account.address, parseUnits("101", 6)]),
        vault,
        "InsufficientLiquidity",
      );
    });
  });
});
