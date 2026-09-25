import { network } from "hardhat";
import { getAddress, parseUnits, type Address, type Hex } from "viem";
import { ROLES } from "./constants.js";
import {
  CLAIM_ATTESTATION_TYPES,
  EXECUTION_ROUTE_TYPES,
  claimRegistryDomain,
  routerDomain,
} from "./eip712.js";
import { DEMO_MANDATE } from "../../config/demo-mandate.js";

/// Demo vault mandate used across tests — re-exported from the shared config so tests and the
/// Ignition deploy module use the exact same mandate.
export const demoMandate = DEMO_MANDATE;

interface RouteLegInput {
  claimId: Hex;
  vault: Address;
  faceAmount: bigint;
  minimumAdvanceAmount: bigint;
}
interface RouteInput {
  user: Address;
  targetAdvance: bigint;
  maxTotalFace: bigint;
  deadline: bigint;
  nonce: bigint;
  legs: RouteLegInput[];
}

/// AUTHORITATIVE constructor signatures (every contract MUST match these):
///   MockUSDT()
///   IssuerRegistry(address admin)
///   ClaimRegistry(address admin, address issuerRegistry, address settlementToken)
///   VaultRegistry(address admin)
///   LiquidityVault(address admin, address token, ILiquidityVault.Mandate mandate)
///   SettlementManager(address admin, address claimRegistry, address token)
///   MaturaRouter(address admin, address claimRegistry, address vaultRegistry,
///                address issuerRegistry, address settlementManager, address token)
///
/// Deploys the full protocol, wires roles, registers + seeds one demo vault, registers a default
/// issuer (signer = issuerSigner) and allowlists it on the vault, and returns typed handles plus
/// claim/route signing helpers.
export async function deployProtocol() {
  const connection = await network.create();
  const { viem, networkHelpers } = connection;
  const publicClient = await viem.getPublicClient();
  const wallets = await viem.getWalletClients();
  // Narrow the seven demo wallets once (noUncheckedIndexedAccess makes array access `| undefined`);
  // the EDR dev network always provides 20, so this is a type guard, not a runtime expectation.
  // Assigning to fresh consts gives them a non-`undefined` *declared* type, so nested closures
  // (createEligibleClaim/signRoute) capture `WalletClient`, not `WalletClient | undefined`.
  const [w0, w1, w2, w3, w4, w5, w6] = wallets;
  if (
    w0 === undefined ||
    w1 === undefined ||
    w2 === undefined ||
    w3 === undefined ||
    w4 === undefined ||
    w5 === undefined ||
    w6 === undefined
  ) {
    throw new Error("Expected at least 7 wallet clients from the test network.");
  }
  const admin = w0;
  const issuerSigner = w1;
  const user = w2;
  const beneficiary = w3;
  const treasury = w4;
  const other = w5;
  const issuer = w6;

  const usdt = await viem.deployContract("MockUSDT", []);
  const issuerRegistry = await viem.deployContract("IssuerRegistry", [admin.account.address]);
  const claimRegistry = await viem.deployContract("ClaimRegistry", [
    admin.account.address,
    issuerRegistry.address,
    usdt.address,
  ]);
  const vaultRegistry = await viem.deployContract("VaultRegistry", [admin.account.address]);
  const settlement = await viem.deployContract("SettlementManager", [
    admin.account.address,
    claimRegistry.address,
    usdt.address,
  ]);
  const router = await viem.deployContract("MaturaRouter", [
    admin.account.address,
    claimRegistry.address,
    vaultRegistry.address,
    issuerRegistry.address,
    settlement.address,
    usdt.address,
  ]);
  const vault = await viem.deployContract("LiquidityVault", [
    admin.account.address,
    usdt.address,
    demoMandate,
  ]);

  // Role wiring (admin holds DEFAULT_ADMIN_ROLE on every contract).
  await claimRegistry.write.grantRole([ROLES.ROUTER_ROLE, router.address]);
  await claimRegistry.write.grantRole([ROLES.SETTLEMENT_ROLE, settlement.address]);
  await vault.write.grantRole([ROLES.ROUTER_ROLE, router.address]);
  await vault.write.grantRole([ROLES.SETTLEMENT_ROLE, settlement.address]);
  await settlement.write.grantRole([ROLES.ROUTER_ROLE, router.address]);
  await vaultRegistry.write.registerVault([vault.address]);
  await settlement.write.setTreasury([treasury.account.address]);

  // Default issuer + vault allowlist so the stack is route-ready.
  await issuerRegistry.write.registerIssuer([
    issuer.account.address,
    issuerSigner.account.address,
    toBytes32("meta"),
  ]);
  await vault.write.setIssuerAllowed([issuer.account.address, true]);

  // Seed vault liquidity (admin mint).
  await usdt.write.mint([vault.address, demoMandate.liquidityCap]);

  const chainId = await publicClient.getChainId();
  const now = BigInt(await networkHelpers.time.latest());

  let attNonce = 0n;

  /// Sign, register, and mark ELIGIBLE a claim from the default issuer. Returns the claimId.
  async function createEligibleClaim(params: {
    label: string;
    faceValue: bigint;
    beneficiary?: Address;
    dueDate?: bigint;
    claimType?: number;
  }): Promise<{ claimId: Hex; faceValue: bigint; registerHash: Hex }> {
    const claimId = toBytes32(params.label);
    const att = {
      claimId,
      issuer: getAddress(issuer.account.address),
      beneficiary: getAddress(params.beneficiary ?? user.account.address),
      token: getAddress(usdt.address),
      faceValue: params.faceValue,
      dueDate: params.dueDate ?? now + 30n * 86_400n,
      claimType: params.claimType ?? 0,
      externalIdHash: toBytes32(`ext-${params.label}`),
      evidenceHash: toBytes32(`ev-${params.label}`),
      signerEpoch: 0n,
      nonce: attNonce++,
      deadline: now + 3_600n,
    };
    const sig = await issuerSigner.signTypedData({
      account: issuerSigner.account,
      domain: claimRegistryDomain(chainId, claimRegistry.address),
      types: CLAIM_ATTESTATION_TYPES,
      primaryType: "ClaimAttestation",
      message: att,
    });
    const registerHash = await claimRegistry.write.registerClaim([att, sig]);
    await claimRegistry.write.markEligible([claimId]);
    return { claimId, faceValue: params.faceValue, registerHash };
  }

  /// Sign an ExecutionRoute with the given wallet client (defaults to `user`).
  async function signRoute(route: RouteInput, signerClient = user): Promise<Hex> {
    return signerClient.signTypedData({
      account: signerClient.account,
      domain: routerDomain(chainId, router.address),
      types: EXECUTION_ROUTE_TYPES,
      primaryType: "ExecutionRoute",
      message: route,
    });
  }

  return {
    connection,
    viem,
    networkHelpers,
    publicClient,
    chainId,
    now,
    accounts: { admin, issuerSigner, user, beneficiary, treasury, other, issuer },
    usdt,
    issuerRegistry,
    claimRegistry,
    vaultRegistry,
    settlement,
    router,
    vault,
    mandate: demoMandate,
    createEligibleClaim,
    signRoute,
  };
}

