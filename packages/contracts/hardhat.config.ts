import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatIgnitionViem from "@nomicfoundation/hardhat-ignition-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default defineConfig({
  plugins: [hardhatToolboxViem, hardhatIgnitionViem, hardhatVerify],
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
  // Explorer verification via the Etherscan **V2** unified API (BscScan is part of it; chainId 97).
  // Hardhat 3.18 ships the built-in chain-97 descriptor pointing at the V2 endpoint, so we DON'T
  // override `apiUrl` (the old per-chain V1 endpoint `api-testnet.bscscan.com/api` is deprecated and
  // rejects requests). We only supply the API key — a keystore/env config variable
  // (`BSCSCAN_API_KEY`, valid on the unified Etherscan V2 endpoint), never committed. Absent a key,
  // `verify-explorer.ts` still emits the exact manual commands.
  verify: {
    etherscan: { apiKey: configVariable("BSCSCAN_API_KEY"), enabled: true },
  },
  networks: {
    hardhat: { type: "edr-simulated", chainType: "l1" },
    // Persistent local node (`hardhat node`) for deploy:local / seed:local / demo:*.
    localhost: {
      type: "http",
      chainType: "l1",
      chainId: 31337,
      url: "http://127.0.0.1:8545",
    },
    // Deploy + verify only: deployer key alone, so no other command decrypts the issuer key.
    bscTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 97,
      url: configVariable("BSC_TESTNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
    // Seed only: adds ISSUER_PRIVATE_KEY as accounts[1] purely to sign EIP-712 attestations
    // (off-chain). Confining it to this entry keeps the most-sensitive key out of deploy/verify.
    bscTestnetSeed: {
      type: "http",
      chainType: "l1",
      chainId: 97,
      url: configVariable("BSC_TESTNET_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY"), configVariable("ISSUER_PRIVATE_KEY")],
    },
  },
});
