import { network } from "hardhat";
import { getAddress } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { assertWiring } from "./lib/assert-wiring.js";
import { readManifest, manifestAddresses, isManifestDeployed } from "./lib/read-manifest.js";
import { STABLE_MANDATE, FLEX_MANDATE, type VaultMandate } from "../config/vault-mandates.js";
import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";

/// POST-DEPLOY health check for the chain-97 deployment — read-only, sends no transaction. Confirms
/// the committed manifest describes a coherent, correctly-wired, funded LIVE deployment and, crucially,
/// that the manifest addresses still match on-chain reality (guards the stale-manifest hazard: after a
/// redeploy the Ignition journal may mint NEW addresses while an old manifest lingers). Exits non-zero
/// with a human-readable report on any mismatch.
///   check-deployment:bsc-testnet -> hardhat run scripts/check-deployment.ts --network bscTestnet
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const chainId = await assertChainId(publicClient, [BSC_TESTNET_CHAIN_ID]);

  const manifest = readManifest(chainId);
  if (manifest === undefined || !isManifestDeployed(manifest)) {
    throw new Error(`No complete deployment for chainId ${String(chainId)} — run deploy first.`);
  }

  const failures: string[] = [];
  const check = (label: string, ok: boolean): void => {
    if (!ok) failures.push(label);
    console.log(`  [${ok ? "ok" : "FAIL"}] ${label}`);
  };

  console.log(`Checking deployment on chainId ${String(chainId)}…`);

  // 0. Manifest self-consistency: the file must be keyed to 97 (readManifest already refuses a
  //    mis-keyed file, but assert it explicitly here as the acceptance criterion demands).
  check("manifest.chainId === 97", manifest.chainId === BSC_TESTNET_CHAIN_ID);

  // 1. Bytecode present at every manifest address (core + vaults + sources) — a live deployment.
  for (const address of manifestAddresses(manifest)) {
    const code = await publicClient.getCode({ address });
    check(`bytecode present at ${address}`, code !== undefined && code !== "0x");
  }

  // 2. Role wiring + reserve/release separation (the same invariants deploy/verify assert).
  try {
    await assertWiring(viem, {
      claimRegistry: manifest.addresses.claimRegistry,
      settlementManager: manifest.addresses.settlementManager,
      router: manifest.addresses.router,
      vaultRegistry: manifest.addresses.vaultRegistry,
      stableVault: manifest.namedVaults.stableVault,
      flexVault: manifest.namedVaults.flexVault,
      sources: [manifest.sources.payroll, manifest.sources.freelance, manifest.sources.stream],
      sourceRegistrars: [manifest.sources.freelance, manifest.sources.stream],
    });
    check("role wiring (grants + registrations + reserve/release separation)", true);
  } catch (error: unknown) {
    check(`role wiring: ${error instanceof Error ? error.message : String(error)}`, false);
  }

  const usdt = getAddress(manifest.addresses.mockUsdt);
  const usdtContract = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
  const claimRegistry = getAddress(manifest.addresses.claimRegistry);
  const vaultRegistryAddr = getAddress(manifest.addresses.vaultRegistry);
  const issuerRegistryAddr = getAddress(manifest.addresses.issuerRegistry);
  const settlementManager = getAddress(manifest.addresses.settlementManager);
  const stableVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.stableVault);
  const flexVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.flexVault);

  // 3. Vault mandates match the typed config exactly (deployed config == tested config).
  type MandateView = Awaited<ReturnType<typeof stableVault.read.getMandate>>;
  const compareMandate = (name: string, onChain: MandateView, want: VaultMandate): void => {
    check(
      `${name} mandate matches config`,
      onChain.supportedTypesBitmap === want.supportedTypesBitmap &&
        onChain.baseDiscountBps === want.baseDiscountBps &&
        onChain.durationBpsPerDay === want.durationBpsPerDay &&
        onChain.maxDurationDays === want.maxDurationDays &&
        onChain.minFace === want.minFace &&
        onChain.maxFace === want.maxFace &&
        onChain.liquidityCap === want.liquidityCap &&
        onChain.claimTypePremiumBps.length === want.claimTypePremiumBps.length &&
        want.claimTypePremiumBps.every((v, i) => onChain.claimTypePremiumBps[i] === v),
    );
  };
  compareMandate("stableVault", await stableVault.read.getMandate(), STABLE_MANDATE);
  compareMandate("flexVault", await flexVault.read.getMandate(), FLEX_MANDATE);

  // 4. Balances: each vault holds at least its liquidity cap; each source obligor is funded.
  check(
    "stableVault balance >= liquidityCap",
    (await usdtContract.read.balanceOf([manifest.namedVaults.stableVault])) >=
      STABLE_MANDATE.liquidityCap,
  );
  check(
    "flexVault balance >= liquidityCap",
    (await usdtContract.read.balanceOf([manifest.namedVaults.flexVault])) >=
      FLEX_MANDATE.liquidityCap,
  );
  for (const [name, source] of Object.entries(manifest.sources)) {
    check(`${name}Source funded`, (await usdtContract.read.balanceOf([source])) > 0n);
  }

  // 5. Manifest addresses == on-chain reality. The router pins all six core dependencies as immutable
  //    getters; reading them back and matching the manifest proves the manifest is not a stale mix of
  //    old + new addresses after a redeploy. Vault + payroll-obligor token/deps wiring ties the rest.
  const router = await viem.getContractAt("MaturaRouter", manifest.addresses.router);
  const payrollObligor = await viem.getContractAt("SourceObligor", manifest.sources.payroll);
  const eq = (label: string, actual: string, want: string): void =>
    check(label, getAddress(actual) === want);

  eq("router.claimRegistry() == manifest", await router.read.claimRegistry(), claimRegistry);
  eq("router.vaultRegistry() == manifest", await router.read.vaultRegistry(), vaultRegistryAddr);
  eq("router.issuerRegistry() == manifest", await router.read.issuerRegistry(), issuerRegistryAddr);
  eq(
    "router.settlementManager() == manifest",
    await router.read.settlementManager(),
    settlementManager,
  );
  eq("router.settlementToken() == manifest.mockUsdt", await router.read.settlementToken(), usdt);
  eq("stableVault.token() == manifest.mockUsdt", await stableVault.read.token(), usdt);
  eq("flexVault.token() == manifest.mockUsdt", await flexVault.read.token(), usdt);
  eq("payrollSource.token() == manifest.mockUsdt", await payrollObligor.read.token(), usdt);
  eq(
    "payrollSource.settlementManager() == manifest",
    await payrollObligor.read.settlementManager(),
    settlementManager,
  );
  eq(
    "payrollSource.claimRegistry() == manifest",
    await payrollObligor.read.claimRegistry(),
    claimRegistry,
  );

  if (failures.length > 0) {
    throw new Error(
      `Deployment check FAILED (${String(failures.length)}):\n - ${failures.join("\n - ")}`,
    );
  }
  console.log("\nAll deployment checks passed — manifest matches a coherent live deployment.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
