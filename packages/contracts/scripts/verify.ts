import { network } from "hardhat";
import { getAddress, type Address, type Hex } from "viem";
import { assertChainId } from "./lib/network-guard.js";
import { assertWiring } from "./lib/assert-wiring.js";
import { readManifest } from "./lib/read-manifest.js";
import { ROLES, CLAIM_STATE, CLAIM_TYPE } from "../config/constants.js";
import { STABLE_MANDATE, FLEX_MANDATE, type VaultMandate } from "../config/vault-mandates.js";
import { ALICE_CLAIMS, REQUEST_A, REQUEST_B, claimIdFor } from "../config/demo.js";
import { ALLOWED_CHAIN_IDS, ZERO_ADDRESS } from "./lib/constants.js";

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
  if (manifest === undefined || manifest.addresses.mockUsdt === ZERO_ADDRESS) {
    throw new Error(`No deployment for chainId ${String(chainId)} — run deploy first.`);
  }
  const fromBlock = BigInt(manifest.deploymentBlock);

  const usdt = await viem.getContractAt("MockUSDT", manifest.addresses.mockUsdt);
  const claimRegistry = await viem.getContractAt("ClaimRegistry", manifest.addresses.claimRegistry);
  const stableVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.stableVault);
  const flexVault = await viem.getContractAt("LiquidityVault", manifest.namedVaults.flexVault);

  const failures: string[] = [];
  const check = (label: string, ok: boolean): void => {
    if (!ok) failures.push(label);
    console.log(`  [${ok ? "ok" : "FAIL"}] ${label}`);
  };

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
    });
    check("wiring assertions (roles + registrations + separation spot-checks)", true);
  } catch (error: unknown) {
    check(`wiring: ${error instanceof Error ? error.message : String(error)}`, false);
  }

  // 2. Role-holder enumeration (RoleGranted − RoleRevoked) — a true separation-invariant check.
  const holdersOf = async (
    contract: typeof claimRegistry | typeof stableVault,
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

  // 3. Mandates match the typed config exactly.
  const compareMandate = (name: string, onChain: MandateView, want: VaultMandate): void => {
    check(
      `${name} mandate matches config`,
      onChain.supportedTypesBitmap === want.supportedTypesBitmap &&
        onChain.baseDiscountBps === want.baseDiscountBps &&
        onChain.durationBpsPerDay === want.durationBpsPerDay &&
        onChain.maxDurationDays === want.maxDurationDays &&
        onChain.minFace === want.minFace &&
        onChain.maxFace === want.maxFace &&
        onChain.liquidityCap === want.liquidityCap &&
        onChain.claimTypePremiumBps.length === want.claimTypePremiumBps.length &&
        want.claimTypePremiumBps.every((v, i) => onChain.claimTypePremiumBps[i] === v),
    );
  };
  compareMandate("stableVault", await stableVault.read.getMandate(), STABLE_MANDATE);
  compareMandate("flexVault", await flexVault.read.getMandate(), FLEX_MANDATE);

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
    check(`${name}Source funded`, (await usdt.read.balanceOf([source as Address])) > 0n);
  }

  // 5. Alice's three claims exist, ELIGIBLE, with the configured params.
  let issuer: Address | undefined;
  const dueDates = new Map<string, bigint>();
  for (const claim of ALICE_CLAIMS) {
    const claimId = claimIdFor(claim.label);
    const c = await claimRegistry.read
      .getClaim([claimId])
      .then((v) => v)
      .catch(() => undefined);
    if (c === undefined) {
      check(`claim ${claim.label} exists`, false);
      continue;
    }
    issuer ??= getAddress(c.issuer);
    dueDates.set(claim.label, c.dueDate);
    check(
      `claim ${claim.label} ELIGIBLE with configured face/type`,
      c.state === CLAIM_STATE.ELIGIBLE &&
        c.faceValue === claim.faceValue &&
        c.claimType === claim.claimType,
    );
  }

  // 6. Issuer allowlist (no getter → quoteAndCheck.ok) + A/B calibration feasibility.
  if (issuer === undefined) {
    check("calibration: issuer resolvable from Alice's claims", false);
  } else {
    const payrollDue = dueDates.get("alice-payroll");
    const streamDue = dueDates.get("alice-stream");
    if (payrollDue === undefined || streamDue === undefined) {
      check("calibration: payroll + stream claims present", false);
    } else {
      // Allowlist proof on both vaults.
      const [stableOk] = await stableVault.read.quoteAndCheck([
        issuer,
        CLAIM_TYPE.PAYROLL,
        STABLE_MANDATE.minFace,
        payrollDue,
      ]);
      const [flexOk] = await flexVault.read.quoteAndCheck([
        issuer,
        CLAIM_TYPE.PAYROLL,
        FLEX_MANDATE.minFace,
        payrollDue,
      ]);
      check("issuer allowed on stableVault (quoteAndCheck.ok)", stableOk);
      check("issuer allowed on flexVault (quoteAndCheck.ok)", flexOk);

      // Request A: one partial payroll slice on Stable (<= maxTotalFace < claim face) covers target.
      const [okA, advA] = await stableVault.read.quoteAndCheck([
        issuer,
        CLAIM_TYPE.PAYROLL,
        REQUEST_A.maxTotalFace,
        payrollDue,
      ]);
      check(
        "request A: one partial payroll slice on Stable >= targetAdvance",
        okA && advA >= REQUEST_A.targetAdvance,
      );

      // Request B: no single (claim, eligible vault) advance reaches targetB.
      let maxSingle = 0n;
      for (const claim of ALICE_CLAIMS) {
        const due = dueDates.get(claim.label);
        if (due === undefined) continue;
        for (const vault of [stableVault, flexVault]) {
          const [ok, adv] = await vault.read.quoteAndCheck([
            issuer,
            claim.claimType,
            claim.faceValue,
            due,
          ]);
          if (ok && adv > maxSingle) maxSingle = adv;
        }
      }
      check(
        "request B: no single claim advance reaches targetAdvance",
        maxSingle < REQUEST_B.targetAdvance,
      );

      // Request B: the named payroll+stream pair on Stable does reach it.
      const [, advPayroll] = await stableVault.read.quoteAndCheck([
        issuer,
        CLAIM_TYPE.PAYROLL,
        ALICE_CLAIMS[0].faceValue,
        payrollDue,
      ]);
      const [, advStream] = await stableVault.read.quoteAndCheck([
        issuer,
        CLAIM_TYPE.STREAM,
        ALICE_CLAIMS[2].faceValue,
        streamDue,
      ]);
      check(
        "request B: payroll + stream pair on Stable >= targetAdvance",
        advPayroll + advStream >= REQUEST_B.targetAdvance,
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

interface MandateView {
  supportedTypesBitmap: number;
  baseDiscountBps: number;
  durationBpsPerDay: number;
  maxDurationDays: number;
  minFace: bigint;
  maxFace: bigint;
  liquidityCap: bigint;
  claimTypePremiumBps: readonly number[];
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
