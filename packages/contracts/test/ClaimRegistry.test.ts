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

interface SourceClaim {
  claimId: Hex;
  beneficiary: Address;
  token: Address;
  faceValue: bigint;
  dueDate: bigint;
  claimType: number;
  externalIdHash: Hex;
  evidenceHash: Hex;
}

async function setup() {
  const { viem, networkHelpers } = await network.create();
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  // Narrow the six wallets once (noUncheckedIndexedAccess makes array access `| undefined`);
  // the EDR dev network always provides 20, so this is a type guard, not a runtime expectation.
  // Assigning to fresh consts gives them a non-`undefined` *declared* type, so the nested `sign`
  // closure captures `WalletClient`, not `WalletClient | undefined`.
  const [w0, w1, w2, w3, w4, w5, w6] = wallets;
  if (
    w0 === undefined ||
    w1 === undefined ||
    w2 === undefined ||
    w3 === undefined ||
    w4 === undefined ||
    w5 === undefined ||
    w6 === undefined
  ) {
    throw new Error("Expected at least 7 wallet clients from the test network.");
  }
  const admin = w0;
  const issuerSigner = w1;
  const user = w2;
  const router = w3;
  const settlement = w4;
  const other = w5;
  // Stands in for an on-chain source adapter: holds SOURCE_REGISTRAR_ROLE AND is its own registered
  // issuer (signer = itself, per Decision 4), so registerFromSource's issuer == msg.sender is honoured.
  const sourceAdapter = w6;
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
  // The source adapter is its own issuer: signer = adapter address (unused on the source path, but
  // one-signer-one-issuer is satisfied since it is distinct from issuerSigner).
  await issuerRegistry.write.registerIssuer([
    sourceAdapter.account.address,
    sourceAdapter.account.address,
    toBytes32("src-meta"),
  ]);
  await claimRegistry.write.grantRole([ROLES.ROUTER_ROLE, router.account.address]);
  await claimRegistry.write.grantRole([ROLES.SETTLEMENT_ROLE, settlement.account.address]);
  await claimRegistry.write.grantRole([ROLES.SOURCE_REGISTRAR_ROLE, sourceAdapter.account.address]);

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

  /// Positional args for `registerFromSource` (no signature/nonce; issuer is intrinsically the caller).
  function makeSourceArgs(overrides: Partial<SourceClaim> = {}): SourceClaim {
    return {
      claimId: toBytes32("src-1"),
      beneficiary: getAddress(user.account.address),
      token: getAddress(usdt.address),
      faceValue: parseUnits("500", 6),
      dueDate: now + 30n * 86_400n,
      claimType: CLAIM_TYPE.FREELANCE_ESCROW,
      externalIdHash: toBytes32("src-ext-1"),
      evidenceHash: toBytes32("src-ev-1"),
      ...overrides,
    };
  }

  /// Call registerFromSource as the source adapter (default) or any account, in struct-field order.
  async function callFromSource(args: SourceClaim, account = sourceAdapter.account): Promise<Hex> {
    return claimRegistry.write.registerFromSource(
      [
        args.claimId,
        args.beneficiary,
        args.token,
        args.faceValue,
        args.dueDate,
        args.claimType,
        args.externalIdHash,
        args.evidenceHash,
      ],
      { account },
    );
  }

  return {
    viem,
    networkHelpers,
    accounts: { admin, issuerSigner, user, router, settlement, other, sourceAdapter },
    usdt,
    issuerRegistry,
    claimRegistry,
    makeAtt,
    sign,
    makeSourceArgs,
    callFromSource,
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
        att.externalIdHash,
        att.evidenceHash,
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
      "NonceAlreadyUsed",
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

  it("frees the externalIdHash for re-attestation after reject/revoke", async () => {
    const { claimRegistry, makeAtt, sign } = await setup();
    const a = makeAtt(); // externalIdHash "ext-1"
    await claimRegistry.write.registerClaim([a, await sign(a)]);
    await claimRegistry.write.reject([a.claimId]);

    // same externalIdHash, new claimId + nonce → previously blocked, now allowed
    const reattest = makeAtt({ claimId: toBytes32("claim-1b"), nonce: 1n });
    await claimRegistry.write.registerClaim([reattest, await sign(reattest)]);
    assert.equal(
      (await claimRegistry.read.getClaim([reattest.claimId])).state,
      CLAIM_STATE.ATTESTED,
    );
  });
});

