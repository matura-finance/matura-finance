import type { AddressBook } from "./addresses.js";
import {
  mockUSDTAbi,
  issuerRegistryAbi,
  claimRegistryAbi,
  vaultRegistryAbi,
  maturaRouterAbi,
  settlementManagerAbi,
  liquidityVaultAbi,
  sourceObligorAbi,
  mockFreelanceEscrowAbi,
  mockStreamAbi,
} from "./abis/index.js";

/**
 * ABI for each `AddressBook` slot, keyed identically to the address book so a consumer can wire a
 * viem contract as `{ address: book[k], abi: contractAbis[k] }` without hand-reconciling names.
 *
 * `satisfies Record<keyof AddressBook, ...>` makes this a COMPILE-TIME alignment check: adding an
 * `AddressBook` slot without a matching ABI (or vice versa) fails typecheck.
 */
export const contractAbis = {
  mockUsdt: mockUSDTAbi,
  issuerRegistry: issuerRegistryAbi,
  claimRegistry: claimRegistryAbi,
  vaultRegistry: vaultRegistryAbi,
  router: maturaRouterAbi,
  settlementManager: settlementManagerAbi,
} as const satisfies Record<keyof AddressBook, readonly unknown[]>;

/**
 * LiquidityVault ABI. Not an `AddressBook` slot — vaults are enumerated on-chain via
 * `VaultRegistry.getVaults()`, so their addresses are discovered at runtime, not from the manifest.
 */
export const vaultAbi = liquidityVaultAbi;

/**
 * ABI per manifest `sources` slot. The three source addresses live in the manifest's `sources` map,
 * but they bind to DIFFERENT contract types: `payroll` is a `SourceObligor` (pooled, surcharge-aware
 * obligor), while `freelance`/`stream` are the stateful adapters (`MockFreelanceEscrow`/`MockStream`)
 * that are their own issuer + a BOUND zero-fee obligor. They are NOT substitutable through the shared
 * `settle(bytes32)` signature (the adapters fail closed unless `feeBps()==0`), so each slot needs its
 * own ABI. Keyed to match the `Sources` manifest shape.
 */
export const sourceAbis = {
  payroll: sourceObligorAbi,
  freelance: mockFreelanceEscrowAbi,
  stream: mockStreamAbi,
} as const;

/**
 * SourceObligor ABI — kept as a standalone convenience binding (the payroll source + the demo
 * obligor in tests/scripts). For the per-slot adapter ABIs use {@link sourceAbis}.
 */
export const sourceAbi = sourceObligorAbi;
