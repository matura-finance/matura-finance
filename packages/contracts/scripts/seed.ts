import { network } from "hardhat";
import { getAddress, keccak256, toHex, parseUnits, zeroHash, type Address, type Hex } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest, manifestAddresses, isManifestDeployed } from "./lib/read-manifest.js";
import { isRevertNamed } from "./lib/revert.js";
import { CLAIM_ATTESTATION_TYPES, claimRegistryDomain } from "../config/eip712.js";
import { CLAIM_STATE } from "../config/constants.js";
import {
  ACTORS,
  ALICE_CLAIMS,
  ESCROW_METADATA_HASH,
  ISSUER_METADATA_HASH,
  REQUEST_A,
  REQUEST_B,
  SCRIPTED_DEPLOYER_PAYROLL,
  STREAM_METADATA_HASH,
  claimIdFor,
  externalIdFor,
  resolveBeneficiary,
  resolveClaimId,
  type ClaimSource,
} from "../config/demo.js";
import { STABLE_MANDATE, FLEX_MANDATE } from "../config/vault-mandates.js";
import { ALLOWED_CHAIN_IDS, DAY_SECONDS, ZERO_ADDRESS } from "./lib/constants.js";

const OBLIGOR_FUNDING = parseUnits("25000", 6); // payroll obligor: covers the largest claim face

