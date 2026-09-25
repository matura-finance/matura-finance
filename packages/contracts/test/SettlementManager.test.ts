import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { getAddress, parseUnits, zeroAddress, type Address } from "viem";
import { ROLES, MAX_SLICES_PER_CLAIM, MAX_FEE_BPS } from "./helpers/constants.js";
import { toBytes32 } from "./helpers/fixtures.js";

/// Unit tests for SettlementManager. These cover the pieces testable in isolation:
/// allocation aggregation + bounds, role gating, and the admin fee/treasury setters. The full
/// happy-path settlement (which requires a signed, funded, matured claim) lives in an integration test.
describe("SettlementManager", () => {
  /// A deterministic non-zero address for the Nth distinct fake vault.
  function fakeVault(n: number): Address {
    return getAddress(`0x${n.toString(16).padStart(40, "0")}`);
  }

  async function deploy() {
    const { viem } = await network.create();
    // Narrow the four demo wallets once (noUncheckedIndexedAccess makes array access `| undefined`);
    // the EDR dev network always provides 20, so this is a type guard, not a runtime expectation.
    const [w0, w1, w2, w3] = await viem.getWalletClients();
    if (w0 === undefined || w1 === undefined || w2 === undefined || w3 === undefined) {
      throw new Error("Expected at least 4 wallet clients from the test network.");
    }
    const admin = w0;
    const router = w1;
    const outsider = w2;
    const treasury = w3;

    const usdt = await viem.deployContract("MockUSDT", []);
    const issuerRegistry = await viem.deployContract("IssuerRegistry", [admin.account.address]);
    const claimRegistry = await viem.deployContract("ClaimRegistry", [
      admin.account.address,
      issuerRegistry.address,
      usdt.address,
    ]);
    const settlement = await viem.deployContract("SettlementManager", [
      admin.account.address,
      claimRegistry.address,
      usdt.address,
    ]);

    // Grant ROUTER_ROLE to a test EOA so we can drive registerAllocation directly.
    await settlement.write.grantRole([ROLES.ROUTER_ROLE, router.account.address]);

    return {
      viem,
      usdt,
      issuerRegistry,
      claimRegistry,
      settlement,
      admin,
      router,
      outsider,
      treasury,
    };
  }

  it("wires immutables and initial admin/treasury/fee state", async () => {
    const { settlement, claimRegistry, usdt, admin } = await deploy();
    assert.equal(
      getAddress(await settlement.read.claimRegistry()),
      getAddress(claimRegistry.address),
    );
    assert.equal(getAddress(await settlement.read.token()), getAddress(usdt.address));
    assert.equal(getAddress(await settlement.read.treasury()), getAddress(admin.account.address));
    assert.equal(await settlement.read.feeBps(), 0);
  });

  it("aggregates repeat allocations for the same (claimId, vault) into one entry", async () => {
    const { settlement, router } = await deploy();
    const claimId = toBytes32("claim-agg");
    const execId = toBytes32("exec-1");
    const vault = fakeVault(1);
    const a = parseUnits("100", 6);
    const b = parseUnits("250", 6);

    await settlement.write.registerAllocation([claimId, execId, vault, a], {
      account: router.account,
    });
    await settlement.write.registerAllocation([claimId, execId, vault, b], {
      account: router.account,
    });

    const allocs = await settlement.read.getAllocations([claimId]);
    assert.equal(allocs.length, 1);
    const [alloc0] = allocs;
    if (alloc0 === undefined) {
      throw new Error("Expected an allocation entry for the claim.");
    }
    assert.equal(getAddress(alloc0.vault), vault);
    assert.equal(alloc0.faceAmount, a + b);
  });

  it("keeps distinct vaults as separate entries", async () => {
    const { settlement, router } = await deploy();
    const claimId = toBytes32("claim-two-vaults");
    const execId = toBytes32("exec-1");
    const v1 = fakeVault(1);
    const v2 = fakeVault(2);
    const a = parseUnits("100", 6);
    const b = parseUnits("400", 6);

    await settlement.write.registerAllocation([claimId, execId, v1, a], {
      account: router.account,
    });
    await settlement.write.registerAllocation([claimId, execId, v2, b], {
      account: router.account,
    });

    const allocs = await settlement.read.getAllocations([claimId]);
    assert.equal(allocs.length, 2);
    const [alloc0, alloc1] = allocs;
    if (alloc0 === undefined || alloc1 === undefined) {
      throw new Error("Expected two allocation entries for the claim.");
    }
    assert.equal(getAddress(alloc0.vault), v1);
    assert.equal(alloc0.faceAmount, a);
    assert.equal(getAddress(alloc1.vault), v2);
    assert.equal(alloc1.faceAmount, b);
  });

  it("emits AllocationRegistered with the per-call faceAmount", async () => {
    const { viem, settlement, router } = await deploy();
    const claimId = toBytes32("claim-evt");
    const execId = toBytes32("exec-evt");
    const vault = fakeVault(3);
    const amount = parseUnits("123", 6);

    await viem.assertions.emitWithArgs(
      settlement.write.registerAllocation([claimId, execId, vault, amount], {
        account: router.account,
      }),
      settlement,
      "AllocationRegistered",
      [claimId, execId, vault, amount],
    );
  });

  it("enforces MaxSlicesExceeded when adding a NEW vault past the cap", async () => {
    const { viem, settlement, router } = await deploy();
    const claimId = toBytes32("claim-max");
    const execId = toBytes32("exec-max");
    const amount = parseUnits("10", 6);

    // Fill exactly MAX_SLICES_PER_CLAIM (8) distinct vaults.
    for (let i = 1; i <= MAX_SLICES_PER_CLAIM; i++) {
      await settlement.write.registerAllocation([claimId, execId, fakeVault(i), amount], {
        account: router.account,
      });
    }
    assert.equal((await settlement.read.getAllocations([claimId])).length, MAX_SLICES_PER_CLAIM);

    // A 9th distinct vault reverts.
    await viem.assertions.revertWithCustomError(
      settlement.write.registerAllocation(
        [claimId, execId, fakeVault(MAX_SLICES_PER_CLAIM + 1), amount],
        {
          account: router.account,
        },
      ),
      settlement,
      "MaxSlicesExceeded",
    );

    // Aggregating into an EXISTING vault at the cap still succeeds (no new slot).
    await settlement.write.registerAllocation([claimId, execId, fakeVault(1), amount], {
      account: router.account,
    });
    const allocs = await settlement.read.getAllocations([claimId]);
    assert.equal(allocs.length, MAX_SLICES_PER_CLAIM);
    const [alloc0] = allocs;
    if (alloc0 === undefined) {
      throw new Error("Expected an allocation entry for the claim.");
    }
    assert.equal(alloc0.faceAmount, amount * 2n);
  });

  it("reverts AccessControlUnauthorizedAccount for a non-ROUTER registerAllocation caller", async () => {
    const { viem, settlement, outsider } = await deploy();

    await viem.assertions.revertWithCustomErrorWithArgs(
      settlement.write.registerAllocation(
        [toBytes32("c"), toBytes32("e"), fakeVault(1), parseUnits("1", 6)],
        { account: outsider.account },
      ),
      settlement,
      "AccessControlUnauthorizedAccount",
      [getAddress(outsider.account.address), ROLES.ROUTER_ROLE],
    );
  });

  it("getAllocations returns an empty array for an unknown claim", async () => {
    const { settlement } = await deploy();
    const allocs = await settlement.read.getAllocations([toBytes32("nope")]);
    assert.equal(allocs.length, 0);
  });

  it("setFeeBps updates the fee and emits FeeUpdated", async () => {
    const { viem, settlement } = await deploy();

    await viem.assertions.emitWithArgs(
      settlement.write.setFeeBps([MAX_FEE_BPS]),
      settlement,
      "FeeUpdated",
      [MAX_FEE_BPS],
    );
    assert.equal(await settlement.read.feeBps(), MAX_FEE_BPS);
  });

  it("setFeeBps accepts the MAX_FEE_BPS boundary but reverts FeeTooHigh above it", async () => {
    const { viem, settlement } = await deploy();

    // 500 (MAX_FEE_BPS) is accepted.
    await settlement.write.setFeeBps([MAX_FEE_BPS]);
    assert.equal(await settlement.read.feeBps(), MAX_FEE_BPS);

    // 501 reverts.
    await viem.assertions.revertWithCustomError(
      settlement.write.setFeeBps([MAX_FEE_BPS + 1]),
      settlement,
      "FeeTooHigh",
    );
  });

  it("setFeeBps reverts for a non-admin caller", async () => {
    const { viem, settlement, outsider } = await deploy();

    await viem.assertions.revertWithCustomErrorWithArgs(
      settlement.write.setFeeBps([100], { account: outsider.account }),
      settlement,
      "AccessControlUnauthorizedAccount",
      [getAddress(outsider.account.address), ROLES.DEFAULT_ADMIN_ROLE],
    );
  });

  it("setTreasury updates the treasury and emits TreasuryUpdated", async () => {
    const { viem, settlement, treasury } = await deploy();
    const next = getAddress(treasury.account.address);

    await viem.assertions.emitWithArgs(
      settlement.write.setTreasury([next]),
      settlement,
      "TreasuryUpdated",
      [next],
    );
    assert.equal(getAddress(await settlement.read.treasury()), next);
  });

  it("setTreasury reverts ZeroAddress for the zero address", async () => {
    const { viem, settlement } = await deploy();

    await viem.assertions.revertWithCustomError(
      settlement.write.setTreasury([zeroAddress]),
      settlement,
      "ZeroAddress",
    );
  });

  it("setTreasury reverts for a non-admin caller", async () => {
    const { viem, settlement, outsider } = await deploy();

    await viem.assertions.revertWithCustomErrorWithArgs(
      settlement.write.setTreasury([getAddress(outsider.account.address)], {
        account: outsider.account,
      }),
      settlement,
      "AccessControlUnauthorizedAccount",
      [getAddress(outsider.account.address), ROLES.DEFAULT_ADMIN_ROLE],
    );
  });
});
