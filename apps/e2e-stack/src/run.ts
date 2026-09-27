import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createTestClient,
  createWalletClient,
  getAddress,
  http,
  publicActions,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { contractAbis, hardhatLocal } from "@matura/chain";
import { ALICE_KEY, CHAIN_ID, DEPLOYER_KEY, REPO_ROOT, RPC_URL } from "./env.js";
import { Manifest } from "./schemas.js";
import {
  getClaim,
  makePublicClient,
  optimize,
  prepareExecution,
  siweLogin,
  signAndExecuteRoute,
} from "./api.js";
import { payrollClaimId } from "./claims.js";
import { startStack, waitFor } from "./stack.js";

const DAY = 86_400;

/// All three sources expose `settle(bytes32)` (SourceObligor + both adapters share the signature).
const SETTLE_ABI = [
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimId", type: "bytes32" }],
    outputs: [],
  },
] as const;

/// Minimal read ABIs to fetch the adapter-derived claimIds straight from source state (avoids any
/// off-chain derivation drift — the adapter is the authority on its own claimId).
const GET_ENGAGEMENT_ABI = [
  {
    type: "function",
    name: "getEngagement",
    stateMutability: "view",
    inputs: [{ name: "engagementId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "client", type: "address" },
          { name: "beneficiary", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "releaseDate", type: "uint64" },
          { name: "state", type: "uint8" },
          { name: "claimId", type: "bytes32" },
        ],
      },
    ],
  },
] as const;
const GET_STREAM_ABI = [
  {
    type: "function",
    name: "getStream",
    stateMutability: "view",
    inputs: [{ name: "streamId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "funder", type: "address" },
          { name: "recipient", type: "address" },
          { name: "deposit", type: "uint256" },
          { name: "start", type: "uint64" },
          { name: "stop", type: "uint64" },
          { name: "withdrawn", type: "uint256" },
          { name: "assigned", type: "bool" },
          { name: "claimId", type: "bytes32" },
        ],
      },
    ],
  },
] as const;

