import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { getAddress, zeroAddress, keccak256, toHex, type Address } from "viem";
import { ROLES } from "./helpers/constants.js";

const METADATA_HASH = keccak256(toHex("issuer-metadata-v1"));
const OTHER_HASH = keccak256(toHex("issuer-metadata-v2"));

/// Deploy a fresh IssuerRegistry with `admin` as the sole role holder.
async function deployRegistry() {
  const { viem } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [admin, issuer, signer, newSigner, other] = await viem.getWalletClients();
  const registry = await viem.deployContract("IssuerRegistry", [admin.account.address]);
  return { viem, publicClient, registry, admin, issuer, signer, newSigner, other };
}

describe("IssuerRegistry", () => {
  it("grants DEFAULT_ADMIN_ROLE and ISSUER_ADMIN_ROLE to the constructor admin", async () => {
    const { registry, admin } = await deployRegistry();
    assert.equal(
      await registry.read.hasRole([ROLES.DEFAULT_ADMIN_ROLE, admin.account.address]),
      true,
    );
    assert.equal(
      await registry.read.hasRole([ROLES.ISSUER_ADMIN_ROLE, admin.account.address]),
      true,
    );
  });

  it("registers an issuer and stores the record via getIssuer", async () => {
    const { registry, issuer, signer } = await deployRegistry();

    await registry.write.registerIssuer([
      issuer.account.address,
      signer.account.address,
      METADATA_HASH,
    ]);

    const record = await registry.read.getIssuer([issuer.account.address]);
    assert.equal(getAddress(record.issuerAddress), getAddress(issuer.account.address));
    assert.equal(getAddress(record.signer), getAddress(signer.account.address));
    assert.equal(record.metadataHash, METADATA_HASH);
    assert.equal(record.active, true);
    assert.equal(record.signerEpoch, 0n);
    assert.equal(await registry.read.isActive([issuer.account.address]), true);
    assert.equal(await registry.read.currentEpoch([issuer.account.address]), 0n);
  });

  it("emits IssuerRegistered on registration", async () => {
    const { viem, registry, issuer, signer } = await deployRegistry();
    await viem.assertions.emitWithArgs(
      registry.write.registerIssuer([
        issuer.account.address,
        signer.account.address,
        METADATA_HASH,
      ]),
      registry,
      "IssuerRegistered",
      [getAddress(issuer.account.address), getAddress(signer.account.address), METADATA_HASH],
    );
  });

  it("reverts IssuerAlreadyRegistered on duplicate registration", async () => {
    const { viem, registry, issuer, signer, newSigner } = await deployRegistry();
    await registry.write.registerIssuer([
      issuer.account.address,
      signer.account.address,
      METADATA_HASH,
    ]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.registerIssuer([
        issuer.account.address,
        newSigner.account.address,
        OTHER_HASH,
      ]),
      registry,
      "IssuerAlreadyRegistered",
      [getAddress(issuer.account.address)],
    );
  });

  it("reverts SignerAlreadyBound when the signer already backs another issuer", async () => {
    const { viem, registry, issuer, signer, other } = await deployRegistry();
    await registry.write.registerIssuer([
      issuer.account.address,
      signer.account.address,
      METADATA_HASH,
    ]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.registerIssuer([other.account.address, signer.account.address, OTHER_HASH]),
      registry,
      "SignerAlreadyBound",
      [getAddress(signer.account.address)],
    );
  });

  it("reverts ZeroAddress when issuer or signer is zero", async () => {
    const { viem, registry, issuer, signer } = await deployRegistry();

    await viem.assertions.revertWithCustomError(
      registry.write.registerIssuer([zeroAddress, signer.account.address, METADATA_HASH]),
      registry,
      "ZeroAddress",
    );
    await viem.assertions.revertWithCustomError(
      registry.write.registerIssuer([issuer.account.address, zeroAddress, METADATA_HASH]),
      registry,
      "ZeroAddress",
    );
  });

  it("toggles active status via setIssuerActive and reflects it in isActive", async () => {
    const { viem, registry, issuer, signer } = await deployRegistry();
    await registry.write.registerIssuer([
      issuer.account.address,
      signer.account.address,
      METADATA_HASH,
    ]);

    await viem.assertions.emitWithArgs(
      registry.write.setIssuerActive([issuer.account.address, false]),
      registry,
      "IssuerStatusChanged",
      [getAddress(issuer.account.address), false],
    );
    assert.equal(await registry.read.isActive([issuer.account.address]), false);

    await registry.write.setIssuerActive([issuer.account.address, true]);
    assert.equal(await registry.read.isActive([issuer.account.address]), true);
  });

  it("reverts IssuerNotRegistered when toggling an unknown issuer", async () => {
    const { viem, registry, other } = await deployRegistry();
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.setIssuerActive([other.account.address, false]),
      registry,
      "IssuerNotRegistered",
      [getAddress(other.account.address)],
    );
  });

  it("reverts AccessControlUnauthorizedAccount for a non-role caller", async () => {
    const { viem, registry, issuer, signer, other } = await deployRegistry();
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.registerIssuer(
        [issuer.account.address, signer.account.address, METADATA_HASH],
        { account: other.account },
      ),
      registry,
      "AccessControlUnauthorizedAccount",
      [getAddress(other.account.address), ROLES.ISSUER_ADMIN_ROLE],
    );
  });

  it("rotateSigner bumps the epoch and emits IssuerSignerRotated", async () => {
    const { viem, registry, issuer, signer, newSigner } = await deployRegistry();
    await registry.write.registerIssuer([
      issuer.account.address,
      signer.account.address,
      METADATA_HASH,
    ]);

    await viem.assertions.emitWithArgs(
      registry.write.rotateSigner([issuer.account.address, newSigner.account.address]),
      registry,
      "IssuerSignerRotated",
      [
        getAddress(issuer.account.address),
        getAddress(signer.account.address),
        getAddress(newSigner.account.address),
        1n,
      ],
    );

    const record = await registry.read.getIssuer([issuer.account.address]);
    assert.equal(getAddress(record.signer), getAddress(newSigner.account.address));
    assert.equal(record.signerEpoch, 1n);
    assert.equal(await registry.read.currentEpoch([issuer.account.address]), 1n);
  });

  it("frees the old signer on rotation so it can back a different issuer", async () => {
    const { registry, issuer, signer, newSigner, other } = await deployRegistry();
    await registry.write.registerIssuer([
      issuer.account.address,
      signer.account.address,
      METADATA_HASH,
    ]);
    await registry.write.rotateSigner([issuer.account.address, newSigner.account.address]);

    // Old signer is now unbound and reusable.
    await registry.write.registerIssuer([
      other.account.address,
      signer.account.address,
      OTHER_HASH,
    ]);
    const record = await registry.read.getIssuer([other.account.address]);
    assert.equal(getAddress(record.signer), getAddress(signer.account.address));
  });

  it("rotateSigner reverts IssuerNotRegistered / ZeroAddress / SignerAlreadyBound", async () => {
    const { viem, registry, issuer, signer, newSigner, other } = await deployRegistry();
    await registry.write.registerIssuer([
      issuer.account.address,
      signer.account.address,
      METADATA_HASH,
    ]);

    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.rotateSigner([other.account.address, newSigner.account.address]),
      registry,
      "IssuerNotRegistered",
      [getAddress(other.account.address)],
    );
    await viem.assertions.revertWithCustomError(
      registry.write.rotateSigner([issuer.account.address, zeroAddress]),
      registry,
      "ZeroAddress",
    );

    // Register a second issuer, then try to steal its signer.
    await registry.write.registerIssuer([
      other.account.address,
      newSigner.account.address,
      OTHER_HASH,
    ]);
    await viem.assertions.revertWithCustomErrorWithArgs(
      registry.write.rotateSigner([issuer.account.address, newSigner.account.address]),
      registry,
      "SignerAlreadyBound",
      [getAddress(newSigner.account.address)],
    );
  });

  it("isAuthorizedSigner: true for current signer+epoch, false for old signer/epoch and when inactive", async () => {
    const { registry, issuer, signer, newSigner } = await deployRegistry();
    const issuerAddr = issuer.account.address as Address;
    const signerAddr = signer.account.address as Address;
    const newSignerAddr = newSigner.account.address as Address;

    await registry.write.registerIssuer([issuerAddr, signerAddr, METADATA_HASH]);

    // Current signer at current epoch (0) is authorized.
    assert.equal(await registry.read.isAuthorizedSigner([issuerAddr, signerAddr, 0n]), true);
    // Wrong epoch number is never valid.
    assert.equal(await registry.read.isAuthorizedSigner([issuerAddr, signerAddr, 1n]), false);

    // Rotate: epoch -> 1, new signer authorized.
    await registry.write.rotateSigner([issuerAddr, newSignerAddr]);
    assert.equal(await registry.read.isAuthorizedSigner([issuerAddr, newSignerAddr, 1n]), true);
    // Old signer is never valid, at any epoch.
    assert.equal(await registry.read.isAuthorizedSigner([issuerAddr, signerAddr, 1n]), false);
    // Old epoch number is never valid, even for the new signer.
    assert.equal(await registry.read.isAuthorizedSigner([issuerAddr, newSignerAddr, 0n]), false);

    // Deactivation invalidates the current signer+epoch too.
    await registry.write.setIssuerActive([issuerAddr, false]);
    assert.equal(await registry.read.isAuthorizedSigner([issuerAddr, newSignerAddr, 1n]), false);
  });

  it("isAuthorizedSigner returns false for an unregistered issuer", async () => {
    const { registry, other, signer } = await deployRegistry();
    assert.equal(
      await registry.read.isAuthorizedSigner([other.account.address, signer.account.address, 0n]),
      false,
    );
  });
});
