import { network } from "hardhat";
import { getAddress } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest } from "./lib/read-manifest.js";
import { EXECUTION_ROUTE_TYPES, routerDomain } from "../config/eip712.js";
import { CLAIM_STATE } from "../config/constants.js";
import { ACTORS, ALICE_PAYROLL, claimIdFor } from "../config/demo.js";
import { LOCAL_CHAIN_ID, DAY_SECONDS } from "./lib/constants.js";

/// LOCAL-ONLY demo: drive one seeded claim end-to-end through the obligor self-settlement path —
/// route (fund) Alice's payroll claim on the Stable vault, warp past its dueDate, then have the
/// payroll obligor `settle` it to PAID. Requires EDR time-travel, so it refuses any non-local
/// chain. One-shot after a fresh seed (routing consumes the ELIGIBLE claim).
///   demo:settle -> hardhat run scripts/demo-settle.ts --network localhost
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem, networkHelpers } = connection;
  const publicClient = await viem.getPublicClient();
  await assertChainId(publicClient, [LOCAL_CHAIN_ID]); // local only (needs time-warp)

  const manifest = readManifest(LOCAL_CHAIN_ID);
  if (manifest === undefined) {
    throw new Error("No local deployment — run `pnpm demo:local` first.");
  }

  const wallets = await viem.getWalletClients();
  const deployer = wallets[0];
  const alice = wallets[ACTORS.alice];
  if (deployer === undefined || alice === undefined) {
    throw new Error("Expected local Hardhat accounts (deployer + alice).");
  }

  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const router = await viem.getContractAt("MaturaRouter", manifest.addresses.router);
  const usdt = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
  const payrollObligor = await viem.getContractAt("SourceObligor", manifest.sources.payroll);

  const payroll = ALICE_PAYROLL; // alice-payroll (the signed claim)
  const claimId = claimIdFor(payroll.label);
  const claim = await claimRegistry.read.getClaim([claimId]);
  if (claim.state !== CLAIM_STATE.ELIGIBLE) {
    console.log(
      `Payroll claim is in state ${String(claim.state)} (not ELIGIBLE) — already demoed? ` +
        "Run `pnpm demo:reset` then `pnpm demo:local` for a fresh run.",
    );
    return;
  }

  // 1. Route (fully fund) the payroll claim on the Stable vault. Alice signs; anyone submits.
  const now = (await publicClient.getBlock()).timestamp;
  const route = {
    user: getAddress(alice.account.address),
    targetAdvance: 1n,
    maxTotalFace: payroll.faceValue,
    deadline: now + 3_600n,
    nonce: 0n,
    legs: [
      {
        claimId,
        vault: getAddress(manifest.namedVaults.stableVault),
        faceAmount: payroll.faceValue,
        minimumAdvanceAmount: 0n,
      },
    ],
  };
  const signature = await alice.signTypedData({
    account: alice.account,
    domain: routerDomain(LOCAL_CHAIN_ID, manifest.addresses.router),
    types: EXECUTION_ROUTE_TYPES,
    primaryType: "ExecutionRoute",
    message: route,
  });
  const aliceBefore = await usdt.read.balanceOf([route.user]);
  const routeHash = await router.write.executeRoute([route, signature], {
    account: alice.account,
  });
  await publicClient.waitForTransactionReceipt({ hash: routeHash });
  const funded = await claimRegistry.read.getClaim([claimId]);
  console.log(`Routed payroll claim -> state ${String(funded.state)} (FUNDED). tx ${routeHash}`);

  // 2. Warp past the dueDate so the claim can mature.
  // dueInDays is small (≤60), so this bigint→Number conversion is safe well within MAX_SAFE_INTEGER.
  await networkHelpers.time.increase(Number(BigInt(payroll.dueInDays) * DAY_SECONDS) + 60);

  // 3. Obligor self-settles (permissionless): markMatured + settleClaim.
  const obligorBefore = await usdt.read.balanceOf([manifest.sources.payroll]);
  const settleHash = await payrollObligor.write.settle([claimId], { account: deployer.account });
  await publicClient.waitForTransactionReceipt({ hash: settleHash });

  const settled = await claimRegistry.read.getClaim([claimId]);
  const obligorAfter = await usdt.read.balanceOf([manifest.sources.payroll]);
  const aliceAfter = await usdt.read.balanceOf([route.user]);
  if (settled.state !== CLAIM_STATE.PAID) {
    throw new Error(`Expected PAID after settle, got state ${String(settled.state)}.`);
  }
  console.log(`Obligor settled claim -> state PAID. tx ${settleHash}`);
  console.log(`  obligor paid:      ${(obligorBefore - obligorAfter).toString()} (base units)`);
  console.log(`  alice advance:     ${(aliceAfter - aliceBefore).toString()} (base units)`);
  console.log("\ndemo:settle complete — end-to-end self-settlement succeeded.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
