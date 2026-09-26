import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { ClaimsReadService } from "./claims-read.service";
import { ClaimDetailDto } from "../../common/dto";

@ApiTags("claims")
@Controller({ path: "claims", version: "1" })
export class ClaimsReadController {
  constructor(private readonly claims: ClaimsReadService) {}

  /** GET /api/v1/claims/:claimId — projection, with read-through fallback to chain. */
  @Get(":claimId")
  getClaim(@Param("claimId") claimId: string): Promise<ClaimDetailDto> {
    return this.claims.getClaim(claimId);
  }
}
