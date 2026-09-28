import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { network } from "hardhat";
import { getAddress } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { assertWiring } from "./lib/assert-wiring.js";
import { readManifest, manifestAddresses, isManifestDeployed } from "./lib/read-manifest.js";
import { compareMandate } from "./lib/assert-mandate.js";
import { createChecklist } from "./lib/checklist.js";
import { STABLE_MANDATE, FLEX_MANDATE } from "../config/vault-mandates.js";
import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";

/// POST-DEPLOY health check for the chain-97 deployment — read-only, sends no transaction. Confirms
/// the committed manifest describes a coherent, correctly-wired, funded LIVE deployment. The on-chain
/// reconciliation (section 5) reads every core dependency back out of the router's immutable getters,
/// so it catches a stale MIX of old + new addresses after a partial redeploy — but NOT a wholesale-
/// stale-yet-self-consistent manifest (an entire OLDER deployment still live on-chain would satisfy
/// every getter check, since contracts are never deleted). Section 6 adds a best-effort freshness
/// anchor against Ignition's `deployed_addresses.json` to catch exactly that case. Exits non-zero with
/// a human-readable report on any mismatch.
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

  // `check` is a hard pass/fail; `warn` is a non-fatal note for a condition expected to vary with
  // seed state (not a deployment-integrity violation — e.g. a recipient-gated source left unfunded).
  const { check, warn, failures } = createChecklist();

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

  // 3. Vault mandates match the typed config exactly (deployed config == tested config). The
  //    field-by-field comparison lives in `lib/assert-mandate.ts`, shared with `verify.ts`.
  check(
    "stableVault mandate matches config",
    compareMandate(await stableVault.read.getMandate(), STABLE_MANDATE),
  );
  check(
    "flexVault mandate matches config",
    compareMandate(await flexVault.read.getMandate(), FLEX_MANDATE),
  );

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
    const funded = (await usdtContract.read.balanceOf([source])) > 0n;
    if (name === "payroll") {
      // The payroll obligor is funded UNCONDITIONALLY by seed (seed.ts) and the scripted settle draws
      // its payout from it, so an unfunded payroll obligor means settle will revert — a hard failure,
      // not a seed-state variation. (freelance/stream are legitimately skippable / recipient-gated.)
      check("payrollSource funded (seed funds it unconditionally; settle draws from it)", funded);
    } else if (funded) {
      check(`${name}Source funded`, true);
    } else {
      warn(
        `${name}Source not funded — expected when its claim path wasn't seeded ` +
          `(e.g. the recipient-gated stream is skipped under a SEED_BENEFICIARY override)`,
      );
    }
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

  // 6. Freshness anchor (best-effort). Section 5 only proves the manifest is internally CONSISTENT
  //    with itself on-chain — a wholesale-stale-yet-coherent manifest (an older deployment still live)
  //    passes it all. Ignition records the addresses it last wrote to `deployed_addresses.json`; when
  //    that file is present, cross-check the manifest's core slots against it (a mismatch means the
  //    committed manifest doesn't describe the last deploy). When absent (fresh clone / journal not
  //    kept), warn that freshness couldn't be verified rather than fail.
  const deploymentId = chainId === BSC_TESTNET_CHAIN_ID ? "matura-bsctestnet" : "matura-local";
  const deployedAddressesPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "ignition",
    "deployments",
    deploymentId,
    "deployed_addresses.json",
  );
  if (existsSync(deployedAddressesPath)) {
    const parsed: unknown = JSON.parse(readFileSync(deployedAddressesPath, "utf8"));
    const recorded = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<
      string,
      unknown
    >;
    const anchors: readonly [label: string, ignitionKey: string, manifestAddr: string][] = [
      ["MockUSDT", "MaturaProtocol#MockUSDT", manifest.addresses.mockUsdt],
      ["IssuerRegistry", "MaturaProtocol#IssuerRegistry", manifest.addresses.issuerRegistry],
      ["ClaimRegistry", "MaturaProtocol#ClaimRegistry", manifest.addresses.claimRegistry],
      ["VaultRegistry", "MaturaProtocol#VaultRegistry", manifest.addresses.vaultRegistry],
      ["MaturaRouter", "MaturaProtocol#MaturaRouter", manifest.addresses.router],
      [
        "SettlementManager",
        "MaturaProtocol#SettlementManager",
        manifest.addresses.settlementManager,
      ],
    ];
    for (const [label, ignitionKey, manifestAddr] of anchors) {
      const ignitionAddr = recorded[ignitionKey];
      if (typeof ignitionAddr !== "string") {
        check(`Ignition deployed_addresses records ${ignitionKey}`, false);
        continue;
      }
      check(
        `manifest ${label} == Ignition deployed_addresses (freshness)`,
        getAddress(ignitionAddr) === getAddress(manifestAddr),
      );
    }
  } else {
    warn(
      `manifest freshness NOT verified — Ignition deployed_addresses.json absent at ` +
        `${deployedAddressesPath} (fresh clone / journal not kept). Section 5 still guards a stale mix.`,
    );
  }

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
