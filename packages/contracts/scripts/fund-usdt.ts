import { network } from "hardhat";
import { formatUnits, getAddress, parseUnits, type Address } from "viem";

import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest } from "./lib/read-manifest.js";

/// Demo helper (BSC Testnet): admin-mint MockUSDT to an address so the settle flow has the funds
/// to pay (faceValue + fee). Uses the deployer (DEFAULT_ADMIN_ROLE) — uncapped, unlike the public
/// faucet (10k/address). Run on the SEED network (exposes the issuer as the default recipient):
///   AMOUNT_USDT=50000 pnpm --filter @matura/contracts fund-usdt:bsc-testnet
/// Env: AMOUNT_USDT (default "50000"), TO (default = issuer account, ISSUER_PRIVATE_KEY).

async function main(): Promise<void> {
  const amount = parseUnits(process.env.AMOUNT_USDT ?? "50000", 6);

  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  await assertChainId(publicClient, [BSC_TESTNET_CHAIN_ID]);

  const manifest = readManifest(BSC_TESTNET_CHAIN_ID);
  if (manifest === undefined) {
    throw new Error("No chain-97 deployment manifest — deploy/seed BSC Testnet first.");
  }

  const wallets = await viem.getWalletClients();
  const deployer = wallets[0];
  const issuer = wallets[1];
  if (deployer === undefined || issuer === undefined) {
    throw new Error("Run with --network bscTestnetSeed (needs DEPLOYER + ISSUER accounts).");
  }
  const to = getAddress((process.env.TO ?? issuer.account.address) as Address);

  const usdt = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
  const before = await usdt.read.balanceOf([to]);
  const hash = await usdt.write.mint([to, amount], { account: deployer.account });
  await publicClient.waitForTransactionReceipt({ hash });
  const after = await usdt.read.balanceOf([to]);

  console.log("Minted MockUSDT (admin):");
  console.log(`  to      : ${to}`);
  console.log(`  amount  : ${formatUnits(amount, 6)} USDT`);
  console.log(`  balance : ${formatUnits(before, 6)} -> ${formatUnits(after, 6)} USDT`);
  console.log(`  tx      : ${hash}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
