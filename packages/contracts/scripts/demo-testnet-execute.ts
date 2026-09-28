import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { network } from "hardhat";
import { getAddress, type Address, type Hex } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest, isManifestDeployed } from "./lib/read-manifest.js";
import { writeJsonAtomic } from "./lib/atomic-write.js";
import { isRevertNamed } from "./lib/revert.js";
import { EXECUTION_ROUTE_TYPES, routerDomain } from "../config/eip712.js";
import { CLAIM_STATE } from "../config/constants.js";
import { SCRIPTED_DEPLOYER_PAYROLL, claimIdFor } from "../config/demo.js";
import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";

/// SCRIPTED BSC-Testnet proof: drive the DEPLOYER-OWNED scripted claim (seeded by `seed.ts`) through
/// optimize → build route → sign(deployer) → executeRoute → settle, and record each tx hash as it
/// confirms. Public-RPC hardened: a WIDE route deadline, explicit tx-nonce management, receipt waits
/// with retry/backoff, and a RESUMABLE design — a re-run detects the claim is already FUNDED (execute
/// landed) and drives only settle. Refuses any chain but 97 FIRST.
///   demo:testnet-execute -> hardhat run scripts/demo-testnet-execute.ts --network bscTestnet
///
/// Timing: fund needs `dueDate` in the future; settle needs `dueDate` reached (see
/// SCRIPTED_DUE_SECONDS). Run promptly after seed to fund, then re-run once the window elapses to
/// settle (the script prints the exact time + remaining wait when settle is not yet possible).

const HERE = dirname(fileURLToPath(import.meta.url));
const RECEIPTS_PATH = join(HERE, "..", ".testnet-receipts", "scripted-execute.json");
const ROUTE_DEADLINE_SECONDS = 86_400n; // wide: absorb slow/rate-limited public-RPC submission
const RECEIPT_MAX_ATTEMPTS = 8;
const RECEIPT_BASE_DELAY_MS = 2_000;

interface Receipts {
  chainId: number;
  claimId: Hex;
  label: string;
  executeTx?: Hex;
  settleTx?: Hex;
  finalState?: number;
  recordedAt: string;
}

function loadReceipts(claimId: Hex): Receipts {
  if (existsSync(RECEIPTS_PATH)) {
    const parsed: unknown = JSON.parse(readFileSync(RECEIPTS_PATH, "utf8"));
    if (typeof parsed === "object" && parsed !== null) {
      const prior = parsed as Partial<Receipts>;
      if (prior.claimId === claimId) {
        return {
          chainId: BSC_TESTNET_CHAIN_ID,
          claimId,
          label: SCRIPTED_DEPLOYER_PAYROLL.label,
          executeTx: prior.executeTx,
          settleTx: prior.settleTx,
          finalState: prior.finalState,
          recordedAt: new Date().toISOString(),
        };
      }
    }
  }
  return {
    chainId: BSC_TESTNET_CHAIN_ID,
    claimId,
    label: SCRIPTED_DEPLOYER_PAYROLL.label,
    recordedAt: new Date().toISOString(),
  };
}

