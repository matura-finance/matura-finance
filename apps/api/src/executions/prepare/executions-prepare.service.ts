import { Injectable } from "@nestjs/common";
import type { z } from "zod";

import { ChainService } from "../../chain/chain.service";
import { ContractsService } from "../../chain/contracts.service";
import { parseUint256 } from "../../common/amount.util";
import { unprocessable } from "../../common/http-errors";
import { toHexAddress, validateBytes32 } from "../../common/evm.util";
import { validateRouteLegs } from "../../common/leg-mirror";
import {
  buildPrepareResponse,
  type ExecutionPrepareSchema,
  type PrepareResponse,
  type PrepareStep,
} from "../../common/prepare.dto";
import {
  buildExecutionRouteTypedData,
  type ExecutionRouteMessage,
} from "../../common/prepare.serialize";
import { CursorService } from "../../cursor/cursor.service";

const DEFAULT_DEADLINE_SECONDS = 3600;

@Injectable()
export class ExecutionsPrepareService {
  constructor(
    private readonly chain: ChainService,
    private readonly contracts: ContractsService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * POST /api/v1/executions/prepare. Validates a client-supplied route against a pinned
   * finalized block via the shared `validateRouteLegs` mirror (same _validateLegs + slice/
   * remaining/dup checks the routes flow uses), so a returned route never reverts on a
   * checkable condition. `user` comes from the JWT (never the body). The client supplies
   * each leg's `minimumAdvanceAmount`; we assert the fresh advance clears it and sign that
   * floor. Returns the ExecutionRoute typed data + the executionId digest.
   */
  async prepare(
    wallet: string,
    body: z.infer<typeof ExecutionPrepareSchema>,
  ): Promise<PrepareResponse> {
    const user = toHexAddress(wallet);
    const targetAdvance = parseUint256(body.targetAdvance, "targetAdvance");
    if (targetAdvance === 0n) {
      throw unprocessable("ZERO_TARGET_ADVANCE", "targetAdvance must be non-zero");
    }

    // Parse leg inputs synchronously; retain the client-supplied minimumAdvanceAmount per
    // (claim, vault). Dedup + all on-chain checks are handled by the shared mirror below.
    const clientMinByLeg = new Map<string, bigint>();
    const legInputs = body.legs.map((leg) => {
      const claimId = validateBytes32(leg.claimId, "claimId");
      const vault = toHexAddress(leg.vault);
      clientMinByLeg.set(
        `${claimId}:${vault}`,
        parseUint256(leg.minimumAdvanceAmount, "minimumAdvanceAmount"),
      );
      return { claimId, vault, faceAmount: leg.faceAmount };
    });

    const frontier = await this.chain.getFrontierBlock();
    const reads = this.contracts.pinnedAt(frontier.number);
    if (await reads.routerPaused()) {
      throw unprocessable("ROUTER_PAUSED", "Router is paused");
    }

    const validated = await validateRouteLegs(reads, user, legInputs);

    let totalAdvance = 0n;
    let totalFace = 0n;
    const legs = validated.map((leg) => {
      const clientMin = clientMinByLeg.get(`${leg.claimId}:${leg.vault}`) ?? 0n;
      if (leg.advance < clientMin) {
        throw unprocessable(
          "ADVANCE_BELOW_MINIMUM",
          `Advance below minimum for claim ${leg.claimId}`,
        );
      }
      totalAdvance += leg.advance;
      totalFace += leg.faceAmount;
      return {
        claimId: leg.claimId,
        vault: leg.vault,
        faceAmount: leg.faceAmount,
        minimumAdvanceAmount: clientMin,
      };
    });

    if (totalAdvance < targetAdvance) {
      throw unprocessable("TARGET_ADVANCE_NOT_MET", "targetAdvance not met by the assembled route");
    }
    const maxTotalFace =
      body.maxTotalFace === undefined ? totalFace : parseUint256(body.maxTotalFace, "maxTotalFace");
    if (totalFace > maxTotalFace) {
      throw unprocessable("MAX_FACE_EXCEEDED", "route total face exceeds maxTotalFace");
    }

    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + (body.deadlineSeconds ?? DEFAULT_DEADLINE_SECONDS),
    );
    const router = this.chain.addresses.router;
    const nonce = await reads.routerNonce(user);

    const message: ExecutionRouteMessage = {
      user,
      targetAdvance,
      maxTotalFace,
      deadline,
      nonce,
      legs,
    };
    const { typedData, executionId } = buildExecutionRouteTypedData(
      this.chain.chainId,
      router,
      message,
    );

    const step: PrepareStep = {
      kind: "typed-data",
      to: router,
      value: "0",
      verifyingContract: router,
      typedData,
      submitFunction: "executeRoute",
      nonce: nonce.toString(),
      expiry: deadline.toString(),
    };
    const summary =
      `Sign an ExecutionRoute (executionId ${executionId}) advancing ${totalAdvance.toString()} ` +
      `against ${totalFace.toString()} face across ${String(legs.length)} leg(s); submit via router.executeRoute.`;

    return buildPrepareResponse(
      this.chain.chainId,
      [step],
      summary,
      await this.cursor.finalizedThrough(),
    );
  }
}
