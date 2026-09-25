import { network } from "hardhat";
import { getAddress, keccak256, toHex, parseUnits, type Address, type Hex } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest } from "./lib/read-manifest.js";
import { CLAIM_ATTESTATION_TYPES, claimRegistryDomain } from "../config/eip712.js";
import { CLAIM_STATE } from "../config/constants.js";
import {
  ACTORS,
  ALICE_CLAIMS,
  ISSUER_METADATA_HASH,
  REQUEST_A,
  REQUEST_B,
  claimIdFor,
  externalIdFor,
} from "../config/demo.js";
import { STABLE_MANDATE, FLEX_MANDATE } from "../config/vault-mandates.js";
import { ALLOWED_CHAIN_IDS, ZERO_ADDRESS, DAY_SECONDS } from "./lib/constants.js";

const OBLIGOR_FUNDING = parseUnits("25000", 6); // covers the largest claim face (+ fee headroom)

/// Idempotently seed a deployed Matura chain: register the demo issuer, allowlist it on both
/// vaults, fund the vaults + source obligors, and register Alice's three ELIGIBLE claims. Re-runs
/// resume only what's missing (probe on-chain state) and fail clearly on genuine conflicts. No
/// routes are executed — the chain is left queryable for the optimizer / `demo:settle`.
///   seed:local        -> hardhat run scripts/seed.ts --network localhost
///   seed:bsc-testnet  -> hardhat run scripts/seed.ts --network bscTestnetSeed
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const chainId = await assertChainId(publicClient, ALLOWED_CHAIN_IDS);

  const manifest = readManifest(chainId);
  if (manifest === undefined || manifest.addresses.mockUsdt === ZERO_ADDRESS) {
    throw new Error(`No deployment for chainId ${String(chainId)} — run deploy first.`);
  }
  // Fail fast if the addresses have no code (e.g. the local node was restarted after a deploy).
  for (const [name, address] of Object.entries(manifest.addresses)) {
    const code = await publicClient.getCode({ address: address as Address });
    if (code === undefined || code === "0x") {
      throw new Error(
        `No contract code at ${name} (${address}) on chainId ${String(chainId)} — node ` +
          `restarted? Run demo:reset (local) then deploy again.`,
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
  // Demo issuer identity: entity == signer address (the key only ever signs typed data off-chain).
  const issuerEntity = getAddress(issuerSigner.account.address);
  // Alice: a deterministic local account when present (index 2), else the deployer on testnet
  // (a public throwaway identity — never holds value; see docs/deployment-runbook.md).
  const aliceAddr = getAddress((wallets[ACTORS.alice] ?? deployer).account.address);

  const usdt = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
  const issuerRegistry = await viem.getContractAt(
    "IssuerRegistry",
    manifest.addresses.issuerRegistry,
  );
  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const stableVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.stableVault);
  const flexVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.flexVault);

  const exec = async (label: string, run: () => Promise<Hex>): Promise<void> => {
    let hash: Hex;
    try {
      hash = await run(); // viem estimates gas first → throws a decoded custom error on revert
    } catch (error: unknown) {
      throw new Error(`${label} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`${label} reverted on-chain (tx ${hash}).`);
    }
    console.log(`  ${label.padEnd(28)} ${hash}`);
  };

  console.log(`Seeding chainId ${String(chainId)}…`);

  // 1. Issuer registration (resume-missing).
  if (await issuerRegistry.read.isActive([issuerEntity])) {
    const issuer = await issuerRegistry.read.getIssuer([issuerEntity]);
    if (getAddress(issuer.signer) !== issuerEntity) {
      throw new Error(
        `Issuer ${issuerEntity} already registered with a different signer (${issuer.signer}). ` +
          "Conflict — refusing to proceed.",
      );
    }
    console.log("  issuer already registered (skip)");
  } else {
    await exec("registerIssuer", () =>
      issuerRegistry.write.registerIssuer([issuerEntity, issuerEntity, ISSUER_METADATA_HASH], {
        account: deployerAccount,
      }),
    );
  }

  // 2. Allowlist the issuer on both vaults (idempotent write).
  await exec("setIssuerAllowed(stable)", () =>
    stableVault.write.setIssuerAllowed([issuerEntity, true], { account: deployerAccount }),
  );
  await exec("setIssuerAllowed(flex)", () =>
    flexVault.write.setIssuerAllowed([issuerEntity, true], { account: deployerAccount }),
  );

  // 3. Fund vaults to their liquidity cap + obligors to cover settlement (resume-missing).
  const fundTo = async (label: string, target: Address, want: bigint): Promise<void> => {
    const balance = await usdt.read.balanceOf([target]);
    if (balance >= want) {
      console.log(`  ${label.padEnd(28)} already funded (skip)`);
      return;
    }
    await exec(`mint ${label}`, () =>
      usdt.write.mint([target, want - balance], { account: deployerAccount }),
    );
  };
  await fundTo("stableVault", manifest.namedVaults.stableVault, STABLE_MANDATE.liquidityCap);
  await fundTo("flexVault", manifest.namedVaults.flexVault, FLEX_MANDATE.liquidityCap);
  await fundTo("payrollSource", manifest.sources.payroll, OBLIGOR_FUNDING);
  await fundTo("freelanceSource", manifest.sources.freelance, OBLIGOR_FUNDING);
  await fundTo("streamSource", manifest.sources.stream, OBLIGOR_FUNDING);

  // 4. Alice's three ELIGIBLE claims (resume-missing, keyed by deterministic claimId).
  const latest = await publicClient.getBlock();
  const now = latest.timestamp;
  const signerEpoch = await issuerRegistry.read.currentEpoch([issuerEntity]);

  for (const [index, claim] of ALICE_CLAIMS.entries()) {
    const claimId = claimIdFor(claim.label);
    // getClaim reverts ClaimNotFound for an unregistered claim → treat a throw as "absent".
    const existing = await claimRegistry.read
      .getClaim([claimId])
      .then((c) => c)
      .catch(() => undefined);
    if (existing !== undefined) {
      // Conflict-equality excludes dueDate (it is recomputed from `now` each run).
      const mismatch =
        getAddress(existing.beneficiary) !== aliceAddr ||
        existing.claimType !== claim.claimType ||
        existing.faceValue !== claim.faceValue;
      if (mismatch) {
        throw new Error(`Claim ${claim.label} exists with different parameters — conflict.`);
      }
      if (existing.state === CLAIM_STATE.ELIGIBLE) {
        console.log(`  claim ${claim.label.padEnd(20)} already eligible (skip)`);
        continue;
      }
      if (existing.state === CLAIM_STATE.ATTESTED) {
        await exec(`markEligible ${claim.label}`, () =>
          claimRegistry.write.markEligible([claimId], { account: deployerAccount }),
        );
        continue;
      }
      throw new Error(
        `Claim ${claim.label} is in unexpected state ${String(existing.state)} — refusing.`,
      );
    }

    const attestation = {
      claimId,
      issuer: issuerEntity,
      beneficiary: aliceAddr,
      token: getAddress(manifest.addresses.mockUsdt),
      faceValue: claim.faceValue,
      dueDate: now + BigInt(claim.dueInDays) * DAY_SECONDS,
      claimType: claim.claimType,
      externalIdHash: externalIdFor(claim.label),
      evidenceHash: keccak256(toHex(`ev:${claim.label}`)),
      signerEpoch,
      nonce: BigInt(index),
      deadline: now + 3_600n,
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
    await exec(`markEligible ${claim.label}`, () =>
      claimRegistry.write.markEligible([claimId], { account: deployerAccount }),
    );
  }

  // 5. Report the exported A/B calibration (documented fixtures for the future optimizer).
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
  console.log(`  issuer=${issuerEntity}  beneficiary(alice)=${aliceAddr}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
