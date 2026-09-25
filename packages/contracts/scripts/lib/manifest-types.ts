import type { Address } from "viem";

/// Local, contracts-side mirror of the deployment manifest shape. `@matura/contracts` has no
/// `@matura/*` (or `zod`) dependency, so it must NOT import the chain-side Zod schema — it writes
/// with these local types and the chain-side codegen/loader owns validation. Keep field names in
/// sync with `packages/chain/src/manifest.ts`.
export interface AddressBookData {
  readonly mockUsdt: Address;
  readonly issuerRegistry: Address;
  readonly claimRegistry: Address;
  readonly vaultRegistry: Address;
  readonly router: Address;
  readonly settlementManager: Address;
}

export interface NamedVaultsData {
  readonly stableVault: Address;
  readonly flexVault: Address;
}

export interface SourcesData {
  readonly payroll: Address;
  readonly freelance: Address;
  readonly stream: Address;
}

export interface DeploymentManifestData {
  readonly chainId: number;
  readonly deploymentBlock: string;
  readonly abiBuildId: string;
  readonly addresses: AddressBookData;
  readonly namedVaults: NamedVaultsData;
  readonly sources: SourcesData;
}
