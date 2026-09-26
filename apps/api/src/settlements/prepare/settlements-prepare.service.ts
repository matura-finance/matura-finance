import { Injectable } from "@nestjs/common";
import { contractAbis } from "@matura/chain";
import { CLAIM_STATES } from "@matura/shared";
import { encodeFunctionData } from "viem";

import { ChainService } from "../../chain/chain.service";
import { ContractsService } from "../../chain/contracts.service";
import { ceilFee } from "../../common/amount.util";
import { conflict, notFound } from "../../common/http-errors";
import { validateBytes32 } from "../../common/evm.util";
import { buildPrepareResponse, type PrepareResponse, type PrepareStep } from "../../common/prepare.dto";
import { CursorService } from "../../cursor/cursor.service";

// Derived from the shared ordinal source-of-truth (not magic numbers) so a reorder can't desync.
const STATE_MATURED = CLAIM_STATES.indexOf("MATURED");
const STATE_DELAYED = CLAIM_STATES.indexOf("DELAYED");

@Injectable()
export class SettlementsPrepareService {
  constructor(
    private readonly chain: ChainService,
    private readonly contracts: ContractsService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * POST /api/v1/settlements/:claimId/prepare. Two-step approve→settle for the payer.
   * Reads live `feeBps` (dynamic) so the approval never falls short; 409s a non-matured or
   * already-settled claim. `settleClaim` is permissionless — any payer may submit.
   */
  async prepare(rawClaimId: string): Promise<PrepareResponse> {
    const claimId = validateBytes32(rawClaimId, "claimId");
    const claim = await this.chain.getClaim(claimId);
    if (claim === null) {
      throw notFound("CLAIM_NOT_FOUND", `Claim not found: ${claimId}`);
    }
    if (claim.state !== STATE_MATURED && claim.state !== STATE_DELAYED) {
      throw conflict("NOT_MATURED", "Claim is not settleable (must be MATURED or DELAYED)");
    }
    if (await this.contracts.isSettled(claimId)) {
      throw conflict("ALREADY_SETTLED", "Claim is already settled");
    }

    const feeBps = await this.contracts.feeBps();
    const protocolFee = ceilFee(claim.faceValue, feeBps);
    const amountReceived = claim.faceValue + protocolFee;

    const { mockUsdt, settlementManager } = this.chain.addresses;
    const approveData = encodeFunctionData({
      abi: contractAbis.mockUsdt,
      functionName: "approve",
      args: [settlementManager, amountReceived],
    });
    const settleData = encodeFunctionData({
      abi: contractAbis.settlementManager,
      functionName: "settleClaim",
      args: [claimId],
    });

    const steps: PrepareStep[] = [
      { kind: "transaction", to: mockUsdt, data: approveData, value: "0" },
      { kind: "transaction", to: settlementManager, data: settleData, value: "0" },
    ];
    const summary =
      `Settle claim ${claimId}: approve ${amountReceived.toString()} base units to the ` +
      `SettlementManager (face ${claim.faceValue.toString()} + fee ${protocolFee.toString()} @ ${String(feeBps)}bps), then settleClaim.`;

    return buildPrepareResponse(
      this.chain.chainId,
      steps,
      summary,
      await this.cursor.finalizedThrough(),
    );
  }
}