const POLL = { timeoutMs: 30_000, intervalMs: 500 } as const;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const stack = await startStack();
  try {
    const publicClient = makePublicClient();
    const test = createTestClient({
      chain: hardhatLocal,
      mode: "hardhat",
      transport: http(RPC_URL),
    }).extend(publicActions);
    const alice = privateKeyToAccount(ALICE_KEY);
    const deployer = privateKeyToAccount(DEPLOYER_KEY);
    const deployerWallet = createWalletClient({
      account: deployer,
      chain: hardhatLocal,
      transport: http(RPC_URL),
    });

    // Read the freshly-deployed manifest from disk (getManifest is bound to the import-time dist).
    const manifest = Manifest.parse(
      JSON.parse(
        readFileSync(
          join(REPO_ROOT, "packages/chain/src/deployments", `${String(CHAIN_ID)}.json`),
          "utf8",
        ),
      ),
    );
    const usdt = getAddress(manifest.addresses.mockUsdt);
    const claimRegistry = getAddress(manifest.addresses.claimRegistry);
    const settlementManager = getAddress(manifest.addresses.settlementManager);
    const payrollSource = getAddress(manifest.sources.payroll);
    const freelanceSource = getAddress(manifest.sources.freelance);
    const streamSource = getAddress(manifest.sources.stream);

    const payroll = payrollClaimId();
    const stream = (
      await publicClient.readContract({
        address: streamSource,
        abi: GET_STREAM_ABI,
        functionName: "getStream",
        args: [1n],
      })
    ).claimId;
    const freelance = (
      await publicClient.readContract({
        address: freelanceSource,
        abi: GET_ENGAGEMENT_ABI,
        functionName: "getEngagement",
        args: [1n],
      })
    ).claimId;

    const balanceOf = async (who: Address): Promise<bigint> =>
      publicClient.readContract({
        address: usdt,
        abi: contractAbis.mockUsdt,
        functionName: "balanceOf",
        args: [who],
      });

    // Advance the chain by `n` blocks with real (0-value) txs. Reliable under hardhat automine —
    // unlike the test-client `mine`, which we observed not always advancing head here. Advancing
    // head is what lets the API's (head - 1) frontier include the just-executed route.
    const advanceBlocks = async (n: number): Promise<void> => {
      for (let i = 0; i < n; i++) {
        const hash = await deployerWallet.sendTransaction({
          account: deployer,
          chain: hardhatLocal,
          to: getAddress(deployer.address),
          value: 0n,
        });
        await publicClient.waitForTransactionReceipt({ hash });
      }
    };

    /// Optimize → prepare → sign → executeRoute one route via the API. `minFrontier` is the block
    /// the optimizer's pinned frontier MUST reach before we trust its route — the API reads chain
    /// state at (head - 1), which lags on an instant-mine chain, so we advance blocks + re-optimize
    /// until `opt.blockNumber >= minFrontier`. Without this the optimizer sees stale financing (→
    /// OverAssignment at execute) or a stale nonce. Returns the on-chain execution block.
    const execViaApi = async (
      label: string,
      claimIds: Hex[],
      targetAdvance: string,
      token: string,
      minFrontier: bigint,
      minClaims: number,
    ): Promise<bigint> => {
      // The API's optimize reads chain state at its (head - 1) frontier; on an instant-mine chain
      // its RPC connection can lag ours (and even the worker cursor) transiently. optimize is
      // rate-limited to 5/min per wallet, so we can't poll it — instead advance blocks, wait for the
      // cursor to pass minFrontier (un-throttled getClaim), and let the API connection settle before
      // a single optimize. A stale frontier gets ONE throttle-safe retry (≤2 optimize calls/route).
      const readyOptimize = async (): Promise<Awaited<ReturnType<typeof optimize>>> => {
        if (minFrontier > 0n) {
          await advanceBlocks(2);
          await waitFor(
            `cursor >= ${minFrontier.toString()}`,
            async () => BigInt((await getClaim(payroll)).finalizedThrough) >= minFrontier,
            { timeoutMs: 30_000, intervalMs: 300 },
          );
          await sleep(1500); // let the API's own RPC connection converge to the advanced head
        }
        let o = await optimize({ claimIds, targetAdvance, routeDeadlineSeconds: 3600 }, token);
        if (BigInt(o.blockNumber) < minFrontier) {
          await advanceBlocks(2);
          await sleep(2500);
          o = await optimize({ claimIds, targetAdvance, routeDeadlineSeconds: 3600 }, token);
        }
        return o;
      };
      const opt = await readyOptimize();
      assert.ok(
        BigInt(opt.blockNumber) >= minFrontier,
        `${label}: optimize frontier ${opt.blockNumber} < required ${minFrontier.toString()}`,
      );
      if (opt.routeId === null || !opt.result.executable) {
        throw new Error(
          `${label}: no executable route — ${JSON.stringify(opt.result)} filteredOut=${JSON.stringify(opt.filteredOut)}`,
        );
      }
      const distinct = new Set(opt.result.legs.map((l) => l.claimId)).size;
      assert.ok(
        distinct >= minClaims,
        `${label} combined ${String(distinct)} claim(s), expected ≥${String(minClaims)}`,
      );
      const execBlock = await signAndExecuteRoute(
        await prepareExecution(opt.routeId, token),
        alice,
        publicClient,
      );
      await advanceBlocks(2);
      console.log(
        `${label} executed @block ${execBlock.toString()} (${String(distinct)} claim(s))`,
      );
      return execBlock;
    };

    const token = await siweLogin(alice);
    console.log(
      `SIWE session for ${alice.address}; claims payroll=${payroll} stream=${stream} freelance=${freelance}`,
    );

    // ── Request A: a single PARTIAL payroll slice ──────────────────────────────
    const aBlock = await execViaApi("Request A", [payroll], "4800000000", token, 0n, 1);

    // ── Request B: combine ≥2 claims (payroll remaining + stream). Its optimize frontier must
    //    include A's block, else the optimizer sees payroll unfinanced → OverAssignment at execute. ─
    const bBlock = await execViaApi(
      "Request B",
      [payroll, stream],
      "18000000000",
      token,
      aBlock,
      2,
    );

    // ── Fund the delayed claim NOW, before any time-warp ──────────────────────
    // Every executeRoute must happen while chain time ≈ wall-clock (the API sets the route deadline
    // from Date.now()); once we warp the chain forward, later routes would RouteExpired. So finance
    // the freelance claim here; it is matured + marked DELAYED (never settled) after the warp below.
    await execViaApi("freelance financing", [freelance], "1000000000", token, bBlock, 1);

    // ── Warp past ALL due dates (payroll 30d, stream ~30d, freelance 45d) ──────
    await test.increaseTime({ seconds: 46 * DAY });
    await advanceBlocks(1);

    // ── Settle payroll + stream, reconcile events ↔ DB projection ↔ balances ───
    const aliceBefore = await balanceOf(getAddress(alice.address));
    await settle(deployerWallet, publicClient, payrollSource, payroll);
    await settle(deployerWallet, publicClient, streamSource, stream);
    await advanceBlocks(1);
    const aliceAfter = await balanceOf(getAddress(alice.address));

    let expectedResidualSum = 0n;
    for (const claimId of [payroll, stream]) {
      const ev = await lastSettledEvent(publicClient, settlementManager, claimId);
      expectedResidualSum += ev.userResidual;
      // Conservation on the emitted components.
      assert.equal(
        ev.amountReceived,
        ev.vaultDistribution + ev.userResidual + ev.protocolFee,
        "conservation",
      );

      // Poll until the projection reflects the settlement (PAID + a settlement row), not merely
      // until the cursor passes the block — the state update can lag the cursor read by a tick.
      await waitFor(
        `${claimId} projected PAID`,
        async () => {
          const c = await getClaim(claimId);
          return c.state === "PAID" && c.settlement !== null;
        },
        POLL,
      );
      const detail = await getClaim(claimId);
      assert.equal(detail.state, "PAID", `${claimId} not PAID in read-model`);
      assert.ok(detail.settlement !== null, `${claimId} has no settlement projection`);
      // Event ↔ DB projection, field for field (the DB stores base-unit strings).
      assert.equal(detail.settlement.amountReceived, ev.amountReceived.toString());
      assert.equal(detail.settlement.vaultDistribution, ev.vaultDistribution.toString());
      assert.equal(detail.settlement.userResidual, ev.userResidual.toString());
      assert.equal(detail.settlement.protocolFee, ev.protocolFee.toString());
      console.log(`reconciled ${claimId}: PAID, projection == event`);
    }
    // Balance delta: Alice received exactly the sum of residuals across both settlements.
    assert.equal(
      aliceAfter - aliceBefore,
      expectedResidualSum,
      "Alice residual balance delta mismatch",
    );
    console.log("balance reconciliation exact: Alice residual =", expectedResidualSum.toString());

    // ── Delayed path: freelance (already financed) matured, marked DELAYED — never PAID ──
    await writeAndWait(deployerWallet, publicClient, claimRegistry, "markMatured", freelance);
    await writeAndWait(deployerWallet, publicClient, claimRegistry, "markDelayed", freelance);
    await advanceBlocks(1);

    // Poll the projection until it reflects the DELAYED transition (the worker must index the
    // ClaimStateChanged events). Gating on finalizedThrough alone raced the state update.
    await waitFor(
      "freelance projected DELAYED",
      async () => (await getClaim(freelance)).state === "DELAYED",
      POLL,
    );
    const delayed = await getClaim(freelance);
    assert.equal(delayed.state, "DELAYED", "freelance not DELAYED");
    assert.equal(delayed.settlement, null, "delayed claim must have no settlement projection");
    assert.ok(
      BigInt(delayed.financedFaceValue) > 0n,
      "delayed claim should have principal outstanding",
    );
    console.log("delayed path reconciled: freelance DELAYED, no settlement, principal outstanding");

    console.log("\n✓ cross-stack reconciliation passed (events ↔ DB projections ↔ balances)");
  } finally {
    await stack.stop();
  }
}

