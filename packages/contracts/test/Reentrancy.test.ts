import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { encodeFunctionData, getAddress, parseUnits } from "viem";
import { deployProtocol, demoMandate, toBytes32 } from "./helpers/fixtures.js";
import {
  CLAIM_ATTESTATION_TYPES,
  EXECUTION_ROUTE_TYPES,
  claimRegistryDomain,
  routerDomain,
} from "./helpers/eip712.js";
import { ROLES, CLAIM_TYPE, CLAIM_STATE } from "./helpers/constants.js";

/// A7 — reentrancy: proof-of-pinning (the settlement token is immutable and every claim/vault is
/// bound to it) + proof-of-guard (a reentrant token callback into a value-moving entrypoint is
/// blocked by ReentrancyGuardTransient). Uses the TEST-ONLY MaliciousToken / MockNoReturnToken
/// mocks, which are excluded from the ABI export set. (registerClaim/registerFromSource rejecting a
/// non-settlement token — TokenNotSettlement — is covered in ClaimRegistry.test.ts.)
describe("A7: reentrancy — pinning + guard", () => {
  // ---- proof-of-pinning -----------------------------------------------------------------------

  it("A7: asset immutables are all wired to the one settlement token", async () => {
    const { usdt, claimRegistry, settlement, router, vault } = await deployProtocol();
    const token = getAddress(usdt.address);
    assert.equal(getAddress(await claimRegistry.read.settlementToken()), token);
    assert.equal(getAddress(await settlement.read.token()), token);
    assert.equal(getAddress(await router.read.settlementToken()), token);
    assert.equal(getAddress(await vault.read.token()), token);
  });

  it("A7: the router rejects a claim↔vault token mismatch (TokenMismatch)", async () => {
    const ctx = await deployProtocol();
    const { viem, router, vaultRegistry, accounts, now, createEligibleClaim, signRoute } = ctx;
    // A second vault bound to a DIFFERENT token than the claim's settlement token.
    const otherToken = await viem.deployContract("MockUSDT", []);
    const otherVault = await viem.deployContract("LiquidityVault", [
      accounts.admin.account.address,
      otherToken.address,
      demoMandate,
    ]);
    await vaultRegistry.write.registerVault([otherVault.address]);
    await otherVault.write.setIssuerAllowed([accounts.issuer.account.address, true]);
    await otherToken.write.mint([otherVault.address, demoMandate.liquidityCap]);

    const { claimId, faceValue } = await createEligibleClaim({
      label: "pin-mismatch",
      faceValue: parseUnits("1000", 6),
    });
    const route = {
      user: getAddress(accounts.user.account.address),
      targetAdvance: 1n,
      maxTotalFace: parseUnits("1000000", 6),
      deadline: now + 3_600n,
      nonce: 0n,
      legs: [
        {
          claimId,
          vault: getAddress(otherVault.address),
          faceAmount: faceValue,
          minimumAdvanceAmount: 0n,
        },
      ],
    };
    await viem.assertions.revertWithCustomError(
      router.write.executeRoute([route, await signRoute(route)], {
        account: accounts.user.account,
      }),
      router,
      "TokenMismatch",
    );
  });

  // ---- proof-of-guard -------------------------------------------------------------------------

  it("A7: a reentrant token callback into LiquidityVault.fund is blocked by nonReentrant", async () => {
    const { viem, networkHelpers } = await network.create();
    const [w0, w1, w2] = await viem.getWalletClients();
    if (w0 === undefined || w1 === undefined || w2 === undefined) {
      throw new Error("Expected at least 3 wallet clients from the test network.");
    }
    const admin = w0;
    const routerEoa = w1;
    const user = w2;

    const evil = await viem.deployContract("MaliciousToken", []);
    const vault = await viem.deployContract("LiquidityVault", [
      admin.account.address,
      evil.address,
      demoMandate,
    ]);
    // Grant ROUTER_ROLE to the real caller AND to the token, so the reentrant fund clears the role
    // check and the ONLY thing left to stop it is the reentrancy guard.
    await vault.write.grantRole([ROLES.ROUTER_ROLE, routerEoa.account.address]);
    await vault.write.grantRole([ROLES.ROUTER_ROLE, evil.address]);
    await evil.write.mint([vault.address, demoMandate.liquidityCap]);

    const now = BigInt(await networkHelpers.time.latest());
    const dueDate = now + 30n * 86_400n;
    const face = parseUnits("1000", 6);
    const claimId = toBytes32("evil-fund");

    const reentryData = encodeFunctionData({
      abi: vault.abi,
      functionName: "fund",
      args: [claimId, getAddress(user.account.address), CLAIM_TYPE.PAYROLL, face, dueDate],
    });
    await evil.write.arm([vault.address, reentryData]);

    // Outer fund succeeds; the token's transfer hook attempts a reentrant fund which reverts.
    await vault.write.fund([claimId, user.account.address, CLAIM_TYPE.PAYROLL, face, dueDate], {
      account: routerEoa.account,
    });

    assert.equal(await evil.read.reentryAttempted(), true);
    assert.equal(await evil.read.reentryReverted(), true);
    // The outer call funded exactly once (no double advance from a successful reentry).
    assert.equal(
      await vault.read.principalByClaim([claimId]),
      await vault.read.outstandingPrincipal(),
    );
  });

  it("A7: a reentrant token callback into SettlementManager.settleClaim is blocked (guard + AlreadySettled)", async () => {
    const { evil, settlement, claimRegistry, accounts, claimId, face } = await deployEvilStack();

    // Fund the payer and arm the token to re-enter settleClaim on the first token movement.
    await evil.write.mint([accounts.payer.account.address, face]);
    await evil.write.approve([settlement.address, face], { account: accounts.payer.account });
    const reentryData = encodeFunctionData({
      abi: settlement.abi,
      functionName: "settleClaim",
      args: [claimId],
    });
    await evil.write.arm([settlement.address, reentryData]);

    await settlement.write.settleClaim([claimId], { account: accounts.payer.account });

    assert.equal(await evil.read.reentryAttempted(), true);
    assert.equal(await evil.read.reentryReverted(), true);
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);
    assert.equal(await settlement.read.isSettled([claimId]), true);
  });

  // ---- optional defensive: SafeERC20 surfaces a misbehaving token as a revert ------------------

  it("A7: SafeERC20 reverts on a token whose transfer returns false (no silent continue)", async () => {
    const { viem, networkHelpers } = await network.create();
    const [w0, w1, w2] = await viem.getWalletClients();
    if (w0 === undefined || w1 === undefined || w2 === undefined) {
      throw new Error("Expected at least 3 wallet clients from the test network.");
    }
    const admin = w0;
    const routerEoa = w1;
    const user = w2;

    const bad = await viem.deployContract("MockNoReturnToken", []);
    const vault = await viem.deployContract("LiquidityVault", [
      admin.account.address,
      bad.address,
      demoMandate,
    ]);
    await vault.write.grantRole([ROLES.ROUTER_ROLE, routerEoa.account.address]);
    await bad.write.mint([vault.address, demoMandate.liquidityCap]);

    const now = BigInt(await networkHelpers.time.latest());
    await viem.assertions.revertWithCustomError(
      vault.write.fund(
        [
          toBytes32("bad-tok"),
          user.account.address,
          CLAIM_TYPE.PAYROLL,
          parseUnits("1000", 6),
          now + 30n * 86_400n,
        ],
        { account: routerEoa.account },
      ),
      vault,
      "SafeERC20FailedOperation",
    );
  });
});

