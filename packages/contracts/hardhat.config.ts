import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatIgnitionViem from "@nomicfoundation/hardhat-ignition-viem";

export default defineConfig({
  plugins: [hardhatToolboxViem, hardhatIgnitionViem],
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 } } },
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