/// Ceil-division mirror of MaturaPricing's rounding (discount rounds UP).
export function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

interface LegSpec {
  claimId: Hex;
  vault: Address;
  faceAmount: bigint;
  min?: bigint;
}

/// Build an ExecutionRoute with sensible defaults (targetAdvance 1, maxTotalFace 1M, +1h deadline,
/// nonce 0). Override any field via `overrides`.
export function makeRoute(
  user: Address,
  legs: LegSpec[],
  now: bigint,
  overrides: Partial<RouteInput> = {},
): RouteInput {
  return {
    user: getAddress(user),
    targetAdvance: 1n,
    maxTotalFace: parseUnits("1000000", 6),
    deadline: now + 3_600n,
    nonce: 0n,
    legs: legs.map((l) => ({
      claimId: l.claimId,
      vault: getAddress(l.vault),
      faceAmount: l.faceAmount,
      minimumAdvanceAmount: l.min ?? 0n,
    })),
    ...overrides,
  };
}

/// Convenience wrapper for the common single-leg ExecutionRoute (was duplicated verbatim across
/// the route/settlement integration tests).
export function route(
  user: Address,
  claimId: Hex,
  vault: Address,
  faceAmount: bigint,
  now: bigint,
): RouteInput {
  return makeRoute(user, [{ claimId, vault, faceAmount }], now);
}

/// Deterministic bytes32 helper for claimId / externalIdHash / evidenceHash in tests.
export function toBytes32(label: string): `0x${string}` {
  const hex = Buffer.from(label, "utf8").toString("hex").padEnd(64, "0").slice(0, 64);
  return `0x${hex}`;
}

export type DeployedProtocol = Awaited<ReturnType<typeof deployProtocol>>;
