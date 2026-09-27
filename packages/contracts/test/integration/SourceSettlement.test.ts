import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import { deployProtocol, route } from "../helpers/fixtures.js";
import { CLAIM_STATE } from "../helpers/constants.js";
import {
  assertConservation,
  formatReceipt,
  partyDelta,
  type ClaimSettledFields,
  type PartyBalance,
} from "../../scripts/lib/settlement-receipt.js";

describe("Integration: source settlement + delayed path", () => {
  it("delayed path (unfunded obligor): claim stays DELAYED, principal outstanding, never PAID", async () => {
    const ctx = await deployProtocol();
    const {
      viem,
      router,
      vault,
      usdt,
      claimRegistry,
      settlement,
      networkHelpers,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;

    const face = parseUnits("1000", 6);
    const financed = parseUnits("400", 6); // partially financed → real principal outstanding
    const { claimId } = await createEligibleClaim({ label: "delayed", faceValue: face });

    const r = route(accounts.user.account.address, claimId, vault.address, financed, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    await networkHelpers.time.increase(31 * 86_400);
    await claimRegistry.write.markMatured([claimId]);
    await claimRegistry.write.markDelayed([claimId]);
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.DELAYED);

    // A deliberately UNFUNDED obligor cannot settle the delayed claim — settle reverts on the pull,
    // so "never PAID" is a real guarantee here (not merely test-controlled).
    const obligor = await viem.deployContract("SourceObligor", [
      usdt.address,
      settlement.address,
      claimRegistry.address,
    ]);
    await assert.rejects(obligor.write.settle([claimId], { account: accounts.other.account }));

    // State is unchanged by the reverted settle: still DELAYED, principal still outstanding, not PAID.
    const claim = await claimRegistry.read.getClaim([claimId]);
    assert.equal(claim.state, CLAIM_STATE.DELAYED);
    assert.equal(claim.financedFaceValue, financed); // reserved face preserved (principal outstanding)
    assert.ok((await vault.read.outstandingPrincipal()) > 0n); // vault exposure NOT cleared (advance)
    assert.notEqual(claim.state, CLAIM_STATE.PAID);
  });

  it("settlement conservation holds from the ClaimSettled event; receipt splits vault vs residual", async () => {
    const ctx = await deployProtocol();
    const {
      viem,
      router,
      vault,
      usdt,
      claimRegistry,
      settlement,
      publicClient,
      networkHelpers,
      accounts,
      now,
      createEligibleClaim,
      signRoute,
    } = ctx;

    const face = parseUnits("1000", 6);
    const financed = parseUnits("400", 6);
    const { claimId } = await createEligibleClaim({ label: "settle", faceValue: face });

    const r = route(accounts.user.account.address, claimId, vault.address, financed, now);
    await router.write.executeRoute([r, await signRoute(r)], { account: accounts.user.account });
    await networkHelpers.time.increase(31 * 86_400);

    // A funded obligor pays exactly the face (feeBps == 0).
    const obligor = await viem.deployContract("SourceObligor", [
      usdt.address,
      settlement.address,
      claimRegistry.address,
    ]);
    await usdt.write.mint([obligor.address, face]);

    const parties: PartyBalance[] = [];
    const snapshot = async (label: string, address: `0x${string}`): Promise<void> => {
      parties.push({ label, address, before: await usdt.read.balanceOf([address]), after: 0n });
    };
    await snapshot("obligor", obligor.address);
    await snapshot("vault", vault.address);
    await snapshot("beneficiary", accounts.user.account.address);
    await snapshot("treasury", accounts.treasury.account.address);

    await obligor.write.settle([claimId], { account: accounts.other.account });

    for (const p of parties) p.after = await usdt.read.balanceOf([p.address]);

    // Read the emitted conservation components and verify them via the shared helper.
    const logs = await publicClient.getContractEvents({
      address: settlement.address,
      abi: settlement.abi,
      eventName: "ClaimSettled",
    });
    const ev = logs.at(-1);
    assert.ok(ev !== undefined);
    const { amountReceived, vaultDistribution, userResidual, protocolFee } = ev.args;
    assert.ok(
      amountReceived !== undefined &&
        vaultDistribution !== undefined &&
        userResidual !== undefined &&
        protocolFee !== undefined,
    );
    const settled: ClaimSettledFields = {
      amountReceived,
      vaultDistribution,
      userResidual,
      protocolFee,
    };
    assertConservation(settled); // amountReceived == vaultDistribution + userResidual + protocolFee

    assert.equal(vaultDistribution, financed); // vault gets its financed slice
    assert.equal(userResidual, face - financed); // beneficiary (Alice) gets the residual
    assert.equal(protocolFee, 0n);
    assert.equal(amountReceived, face);
    assert.equal((await claimRegistry.read.getClaim([claimId])).state, CLAIM_STATE.PAID);

    // Balance deltas match the emitted components.
    const byLabel = (label: string): PartyBalance => {
      const p = parties.find((x) => x.label === label);
      assert.ok(p !== undefined, `missing ${label} balance`);
      return p;
    };
    assert.equal(partyDelta(byLabel("obligor")), -face);
    assert.equal(partyDelta(byLabel("vault")), financed);
    assert.equal(partyDelta(byLabel("beneficiary")), face - financed);
    assert.equal(partyDelta(byLabel("treasury")), 0n);

    // The receipt helper renders every component (sanity: non-empty, contains the claimId).
    const receipt = formatReceipt({ claimId, faceValue: face, parties, settled });
    assert.ok(receipt.includes(claimId));
    assert.ok(receipt.includes("vaultDistribution"));
  });
});
