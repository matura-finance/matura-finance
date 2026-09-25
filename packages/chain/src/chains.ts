import { defineChain } from "viem";

/**
 * BNB Smart Chain Testnet chain id. The canonical target network for the
 * Matura MVP. Exported `as const` so it narrows to the literal `97`.
 */
export const BSC_TESTNET_CHAIN_ID = 97 as const;

/**
 * viem chain definition for BNB Smart Chain Testnet.
 *
 * The RPC URL here is the public seed endpoint; callers that need a keyed or
 * private RPC pass it explicitly to the client factories in `./clients` rather
 * than relying on this default.
 */
export const bscTestnet = defineChain({
  id: BSC_TESTNET_CHAIN_ID,
  name: "BNB Smart Chain Testnet",
  nativeCurrency: {
    name: "tBNB",
    symbol: "tBNB",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
    },
  },
  testnet: true,
});

/**
 * Local Hardhat / EDR development chain id. Exported `as const` so it narrows to
 * the literal `31337`.
 */
export const LOCAL_CHAIN_ID = 31337 as const;

/**
 * viem chain definition for the local Hardhat dev node. Points at the default
 * `hardhat node` JSON-RPC endpoint; used by scripts and tests targeting a
 * locally-running EDR chain.
 */
export const hardhatLocal = defineChain({
  id: LOCAL_CHAIN_ID,
  name: "Hardhat Local",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:8545"],
    },
  },
  testnet: true,
});
