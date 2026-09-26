import { Controller, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { SettlementsPrepareService } from "./settlements-prepare.service";
import { PrepareResponseDto } from "../../common/prepare.dto";

@ApiBearerAuth()
@ApiTags("settlements")
@Controller({ path: "settlements", version: "1" })
export class SettlementsPrepareController {
  constructor(private readonly settlements: SettlementsPrepareService) {}

  /** POST /api/v1/settlements/:claimId/prepare — approve+settle steps (auth required). */
  @ApiCreatedResponse({ type: PrepareResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":claimId/prepare")
  prepare(@Param("claimId") claimId: string): Promise<PrepareResponseDto> {
    return this.settlements.prepare(claimId);
  }
}
