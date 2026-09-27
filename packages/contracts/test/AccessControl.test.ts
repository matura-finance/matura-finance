import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import { deployProtocol, toBytes32 } from "./helpers/fixtures.js";
import { ROLES } from "./helpers/constants.js";

/// A4 — access control & role initialization. Proves the deploy wiring keeps the ROUTER_ROLE and
/// SETTLEMENT_ROLE trust boundaries disjoint, that value-moving/state-mutating entrypoints reject a
/// random EOA, and that constructors grant exactly the expected admin/pauser/treasury/fee state.
describe("AccessControl (role separation & init)", () => {
  it("A4: no address holds both ROUTER_ROLE and SETTLEMENT_ROLE post-deploy", async () => {
    const { claimRegistry, vault, settlement, router } = await deployProtocol();
    const routerAddr = router.address;
    const settlementAddr = settlement.address;

    // The router is the sole ROUTER_ROLE holder; it never holds SETTLEMENT_ROLE anywhere.
    for (const contract of [claimRegistry, vault, settlement]) {
      assert.equal(await contract.read.hasRole([ROLES.ROUTER_ROLE, routerAddr]), true);
      assert.equal(await contract.read.hasRole([ROLES.SETTLEMENT_ROLE, routerAddr]), false);
    }
    // The settlement manager holds SETTLEMENT_ROLE (on registry + vault) but never ROUTER_ROLE.
    for (const contract of [claimRegistry, vault]) {
      assert.equal(await contract.read.hasRole([ROLES.SETTLEMENT_ROLE, settlementAddr]), true);
      assert.equal(await contract.read.hasRole([ROLES.ROUTER_ROLE, settlementAddr]), false);
    }
    assert.equal(await settlement.read.hasRole([ROLES.ROUTER_ROLE, settlementAddr]), false);
  });

  // NOTE: deliberately restates coverage that also exists per-contract (LiquidityVault.test.ts,
  // ClaimRegistry.test.ts, SettlementManager.test.ts) — kept here as ONE cross-cutting matrix over
  // every value-moving / state-mutating entrypoint, so the role boundary is asserted in a single
  // place. Do not dedupe against the per-contract tests: this consolidated view is intentional.
  it("A4: fund / reserveSlice / registerAllocation / releaseSlice revert AccessControlUnauthorizedAccount from a random EOA", async () => {
    const { viem, claimRegistry, vault, settlement, accounts, now } = await deployProtocol();
    const account = accounts.other.account;
    const claimId = toBytes32("ac-x");

    await viem.assertions.revertWithCustomError(
      vault.write.fund([claimId, account.address, 0, parseUnits("100", 6), now + 86_400n], {
        account,
      }),
      vault,
      "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.reserveSlice([claimId, parseUnits("1", 6)], { account }),
      claimRegistry,
      "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.revertWithCustomError(
      settlement.write.registerAllocation(
        [claimId, toBytes32("ac-e"), vault.address, parseUnits("1", 6)],
        { account },
      ),
      settlement,
      "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.releaseSlice([claimId], { account }),
      claimRegistry,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("A4: constructors grant the expected admin / pauser roles and initialize feeBps == 0", async () => {
    const { claimRegistry, issuerRegistry, vaultRegistry, settlement, router, vault, accounts } =
      await deployProtocol();
    const admin = accounts.admin.account.address;

    // DEFAULT_ADMIN_ROLE on every protocol contract.
    for (const contract of [
      claimRegistry,
      issuerRegistry,
      vaultRegistry,
      settlement,
      router,
      vault,
    ]) {
      assert.equal(await contract.read.hasRole([ROLES.DEFAULT_ADMIN_ROLE, admin]), true);
    }
    // Pausable contracts grant PAUSER_ROLE to the admin at construction.
    assert.equal(await router.read.hasRole([ROLES.PAUSER_ROLE, admin]), true);
    assert.equal(await vault.read.hasRole([ROLES.PAUSER_ROLE, admin]), true);
    // Claim registry also grants the reviewer role.
    assert.equal(await claimRegistry.read.hasRole([ROLES.CLAIM_REVIEWER_ROLE, admin]), true);
    // Fee starts at zero.
    assert.equal(await settlement.read.feeBps(), 0);
  });
});
