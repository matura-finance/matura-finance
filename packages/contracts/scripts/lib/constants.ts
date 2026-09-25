import type { Address } from "viem";

/// Shared constants for the deploy/seed/verify/demo scripts. `@matura/contracts` can't import the
/// chain package's `LOCAL_CHAIN_ID`/`BSC_TESTNET_CHAIN_ID`/`ZERO_ADDRESS` across the package
/// boundary, so these mirror them here as the single in-package source (avoids per-script drift).
export const LOCAL_CHAIN_ID = 31337;
export const BSC_TESTNET_CHAIN_ID = 97;

/// Chains the deploy/seed/verify scripts may operate on. BSC Mainnet (56) is refused by the guard.
export const ALLOWED_CHAIN_IDS = [LOCAL_CHAIN_ID, BSC_TESTNET_CHAIN_ID] as const;

export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";

/// Seconds in a day (bigint — used in unix-second dueDate math, never mixed with `number`).
export const DAY_SECONDS = 86_400n;
