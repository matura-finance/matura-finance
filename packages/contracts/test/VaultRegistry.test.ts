import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { getAddress, zeroAddress } from "viem";
import { ROLES } from "./helpers/constants.js";

/// Unit tests for VaultRegistry: the append-only, admin-gated enumerable vault set.
describe("VaultRegistry", () => {
  async function deploy() {
    const { viem } = await network.create();
    // Narrow the four demo wallets once (noUncheckedIndexedAccess makes array access `| undefined`);
    // the EDR dev network always provides 20, so this is a type guard, not a runtime expectation.
    const [w0, w1, w2, w3] = await viem.getWalletClients();
    if (w0 === undefined || w1 === undefined || w2 === undefined || w3 === undefined) {
      throw new Error("Expected at least 4 wallet clients from the test network.");
    }
    const admin = w0;
    const vaultA = w1;
    const vaultB = w2;
    const outsider = w3;
    const registry = await viem.deployContract("VaultRegistry", [admin.account.address]);
    return { viem, registry, admin, vaultA, vaultB, outsider };
  }

  it("registers a vault: getVaults contains it and isRegistered/isActive are true", async () => {
    const { registry, vaultA } = await deploy();
    const vault = getAddress(vaultA.account.address);

    await registry.write.registerVault([vault]);

    const vaults = await registry.read.getVaults();
    assert.deepEqual(vaults, [vault]);
    assert.equal(await registry.read.isRegistered([vault]), true);
    assert.equal(await registry.read.isActive([vault]), true);
  });

  it("emits VaultRegistered on registration", async () => {
    const { viem, registry, vaultA } = await deploy();
    const vault = getAddress(vaultA.account.address);

    await viem.assertions.emitWithArgs(
      registry.write.registerVault([vault]),
      registry,
      "VaultRegistered",
      [vault],
    );
  });

  it("reverts VaultAlreadyRegistered on duplicate registration", async () => {
    const { viem, registry, vaultA } = await deploy();
    const vault = getAddress(vaultA.account.address);

    await registry.write.registerVault([vault]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.registerVault([vault]),
      registry,
      "VaultAlreadyRegistered",
      [vault],
    );
  });

  it("reverts ZeroAddress when registering the zero address", async () => {
    const { viem, registry } = await deploy();

    await viem.assertions.revertWithCustomError(
      registry.write.registerVault([zeroAddress]),
      registry,
      "ZeroAddress",
    );
  });

  it("setVaultActive(false) clears isActive but keeps isRegistered true", async () => {
    const { viem, registry, vaultA } = await deploy();
    const vault = getAddress(vaultA.account.address);

    await registry.write.registerVault([vault]);

    await viem.assertions.emitWithArgs(
      registry.write.setVaultActive([vault, false]),
      registry,
      "VaultStatusChanged",
      [vault, false],
    );

    assert.equal(await registry.read.isActive([vault]), false);
    assert.equal(await registry.read.isRegistered([vault]), true);

    // Re-enabling flips isActive back to true.
    await registry.write.setVaultActive([vault, true]);
    assert.equal(await registry.read.isActive([vault]), true);
  });

  it("reverts VaultNotRegistered when toggling an unregistered vault", async () => {
    const { viem, registry, vaultB } = await deploy();
    const vault = getAddress(vaultB.account.address);

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.setVaultActive([vault, false]),
      registry,
      "VaultNotRegistered",
      [vault],
    );
  });

  it("reverts AccessControlUnauthorizedAccount for a non-admin registerVault caller", async () => {
    const { viem, registry, vaultA, outsider } = await deploy();
    const vault = getAddress(vaultA.account.address);

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.registerVault([vault], { account: outsider.account }),
      registry,
      "AccessControlUnauthorizedAccount",
      [getAddress(outsider.account.address), ROLES.DEFAULT_ADMIN_ROLE],
    );
  });

  it("reverts AccessControlUnauthorizedAccount for a non-admin setVaultActive caller", async () => {
    const { viem, registry, vaultA, outsider } = await deploy();
    const vault = getAddress(vaultA.account.address);

    await registry.write.registerVault([vault]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.setVaultActive([vault, false], { account: outsider.account }),
      registry,
      "AccessControlUnauthorizedAccount",
      [getAddress(outsider.account.address), ROLES.DEFAULT_ADMIN_ROLE],
    );
  });

  it("getVaults returns every registered vault in registration order", async () => {
    const { registry, vaultA, vaultB } = await deploy();
    const first = getAddress(vaultA.account.address);
    const second = getAddress(vaultB.account.address);

    await registry.write.registerVault([first]);
    await registry.write.registerVault([second]);

    const vaults = await registry.read.getVaults();
    assert.deepEqual(vaults, [first, second]);
  });
});
