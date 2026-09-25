import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, getAddress, type Address, type Hex } from "viem";
import { CLAIM_ATTESTATION_TYPES, claimRegistryDomain } from "./helpers/eip712.js";
import { ROLES, CLAIM_STATE, CLAIM_TYPE } from "./helpers/constants.js";
import { toBytes32 } from "./helpers/fixtures.js";

interface Attestation {
  claimId: Hex;
  issuer: Address;
  beneficiary: Address;
  token: Address;
  faceValue: bigint;
  dueDate: bigint;
  claimType: number;
  externalIdHash: Hex;
  evidenceHash: Hex;
  signerEpoch: bigint;
  nonce: bigint;
  deadline: bigint;
}

async function setup() {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const [admin, issuerSigner, user, router, settlement, other] = await viem.getWalletClients();
  const chainId = await publicClient.getChainId();

  const usdt = await viem.deployContract("MockUSDT", []);
  const issuerRegistry = await viem.deployContract("IssuerRegistry", [admin.account.address]);
  const claimRegistry = await viem.deployContract("ClaimRegistry", [
    admin.account.address,
    issuerRegistry.address,
    usdt.address,
  ]);

  await issuerRegistry.write.registerIssuer([
    admin.account.address,
    issuerSigner.account.address,
    toBytes32("meta"),
  ]);
  await claimRegistry.write.grantRole([ROLES.ROUTER_ROLE, router.account.address]);
  await claimRegistry.write.grantRole([ROLES.SETTLEMENT_ROLE, settlement.account.address]);

  const now = BigInt(await networkHelpers.time.latest());

  function makeAtt(overrides: Partial<Attestation> = {}): Attestation {
    return {
      claimId: toBytes32("claim-1"),
      issuer: getAddress(admin.account.address),
      beneficiary: getAddress(user.account.address),
      token: getAddress(usdt.address),
      faceValue: parseUnits("1000", 6),
      dueDate: now + 30n * 86_400n,
      claimType: CLAIM_TYPE.PAYROLL,
      externalIdHash: toBytes32("ext-1"),
      evidenceHash: toBytes32("ev-1"),
      signerEpoch: 0n,
      nonce: 0n,
      deadline: now + 3_600n,
      ...overrides,
    };
  }

  async function sign(att: Attestation, signerClient = issuerSigner): Promise<Hex> {
    return signerClient.signTypedData({
      account: signerClient.account,
      domain: claimRegistryDomain(chainId, claimRegistry.address),
      types: CLAIM_ATTESTATION_TYPES,
      primaryType: "ClaimAttestation",
      message: att,
    });
  }

  return {
    viem,
    networkHelpers,
    accounts: { admin, issuerSigner, user, router, settlement, other },
    usdt,
    issuerRegistry,
    claimRegistry,
    makeAtt,
    sign,
    now,
  };
}

