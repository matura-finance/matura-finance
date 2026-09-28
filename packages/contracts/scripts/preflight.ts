import { network } from "hardhat";
import { formatEther, getAddress } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { meetsMinBalance, MIN_DEPLOYER_BALANCE_WEI } from "./lib/preflight.js";
import { readManifest, isManifestDeployed } from "./lib/read-manifest.js";
import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";
import { USDT_DECIMALS } from "../config/constants.js";

/// BSC-Testnet PRE-FLIGHT — read-only, sends no transaction. Refuses any chain but 97, proves the
/// required config vars resolve (WITHOUT ever printing their values), reports the deployer + issuer
/// addresses and the deployer's tBNB balance against a minimum, and documents/asserts the MockUSDT
/// assumptions the protocol relies on. Exits non-zero on any failure so it can gate the runbook.
///
/// Run on the SEED network so BOTH keys resolve (deployer = accounts[0], issuer = accounts[1]) — the
/// only script besides seed that touches ISSUER_PRIVATE_KEY, and only to DERIVE its public address:
///   preflight:bsc-testnet -> hardhat run scripts/preflight.ts --network bscTestnetSeed
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();

  // Reaching past this line proves BSC_TESTNET_RPC_URL resolved AND points at chain 97 (assertChainId
  // hard-refuses 56 and anything not in the allowed set). We keep 97 as the sole allowed chain.
  const chainId = await assertChainId(publicClient, [BSC_TESTNET_CHAIN_ID]);

  const failures: string[] = [];
  const check = (label: string, ok: boolean): void => {
    if (!ok) failures.push(label);
    console.log(`  [${ok ? "ok" : "FAIL"}] ${label}`);
  };

  console.log(`Pre-flight for chainId ${String(chainId)} (BSC Testnet)…\n`);
  console.log("Config variables (presence only — values are NEVER printed):");

  // BSC_TESTNET_RPC_URL: proven present + reachable by the successful getChainId() above.
  check("BSC_TESTNET_RPC_URL present and reachable", true);

  // DEPLOYER_PRIVATE_KEY / ISSUER_PRIVATE_KEY: present iff the keystore resolved both accounts into
  // wallet clients. We only ever read their PUBLIC addresses; the private keys never leave hardhat.
  const wallets = await viem.getWalletClients();
  const deployer = wallets[0];
  const issuerSigner = wallets[1];
  check("DEPLOYER_PRIVATE_KEY present (accounts[0] resolved)", deployer !== undefined);
  check("ISSUER_PRIVATE_KEY present (accounts[1] resolved)", issuerSigner !== undefined);
  if (deployer === undefined || issuerSigner === undefined) {
    throw new Error(
      "Missing deployer and/or issuer key. Run on --network bscTestnetSeed with " +
        "DEPLOYER_PRIVATE_KEY + ISSUER_PRIVATE_KEY set in the hardhat keystore.\n" +
        `Pre-flight FAILED (${String(failures.length)}):\n - ${failures.join("\n - ")}`,
    );
  }

  const deployerAddr = getAddress(deployer.account.address);
  const issuerAddr = getAddress(issuerSigner.account.address);
  console.log("\nDerived addresses (public — safe to print):");
  console.log(`  deployer  ${deployerAddr}`);
  console.log(`  issuer    ${issuerAddr}`);

  // Deployer gas balance vs the operational minimum.
  const balanceWei = await publicClient.getBalance({ address: deployerAddr });
  const enough = meetsMinBalance(balanceWei, MIN_DEPLOYER_BALANCE_WEI);
  console.log(
    `\nDeployer balance: ${formatEther(balanceWei)} tBNB ` +
      `(minimum ${formatEther(MIN_DEPLOYER_BALANCE_WEI)} tBNB)`,
  );
  check(
    `deployer balance >= ${formatEther(MIN_DEPLOYER_BALANCE_WEI)} tBNB (fund via faucet if below)`,
    enough,
  );

  // MockUSDT assumptions the protocol + pricing depend on. MockUSDT is a standard OpenZeppelin ERC20
  // with a fixed 6-dp `decimals()`, no transfer fee, and no rebasing/elastic supply — so faceValue
  // base units, vault mandates, and settlement surcharge math are all exact. If a full deployment is
  // already recorded we READ `decimals()` back on-chain; pre-deploy we assert the in-package constant.
  const manifest = readManifest(chainId);
  if (manifest !== undefined && isManifestDeployed(manifest)) {
    const usdt = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
    const onChainDecimals = await usdt.read.decimals();
    check(
      `MockUSDT.decimals() == ${String(USDT_DECIMALS)} on-chain (non-fee, non-rebasing ERC20)`,
      onChainDecimals === USDT_DECIMALS,
    );
  } else {
    check(
      `MockUSDT assumption: ${String(USDT_DECIMALS)}-dp, non-fee, non-rebasing (asserted post-deploy)`,
      USDT_DECIMALS === 6,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Pre-flight FAILED (${String(failures.length)}):\n - ${failures.join("\n - ")}`,
    );
  }
  console.log("\nAll pre-flight checks passed — safe to proceed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
