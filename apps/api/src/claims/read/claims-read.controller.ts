import { Controller, Get, Param } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { ClaimsReadService } from "./claims-read.service";
import { Public } from "../../auth/public.decorator";
import { Wallet } from "../../auth/wallet.decorator";
import { ClaimDetailDto, IssuedClaimsDto } from "../../common/dto";

@ApiTags("claims")
@Controller({ path: "claims", version: "1" })
export class ClaimsReadController {
  constructor(private readonly claims: ClaimsReadService) {}

  /**
   * GET /api/v1/claims/issued — claims the authenticated issuer has registered (newest first).
   * Authed + issuer-scoped to the signed wallet. Declared before `:claimId` so "issued" is not
   * captured as a claim id.
   */
  @ApiBearerAuth()
  @ApiOkResponse({ type: IssuedClaimsDto })
  @Get("issued")
  getIssued(@Wallet() wallet: string): Promise<IssuedClaimsDto> {
    return this.claims.listIssued(wallet);
  }

  /** GET /api/v1/claims/:claimId — projection, with read-through fallback to chain. */
  @Public()
  @ApiOkResponse({ type: ClaimDetailDto })
  @Get(":claimId")
  getClaim(@Param("claimId") claimId: string): Promise<ClaimDetailDto> {
    return this.claims.getClaim(claimId);
  }
}
