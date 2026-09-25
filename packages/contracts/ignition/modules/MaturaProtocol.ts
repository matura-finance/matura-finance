import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { keccak256, toHex } from "viem";
import { DEMO_MANDATE, LIQUIDITY_CAP } from "../../config/demo-mandate.js";

// Role identifiers — keccak256(toHex("X")) is byte-identical to Solidity keccak256("X").
const ROUTER_ROLE = keccak256(toHex("ROUTER_ROLE"));
const SETTLEMENT_ROLE = keccak256(toHex("SETTLEMENT_ROLE"));

/// Deploys the full Matura P0 protocol, wires AccessControl roles, registers and seeds one demo
/// vault, and sets the treasury. Every duplicated contract/call carries a unique `id`.
///
/// Parameterized for production: pass a `--parameters` file to override `admin`, `treasury`,
/// `mandate`, and `liquidityCap` (e.g. a multisig admin/treasury — see docs/threat-model.md).
/// Defaults target account 0 (the deployer) and the shared DEMO_MANDATE.
/// Deploy: `hardhat ignition deploy ignition/modules/MaturaProtocol.ts --network bscTestnet`.
export default buildModule("MaturaProtocol", (m) => {
  const deployer = m.getAccount(0);
  const admin = m.getParameter("admin", deployer);
  const treasury = m.getParameter("treasury", deployer);
  const mandate = m.getParameter("mandate", DEMO_MANDATE);
  const seedAmount = m.getParameter("liquidityCap", LIQUIDITY_CAP);

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
  const vault = m.contract("LiquidityVault", [admin, usdt, mandate], { id: "DemoVault" });

  // Role wiring (ordered automatically because the router/settlement futures are the call args).
  m.call(claimRegistry, "grantRole", [ROUTER_ROLE, router], { id: "cr_grant_router" });
  m.call(claimRegistry, "grantRole", [SETTLEMENT_ROLE, settlement], { id: "cr_grant_settlement" });
  m.call(vault, "grantRole", [ROUTER_ROLE, router], { id: "vault_grant_router" });
  m.call(vault, "grantRole", [SETTLEMENT_ROLE, settlement], { id: "vault_grant_settlement" });
  m.call(settlement, "grantRole", [ROUTER_ROLE, router], { id: "sm_grant_router" });

  const registered = m.call(vaultRegistry, "registerVault", [vault], { id: "register_vault" });
  m.call(settlement, "setTreasury", [treasury], { id: "sm_set_treasury" });

  // Seed liquidity after the vault is registered (no data dependency links these otherwise).
  m.call(usdt, "mint", [vault, seedAmount], { id: "seed_vault", after: [registered] });

  return { usdt, issuerRegistry, claimRegistry, vaultRegistry, settlement, router, vault };
});