/// Idempotently seed a deployed Matura chain: register the demo payroll issuer AND the two source
/// adapters (as their own issuer entities), allowlist all three on both vaults, fund the vaults +
/// payroll obligor, and register Alice's three ELIGIBLE claims — payroll via a signed attestation,
/// freelance via the escrow adapter, stream via the stream adapter (each from its own verified
/// state). Re-runs resume only what's missing. No routes are executed.
///   seed:local        -> hardhat run scripts/seed.ts --network localhost
///   seed:bsc-testnet  -> hardhat run scripts/seed.ts --network bscTestnetSeed
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const chainId = await assertChainId(publicClient, ALLOWED_CHAIN_IDS);

  const manifest = readManifest(chainId);
  if (manifest === undefined || !isManifestDeployed(manifest)) {
    throw new Error(`No complete deployment for chainId ${String(chainId)} — run deploy first.`);
  }
  for (const address of manifestAddresses(manifest)) {
    const code = await publicClient.getCode({ address });
    if (code === undefined || code === "0x") {
      throw new Error(
        `No contract code at ${address} on chainId ${String(chainId)} — node restarted? ` +
          "Run demo:reset (local) then deploy again.",
      );
    }
  }

  const wallets = await viem.getWalletClients();
  const deployer = wallets[0];
  const issuerSigner = wallets[1];
  if (deployer === undefined || issuerSigner === undefined) {
    throw new Error(
      "Expected a deployer (accounts[0]) and an issuer signer (accounts[1]). On BSC Testnet run " +
        "with --network bscTestnetSeed so the keystore ISSUER_PRIVATE_KEY is available.",
    );
  }
  const deployerAccount = deployer.account;
  const issuerEntity = getAddress(issuerSigner.account.address);
  type SeedWallet = (typeof wallets)[number];

  // Interactive-claim beneficiary. `SEED_BENEFICIARY` (an arbitrary, operator-funded wallet they'll
  // connect for the demo) overrides the default; else Alice (local index 2) / the deployer (testnet)
  // via `resolveBeneficiary`. We can only drive the RECIPIENT-GATED stream (`MockStream.createClaim`
  // is callable only by the recipient — see the stream branch below) when we HOLD the beneficiary's
  // key, i.e. only for the fallback wallet, never for an arbitrary override → `beneficiaryWallet` is
  // undefined in the override case and the stream claim is skipped.
  const fallbackWallet = wallets[ACTORS.alice] ?? deployer;
  const fallbackAddr = getAddress(fallbackWallet.account.address);
  const beneficiary = resolveBeneficiary(process.env.SEED_BENEFICIARY, fallbackAddr);
  const beneficiaryWallet: SeedWallet | undefined =
    beneficiary === fallbackAddr ? fallbackWallet : undefined;

  const usdt = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
  const issuerRegistry = await viem.getContractAt(
    "IssuerRegistry",
    manifest.addresses.issuerRegistry,
  );
  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const stableVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.stableVault);
  const flexVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.flexVault);
  const escrow = await viem.getContractAt("MockFreelanceEscrow", manifest.sources.freelance);
  const stream = await viem.getContractAt("MockStream", manifest.sources.stream);
  const escrowIssuer = getAddress(escrow.address);
  const streamIssuer = getAddress(stream.address);

  const exec = async (label: string, run: () => Promise<Hex>): Promise<void> => {
    let hash: Hex;
    try {
      hash = await run();
    } catch (error: unknown) {
      throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${label} reverted on-chain (tx ${hash}).`);
    }
    console.log(`  ${label.padEnd(30)} ${hash}`);
  };

  console.log(`Seeding chainId ${String(chainId)}…`);

  // 1. Register issuers (resume-missing): the shared payroll issuer + each source adapter as its
  //    own issuer entity (signer == entity address; only ever signs off-chain typed data — the
  //    adapters never sign, they use the role-gated registerFromSource path).
  const registerIssuer = async (
    label: string,
    entity: Address,
    signer: Address,
    metaHash: Hex,
  ): Promise<void> => {
    if (await issuerRegistry.read.isActive([entity])) {
      const issuer = await issuerRegistry.read.getIssuer([entity]);
      if (getAddress(issuer.signer) !== getAddress(signer)) {
        throw new Error(`Issuer ${entity} already registered with a different signer — conflict.`);
      }
      console.log(`  ${label.padEnd(30)} already registered (skip)`);
      return;
    }
    await exec(`registerIssuer(${label})`, () =>
      issuerRegistry.write.registerIssuer([entity, signer, metaHash], { account: deployerAccount }),
    );
  };
  await registerIssuer("payroll issuer", issuerEntity, issuerEntity, ISSUER_METADATA_HASH);
  await registerIssuer("freelance escrow issuer", escrowIssuer, escrowIssuer, ESCROW_METADATA_HASH);
  await registerIssuer("stream issuer", streamIssuer, streamIssuer, STREAM_METADATA_HASH);

  // 2. Allowlist all three issuers on both vaults (idempotent write).
  for (const [vlabel, vault] of [
    ["stable", stableVault],
    ["flex", flexVault],
  ] as const) {
    for (const [ilabel, issuer] of [
      ["payroll", issuerEntity],
      ["escrow", escrowIssuer],
      ["stream", streamIssuer],
    ] as const) {
      await exec(`setIssuerAllowed(${vlabel},${ilabel})`, () =>
        vault.write.setIssuerAllowed([issuer, true], { account: deployerAccount }),
      );
    }
  }

  // 3. Fund vaults to their liquidity cap + the payroll obligor (resume-missing). The escrow and
  //    stream adapters are self-funded per claim (fundEngagement / createStream pull from the
  //    client/funder), so they need no standing balance here.
  const fundTo = async (label: string, target: Address, want: bigint): Promise<void> => {
    const balance = await usdt.read.balanceOf([target]);
    if (balance >= want) {
      console.log(`  ${label.padEnd(30)} already funded (skip)`);
      return;
    }
    await exec(`mint ${label}`, () =>
      usdt.write.mint([target, want - balance], { account: deployerAccount }),
    );
  };
  await fundTo("stableVault", manifest.namedVaults.stableVault, STABLE_MANDATE.liquidityCap);
  await fundTo("flexVault", manifest.namedVaults.flexVault, FLEX_MANDATE.liquidityCap);
  await fundTo("payrollSource", manifest.sources.payroll, OBLIGOR_FUNDING);

  // 4. Alice's three ELIGIBLE claims (resume-missing, keyed by the resolved claimId).
  const latest = await publicClient.getBlock();
  const now = latest.timestamp;
  const signerEpoch = await issuerRegistry.read.currentEpoch([issuerEntity]);
  const sources = { freelance: manifest.sources.freelance, stream: manifest.sources.stream };

  /// Ensure a claim reaches ELIGIBLE for `beneficiary`. Returns early if it already exists
  /// (idempotent). A recipient-gated stream claim with no controllable beneficiary wallet is
  /// skipped (can't be created for an arbitrary SEED_BENEFICIARY — documented at the stream branch).
  const ensureEligible = async (
    claim: ClaimSource,
    beneficiary: Address,
    beneficiaryWallet: SeedWallet | undefined,
  ): Promise<void> => {
    if (claim.kind === "stream" && beneficiaryWallet === undefined) {
      console.log(
        `  claim ${claim.label.padEnd(22)} skipped — stream is recipient-gated and ` +
          "SEED_BENEFICIARY is not a wallet we hold a key for",
      );
      return;
    }
    const claimId = resolveClaimId(claim, sources);
    const existing = await claimRegistry.read.getClaim([claimId]).catch((error: unknown) => {
      if (isRevertNamed(error, "ClaimNotFound")) return undefined;
      throw error;
    });
    if (existing !== undefined) {
      if (existing.state === CLAIM_STATE.ELIGIBLE) {
        console.log(`  claim ${claim.label.padEnd(22)} already eligible (skip)`);
        return;
      }
      if (existing.state === CLAIM_STATE.ATTESTED) {
        await exec(`markEligible ${claim.label}`, () =>
          claimRegistry.write.markEligible([claimId], { account: deployerAccount }),
        );
        return;
      }
      throw new Error(
        `Claim ${claim.label} in unexpected state ${String(existing.state)} — refusing.`,
      );
    }
    await registerClaim(claim, now, beneficiary, beneficiaryWallet);
    await exec(`markEligible ${claim.label}`, () =>
      claimRegistry.write.markEligible([claimId], { account: deployerAccount }),
    );
  };

  /// Register a claim from its source (ATTESTED) for `beneficiary`. Dispatches on the source kind.
  const registerClaim = async (
    claim: ClaimSource,
    nowTs: bigint,
    beneficiary: Address,
    beneficiaryWallet: SeedWallet | undefined,
  ): Promise<void> => {
    switch (claim.kind) {
      case "signed": {
        // `dueInSeconds` (short, second-granularity) wins when present — the scripted proof claim
        // uses it so fund-then-settle fits one session; every other signed claim uses `dueInDays`.
        const dueOffset =
          claim.dueInSeconds !== undefined
            ? BigInt(claim.dueInSeconds)
            : BigInt(claim.dueInDays) * DAY_SECONDS;
        const attestation = {
          claimId: claimIdFor(claim.label),
          issuer: issuerEntity,
          beneficiary,
          token: getAddress(manifest.addresses.mockUsdt),
          faceValue: claim.faceValue,
          dueDate: nowTs + dueOffset,
          claimType: claim.claimType,
          externalIdHash: externalIdFor(claim.label),
          evidenceHash: keccak256(toHex(`ev:${claim.label}`)),
          signerEpoch,
          nonce: claim.attestationNonce ?? 0n, // distinct per signed claim (same issuer signer)
          deadline: nowTs + 3_600n,
        };
        const signature = await issuerSigner.signTypedData({
          account: issuerSigner.account,
          domain: claimRegistryDomain(chainId, manifest.addresses.claimRegistry),
          types: CLAIM_ATTESTATION_TYPES,
          primaryType: "ClaimAttestation",
          message: attestation,
        });
        await exec(`registerClaim ${claim.label}`, () =>
          claimRegistry.write.registerClaim([attestation, signature], { account: deployerAccount }),
        );
        return;
      }
      case "escrow": {
        // Client (deployer) funds the engagement, approves the work, then the escrow creates the
        // payout claim from its own verified state (issuer == the escrow). State-aware so a re-run
        // after a mid-sequence crash RESUMES from the right step rather than re-funding (which would
        // mint a second engagement + double-charge). EngagementState: 0 None, 1 Funded, 2 Approved.
        const releaseDate = nowTs + BigInt(claim.dueInDays) * DAY_SECONDS;
        if ((await escrow.read.getEngagement([claim.engagementId])).state === 0) {
          await fundTo(`escrow client (${claim.label})`, deployerAccount.address, claim.amount);
          await exec(`approve escrow ${claim.label}`, () =>
            usdt.write.approve([escrowIssuer, claim.amount], { account: deployerAccount }),
          );
          await exec(`fundEngagement ${claim.label}`, () =>
            escrow.write.fundEngagement([beneficiary, claim.amount, releaseDate], {
              account: deployerAccount,
            }),
          );
        }
        if ((await escrow.read.getEngagement([claim.engagementId])).state === 1) {
          await exec(`approveWork ${claim.label}`, () =>
            escrow.write.approveWork([claim.engagementId], { account: deployerAccount }),
          );
        }
        if ((await escrow.read.getEngagement([claim.engagementId])).claimId === zeroHash) {
          await exec(`createPayout ${claim.label}`, () =>
            escrow.write.createPayout([claim.engagementId], { account: deployerAccount }),
          );
        }
        return;
      }
      case "stream": {
        // Funder (deployer) deposits the stream to the beneficiary; the beneficiary assigns it to
        // the protocol; the stream freezes the claimable-at-registration as the claim face (issuer
        // == the stream). State-aware resume (mirrors the escrow branch): a fresh stream has funder
        // == 0. `ensureEligible` already skipped this branch when no beneficiary wallet is held; the
        // guard here re-narrows the type (createStream's recipient + the recipient-gated assign /
        // createClaim all need a key we control).
        if (beneficiaryWallet === undefined) {
          throw new Error(
            `Stream claim ${claim.label} requires a controllable beneficiary wallet.`,
          );
        }
        const start = nowTs - BigInt(claim.startOffsetDays) * DAY_SECONDS;
        const stop = start + BigInt(claim.durationDays) * DAY_SECONDS;
        if (
          getAddress((await stream.read.getStream([claim.streamId])).funder) ===
          getAddress(ZERO_ADDRESS)
        ) {
          await fundTo(`stream funder (${claim.label})`, deployerAccount.address, claim.deposit);
          await exec(`approve stream ${claim.label}`, () =>
            usdt.write.approve([streamIssuer, claim.deposit], { account: deployerAccount }),
          );
          await exec(`createStream ${claim.label}`, () =>
            stream.write.createStream([beneficiary, claim.deposit, start, stop], {
              account: deployerAccount,
            }),
          );
        }
        if (!(await stream.read.getStream([claim.streamId])).assigned) {
          await exec(`assignToProtocol ${claim.label}`, () =>
            stream.write.assignToProtocol([claim.streamId], { account: beneficiaryWallet.account }),
          );
        }
        // createClaim is recipient-gated (prevents front-running the frozen face) → call as the
        // beneficiary (only reachable when we hold their key).
        if ((await stream.read.getStream([claim.streamId])).claimId === zeroHash) {
          await exec(`createClaim ${claim.label}`, () =>
            stream.write.createClaim([claim.streamId], { account: beneficiaryWallet.account }),
          );
        }
        return;
      }
    }
  };

  for (const claim of ALICE_CLAIMS) {
    await ensureEligible(claim, beneficiary, beneficiaryWallet);
  }

  // Deployer-owned scripted proof claim — ALWAYS the deployer (independent of SEED_BENEFICIARY), a
  // distinct label so its id never collides with the interactive payroll claim. This is the claim
  // `demo-testnet-execute.ts` drives through the one real execute+settle.
  const deployerAddr = getAddress(deployerAccount.address);
  await ensureEligible(SCRIPTED_DEPLOYER_PAYROLL, deployerAddr, deployer);

  // 5. Report the exported A/B calibration.
  console.log("\nSeed complete. Calibration requests (for the optimizer, not executed):");
  for (const [name, req] of [
    ["A", REQUEST_A],
    ["B", REQUEST_B],
  ] as const) {
    console.log(
      `  request ${name}: targetAdvance=${req.targetAdvance.toString()} ` +
        `maxTotalFace=${req.maxTotalFace.toString()} eligible=[${req.eligibleClaims.join(", ")}]`,
    );
  }
  console.log(`  payrollIssuer=${issuerEntity}`);
  console.log(`  escrowIssuer=${escrowIssuer}  streamIssuer=${streamIssuer}`);
  console.log(
    `  interactiveBeneficiary=${beneficiary}` +
      (beneficiaryWallet === undefined
        ? " (SEED_BENEFICIARY override — stream claim skipped)"
        : " (fallback wallet — all three claims seeded)"),
  );
  console.log(`  scriptedClaimBeneficiary(deployer)=${deployerAddr}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
