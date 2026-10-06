import { network } from "hardhat";

import { CLAIM_STATE } from "../config/constants.js";
import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest } from "./lib/read-manifest.js";

/// Demo helper (BSC Testnet): advance ONE claim through the state transitions the product UI does
/// not expose, so the Issuer Demo settle flow can be exercised end-to-end.
///   ACTION=eligible — ATTESTED -> ELIGIBLE (CLAIM_REVIEWER_ROLE; the deployer account). Do this
///                     right after creating a claim so it can be financed via Get Liquidity.
///   ACTION=matured  — PARTIALLY_FUNDED/FUNDED -> MATURED (permissionless, requires the due date to
///                     have passed). Do this after financing + the claim's due date, before settle.
///
/// Run (needs the same env the testnet deploy/seed use — BSC_TESTNET_RPC_URL + DEPLOYER_PRIVATE_KEY):
///   CLAIM_ID=0x<32-byte hex> ACTION=eligible pnpm --filter @matura/contracts mark-eligible:bsc-testnet
///   CLAIM_ID=0x<32-byte hex> ACTION=matured  pnpm --filter @matura/contracts mark-matured:bsc-testnet

const STATE_NAME: Record<number, string> = {};
for (const [name, ordinal] of Object.entries(CLAIM_STATE)) {
  STATE_NAME[ordinal] = name;
}

function stateName(state: number): string {
  return STATE_NAME[state] ?? `#${String(state)}`;
}

function requireClaimId(): `0x${string}` {
  const id = process.env.CLAIM_ID;
  if (id === undefined || !/^0x[0-9a-fA-F]{64}$/.test(id)) {
    throw new Error("Set CLAIM_ID=0x<32-byte hex claimId> in the environment.");
  }
  return id as `0x${string}`;
}

function requireAction(): "eligible" | "matured" {
  const action = process.env.ACTION;
  if (action !== "eligible" && action !== "matured") {
    throw new Error("Set ACTION=eligible or ACTION=matured.");
  }
  return action;
}

async function main(): Promise<void> {
  const claimId = requireClaimId();
  const action = requireAction();

  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  await assertChainId(publicClient, [BSC_TESTNET_CHAIN_ID]);

  const manifest = readManifest(BSC_TESTNET_CHAIN_ID);
  if (manifest === undefined) {
    throw new Error("No chain-97 deployment manifest — deploy/seed BSC Testnet first.");
  }

  const wallets = await viem.getWalletClients();
  const sender = wallets[0];
  if (sender === undefined) {
    throw new Error("No wallet account resolved (DEPLOYER_PRIVATE_KEY).");
  }

  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const claim = await claimRegistry.read.getClaim([claimId]);

  console.log(`Claim ${claimId}`);
  console.log(`  state         : ${stateName(Number(claim.state))}`);
  console.log(`  financedFace  : ${claim.financedFaceValue.toString()}`);
  console.log(`  dueDate       : ${new Date(Number(claim.dueDate) * 1000).toISOString()}`);
  console.log(`  sender        : ${sender.account.address}`);

  if (action === "eligible") {
    if (
      Number(claim.state) !== CLAIM_STATE.ELIGIBLE &&
      Number(claim.state) !== CLAIM_STATE.ATTESTED
    ) {
      throw new Error(`markEligible expects ATTESTED, claim is ${stateName(Number(claim.state))}.`);
    }
    if (Number(claim.state) === CLAIM_STATE.ELIGIBLE) {
      console.log("Already ELIGIBLE — nothing to do.");
      return;
    }
    const hash = await claimRegistry.write.markEligible([claimId], { account: sender.account });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`markEligible tx: ${hash}`);
  } else {
    const funded =
      Number(claim.state) === CLAIM_STATE.PARTIALLY_FUNDED ||
      Number(claim.state) === CLAIM_STATE.FUNDED;
    if (!funded) {
      throw new Error(
        `markMatured requires PARTIALLY_FUNDED/FUNDED (finance it via Get Liquidity first); ` +
          `claim is ${stateName(Number(claim.state))}.`,
      );
    }
    const now = (await publicClient.getBlock()).timestamp;
    if (now < claim.dueDate) {
      throw new Error(
        `markMatured requires the due date to have passed. Due ` +
          `${new Date(Number(claim.dueDate) * 1000).toISOString()}, now ` +
          `${new Date(Number(now) * 1000).toISOString()}.`,
      );
    }
    const hash = await claimRegistry.write.markMatured([claimId], { account: sender.account });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`markMatured tx: ${hash}`);
  }

  const after = await claimRegistry.read.getClaim([claimId]);
  console.log(`  -> new state  : ${stateName(Number(after.state))}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
