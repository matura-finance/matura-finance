import { Injectable, NotFoundException } from "@nestjs/common";
import { CLAIM_STATES, CLAIM_TYPES } from "@matura/shared";
import type { z } from "zod";

import { ChainService, type OnChainClaim } from "../../chain/chain.service";
import { CursorService } from "../../cursor/cursor.service";
import type { ClaimDetailSchema, ClaimSchema } from "../../common/dto";
import { validateBytes32 } from "../../common/evm.util";
import { mapClaim, mapSettlement } from "../../common/mappers";
import { PrismaService } from "../../prisma/prisma.service";

type ClaimDetailShape = z.infer<typeof ClaimDetailSchema>;

@Injectable()
export class ClaimsReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chain: ChainService,
    private readonly cursor: CursorService,
  ) {}

  /**
   * GET /api/v1/claims/:claimId. Serves the projection; on a miss within the finality gap,
   * falls back to a chain read tagged `pending: true`. 404 only when the claim exists nowhere.
   */
  async getClaim(rawClaimId: string): Promise<ClaimDetailShape> {
    const claimId = validateBytes32(rawClaimId, "claimId");
    const [row, finalizedThrough] = await Promise.all([
      this.prisma.claimProjection.findUnique({
        where: { claimId },
        include: { settlement: true },
      }),
      this.cursor.finalizedThrough(),
    ]);

    if (row !== null) {
      return {
        ...mapClaim(row),
        settlement: row.settlement === null ? null : mapSettlement(row.settlement),
        finalizedThrough,
      };
    }

    const onChain = await this.chain.getClaim(claimId);
    if (onChain === null) {
      throw new NotFoundException(`Claim not found: ${claimId}`);
    }
    return { ...this.mapOnChainClaim(claimId, onChain), settlement: null, finalizedThrough };
  }

  private mapOnChainClaim(claimId: string, claim: OnChainClaim): z.infer<typeof ClaimSchema> {
    const claimType = CLAIM_TYPES[claim.claimType];
    const state = CLAIM_STATES[claim.state];
    if (claimType === undefined || state === undefined) {
      throw new Error(
        `Unknown enum ordinal from chain: type=${String(claim.claimType)} state=${String(claim.state)}`,
      );
    }
    return {
      claimId,
      beneficiary: claim.beneficiary.toLowerCase(),
      issuer: claim.issuer.toLowerCase(),
      claimType,
      token: claim.token.toLowerCase(),
      faceValue: claim.faceValue.toString(),
      financedFaceValue: claim.financedFaceValue.toString(),
      dueAt: new Date(Number(claim.dueDate) * 1000).toISOString(),
      state,
      pending: true,
    };
  }
}
