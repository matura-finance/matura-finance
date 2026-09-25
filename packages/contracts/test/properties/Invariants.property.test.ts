import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";
import { parseUnits, getAddress } from "viem";
import { ceilDiv, deployProtocol } from "../helpers/fixtures.js";
import { ROLES } from "../helpers/constants.js";

const UNIT = parseUnits("1", 6);

describe("Property: invariants", () => {
  it("never over-assigns financedFaceValue beyond faceValue", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.bigInt({ min: 1n, max: 1_000n }), { minLength: 1, maxLength: 12 }),
        async (rawAmounts) => {
          const ctx = await deployProtocol();
          const { claimRegistry, accounts, createEligibleClaim } = ctx;
          const face = parseUnits("1000", 6);
          const { claimId } = await createEligibleClaim({ label: "prop-oa", faceValue: face });
          // Drive reserveSlice directly via an EOA granted ROUTER_ROLE.
          await claimRegistry.write.grantRole([ROLES.ROUTER_ROLE, accounts.admin.account.address]);
          const admin = { account: accounts.admin.account };

          let financed = 0n;
          let slices = 0;
          for (const raw of rawAmounts) {
            const amt = raw * UNIT;
            const blocked = financed + amt > face || slices >= 8 || financed === face;
            if (blocked) {
              await assert.rejects(claimRegistry.write.reserveSlice([claimId, amt], admin));
            } else {
              await claimRegistry.write.reserveSlice([claimId, amt], admin);
              financed += amt;
              slices += 1;
            }
            const onchain = (await claimRegistry.read.getClaim([claimId])).financedFaceValue;
            assert.equal(onchain, financed);
            assert.ok(onchain <= face);
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("settlement conservation holds exactly: received == vaultDist + residual + fee", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.bigInt({ min: 100n, max: 100_000n }), // faceValue in USDT (within [minFace, maxFace])
        fc.bigInt({ min: 100n, max: 100_000n }), // financed target in USDT
        fc.integer({ min: 0, max: 500 }), // feeBps within [0, MAX_FEE_BPS]
        async (faceUsdt, finUsdt, feeBps) => {
          const ctx = await deployProtocol();
          const {
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
            publicClient,
          } = ctx;

          const face = faceUsdt * UNIT;
          let financed = finUsdt * UNIT;
          if (financed > face) financed = face; // financed <= face
          if (financed < parseUnits("100", 6)) financed = parseUnits("100", 6); // vault minFace

          const { claimId } = await createEligibleClaim({ label: "prop-cons", faceValue: face });
          const r = {
            user: getAddress(accounts.user.account.address),
            targetAdvance: 1n,
            maxTotalFace: parseUnits("1000000", 6),
            deadline: now + 3_600n,
            nonce: 0n,
            legs: [
              {
                claimId,
                vault: getAddress(vault.address),
                faceAmount: financed,
                minimumAdvanceAmount: 0n,
              },
            ],
          };
          await router.write.executeRoute([r, await signRoute(r)], {
            account: accounts.user.account,
          });

          await networkHelpers.time.increase(31 * 86_400);
          await claimRegistry.write.markMatured([claimId]);
          await settlement.write.setFeeBps([feeBps]);

          const fee = ceilDiv(face * BigInt(feeBps), 10_000n);
          const total = face + fee;
          await usdt.write.mint([accounts.issuer.account.address, total]);
          await usdt.write.approve([settlement.address, total], {
            account: accounts.issuer.account,
          });
          await settlement.write.settleClaim([claimId], { account: accounts.issuer.account });

          const logs = await publicClient.getContractEvents({
            address: settlement.address,
            abi: settlement.abi,
            eventName: "ClaimSettled",
          });
          const ev = logs.at(-1);
          assert.ok(ev !== undefined);
          const { amountReceived, vaultDistribution, userResidual, protocolFee } = ev.args;
          assert.ok(amountReceived !== undefined && vaultDistribution !== undefined);
          assert.ok(userResidual !== undefined && protocolFee !== undefined);
          // Conservation identity
          assert.equal(amountReceived, vaultDistribution + userResidual + protocolFee);
          // Component correctness
          assert.equal(vaultDistribution, financed);
          assert.equal(userResidual, face - financed);
          assert.equal(protocolFee, fee);
          assert.equal(amountReceived, total);
        },
      ),
      { numRuns: 8 },
    );
  });
});
