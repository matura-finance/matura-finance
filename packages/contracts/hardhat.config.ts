import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatIgnitionViem from "@nomicfoundation/hardhat-ignition-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default defineConfig({
  plugins: [hardhatToolboxViem, hardhatIgnitionViem, hardhatVerify],
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
  // Explorer verification (BscScan testnet). Hardhat 3 already ships a chain descriptor for 97 with
  // the browser URL; we add the BscScan testnet `apiUrl` so `verify` targets the right endpoint. The
  // key is a keystore/env config variable (`BSCSCAN_API_KEY`) — never committed. Absent a key,
  // `verify-explorer.ts` still emits the exact manual commands, so authoring needs no key.
  verify: {
    etherscan: { apiKey: configVariable("BSCSCAN_API_KEY"), enabled: true },
  },
  chainDescriptors: {
    97: {
      name: "Binance Smart Chain Testnet",
      blockExplorers: {
        etherscan: {
          name: "BscScan",
          url: "https://testnet.bscscan.com",
          apiUrl: "https://api-testnet.bscscan.com/api",
        },
      },
    },
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