interface SettledEvent {
  amountReceived: bigint;
  vaultDistribution: bigint;
  userResidual: bigint;
  protocolFee: bigint;
}

async function lastSettledEvent(
  publicClient: PublicClient,
  settlementManager: Address,
  claimId: Hex,
): Promise<SettledEvent> {
  const logs = await publicClient.getContractEvents({
    address: settlementManager,
    abi: contractAbis.settlementManager,
    eventName: "ClaimSettled",
    args: { claimId },
    fromBlock: 0n,
    toBlock: "latest",
  });
  const ev = logs.at(-1);
  if (ev === undefined) throw new Error(`no ClaimSettled event for ${claimId}`);
  const { amountReceived, vaultDistribution, userResidual, protocolFee } = ev.args;
  if (
    amountReceived === undefined ||
    vaultDistribution === undefined ||
    userResidual === undefined ||
    protocolFee === undefined
  ) {
    throw new Error(`ClaimSettled event for ${claimId} missing args`);
  }
  return { amountReceived, vaultDistribution, userResidual, protocolFee };
}

async function settle(
  wallet: ReturnType<typeof createWalletClient>,
  publicClient: PublicClient,
  source: Address,
  claimId: Hex,
): Promise<void> {
  const account = wallet.account;
  if (account === undefined) throw new Error("wallet has no account");
  const hash = await wallet.writeContract({
    account,
    chain: hardhatLocal,
    address: source,
    abi: SETTLE_ABI,
    functionName: "settle",
    args: [claimId],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`settle(${claimId}) reverted (tx ${hash})`);
}

async function writeAndWait(
  wallet: ReturnType<typeof createWalletClient>,
  publicClient: PublicClient,
  address: Address,
  functionName: "markMatured" | "markDelayed",
  claimId: Hex,
): Promise<void> {
  const account = wallet.account;
  if (account === undefined) throw new Error("wallet has no account");
  const hash = await wallet.writeContract({
    account,
    chain: hardhatLocal,
    address,
    abi: contractAbis.claimRegistry,
    functionName,
    args: [claimId],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success")
    throw new Error(`${functionName}(${claimId}) reverted (tx ${hash})`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
