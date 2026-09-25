import type { Address } from "viem";
import { network } from "hardhat";
import { ROLES } from "../../config/constants.js";

type Viem = Awaited<ReturnType<typeof network.create>>["viem"];

/// The set of protocol addresses whose wiring `assertWiring` verifies. Reused by `deploy.ts`
/// (post-deploy gate) and `verify.ts` (standalone check) so both apply the same invariants.
export interface WiringAddresses {
  readonly claimRegistry: Address;
  readonly settlementManager: Address;
  readonly router: Address;
  readonly vaultRegistry: Address;
  readonly stableVault: Address;
  readonly flexVault: Address;
  readonly sources: readonly Address[];
}

/// Assert every required role grant + vault registration is in place, and that the hard
/// reserve/release separation holds: `router != settlement`; the router never holds
/// SETTLEMENT_ROLE and the settlement manager never holds ROUTER_ROLE on any wired contract; and
/// the obligors hold neither privileged role. Throws a single error listing every failure with a
/// remediation hint. (Full RoleGranted/RoleRevoked enumeration lives in `verify.ts`.)
export async function assertWiring(viem: Viem, a: WiringAddresses): Promise<void> {
  const claimRegistry = await viem.getContractAt("ClaimRegistry", a.claimRegistry);
  const settlement = await viem.getContractAt("SettlementManager", a.settlementManager);
  const vaultRegistry = await viem.getContractAt("VaultRegistry", a.vaultRegistry);
  const stableVault = await viem.getContractAt("LiquidityVault", a.stableVault);
  const flexVault = await viem.getContractAt("LiquidityVault", a.flexVault);

  const failures: string[] = [];
  const expect = async (label: string, actual: Promise<boolean>, want: boolean): Promise<void> => {
    if ((await actual) !== want) {
      failures.push(label);
    }
  };

  // Positive grants: router reserves, settlement releases.
  await expect(
    "claimRegistry missing ROUTER_ROLE -> router",
    claimRegistry.read.hasRole([ROLES.ROUTER_ROLE, a.router]),
    true,
  );
  await expect(
    "claimRegistry missing SETTLEMENT_ROLE -> settlementManager",
    claimRegistry.read.hasRole([ROLES.SETTLEMENT_ROLE, a.settlementManager]),
    true,
  );
  await expect(
    "settlementManager missing ROUTER_ROLE -> router",
    settlement.read.hasRole([ROLES.ROUTER_ROLE, a.router]),
    true,
  );
  for (const [name, vault] of [
    ["stableVault", stableVault],
    ["flexVault", flexVault],
  ] as const) {
    await expect(
      `${name} missing ROUTER_ROLE -> router`,
      vault.read.hasRole([ROLES.ROUTER_ROLE, a.router]),
      true,
    );
    await expect(
      `${name} missing SETTLEMENT_ROLE -> settlementManager`,
      vault.read.hasRole([ROLES.SETTLEMENT_ROLE, a.settlementManager]),
      true,
    );
  }

  // Registrations.
  await expect(
    "stableVault not registered",
    vaultRegistry.read.isRegistered([a.stableVault]),
    true,
  );
  await expect("stableVault not active", vaultRegistry.read.isActive([a.stableVault]), true);
  await expect("flexVault not registered", vaultRegistry.read.isRegistered([a.flexVault]), true);
  await expect("flexVault not active", vaultRegistry.read.isActive([a.flexVault]), true);

  // Reserve/release separation (spot negatives; full enumeration is in verify.ts).
  if (a.router.toLowerCase() === a.settlementManager.toLowerCase()) {
    failures.push("router == settlementManager (reserve and release must be different addresses)");
  }
  for (const [name, target] of [
    ["claimRegistry", claimRegistry],
    ["stableVault", stableVault],
    ["flexVault", flexVault],
    ["settlementManager", settlement],
  ] as const) {
    await expect(
      `${name} unexpectedly grants SETTLEMENT_ROLE -> router`,
      target.read.hasRole([ROLES.SETTLEMENT_ROLE, a.router]),
      false,
    );
    await expect(
      `${name} unexpectedly grants ROUTER_ROLE -> settlementManager`,
      target.read.hasRole([ROLES.ROUTER_ROLE, a.settlementManager]),
      false,
    );
    for (const source of a.sources) {
      await expect(
        `${name} unexpectedly grants ROUTER_ROLE -> obligor ${source}`,
        target.read.hasRole([ROLES.ROUTER_ROLE, source]),
        false,
      );
      await expect(
        `${name} unexpectedly grants SETTLEMENT_ROLE -> obligor ${source}`,
        target.read.hasRole([ROLES.SETTLEMENT_ROLE, source]),
        false,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Wiring assertion failed (${String(failures.length)}):\n - ${failures.join("\n - ")}`,
    );
  }
}