function persist(receipts: Receipts): void {
  const next = { ...receipts, recordedAt: new Date().toISOString() };
  writeJsonAtomic(RECEIPTS_PATH, next);
  console.log(`  receipts → ${RECEIPTS_PATH}`);
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  // Refuse any chain but 97 BEFORE anything else — this script sends real value-moving txs.
  const chainId = await assertChainId(publicClient, [BSC_TESTNET_CHAIN_ID]);

  const manifest = readManifest(chainId);
  if (manifest === undefined || !isManifestDeployed(manifest)) {
    throw new Error(
      `No complete deployment for chainId ${String(chainId)} — run deploy + seed first.`,
    );
  }

  const wallets = await viem.getWalletClients();
  const deployer = wallets[0];
  if (deployer === undefined) {
    throw new Error("Expected the deployer (accounts[0]) — run with --network bscTestnet.");
  }
  const deployerAccount = deployer.account;
  const user = getAddress(deployerAccount.address);

  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const router = await viem.getContractAt("MaturaRouter", manifest.addresses.router);
  const payrollObligor = await viem.getContractAt("SourceObligor", manifest.sources.payroll);

  const claimId = claimIdFor(SCRIPTED_DEPLOYER_PAYROLL.label);
  const receipts = loadReceipts(claimId);

  const getClaim = () =>
    claimRegistry.read.getClaim([claimId]).catch((error: unknown) => {
      if (isRevertNamed(error, "ClaimNotFound")) return undefined;
      throw error;
    });

  const claim = await getClaim();
  if (claim === undefined) {
    throw new Error(
      `Scripted claim ${SCRIPTED_DEPLOYER_PAYROLL.label} not found — run seed:bsc-testnet first.`,
    );
  }
  if (getAddress(claim.beneficiary) !== user) {
    throw new Error(
      `Scripted claim beneficiary ${getAddress(claim.beneficiary)} != deployer ${user} — ` +
        "re-seed so the scripted claim is deployer-owned.",
    );
  }

  console.log(
    `Scripted execute+settle on chainId ${String(chainId)} — claim ${SCRIPTED_DEPLOYER_PAYROLL.label}`,
  );
  console.log(`  claimId ${claimId}\n  state ${String(claim.state)} (deployer-owned)`);

  // Explicit tx-nonce management for a flaky public RPC: fetch the pending account nonce once and
  // advance it per submitted tx (avoids "nonce too low"/replacement churn between RPC nodes).
  let txNonce = await publicClient.getTransactionCount({ address: user, blockTag: "pending" });

  /// Wait for a receipt with bounded exponential backoff — public RPCs drop/lag `eth_getTransactionReceipt`.
  const awaitReceipt = async (hash: Hex, label: string): Promise<void> => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RECEIPT_MAX_ATTEMPTS; attempt++) {
      try {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
          throw new Error(`${label} reverted on-chain (tx ${hash}).`);
        }
        console.log(`  ${label.padEnd(14)} confirmed ${hash}`);
        return;
      } catch (error: unknown) {
        lastError = error;
        const delay = RECEIPT_BASE_DELAY_MS * 2 ** (attempt - 1);
        console.log(
          `  ${label}: receipt attempt ${String(attempt)} failed, retrying in ${String(delay)}ms…`,
        );
        await sleep(delay);
      }
    }
    throw new Error(
      `${label}: no receipt after ${String(RECEIPT_MAX_ATTEMPTS)} attempts (tx ${hash}). ` +
        `${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  };

  // 1. EXECUTE (fund) — only from a financeable state; a resumed run past this point skips it.
  const financeable =
    claim.state === CLAIM_STATE.ELIGIBLE || claim.state === CLAIM_STATE.PARTIALLY_FUNDED;
  if (financeable) {
    const now = (await publicClient.getBlock()).timestamp;
    const routeNonce = await router.read.nonces([user]);
    const stableVault: Address = getAddress(manifest.namedVaults.stableVault);
    const route = {
      user,
      targetAdvance: 1n, // any positive advance suffices; the vault quote sets the real advance
      maxTotalFace: claim.faceValue,
      deadline: now + ROUTE_DEADLINE_SECONDS,
      nonce: routeNonce,
      legs: [
        {
          claimId,
          vault: stableVault,
          faceAmount: claim.faceValue,
          minimumAdvanceAmount: 0n,
        },
      ],
    };
    const signature = await deployer.signTypedData({
      account: deployerAccount,
      domain: routerDomain(chainId, manifest.addresses.router),
      types: EXECUTION_ROUTE_TYPES,
      primaryType: "ExecutionRoute",
      message: route,
    });
    const executeHash = await router.write.executeRoute([route, signature], {
      account: deployerAccount,
      nonce: txNonce,
    });
    txNonce += 1;
    receipts.executeTx = executeHash;
    persist(receipts);
    await awaitReceipt(executeHash, "executeRoute");
  } else {
    console.log(
      "  execute: claim not in a financeable state — assuming execute already landed (resume).",
    );
  }

  // 2. SETTLE — mature (needs dueDate reached) then settle out of the pre-funded payroll obligor.
  const funded = await getClaim();
  if (funded === undefined) {
    throw new Error("Claim vanished after execute — unexpected.");
  }
  if (funded.state === CLAIM_STATE.PAID) {
    receipts.finalState = funded.state;
    persist(receipts);
    console.log("\nClaim already PAID — execute+settle complete.");
    return;
  }

  const nowTs = (await publicClient.getBlock()).timestamp;
  if (funded.dueDate > nowTs) {
    const waitSecs = funded.dueDate - nowTs;
    persist(receipts);
    console.log(
      `\nSETTLE PENDING: claim matures at ${new Date(Number(funded.dueDate) * 1000).toISOString()} ` +
        `(${String(waitSecs)}s from now). Re-run \`demo:testnet-execute\` after that to settle — ` +
        "the funded claim is recorded; this run is resumable.",
    );
    return;
  }

  try {
    const settleHash = await payrollObligor.write.settle([claimId], {
      account: deployerAccount,
      nonce: txNonce,
    });
    txNonce += 1;
    receipts.settleTx = settleHash;
    persist(receipts);
    await awaitReceipt(settleHash, "settle");
  } catch (error: unknown) {
    if (isRevertNamed(error, "NotMatured")) {
      persist(receipts);
      console.log(
        "\nSETTLE PENDING: obligor.settle reverted NotMatured (dueDate not yet reached on-chain). " +
          "Re-run shortly — this run is resumable.",
      );
      return;
    }
    throw error;
  }

  // A public RPC can serve a stale read immediately after the settle tx confirms (read-after-write
  // lag), so poll for the terminal PAID state a few times before treating it as a failure.
  let settled = await getClaim();
  for (let i = 0; i < 5 && (settled === undefined || settled.state !== CLAIM_STATE.PAID); i += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 3000);
    });
    settled = await getClaim();
  }
  if (settled === undefined || settled.state !== CLAIM_STATE.PAID) {
    throw new Error(
      `Expected PAID after settle, got state ${String(settled?.state)} — the settle tx confirmed, ` +
        `so this is likely public-RPC read lag; verify the claim on the explorer.`,
    );
  }
  receipts.finalState = settled.state;
  persist(receipts);
  console.log("\ndemo:testnet-execute complete — real execute + settle succeeded on chain 97.");
  console.log(`  executeTx ${String(receipts.executeTx)}`);
  console.log(`  settleTx  ${String(receipts.settleTx)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
