import { randomBytes } from "node:crypto";

import { network } from "hardhat";
import { getAddress, keccak256, parseUnits, toHex, type Address, type Hex } from "viem";

import { CLAIM_ATTESTATION_TYPES, claimRegistryDomain } from "../config/eip712.js";
import { CLAIM_TYPE } from "../config/constants.js";
import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest } from "./lib/read-manifest.js";

/// Demo helper (BSC Testnet): register ONE signed PAYROLL claim with a SHORT due date, so the
/// settle flow can be exercised without the UI's whole-day-≥1 floor. The issuer (accounts[1] =
/// ISSUER_PRIVATE_KEY, the active registered issuer) signs the attestation; it is submitted
/// permissionlessly. externalIdHash is unique per claim so it never hits DuplicateExternalId.
///
/// Run on the SEED network (exposes the issuer key), same env as seed:bsc-testnet:
///   DUE_SECONDS=600 FACE_USDT=20000 pnpm --filter @matura/contracts register-claim:bsc-testnet
/// Env: DUE_SECONDS (default 600 = 10 min), FACE_USDT (default "20000"), BENEFICIARY (default = issuer).
/// Prints the claimId — feed it to mark-eligible → Get Liquidity → mark-matured → Settle.

async function main(): Promise<void> {
  const dueSeconds = BigInt(process.env.DUE_SECONDS ?? "600");
  if (dueSeconds <= 0n) throw new Error("DUE_SECONDS must be a positive integer.");
  const faceUsdt = process.env.FACE_USDT ?? "20000";

  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  await assertChainId(publicClient, [BSC_TESTNET_CHAIN_ID]);

  const manifest = readManifest(BSC_TESTNET_CHAIN_ID);
  if (manifest === undefined) {
    throw new Error("No chain-97 deployment manifest — deploy/seed BSC Testnet first.");
  }

  const wallets = await viem.getWalletClients();
  const submitter = wallets[0];
  const issuerSigner = wallets[1];
  if (submitter === undefined || issuerSigner === undefined) {
    throw new Error("Run with --network bscTestnetSeed (needs DEPLOYER + ISSUER accounts).");
  }
  const issuerEntity = getAddress(issuerSigner.account.address);
  const beneficiary = getAddress((process.env.BENEFICIARY ?? issuerEntity) as Address);

  const issuerRegistry = await viem.getContractAt(
    "IssuerRegistry",
    manifest.addresses.issuerRegistry,
  );
  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const signerEpoch = await issuerRegistry.read.currentEpoch([issuerEntity]);

  const claimId = toHex(randomBytes(32));
  const now = (await publicClient.getBlock()).timestamp;
  const attestation = {
    claimId,
    issuer: issuerEntity,
    beneficiary,
    token: getAddress(manifest.addresses.mockUsdt),
    faceValue: parseUnits(faceUsdt, 6),
    dueDate: now + dueSeconds,
    claimType: CLAIM_TYPE.PAYROLL,
    externalIdHash: claimId, // unique → never collides on _usedExternalId
    evidenceHash: keccak256(toHex(`ev:${claimId}`)),
    signerEpoch,
    nonce: BigInt(`0x${randomBytes(8).toString("hex")}`),
    deadline: now + 3_600n,
  };

  const signature = await issuerSigner.signTypedData({
    account: issuerSigner.account,
    domain: claimRegistryDomain(BSC_TESTNET_CHAIN_ID, manifest.addresses.claimRegistry),
    types: CLAIM_ATTESTATION_TYPES,
    primaryType: "ClaimAttestation",
    message: attestation,
  });

  const hash = await claimRegistry.write.registerClaim([attestation, signature], {
    account: submitter.account,
  });
  await publicClient.waitForTransactionReceipt({ hash });

  console.log("Registered claim (ATTESTED):");
  console.log(`  claimId    : ${claimId}`);
  console.log(`  issuer     : ${issuerEntity}`);
  console.log(`  beneficiary: ${beneficiary}`);
  console.log(`  faceValue  : ${attestation.faceValue.toString()} (base units, ${faceUsdt} USDT)`);
  console.log(`  dueDate    : ${new Date(Number(attestation.dueDate) * 1000).toISOString()}`);
  console.log(`  tx         : ${hash}`);
  console.log(
    `\nNext: mark-eligible → Get Liquidity (connect ${beneficiary}) → mark-matured → Settle.`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
