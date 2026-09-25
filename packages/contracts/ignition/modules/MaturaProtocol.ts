import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { keccak256, toHex } from "viem";
import { STABLE_MANDATE, FLEX_MANDATE, type VaultMandate } from "../../config/vault-mandates.js";

// Role identifiers — keccak256(toHex("X")) is byte-identical to Solidity keccak256("X").
const ROUTER_ROLE = keccak256(toHex("ROUTER_ROLE"));
const SETTLEMENT_ROLE = keccak256(toHex("SETTLEMENT_ROLE"));

/// The `as const` config mandates are deeply readonly; Ignition constructor args must be mutable
/// Solidity parameters, so materialize a mutable copy (the config stays the single typed source).
function mandateArg(mandate: VaultMandate) {
  return { ...mandate, claimTypePremiumBps: [...mandate.claimTypePremiumBps] };
}

/// Deploys the full Matura protocol, wires AccessControl roles, registers both demo vaults, and
/// sets the treasury. Every duplicated contract/call carries a unique `id`.
///
/// Declarative deploy + wiring ONLY. Issuer registration, vault funding, and demo claims are
/// imperative + signer-driven, so they live in `scripts/seed.ts` (not here). Wiring assertions
/// are also imperative (a view returning `false` can't revert an Ignition future) — see
/// `scripts/deploy.ts` + `scripts/lib/assert-wiring.ts`.
///
/// Parameterized for production: pass a `--parameters` file to override `admin` / `treasury`
/// (e.g. a multisig admin/treasury — see docs/threat-model.md). Mandates come from the typed
/// `config/vault-mandates.ts` (the single source shared with tests + verify).
/// Deploy: `hardhat ignition deploy ignition/modules/MaturaProtocol.ts --network bscTestnet`.
export default buildModule("MaturaProtocol", (m) => {
  const deployer = m.getAccount(0);
  const admin = m.getParameter("admin", deployer);
  const treasury = m.getParameter("treasury", deployer);

  // --- Core contracts (dependency order) ---
  const usdt = m.contract("MockUSDT", []);
  const issuerRegistry = m.contract("IssuerRegistry", [admin]);
  const claimRegistry = m.contract("ClaimRegistry", [admin, issuerRegistry, usdt]);
  const vaultRegistry = m.contract("VaultRegistry", [admin]);
  const settlement = m.contract("SettlementManager", [admin, claimRegistry, usdt]);
  const router = m.contract("MaturaRouter", [
    admin,
    claimRegistry,
    vaultRegistry,
    issuerRegistry,
    settlement,
    usdt,
  ]);

  // --- Two named vaults ---
  const stableVault = m.contract("LiquidityVault", [admin, usdt, mandateArg(STABLE_MANDATE)], {
    id: "StableVault",
  });
  const flexVault = m.contract("LiquidityVault", [admin, usdt, mandateArg(FLEX_MANDATE)], {
    id: "FlexVault",
  });

  // --- Three self-paying source-simulator obligors ---
  const payrollSource = m.contract("SourceObligor", [usdt, settlement, claimRegistry], {
    id: "PayrollSource",
  });
  const freelanceSource = m.contract("SourceObligor", [usdt, settlement, claimRegistry], {
    id: "FreelanceSource",
  });
  const streamSource = m.contract("SourceObligor", [usdt, settlement, claimRegistry], {
    id: "StreamSource",
  });

  // --- Role wiring (auto-ordered: the router/settlement futures are the call args) ---
  m.call(claimRegistry, "grantRole", [ROUTER_ROLE, router], { id: "cr_grant_router" });
  m.call(claimRegistry, "grantRole", [SETTLEMENT_ROLE, settlement], { id: "cr_grant_settlement" });
  m.call(settlement, "grantRole", [ROUTER_ROLE, router], { id: "sm_grant_router" });
  m.call(stableVault, "grantRole", [ROUTER_ROLE, router], { id: "stable_grant_router" });
  m.call(stableVault, "grantRole", [SETTLEMENT_ROLE, settlement], {
    id: "stable_grant_settlement",
  });
  m.call(flexVault, "grantRole", [ROUTER_ROLE, router], { id: "flex_grant_router" });
  m.call(flexVault, "grantRole", [SETTLEMENT_ROLE, settlement], { id: "flex_grant_settlement" });

  // --- Registrations (grant both roles BEFORE registering — no unsettleable-claim window) ---
  m.call(vaultRegistry, "registerVault", [stableVault], { id: "register_stable" });
  m.call(vaultRegistry, "registerVault", [flexVault], { id: "register_flex" });
  m.call(settlement, "setTreasury", [treasury], { id: "sm_set_treasury" });

  return {
    usdt,
    issuerRegistry,
    claimRegistry,
    vaultRegistry,
    settlement,
    router,
    stableVault,
    flexVault,
    payrollSource,
    freelanceSource,
    streamSource,
  };
});