describe("ClaimRegistry.registerFromSource", () => {
  it("registers from a source adapter as ATTESTED, issuer == caller, raw uint256 dueDate in event", async () => {
    const { viem, claimRegistry, makeSourceArgs, callFromSource, accounts } = await setup();
    const args = makeSourceArgs();
    await viem.assertions.emitWithArgs(callFromSource(args), claimRegistry, "ClaimRegistered", [
      args.claimId,
      getAddress(accounts.sourceAdapter.account.address), // issuer is intrinsically the caller
      args.beneficiary,
      args.claimType,
      args.token,
      args.faceValue,
      args.dueDate,
      args.externalIdHash,
      args.evidenceHash,
    ]);
    const claim = await claimRegistry.read.getClaim([args.claimId]);
    assert.equal(claim.state, CLAIM_STATE.ATTESTED);
    assert.equal(claim.financedFaceValue, 0n);
    assert.equal(claim.dueDate, args.dueDate); // stored uint64 == the raw value (fits under 2^64)
    // Provenance is unspoofable: the claim's issuer is the calling adapter, nothing it passed.
    assert.equal(claim.issuer, getAddress(accounts.sourceAdapter.account.address));
  });

  it("reverts when the caller lacks SOURCE_REGISTRAR_ROLE", async () => {
    const { viem, claimRegistry, makeSourceArgs, callFromSource, accounts } = await setup();
    await viem.assertions.revertWithCustomError(
      callFromSource(makeSourceArgs(), accounts.other.account),
      claimRegistry,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("reverts when the role holder is not a registered active issuer (IssuerInactive)", async () => {
    // Grant the role to `other` but do NOT register it as an issuer → issuer == msg.sender is inactive.
    const { viem, claimRegistry, makeSourceArgs, callFromSource, accounts } = await setup();
    await claimRegistry.write.grantRole([
      ROLES.SOURCE_REGISTRAR_ROLE,
      accounts.other.account.address,
    ]);
    await viem.assertions.revertWithCustomError(
      callFromSource(makeSourceArgs(), accounts.other.account),
      claimRegistry,
      "IssuerInactive",
    );
  });

  it("re-runs every shared invariant (dup id/externalId, zero/past/type/token)", async () => {
    const { viem, claimRegistry, makeSourceArgs, callFromSource, accounts, now } = await setup();
    await callFromSource(makeSourceArgs());

    await viem.assertions.revertWithCustomError(
      callFromSource(makeSourceArgs({ externalIdHash: toBytes32("src-ext-2") })),
      claimRegistry,
      "DuplicateClaimId",
    );
    await viem.assertions.revertWithCustomError(
      callFromSource(makeSourceArgs({ claimId: toBytes32("src-2") })),
      claimRegistry,
      "DuplicateExternalId",
    );
    await viem.assertions.revertWithCustomError(
      callFromSource(
        makeSourceArgs({
          claimId: toBytes32("src-z"),
          externalIdHash: toBytes32("z"),
          faceValue: 0n,
        }),
      ),
      claimRegistry,
      "ZeroFaceValue",
    );
    await viem.assertions.revertWithCustomError(
      callFromSource(
        makeSourceArgs({
          claimId: toBytes32("src-p"),
          externalIdHash: toBytes32("p"),
          dueDate: now,
        }),
      ),
      claimRegistry,
      "DueDateInPast",
    );
    await viem.assertions.revertWithCustomError(
      callFromSource(
        makeSourceArgs({
          claimId: toBytes32("src-t"),
          externalIdHash: toBytes32("t"),
          claimType: 9,
        }),
      ),
      claimRegistry,
      "InvalidClaimType",
    );
    await viem.assertions.revertWithCustomError(
      callFromSource(
        makeSourceArgs({
          claimId: toBytes32("src-tok"),
          externalIdHash: toBytes32("tok"),
          token: getAddress(accounts.other.account.address),
        }),
      ),
      claimRegistry,
      "TokenNotSettlement",
    );
  });

  it("short-circuits in the shared order: dup claimId wins over dup externalId", async () => {
    const { viem, claimRegistry, makeSourceArgs, callFromSource } = await setup();
    await callFromSource(makeSourceArgs()); // claimId "src-1", externalId "src-ext-1"
    // Both the claimId and externalId already exist → DuplicateClaimId is checked first.
    await viem.assertions.revertWithCustomError(
      callFromSource(makeSourceArgs()),
      claimRegistry,
      "DuplicateClaimId",
    );
  });

  it("shares the registry's global externalId uniqueness with the signed path", async () => {
    const { viem, claimRegistry, makeSourceArgs, callFromSource, makeAtt, sign } = await setup();
    const args = makeSourceArgs();
    await callFromSource(args);
    // A signed claim reusing the same externalIdHash is rejected by the shared _usedExternalId set.
    const collide = makeAtt({
      claimId: toBytes32("signed-collide"),
      externalIdHash: args.externalIdHash,
    });
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.registerClaim([collide, await sign(collide)]),
      claimRegistry,
      "DuplicateExternalId",
    );
  });

  it("cross-path equivalence: registerClaim and registerFromSource produce identical claims", async () => {
    // Layer D — drive the same logical terms down both paths (issuer = the source adapter, which is
    // also a registered signer for itself) and assert the stored structs match except id/externalId.
    const { claimRegistry, makeSourceArgs, callFromSource, makeAtt, sign, accounts } =
      await setup();
    const source = makeSourceArgs({
      claimId: toBytes32("eqv-src"),
      externalIdHash: toBytes32("eqv-src-ext"),
    });
    await callFromSource(source);

    const signed = makeAtt({
      claimId: toBytes32("eqv-signed"),
      externalIdHash: toBytes32("eqv-signed-ext"),
      issuer: getAddress(accounts.sourceAdapter.account.address),
      beneficiary: source.beneficiary,
      token: source.token,
      faceValue: source.faceValue,
      dueDate: source.dueDate,
      claimType: source.claimType,
      evidenceHash: source.evidenceHash,
    });
    // Signed by the adapter itself (its own authorized signer).
    await claimRegistry.write.registerClaim([signed, await sign(signed, accounts.sourceAdapter)]);

    const a = await claimRegistry.read.getClaim([source.claimId]);
    const b = await claimRegistry.read.getClaim([signed.claimId]);
    assert.equal(a.beneficiary, b.beneficiary);
    assert.equal(a.issuer, b.issuer);
    assert.equal(a.claimType, b.claimType);
    assert.equal(a.token, b.token);
    assert.equal(a.faceValue, b.faceValue);
    assert.equal(a.financedFaceValue, b.financedFaceValue);
    assert.equal(a.dueDate, b.dueDate);
    assert.equal(a.state, b.state);
    assert.equal(a.sliceCount, b.sliceCount);
  });

  it("negative role: a SOURCE_REGISTRAR_ROLE holder cannot cross into reserveSlice/releaseSlice", async () => {
    const { viem, claimRegistry, accounts } = await setup();
    const account = accounts.sourceAdapter.account;
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.reserveSlice([toBytes32("x"), 1n], { account }),
      claimRegistry,
      "AccessControlUnauthorizedAccount",
    );
    await viem.assertions.revertWithCustomError(
      claimRegistry.write.releaseSlice([toBytes32("x")], { account }),
      claimRegistry,
      "AccessControlUnauthorizedAccount",
    );
  });

  it("source claims run the review + settlement lifecycle (markEligible → revoke frees externalId)", async () => {
    const { claimRegistry, makeSourceArgs, callFromSource } = await setup();
    const args = makeSourceArgs();
    await callFromSource(args);
    await claimRegistry.write.markEligible([args.claimId]);
    assert.equal((await claimRegistry.read.getClaim([args.claimId])).state, CLAIM_STATE.ELIGIBLE);

    // Registry-level revoke frees the externalId (the dead-forever guard lives in the adapter, Slice 1).
    await claimRegistry.write.revoke([args.claimId]);
    assert.equal((await claimRegistry.read.getClaim([args.claimId])).state, CLAIM_STATE.REVOKED);
    await callFromSource(makeSourceArgs({ claimId: toBytes32("src-reattest") }));
  });
});
