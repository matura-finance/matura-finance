// Barrel — value exports and type exports are split for `isolatedModules` /
// `verbatimModuleSyntax` correctness.

export { BSC_TESTNET_CHAIN_ID, bscTestnet, LOCAL_CHAIN_ID, hardhatLocal } from "./chains.js";

export { AddressBook, ZERO_ADDRESS, zeroAddressBook, evmAddress } from "./addresses.js";

export { DeploymentManifest, NamedVaults, Sources, zeroManifest } from "./manifest.js";

export {
  getManifest,
  getDeployment,
  isDeployed,
  getNamedVaults,
  getSources,
  getDeploymentBlock,
} from "./deployments.js";

export { createPublicClientFor, createWalletClientFor } from "./clients.js";

export { SETTLEMENT_DECIMALS, toBaseUnits, fromBaseUnits } from "./units.js";

export { contractAbis, vaultAbi, sourceAbi, sourceAbis } from "./contracts.js";

export {
  CLAIM_REGISTRY_DOMAIN_NAME,
  ROUTER_DOMAIN_NAME,
  DOMAIN_VERSION,
  CLAIM_ATTESTATION_TYPES,
  EXECUTION_ROUTE_TYPES,
  claimRegistryDomain,
  routerDomain,
} from "./eip712.js";
