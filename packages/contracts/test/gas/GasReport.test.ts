import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseUnits, getAddress, type Address, type Hex } from "viem";
import { deployProtocol } from "../helpers/fixtures.js";

function leg(claimId: Hex, vault: Address, faceAmount: bigint) {
  return { claimId, vault: getAddress(vault), faceAmount, minimumAdvanceAmount: 0n };
}

describe("Gas report", () => {
  it("records gas for registerClaim, executeRoute (1 & 2 legs), settleClaim", async () => {
    const ctx = await deployProtocol();
    const {
      publicClient,
      claimRegistry,
      router,
      settlement,
      vault,
      usdt,
      networkHelpers,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;

    const gasOf = async (hash: Hex): Promise<bigint> =>
      (await publicClient.waitForTransactionReceipt({ hash })).gasUsed;

    // registerClaim (measured inside the helper)
    const c1 = await createEligibleClaim({ label: "gas1", faceValue: parseUnits("1000", 6) });
    const gRegister = await gasOf(c1.registerHash);

    // executeRoute — 1 leg
    const r1 = {
      user: getAddress(accounts.user.account.address),
      targetAdvance: 1n,
      maxTotalFace: parseUnits("1000000", 6),
      deadline: now + 3_600n,
      nonce: 0n,
      legs: [leg(c1.claimId, vault.address, c1.faceValue)],
    };
    const gRoute1 = await gasOf(
      await router.write.executeRoute([r1, await signRoute(r1)], {
        account: accounts.user.account,
      }),
    );

    // executeRoute — 2 legs (fresh claims, user nonce 1)
    const c2 = await createEligibleClaim({ label: "gas2a", faceValue: parseUnits("500", 6) });
    const c3 = await createEligibleClaim({ label: "gas2b", faceValue: parseUnits("300", 6) });
    const r2 = {
      user: getAddress(accounts.user.account.address),
      targetAdvance: 1n,
      maxTotalFace: parseUnits("1000000", 6),
      deadline: now + 3_600n,
      nonce: 1n,
      legs: [
        leg(c2.claimId, vault.address, c2.faceValue),
        leg(c3.claimId, vault.address, c3.faceValue),
      ],
    };
    const gRoute2 = await gasOf(
      await router.write.executeRoute([r2, await signRoute(r2)], {
        account: accounts.user.account,
      }),
    );

    // settleClaim (settle the first, fully-funded claim)
    await networkHelpers.time.increase(31 * 86_400);
    await claimRegistry.write.markMatured([c1.claimId]);
    await usdt.write.mint([accounts.issuer.account.address, c1.faceValue]);
    await usdt.write.approve([settlement.address, c1.faceValue], {
      account: accounts.issuer.account,
    });
    const gSettle = await gasOf(
      await settlement.write.settleClaim([c1.claimId], { account: accounts.issuer.account }),
    );

    const rows: [string, bigint, bigint][] = [
      ["registerClaim", gRegister, 280_000n],
      ["executeRoute (1 leg)", gRoute1, 430_000n],
      ["executeRoute (2 legs)", gRoute2, 620_000n],
      ["settleClaim (1 vault)", gSettle, 180_000n],
    ];

    const body =
      "# Gas Report\n\n" +
      "Measured on the in-process Hardhat network (evm: cancun, optimizer runs 200).\n" +
      "Regenerate with `pnpm --filter @matura/contracts contracts:test`.\n\n" +
      "| Operation | Gas used |\n| --- | ---: |\n" +
      rows.map(([name, gas]) => `| ${name} | ${gas.toString()} |`).join("\n") +
      "\n";
    // Only rewrite the tracked report when explicitly requested, so `contracts:test` doesn't dirty
    // the working tree on every run: `WRITE_GAS_REPORT=1 pnpm --filter @matura/contracts contracts:test`.
    if (process.env.WRITE_GAS_REPORT) {
      const outPath = join(
        dirname(fileURLToPath(import.meta.url)),
        "../../../../docs/gas-report.md",
      );
      writeFileSync(outPath, body);
    }

    // Loose upper bounds so the report cannot silently regress.
    for (const [name, gas, ceiling] of rows) {
      assert.ok(
        gas < ceiling,
        `${name} gas ${gas.toString()} exceeded ceiling ${ceiling.toString()}`,
      );
    }
  });
});