/// Full protocol wired around the reentrant MaliciousToken as the settlement token, with one
/// fully-financed + matured claim ready to settle. Mirrors `deployProtocol`'s wiring exactly.
async function deployEvilStack() {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [w0, w1, w2, w3, w4, w5] = await viem.getWalletClients();
  if (
    w0 === undefined ||
    w1 === undefined ||
    w2 === undefined ||
    w3 === undefined ||
    w4 === undefined ||
    w5 === undefined
  ) {
    throw new Error("Expected at least 6 wallet clients from the test network.");
  }
  const admin = w0;
  const issuerSigner = w1;
  const user = w2;
  const treasury = w3;
  const issuer = w4;
  const payer = w5;

  const evil = await viem.deployContract("MaliciousToken", []);
  const issuerRegistry = await viem.deployContract("IssuerRegistry", [admin.account.address]);
  const claimRegistry = await viem.deployContract("ClaimRegistry", [
    admin.account.address,
    issuerRegistry.address,
    evil.address,
  ]);
  const vaultRegistry = await viem.deployContract("VaultRegistry", [admin.account.address]);
  const settlement = await viem.deployContract("SettlementManager", [
    admin.account.address,
    claimRegistry.address,
    evil.address,
  ]);
  const router = await viem.deployContract("MaturaRouter", [
    admin.account.address,
    claimRegistry.address,
    vaultRegistry.address,
    issuerRegistry.address,
    settlement.address,
    evil.address,
  ]);
  const vault = await viem.deployContract("LiquidityVault", [
    admin.account.address,
    evil.address,
    demoMandate,
  ]);

  await claimRegistry.write.grantRole([ROLES.ROUTER_ROLE, router.address]);
  await claimRegistry.write.grantRole([ROLES.SETTLEMENT_ROLE, settlement.address]);
  await vault.write.grantRole([ROLES.ROUTER_ROLE, router.address]);
  await vault.write.grantRole([ROLES.SETTLEMENT_ROLE, settlement.address]);
  await settlement.write.grantRole([ROLES.ROUTER_ROLE, router.address]);
  await vaultRegistry.write.registerVault([vault.address]);
  await settlement.write.setTreasury([treasury.account.address]);
  await issuerRegistry.write.registerIssuer([
    issuer.account.address,
    issuerSigner.account.address,
    toBytes32("meta"),
  ]);
  await vault.write.setIssuerAllowed([issuer.account.address, true]);
  await evil.write.mint([vault.address, demoMandate.liquidityCap]);

  const chainId = await publicClient.getChainId();
  const now = BigInt(await networkHelpers.time.latest());
  const face = parseUnits("1000", 6);
  const claimId = toBytes32("evil-settle");

  const att = {
    claimId,
    issuer: getAddress(issuer.account.address),
    beneficiary: getAddress(user.account.address),
    token: getAddress(evil.address),
    faceValue: face,
    dueDate: now + 30n * 86_400n,
    claimType: CLAIM_TYPE.PAYROLL,
    externalIdHash: toBytes32("evil-ext"),
    evidenceHash: toBytes32("evil-ev"),
    signerEpoch: 0n,
    nonce: 0n,
    deadline: now + 3_600n,
  };
  const attSig = await issuerSigner.signTypedData({
    account: issuerSigner.account,
    domain: claimRegistryDomain(chainId, claimRegistry.address),
    types: CLAIM_ATTESTATION_TYPES,
    primaryType: "ClaimAttestation",
    message: att,
  });
  await claimRegistry.write.registerClaim([att, attSig]);
  await claimRegistry.write.markEligible([claimId]);

  const route = {
    user: getAddress(user.account.address),
    targetAdvance: 1n,
    maxTotalFace: parseUnits("1000000", 6),
    deadline: now + 3_600n,
    nonce: 0n,
    legs: [
      { claimId, vault: getAddress(vault.address), faceAmount: face, minimumAdvanceAmount: 0n },
    ],
  };
  const routeSig = await user.signTypedData({
    account: user.account,
    domain: routerDomain(chainId, router.address),
    types: EXECUTION_ROUTE_TYPES,
    primaryType: "ExecutionRoute",
    message: route,
  });
  // Not armed during funding → the token behaves normally while the route executes.
  await router.write.executeRoute([route, routeSig], { account: user.account });

  await networkHelpers.time.increase(31 * 86_400);
  await claimRegistry.write.markMatured([claimId]);

  const accounts = { admin, issuerSigner, user, treasury, issuer, payer };
  return { evil, settlement, claimRegistry, accounts, claimId, face };
}
