import { network } from "hardhat";
import { getAddress, type Address, type Hex } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { assertWiring } from "./lib/assert-wiring.js";
import { ROLES, CLAIM_STATE, CLAIM_TYPE } from "../config/constants.js";
import { STABLE_MANDATE, FLEX_MANDATE } from "../config/vault-mandates.js";
import { compareMandate } from "./lib/assert-mandate.js";
import { createChecklist } from "./lib/checklist.js";
import {
  ALICE_CLAIMS,
  REQUEST_A,
  REQUEST_B,
  expectedFace,
  resolveClaimId,
  type ClaimSource,
} from "../config/demo.js";
import { ALLOWED_CHAIN_IDS } from "./lib/constants.js";
import { readManifest, manifestAddresses, isManifestDeployed } from "./lib/read-manifest.js";
import { isRevertNamed } from "./lib/revert.js";

/// Read-only verification of a seeded Matura chain. Exits non-zero on any failure. Confirms: both
/// vault mandates, balances, the role wiring + reserve/release separation invariant (via
/// RoleGranted/RoleRevoked enumeration), the issuer allowlist, Alice's three eligible claims, and
/// the A/B calibration feasibility (all pricing via live `quoteAndCheck`, never re-derived in TS).
///   verify:local        -> hardhat run scripts/verify.ts --network localhost
///   verify:bsc-testnet  -> hardhat run scripts/verify.ts --network bscTestnet
async function main(): Promise<void> {
  const connection = await network.create();
  const { viem } = connection;
  const publicClient = await viem.getPublicClient();
  const chainId = await assertChainId(publicClient, ALLOWED_CHAIN_IDS);

  const manifest = readManifest(chainId);
  if (manifest === undefined || !isManifestDeployed(manifest)) {
    throw new Error(`No complete deployment for chainId ${String(chainId)} — run deploy first.`);
  }
  // Liveness probe: every manifest address (core + vaults + sources) must have code on this chain.
  for (const address of manifestAddresses(manifest)) {
    const code = await publicClient.getCode({ address });
    if (code === undefined || code === "0x") {
      throw new Error(
        `No contract code at ${address} on chainId ${String(chainId)} (node restarted?).`,
      );
    }
  }
  const fromBlock = BigInt(manifest.deploymentBlock);

  const usdt = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const stableVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.stableVault);
  const flexVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.flexVault);
  const settlementContract = await viem.getContractAt(
    "SettlementManager",
    manifest.addresses.settlementManager,
  );
  const vaultRegistry = await viem.getContractAt("VaultRegistry", manifest.addresses.vaultRegistry);

  const { check, failures } = createChecklist();

  // 1. Wiring + reserve/release separation (spot checks; enumeration below).
  try {
    await assertWiring(viem, {
      claimRegistry: manifest.addresses.claimRegistry,
      settlementManager: manifest.addresses.settlementManager,
      router: manifest.addresses.router,
      vaultRegistry: manifest.addresses.vaultRegistry,
      stableVault: manifest.namedVaults.stableVault,
      flexVault: manifest.namedVaults.flexVault,
      sources: [manifest.sources.payroll, manifest.sources.freelance, manifest.sources.stream],
      sourceRegistrars: [manifest.sources.freelance, manifest.sources.stream],
    });
    check("wiring assertions (roles + registrations + separation spot-checks)", true);
  } catch (error: unknown) {
    check(`wiring: ${error instanceof Error ? error.message : String(error)}`, false);
  }

  // 2. Role-holder enumeration (RoleGranted − RoleRevoked) — a true separation-invariant check.
  const holdersOf = async (
    contract:
      typeof claimRegistry | typeof stableVault | typeof settlementContract | typeof vaultRegistry,
    role: Hex,
  ): Promise<Set<string>> => {
    const granted = await contract.getEvents.RoleGranted(
      { role },
      { fromBlock, toBlock: "latest" },
    );
    const revoked = await contract.getEvents.RoleRevoked(
      { role },
      { fromBlock, toBlock: "latest" },
    );
    const holders = new Set<string>();
    for (const log of granted) {
      if (log.args.account !== undefined) holders.add(getAddress(log.args.account));
    }
    for (const log of revoked) {
      if (log.args.account !== undefined) holders.delete(getAddress(log.args.account));
    }
    return holders;
  };
  const router = getAddress(manifest.addresses.router);
  const settlement = getAddress(manifest.addresses.settlementManager);
  const eq = (set: Set<string>, want: readonly string[]): boolean =>
    set.size === want.length && want.every((a) => set.has(getAddress(a)));

  for (const [name, contract] of [
    ["claimRegistry", claimRegistry],
    ["stableVault", stableVault],
    ["flexVault", flexVault],
  ] as const) {
    check(
      `${name} ROUTER_ROLE holders == {router}`,
      eq(await holdersOf(contract, ROLES.ROUTER_ROLE), [router]),
    );
    check(
      `${name} SETTLEMENT_ROLE holders == {settlement}`,
      eq(await holdersOf(contract, ROLES.SETTLEMENT_ROLE), [settlement]),
    );
  }
  // settlementManager's ROUTER_ROLE gates registerAllocation — a second holder could forge
  // settlement allocations, so pin it to exactly {router} too (P2-4).
  check(
    "settlementManager ROUTER_ROLE holders == {router}",
    eq(await holdersOf(settlementContract, ROLES.ROUTER_ROLE), [router]),
  );
  // SOURCE_REGISTRAR_ROLE holders must be EXACTLY the two adapters — a stray grant to any other
  // address would let it mint claims (bounded to its own issuer identity, but still a second writer).
  // assert-wiring only spot-checks the known sources; enumerate the full set here for parity.
  check(
    "claimRegistry SOURCE_REGISTRAR_ROLE holders == {freelance, stream}",
    eq(await holdersOf(claimRegistry, ROLES.SOURCE_REGISTRAR_ROLE), [
      getAddress(manifest.sources.freelance),
      getAddress(manifest.sources.stream),
    ]),
  );

  // DEFAULT_ADMIN_ROLE holders can grant/revoke the roles above at will, so the separation is only
  // an invariant if admin is a single, expected EOA and no protocol contract holds it (P2-4).
  const protocolAddrs = new Set<string>(manifestAddresses(manifest).map((a) => getAddress(a)));
  let adminAddr: string | undefined;
  for (const [name, contract] of [
    ["claimRegistry", claimRegistry],
    ["stableVault", stableVault],
    ["flexVault", flexVault],
    ["settlementManager", settlementContract],
    ["vaultRegistry", vaultRegistry],
  ] as const) {
    const admins = await holdersOf(contract, ROLES.DEFAULT_ADMIN_ROLE);
    check(`${name} DEFAULT_ADMIN_ROLE has exactly one holder`, admins.size === 1);
    const [only] = [...admins];
    if (only !== undefined) {
      adminAddr ??= only;
      check(`${name} DEFAULT_ADMIN_ROLE holder consistent across contracts`, only === adminAddr);
      check(
        `${name} DEFAULT_ADMIN_ROLE holder is an EOA (not a protocol contract)`,
        !protocolAddrs.has(only),
      );
    }
  }

  // 3. Mandates match the typed config exactly (deployed config == tested config). The field-by-field
  //    comparison lives in `lib/assert-mandate.ts`, shared with `check-deployment.ts`.
  check(
    "stableVault mandate matches config",
    compareMandate(await stableVault.read.getMandate(), STABLE_MANDATE),
  );
  check(
    "flexVault mandate matches config",
    compareMandate(await flexVault.read.getMandate(), FLEX_MANDATE),
  );

  // 4. Balances funded.
  check(
    "stableVault balance >= liquidityCap",
    (await usdt.read.balanceOf([manifest.namedVaults.stableVault])) >= STABLE_MANDATE.liquidityCap,
  );
  check(
    "flexVault balance >= liquidityCap",
    (await usdt.read.balanceOf([manifest.namedVaults.flexVault])) >= FLEX_MANDATE.liquidityCap,
  );
  for (const [name, source] of Object.entries(manifest.sources)) {
    check(`${name}Source funded`, (await usdt.read.balanceOf([source])) > 0n);
  }

  // 5. Alice's three claims exist, ELIGIBLE, with the expected face/type — and each carries its OWN
  //    issuer (payroll = the signing issuer; freelance/stream = the adapter itself). The stream face
  //    is read from chain (vested-at-registration), not asserted against a fixed config value.
  interface ClaimInfo {
    readonly claim: ClaimSource;
    readonly issuer: Address;
    readonly dueDate: bigint;
    readonly face: bigint;
  }
  const infos = new Map<string, ClaimInfo>();
  for (const claim of ALICE_CLAIMS) {
    const claimId = resolveClaimId(claim, manifest.sources);
    const c = await claimRegistry.read.getClaim([claimId]).catch((error: unknown) => {
      if (isRevertNamed(error, "ClaimNotFound")) return undefined;
      throw error;
    });
    if (c === undefined) {
      check(`claim ${claim.label} exists`, false);
      continue;
    }
    // Exact face for signed/escrow (config-fixed); for a stream the face is vested-at-registration,
    // so assert it lands in a tolerance band around the expected vesting fraction rather than >0
    // (catches a vesting-math/rounding regression while tolerating a few blocks of registration jitter).
    const wantFace = expectedFace(claim);
    let faceOk: boolean;
    if (wantFace !== undefined) {
      faceOk = c.faceValue === wantFace;
    } else if (claim.kind === "stream") {
      const expected = (claim.deposit * BigInt(claim.startOffsetDays)) / BigInt(claim.durationDays);
      const tol = expected / 20n; // ±5% band absorbs the block-timestamp jitter at registration
      faceOk = c.faceValue >= expected - tol && c.faceValue <= expected + tol;
    } else {
      faceOk = c.faceValue > 0n;
    }
    check(
      `claim ${claim.label} ELIGIBLE with expected face/type`,
      c.state === CLAIM_STATE.ELIGIBLE && c.claimType === claim.claimType && faceOk,
    );
    infos.set(claim.label, {
      claim,
      issuer: getAddress(c.issuer),
      dueDate: c.dueDate,
      face: c.faceValue,
    });
  }

  // 6. Per-issuer allowlist proof + A/B feasibility. Each claim carries its OWN issuer now (payroll
  //    = the signing issuer; freelance/stream = the adapter), so a single calibration issuer is
  //    WRONG. `quoteAndCheck.ok` conflates allowlist + type-support + bounds, so to ISOLATE the
  //    allowlist we probe every issuer with a canonical PAYROLL/minFace combo both vaults support
  //    (claim-type-specific financeability is covered by the A/B calibration below).
  const payroll = infos.get("alice-payroll");
  if (payroll === undefined) {
    check("calibration: payroll claim present", false);
  } else {
    for (const info of infos.values()) {
      for (const [vname, vault, minFace] of [
        ["stableVault", stableVault, STABLE_MANDATE.minFace],
        ["flexVault", flexVault, FLEX_MANDATE.minFace],
      ] as const) {
        const [ok] = await vault.read.quoteAndCheck([
          info.issuer,
          CLAIM_TYPE.PAYROLL,
          minFace,
          payroll.dueDate,
        ]);
        check(`issuer of ${info.claim.label} allowlisted on ${vname}`, ok);
      }
    }

    // Request A: one partial payroll slice on Stable (<= maxTotalFace < claim face) covers target.
    const [okA, advA] = await stableVault.read.quoteAndCheck([
      payroll.issuer,
      CLAIM_TYPE.PAYROLL,
      REQUEST_A.maxTotalFace,
      payroll.dueDate,
    ]);
    check(
      "request A: one partial payroll slice on Stable >= targetAdvance",
      okA && advA >= REQUEST_A.targetAdvance,
    );

    // Request B: no single (claim, eligible vault) advance reaches targetB — each with its issuer.
    let maxSingle = 0n;
    for (const info of infos.values()) {
      for (const vault of [stableVault, flexVault]) {
        const [ok, adv] = await vault.read.quoteAndCheck([
          info.issuer,
          info.claim.claimType,
          info.face,
          info.dueDate,
        ]);
        if (ok && adv > maxSingle) maxSingle = adv;
      }
    }
    check(
      "request B: no single claim advance reaches targetAdvance",
      maxSingle < REQUEST_B.targetAdvance,
    );

    // Request B: the eligible claim set (derived from REQUEST_B.eligibleClaims — payroll + freelance)
    // each financed on its cheapest ALLOWED vault (payroll → Stable is cheapest; freelance is
    // FREELANCE_ESCROW, so Flex-only), fits maxTotalFace, and together reaches targetAdvance. The route
    // spans two vaults — the best-execution story. Derived from config so it can't drift from the request.
    const bClaims = REQUEST_B.eligibleClaims
      .map((label) => infos.get(label))
      .filter((info): info is ClaimInfo => info !== undefined);
    if (bClaims.length !== REQUEST_B.eligibleClaims.length) {
      check("request B: all eligible claims present", false);
    } else {
      let totalFace = 0n;
      let totalAdvance = 0n;
      let allFinanceable = true;
      for (const info of bClaims) {
        let bestAdvance = 0n;
        let financeable = false;
        for (const vault of [stableVault, flexVault]) {
          const [ok, adv] = await vault.read.quoteAndCheck([
            info.issuer,
            info.claim.claimType,
            info.face,
            info.dueDate,
          ]);
          if (ok && adv > bestAdvance) {
            bestAdvance = adv;
            financeable = true;
          }
        }
        if (!financeable) allFinanceable = false;
        totalFace += info.face;
        totalAdvance += bestAdvance;
      }
      check(
        "request B: eligible claims each financeable on an allowed vault, within maxTotalFace, reaching targetAdvance",
        allFinanceable &&
          totalFace <= REQUEST_B.maxTotalFace &&
          totalAdvance >= REQUEST_B.targetAdvance,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Verification FAILED (${String(failures.length)}):\n - ${failures.join("\n - ")}`,
    );
  }
  console.log("\nAll verification checks passed.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
