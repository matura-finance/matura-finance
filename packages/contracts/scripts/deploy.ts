import { execFileSync } from "node:child_process";
import { network } from "hardhat";
import MaturaProtocol from "../ignition/modules/MaturaProtocol.js";
import { assertChainId } from "./lib/network-guard.js";
import { assertWiring } from "./lib/assert-wiring.js";
import { computeAbiBuildId } from "./lib/abi-build-id.js";
import { writeJsonAtomic } from "./lib/atomic-write.js";
import { readManifest, manifestPath } from "./lib/read-manifest.js";
import type { DeploymentManifestData } from "./lib/manifest-types.js";
import { ALLOWED_CHAIN_IDS, BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";

/// Deploy (or idempotently re-apply) the Matura protocol via Ignition, assert the wiring, and
/// write the validated deployment manifest. Run:
///   deploy:local        -> hardhat run scripts/deploy.ts --network localhost
///   deploy:bsc-testnet  -> hardhat run scripts/deploy.ts --network bscTestnet
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem, ignition } = connection;
  const publicClient = await viem.getPublicClient();

  const chainId = await assertChainId(publicClient, ALLOWED_CHAIN_IDS);
  const deploymentId = chainId === BSC_TESTNET_CHAIN_ID ? "matura-bsctestnet" : "matura-local";
  console.log(
    `Deploying MaturaProtocol to chainId ${String(chainId)} (deploymentId ${deploymentId})…`,
  );

  // Snapshot the block BEFORE deploying: the correct `fromBlock` lower bound for scanning
  // deploy-time events (constructors + role grants), which land in the blocks that follow.
  const preDeployBlock = await publicClient.getBlockNumber();

  const d = await ignition.deploy(MaturaProtocol, { deploymentId });

  const addresses = {
    mockUsdt: d.usdt.address,
    issuerRegistry: d.issuerRegistry.address,
    claimRegistry: d.claimRegistry.address,
    vaultRegistry: d.vaultRegistry.address,
    router: d.router.address,
    settlementManager: d.settlement.address,
  } as const;
  const namedVaults = {
    stableVault: d.stableVault.address,
    flexVault: d.flexVault.address,
  } as const;
  const sources = {
    payroll: d.payrollSource.address,
    freelance: d.freelanceSource.address,
    stream: d.streamSource.address,
  } as const;

  // Assert wiring on-chain before recording anything.
  await assertWiring(viem, {
    claimRegistry: addresses.claimRegistry,
    settlementManager: addresses.settlementManager,
    router: addresses.router,
    vaultRegistry: addresses.vaultRegistry,
    stableVault: namedVaults.stableVault,
    flexVault: namedVaults.flexVault,
    sources: [sources.payroll, sources.freelance, sources.stream],
  });
  console.log("Wiring assertions passed.");

  // Deployment block: preserve a prior non-zero value across idempotent re-runs; else snapshot now.
  const prior = readManifest(chainId);
  const deploymentBlock =
    prior !== undefined && prior.deploymentBlock !== "0"
      ? prior.deploymentBlock
      : preDeployBlock.toString();

  const manifest: DeploymentManifestData = {
    chainId,
    deploymentBlock,
    abiBuildId: computeAbiBuildId(),
    addresses,
    namedVaults,
    sources,
  };

  writeJsonAtomic(manifestPath(chainId), manifest);
  console.log(`Wrote manifest ${manifestPath(chainId)}`);

  // Regenerate the typed loader consumed by @matura/chain (contracts -> chain via fs, like ABIs).
  execFileSync("pnpm", ["--filter", "@matura/chain", "gen:deployments"], { stdio: "inherit" });

  console.log("\nDeployment complete:");
  for (const [k, v] of Object.entries({ ...addresses, ...namedVaults, ...sources })) {
    console.log(`  ${k.padEnd(16)} ${v}`);
  }
  console.log(`  deploymentBlock  ${deploymentBlock}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
