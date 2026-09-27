import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseUnits } from "viem";
import { deployProtocol, toBytes32 } from "../helpers/fixtures.js";
import { ROLES } from "../helpers/constants.js";
import { escrowClaimId, streamClaimId } from "../../config/demo.js";

/// Parity guard for the OFF-CHAIN claimId mirror. `config/demo.ts` re-derives the adapters'
/// `keccak256(abi.encode("…", address(this), id))` in TS (seed/verify rely on it to find the
/// registered claims). This asserts the TS derivation equals the on-chain value the adapters mint —
/// matching the repo's cross-language drift-guard convention (EnumParity / EIP-712 typehash tests).
/// If the Solidity derivation changes, this fails at build time instead of a late `ClaimNotFound`.
describe("Parity: off-chain claimId mirror == on-chain derivation", () => {
  it("escrowClaimId(escrow, engagementId) matches MockFreelanceEscrow's minted claimId", async () => {
    const ctx = await deployProtocol();
    const escrow = await ctx.viem.deployContract("MockFreelanceEscrow", [
      ctx.usdt.address,
      ctx.claimRegistry.address,
      ctx.settlement.address,
    ]);
    await ctx.issuerRegistry.write.registerIssuer([escrow.address, escrow.address, toBytes32("m")]);
    await ctx.claimRegistry.write.grantRole([ROLES.SOURCE_REGISTRAR_ROLE, escrow.address]);

    const amount = parseUnits("500", 6);
    const client = ctx.accounts.other;
    await ctx.usdt.write.mint([client.account.address, amount]);
    await ctx.usdt.write.approve([escrow.address, amount], { account: client.account });
    await escrow.write.fundEngagement(
      [ctx.accounts.user.account.address, amount, ctx.now + 30n * 86_400n],
      {
        account: client.account,
      },
    );
    await escrow.write.approveWork([1n], { account: client.account });
    await escrow.write.createPayout([1n]);

    const onChain = (await escrow.read.getEngagement([1n])).claimId;
    assert.equal(onChain, escrowClaimId(escrow.address, 1n));
  });

  it("streamClaimId(stream, streamId) matches MockStream's minted claimId", async () => {
    const ctx = await deployProtocol();
    const stream = await ctx.viem.deployContract("MockStream", [
      ctx.usdt.address,
      ctx.claimRegistry.address,
      ctx.settlement.address,
    ]);
    await ctx.issuerRegistry.write.registerIssuer([stream.address, stream.address, toBytes32("m")]);
    await ctx.claimRegistry.write.grantRole([ROLES.SOURCE_REGISTRAR_ROLE, stream.address]);

    const deposit = parseUnits("1000", 6);
    const funder = ctx.accounts.other;
    const recipient = ctx.accounts.user;
    await ctx.usdt.write.mint([funder.account.address, deposit]);
    await ctx.usdt.write.approve([stream.address, deposit], { account: funder.account });
    await stream.write.createStream(
      [recipient.account.address, deposit, ctx.now - 30n * 86_400n, ctx.now + 30n * 86_400n],
      { account: funder.account },
    );
    await stream.write.assignToProtocol([1n], { account: recipient.account });
    await stream.write.createClaim([1n], { account: recipient.account });

    const onChain = (await stream.read.getStream([1n])).claimId;
    assert.equal(onChain, streamClaimId(stream.address, 1n));
  });
});
