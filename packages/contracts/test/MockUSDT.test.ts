import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, getAddress } from "viem";
import { ROLES } from "./helpers/constants.js";

/// MockUSDT is a testnet/demo ERC20: 6 decimals, admin mint, and a per-address capped faucet.
describe("MockUSDT", () => {
  const FAUCET_CAP = parseUnits("10000", 6); // 10_000e6, matches contract constant.

  async function deploy() {
    const { viem } = await network.create();
    // Narrow the three demo wallets (noUncheckedIndexedAccess makes array access `| undefined`);
    // the EDR dev network always provides 20, so this is a type guard, not a runtime expectation.
    const [w0, w1, w2] = await viem.getWalletClients();
    if (w0 === undefined || w1 === undefined || w2 === undefined) {
      throw new Error("Expected at least 3 wallet clients from the test network.");
    }
    const admin = w0;
    const user = w1;
    const other = w2;
    const usdt = await viem.deployContract("MockUSDT", []);
    return { viem, usdt, admin, user, other };
  }

  it("reports 6 decimals", async () => {
    const { usdt } = await deploy();
    assert.equal(await usdt.read.decimals(), 6);
  });

  it("has name 'Mock USDT' and symbol 'USDT'", async () => {
    const { usdt } = await deploy();
    assert.equal(await usdt.read.name(), "Mock USDT");
    assert.equal(await usdt.read.symbol(), "USDT");
  });

  it("grants DEFAULT_ADMIN_ROLE to the deployer", async () => {
    const { usdt, admin } = await deploy();
    assert.equal(await usdt.read.hasRole([ROLES.DEFAULT_ADMIN_ROLE, admin.account.address]), true);
  });

  it("lets an admin mint, increasing balance and totalSupply", async () => {
    const { usdt, user } = await deploy();
    const amount = parseUnits("1000", 6);

    const supplyBefore = await usdt.read.totalSupply();
    await usdt.write.mint([user.account.address, amount]);

    assert.equal(await usdt.read.balanceOf([user.account.address]), amount);
    assert.equal(await usdt.read.totalSupply(), supplyBefore + amount);
  });

  it("reverts admin mint from a non-admin with AccessControlUnauthorizedAccount", async () => {
    const { viem, usdt, user } = await deploy();
    await viem.assertions.revertWithCustomError(
      usdt.write.mint([user.account.address, parseUnits("1", 6)], { account: user.account }),
      usdt,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("mints to the caller via faucet within the cap and emits Faucet", async () => {
    const { viem, usdt, user } = await deploy();
    const amount = parseUnits("5000", 6);

    await viem.assertions.emitWithArgs(
      usdt.write.faucet([amount], { account: user.account }),
      usdt,
      "Faucet",
      [getAddress(user.account.address), amount],
    );

    assert.equal(await usdt.read.balanceOf([user.account.address]), amount);
    assert.equal(await usdt.read.claimed([user.account.address]), amount);
  });

  it("accumulates faucet claims and reverts FaucetCapExceeded past the cap", async () => {
    const { viem, usdt, user } = await deploy();
    const first = parseUnits("6000", 6);

    await usdt.write.faucet([first], { account: user.account });
    assert.equal(await usdt.read.claimed([user.account.address]), first);

    // first + 6000e6 = 12_000e6 > 10_000e6 cap => revert with (alreadyClaimed, cap).
    await viem.assertions.revertWithCustomErrorWithArgs(
      usdt.write.faucet([parseUnits("6000", 6)], { account: user.account }),
      usdt,
      "FaucetCapExceeded",
      [first, FAUCET_CAP],
    );

    // Claiming exactly up to the cap still succeeds.
    const remainder = FAUCET_CAP - first;
    await usdt.write.faucet([remainder], { account: user.account });
    assert.equal(await usdt.read.claimed([user.account.address]), FAUCET_CAP);
    assert.equal(await usdt.read.balanceOf([user.account.address]), FAUCET_CAP);
  });

  it("gives each address its own independent faucet cap", async () => {
    const { usdt, user, other } = await deploy();

    await usdt.write.faucet([FAUCET_CAP], { account: user.account });
    await usdt.write.faucet([FAUCET_CAP], { account: other.account });

    assert.equal(await usdt.read.balanceOf([user.account.address]), FAUCET_CAP);
    assert.equal(await usdt.read.balanceOf([other.account.address]), FAUCET_CAP);
    assert.equal(await usdt.read.claimed([user.account.address]), FAUCET_CAP);
    assert.equal(await usdt.read.claimed([other.account.address]), FAUCET_CAP);
  });
});
