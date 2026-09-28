import { network } from "hardhat";
import { formatEther, getAddress } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { createChecklist } from "./lib/checklist.js";
import { MIN_DEPLOYER_BALANCE_WEI } from "./lib/preflight.js";
import { readManifest, manifestAddresses, isManifestDeployed } from "./lib/read-manifest.js";
import { ALLOWED_CHAIN_IDS } from "./lib/constants.js";
import { CLAIM_STATE } from "../config/constants.js";
import { STABLE_MANDATE, FLEX_MANDATE } from "../config/vault-mandates.js";
import { ALICE_CLAIMS, REQUEST_B, resolveClaimId, type ClaimSource } from "../config/demo.js";
import { isRevertNamed } from "./lib/revert.js";

/// PRE-DEMO SMOKE TEST — read-only, sends no transaction. Proves the LIVE chain is in a state that can
/// drive the 3-minute demo: the Request B claims are ELIGIBLE, each leg's vault holds enough fundable
/// liquidity to finance it, and the operator wallet has enough gas. Exits non-zero with a red checklist
/// on any gating failure (so it can gate "go"). Deliberately does NOT re-run the optimizer — the pure
/// route shape is locked in @matura/shared's demo-fixture test; here we assert live chain readiness.
///   smoke:bsc-testnet -> hardhat run scripts/smoke.ts --network bscTestnet
///   smoke:local       -> hardhat run scripts/smoke.ts --network localhost
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const chainId = await assertChainId(publicClient, ALLOWED_CHAIN_IDS);

  const manifest = readManifest(chainId);
  if (manifest === undefined || !isManifestDeployed(manifest)) {
    throw new Error(`No complete deployment for chainId ${String(chainId)} — run deploy first.`);
  }

  const { check, warn, failures } = createChecklist();
  console.log(`Pre-demo smoke for chainId ${String(chainId)}…\n`);

  // 1. Bytecode present at every manifest address — the deployment is live.
  for (const address of manifestAddresses(manifest)) {
    const code = await publicClient.getCode({ address });
    check(`bytecode present at ${address}`, code !== undefined && code !== "0x");
  }

  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const stableVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.stableVault);
  const flexVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.flexVault);
  const sources = { freelance: manifest.sources.freelance, stream: manifest.sources.stream };

  // Best-execution vault per claim type: the cheapest (lowest base discount) vault whose mandate
  // supports the type. Payroll → Stable (supported + cheaper); freelance (FREELANCE_ESCROW) → Flex
  // (the only vault that supports it). Derived from the mandates so it can't drift from config.
  const vaultsByType = [
    { name: "stable" as const, contract: stableVault, mandate: STABLE_MANDATE },
    { name: "flex" as const, contract: flexVault, mandate: FLEX_MANDATE },
  ];
  const supports = (bitmap: number, claimType: number): boolean =>
    (bitmap & (1 << claimType)) !== 0;
  const cheapestVaultFor = (claimType: number): (typeof vaultsByType)[number] | undefined => {
    const eligible = vaultsByType.filter((v) =>
      supports(v.mandate.supportedTypesBitmap, claimType),
    );
    return eligible.reduce<(typeof vaultsByType)[number] | undefined>(
      (best, v) =>
        best === undefined || v.mandate.baseDiscountBps < best.mandate.baseDiscountBps ? v : best,
      undefined,
    );
  };

  const claimByLabel = new Map<string, ClaimSource>(ALICE_CLAIMS.map((c) => [c.label, c]));

  // A small retry absorbs public-RPC read-after-write lag right after a fresh seed (a lagging pool
  // node can briefly report an already-seeded claim as missing/not-yet-eligible).
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  // `ClaimNotFound` → absent (undefined) rather than a throw; any other revert propagates.
  const readClaim = (claimId: `0x${string}`) =>
    claimRegistry.read.getClaim([claimId]).catch((error: unknown) => {
      if (isRevertNamed(error, "ClaimNotFound")) return undefined;
      throw error;
    });

  // 2. Each Request B claim is ELIGIBLE, financeable on its leg vault, and that vault has liquidity.
  for (const label of REQUEST_B.eligibleClaims) {
    const claim = claimByLabel.get(label);
    if (claim === undefined) {
      check(`Request B claim ${label} is defined in config`, false);
      continue;
    }
    const claimId = resolveClaimId(claim, sources);

    let onChain = await readClaim(claimId);
    for (let attempt = 0; attempt < 3 && onChain?.state !== CLAIM_STATE.ELIGIBLE; attempt++) {
      await sleep(2000);
      onChain = await readClaim(claimId);
    }
    if (onChain === undefined) {
      check(`claim ${label} exists on-chain`, false);
      continue;
    }
    check(`claim ${label} is ELIGIBLE`, onChain.state === CLAIM_STATE.ELIGIBLE);

    const vault = cheapestVaultFor(claim.claimType);
    if (vault === undefined) {
      check(`claim ${label} has an eligible vault`, false);
      continue;
    }
    const [ok, advance] = await vault.contract.read.quoteAndCheck([
      getAddress(onChain.issuer),
      claim.claimType,
      onChain.faceValue,
      onChain.dueDate,
    ]);
    check(`claim ${label} financeable on ${vault.name} vault`, ok);

    const fundable = await vault.contract.read.fundableLiquidity();
    check(
      `${vault.name} vault fundable liquidity >= ${label} leg advance ` +
        `(${fundable.toString()} >= ${advance.toString()})`,
      fundable >= advance,
    );
  }

  // 3. Operator gas: the wallet that will submit executeRoute has enough native token. On networks
  //    with no configured key (pure read-only) this can't be checked — warn rather than fail.
  const wallets = await viem.getWalletClients();
  const operator = wallets[0];
  if (operator === undefined) {
    warn("operator balance NOT checked — no wallet key configured on this network");
  } else {
    const operatorAddr = getAddress(operator.account.address);
    const balanceWei = await publicClient.getBalance({ address: operatorAddr });
    check(
      `operator ${operatorAddr} balance >= ${formatEther(MIN_DEPLOYER_BALANCE_WEI)} native ` +
        `(has ${formatEther(balanceWei)}; fund via faucet if below)`,
      balanceWei >= MIN_DEPLOYER_BALANCE_WEI,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Smoke FAILED (${String(failures.length)}) — NOT demo-ready:\n - ${failures.join("\n - ")}`,
    );
  }
  console.log("\nSmoke passed — the chain is demo-ready.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