describe("ClaimRegistry", () => {
  it("registers a valid attestation as ATTESTED and emits", async () => {
    const { viem, claimRegistry, makeAtt, sign } = await setup();
    const att = makeAtt();
    const sig = await sign(att);
    await viem.assertions.emitWithArgs(
      claimRegistry.write.registerClaim([att, sig]),
      claimRegistry,
      "ClaimRegistered",
      [
        att.claimId,
        att.issuer,
        att.beneficiary,
        att.claimType,
        att.token,
        att.faceValue,
        att.dueDate,
      ],
    );
    const claim = await claimRegistry.read.getClaim([att.claimId]);
    assert.equal(claim.state, CLAIM_STATE.ATTESTED);
    assert.equal(claim.financedFaceValue, 0n);
  });

  it("rejects a forged signature (wrong signer)", async () => {
    const { viem, claimRegistry, makeAtt, sign, accounts } = await setup();
    const att = makeAtt();
    const sig = await sign(att, accounts.other); // not the authorized signer
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([att, sig]),
      claimRegistry,
      "InvalidSignature",
    );
  });

  it("rejects an expired attestation", async () => {
    const { viem, claimRegistry, makeAtt, sign, now } = await setup();
    const att = makeAtt({ deadline: now - 1n });
    const sig = await sign(att);
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([att, sig]),
      claimRegistry,
      "SignatureExpired",
    );
  });

  it("rejects duplicate claimId and duplicate externalIdHash", async () => {
    const { viem, claimRegistry, makeAtt, sign } = await setup();
    const att = makeAtt();
    await claimRegistry.write.registerClaim([att, await sign(att)]);

    const dupId = makeAtt({ externalIdHash: toBytes32("ext-2"), nonce: 1n });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([dupId, await sign(dupId)]),
      claimRegistry,
      "DuplicateClaimId",
    );

    const dupExt = makeAtt({ claimId: toBytes32("claim-2"), nonce: 1n });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([dupExt, await sign(dupExt)]),
      claimRegistry,
      "DuplicateExternalId",
    );
  });

  it("rejects a replayed nonce", async () => {
    const { viem, claimRegistry, makeAtt, sign } = await setup();
    const att = makeAtt();
    await claimRegistry.write.registerClaim([att, await sign(att)]);
    const replay = makeAtt({
      claimId: toBytes32("claim-2"),
      externalIdHash: toBytes32("ext-2"),
      nonce: 0n,
    });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([replay, await sign(replay)]),
      claimRegistry,
      "InvalidAccountNonce",
    );
  });

  it("rejects zero/past/invalid fields", async () => {
    const { viem, claimRegistry, makeAtt, sign, now } = await setup();
    const zero = makeAtt({ faceValue: 0n });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([zero, await sign(zero)]),
      claimRegistry,
      "ZeroFaceValue",
    );
    const past = makeAtt({ dueDate: now });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([past, await sign(past)]),
      claimRegistry,
      "DueDateInPast",
    );
    const badType = makeAtt({ claimType: 9 });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([badType, await sign(badType)]),
      claimRegistry,
      "InvalidClaimType",
    );
  });

  it("rejects a token that is not the settlement token", async () => {
    const { viem, claimRegistry, makeAtt, sign, accounts } = await setup();
    const att = makeAtt({ token: getAddress(accounts.other.account.address) });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([att, await sign(att)]),
      claimRegistry,
      "TokenNotSettlement",
    );
  });

  it("rejects an inactive issuer", async () => {
    const { viem, claimRegistry, issuerRegistry, makeAtt, sign, accounts } = await setup();
    await issuerRegistry.write.setIssuerActive([accounts.admin.account.address, false]);
    const att = makeAtt();
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([att, await sign(att)]),
      claimRegistry,
      "IssuerInactive",
    );
  });

  it("invalidates in-flight attestations after signer rotation (epoch mismatch)", async () => {
    const { viem, claimRegistry, issuerRegistry, makeAtt, sign, accounts } = await setup();
    const att = makeAtt(); // signed at epoch 0
    const sig = await sign(att);
    await issuerRegistry.write.rotateSigner([
      accounts.admin.account.address,
      accounts.other.account.address,
    ]);
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([att, sig]),
      claimRegistry,
      "InvalidSignature",
    );
  });

  it("runs the review lifecycle: markEligible, reject, revoke", async () => {
    const { viem, claimRegistry, makeAtt, sign } = await setup();
    const att = makeAtt();
    await claimRegistry.write.registerClaim([att, await sign(att)]);
    await claimRegistry.write.markEligible([att.claimId]);
    assert.equal((await claimRegistry.read.getClaim([att.claimId])).state, CLAIM_STATE.ELIGIBLE);

    const att2 = makeAtt({ claimId: toBytes32("c2"), externalIdHash: toBytes32("e2"), nonce: 1n });
    await claimRegistry.write.registerClaim([att2, await sign(att2)]);
    await claimRegistry.write.reject([att2.claimId]);
    assert.equal((await claimRegistry.read.getClaim([att2.claimId])).state, CLAIM_STATE.REJECTED);

    const att3 = makeAtt({ claimId: toBytes32("c3"), externalIdHash: toBytes32("e3"), nonce: 2n });
    await claimRegistry.write.registerClaim([att3, await sign(att3)]);
    await claimRegistry.write.revoke([att3.claimId]);
    assert.equal((await claimRegistry.read.getClaim([att3.claimId])).state, CLAIM_STATE.REVOKED);
  });

  it("reserves slices, derives PARTIALLY_FUNDED/FUNDED, and blocks over-assignment", async () => {
    const { viem, claimRegistry, makeAtt, sign, accounts } = await setup();
    const att = makeAtt();
    await claimRegistry.write.registerClaim([att, await sign(att)]);
    await claimRegistry.write.markEligible([att.claimId]);
    const router = { account: accounts.router.account };

    await claimRegistry.write.reserveSlice([att.claimId, parseUnits("600", 6)], router);
    assert.equal(
      (await claimRegistry.read.getClaim([att.claimId])).state,
      CLAIM_STATE.PARTIALLY_FUNDED,
    );

    await viem.assertions.revertWithCustomError(
      claimRegistry.write.reserveSlice([att.claimId, parseUnits("500", 6)], router),
      claimRegistry,
      "OverAssignment",
    );

    await claimRegistry.write.reserveSlice([att.claimId, parseUnits("400", 6)], router);
    assert.equal((await claimRegistry.read.getClaim([att.claimId])).state, CLAIM_STATE.FUNDED);
  });

  it("enforces MAX_SLICES_PER_CLAIM", async () => {
    const { viem, claimRegistry, makeAtt, sign, accounts } = await setup();
    const att = makeAtt();
    await claimRegistry.write.registerClaim([att, await sign(att)]);
    await claimRegistry.write.markEligible([att.claimId]);
    const router = { account: accounts.router.account };
    for (let i = 0; i < 8; i++) {
      await claimRegistry.write.reserveSlice([att.claimId, parseUnits("100", 6)], router);
    }
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.reserveSlice([att.claimId, parseUnits("100", 6)], router),
      claimRegistry,
      "MaxSlicesExceeded",
    );
  });

  it("blocks revocation after funding and unauthorized role calls", async () => {
    const { viem, claimRegistry, makeAtt, sign, accounts } = await setup();
    const att = makeAtt();
    await claimRegistry.write.registerClaim([att, await sign(att)]);
    await claimRegistry.write.markEligible([att.claimId]);
    await claimRegistry.write.reserveSlice([att.claimId, parseUnits("100", 6)], {
      account: accounts.router.account,
    });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.revoke([att.claimId]),
      claimRegistry,
      "ClaimAlreadyFunded",
    );
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.reserveSlice([att.claimId, 1n], { account: accounts.other.account }),
      claimRegistry,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("matures then releases (settlement) preserving financedFaceValue", async () => {
    const { viem, networkHelpers, claimRegistry, makeAtt, sign, accounts } = await setup();
    const att = makeAtt();
    await claimRegistry.write.registerClaim([att, await sign(att)]);
    await claimRegistry.write.markEligible([att.claimId]);
    await claimRegistry.write.reserveSlice([att.claimId, parseUnits("1000", 6)], {
      account: accounts.router.account,
    });

    await viem.assertions.revertWithCustomError(
      claimRegistry.write.markMatured([att.claimId]),
      claimRegistry,
      "NotMatured",
    );
    await networkHelpers.time.increase(31 * 86_400);
    await claimRegistry.write.markMatured([att.claimId]);
    assert.equal((await claimRegistry.read.getClaim([att.claimId])).state, CLAIM_STATE.MATURED);

    await claimRegistry.write.releaseSlice([att.claimId], { account: accounts.settlement.account });
    const settled = await claimRegistry.read.getClaim([att.claimId]);
    assert.equal(settled.state, CLAIM_STATE.PAID);
    assert.equal(settled.financedFaceValue, parseUnits("1000", 6));
  });
});
