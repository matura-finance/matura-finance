import hre, { network } from "hardhat";
import { getAddress, type Address } from "viem";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";
import { assertChainId } from "./lib/network-guard.js";
import { readManifest, isManifestDeployed } from "./lib/read-manifest.js";
import { BSC_TESTNET_CHAIN_ID } from "./lib/constants.js";
import { STABLE_MANDATE, FLEX_MANDATE, type VaultMandate } from "../config/vault-mandates.js";

/// Verify every deployed chain-97 contract on the block explorer (BscScan testnet) with its EXACT
/// constructor args — a constructor-arg mismatch is the usual verification failure, so the args below
/// mirror `ignition/modules/MaturaProtocol.ts` slot-for-slot. Each contract is attempted independently
/// (one failure never blocks the rest) and the exact MANUAL `hardhat verify` command is printed as a
/// fallback (e.g. when no BSCSCAN_API_KEY is configured, or to re-run a single contract by hand).
///   verify:bsc-testnet:explorer -> hardhat run scripts/verify-explorer.ts --network bscTestnet
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const chainId = await assertChainId(publicClient, [BSC_TESTNET_CHAIN_ID]);

  const manifest = readManifest(chainId);
  if (manifest === undefined || !isManifestDeployed(manifest)) {
    throw new Error(`No complete deployment for chainId ${String(chainId)} — run deploy first.`);
  }

  // Every verified contract takes `admin` as its FIRST constructor arg. The testnet deploy passes no
  // Ignition `--parameters` override, so `admin` is the deployer (accounts[0]). NOTE: `treasury` is
  // NOT a constructor arg on any target — SettlementManager's ctor initializes `_treasury = admin`
  // and the deploy then resets it via a post-deploy `setTreasury` call, so treasury never enters the
  // constructor-arg bytecode match that verification checks and needs no handling here.
  // If a production deploy overrides `admin` (e.g. a multisig) via `--parameters`, set `admin` below
  // to that same address, or the constructor-arg match — and thus explorer verification — will fail.
  const wallets = await viem.getWalletClients();
  const deployer = wallets[0];
  if (deployer === undefined) {
    throw new Error("Expected the deployer (accounts[0]) — run with --network bscTestnet.");
  }
  const admin = getAddress(deployer.account.address);

  const { addresses, namedVaults, sources } = manifest;
  // Ignition materializes the readonly-tuple premium into a mutable array for the struct ctor arg.
  const mandateArg = (m: VaultMandate): Record<string, unknown> => ({
    ...m,
    claimTypePremiumBps: [...m.claimTypePremiumBps],
  });

  interface VerifyTarget {
    readonly label: string;
    readonly address: Address;
    readonly contract: string; // fully-qualified name: <source>:<contract>
    readonly constructorArgs: readonly unknown[];
    readonly structArg: boolean; // struct args can't be given positionally on the CLI
  }

  const targets: readonly VerifyTarget[] = [
    {
      label: "MockUSDT",
      address: getAddress(addresses.mockUsdt),
      contract: "contracts/token/MockUSDT.sol:MockUSDT",
      constructorArgs: [],
      structArg: false,
    },
    {
      label: "IssuerRegistry",
      address: getAddress(addresses.issuerRegistry),
      contract: "contracts/IssuerRegistry.sol:IssuerRegistry",
      constructorArgs: [admin],
      structArg: false,
    },
    {
      label: "ClaimRegistry",
      address: getAddress(addresses.claimRegistry),
      contract: "contracts/ClaimRegistry.sol:ClaimRegistry",
      constructorArgs: [
        admin,
        getAddress(addresses.issuerRegistry),
        getAddress(addresses.mockUsdt),
      ],
      structArg: false,
    },
    {
      label: "VaultRegistry",
      address: getAddress(addresses.vaultRegistry),
      contract: "contracts/VaultRegistry.sol:VaultRegistry",
      constructorArgs: [admin],
      structArg: false,
    },
    {
      label: "SettlementManager",
      address: getAddress(addresses.settlementManager),
      contract: "contracts/SettlementManager.sol:SettlementManager",
      constructorArgs: [admin, getAddress(addresses.claimRegistry), getAddress(addresses.mockUsdt)],
      structArg: false,
    },
    {
      label: "MaturaRouter",
      address: getAddress(addresses.router),
      contract: "contracts/MaturaRouter.sol:MaturaRouter",
      constructorArgs: [
        admin,
        getAddress(addresses.claimRegistry),
        getAddress(addresses.vaultRegistry),
        getAddress(addresses.issuerRegistry),
        getAddress(addresses.settlementManager),
        getAddress(addresses.mockUsdt),
      ],
      structArg: false,
    },
    {
      label: "StableVault (LiquidityVault)",
      address: getAddress(namedVaults.stableVault),
      contract: "contracts/LiquidityVault.sol:LiquidityVault",
      constructorArgs: [admin, getAddress(addresses.mockUsdt), mandateArg(STABLE_MANDATE)],
      structArg: true,
    },
    {
      label: "FlexVault (LiquidityVault)",
      address: getAddress(namedVaults.flexVault),
      contract: "contracts/LiquidityVault.sol:LiquidityVault",
      constructorArgs: [admin, getAddress(addresses.mockUsdt), mandateArg(FLEX_MANDATE)],
      structArg: true,
    },
    {
      label: "PayrollSource (SourceObligor)",
      address: getAddress(sources.payroll),
      contract: "contracts/sources/SourceObligor.sol:SourceObligor",
      constructorArgs: [
        getAddress(addresses.mockUsdt),
        getAddress(addresses.settlementManager),
        getAddress(addresses.claimRegistry),
      ],
      structArg: false,
    },
    {
      label: "FreelanceSource (MockFreelanceEscrow)",
      address: getAddress(sources.freelance),
      contract: "contracts/sources/MockFreelanceEscrow.sol:MockFreelanceEscrow",
      constructorArgs: [
        getAddress(addresses.mockUsdt),
        getAddress(addresses.claimRegistry),
        getAddress(addresses.settlementManager),
      ],
      structArg: false,
    },
    {
      label: "StreamSource (MockStream)",
      address: getAddress(sources.stream),
      contract: "contracts/sources/MockStream.sol:MockStream",
      constructorArgs: [
        getAddress(addresses.mockUsdt),
        getAddress(addresses.claimRegistry),
        getAddress(addresses.settlementManager),
      ],
      structArg: false,
    },
  ];

  // Render one constructor arg for the human-readable manual command.
  const renderArg = (arg: unknown): string => {
    if (typeof arg === "bigint") return arg.toString();
    if (typeof arg === "string") return arg;
    return JSON.stringify(arg, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
  };

  console.log(
    `Explorer verification for chainId ${String(chainId)} (${String(targets.length)} contracts)…\n`,
  );

  const results: { label: string; ok: boolean; note: string }[] = [];
  for (const t of targets) {
    console.log(`— ${t.label} @ ${t.address}`);
    try {
      const verified = await verifyContract(
        { address: t.address, constructorArgs: [...t.constructorArgs], contract: t.contract },
        hre,
      );
      const note = verified ? "verified" : "not verified";
      console.log(`  [${verified ? "ok" : "FAIL"}] ${note}`);
      results.push({ label: t.label, ok: verified, note });
    } catch (error: unknown) {
      const note = error instanceof Error ? error.message : String(error);
      console.log(`  [FAIL] ${note}`);
      results.push({ label: t.label, ok: false, note });
    }
  }

  // Manual fallback command set (always printed — copy/paste to verify by hand).
  console.log("\nManual fallback commands (`hardhat verify`, run with --network bscTestnet):");
  for (const t of targets) {
    if (t.structArg) {
      console.log(
        `  # ${t.label}: struct constructor arg — put the args in a JS module and pass ` +
          `--constructor-args <file> (positional CLI args cannot express a struct):`,
      );
      console.log(`  #   module.exports = [${t.constructorArgs.map(renderArg).join(", ")}];`);
      console.log(
        `  npx hardhat verify --network bscTestnet --contract ${t.contract} ` +
          `--constructor-args <argsFile.cjs> ${t.address}`,
      );
    } else {
      const args = t.constructorArgs.map(renderArg).join(" ");
      console.log(
        `  npx hardhat verify --network bscTestnet --contract ${t.contract} ${t.address}` +
          (args.length > 0 ? ` ${args}` : ""),
      );
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(
      `\n${String(failed.length)}/${String(results.length)} contract(s) not verified via the API — ` +
        "use the manual commands above (a missing BSCSCAN_API_KEY is expected during authoring).",
    );
  } else {
    console.log("\nAll contracts verified on the explorer.");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
