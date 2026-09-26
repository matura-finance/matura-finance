import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { ClaimsPrepareService } from "./claims-prepare.service";
import { Wallet } from "../../auth/wallet.decorator";
import { AttestationPrepareDto, PrepareResponseDto } from "../../common/prepare.dto";

@ApiTags("claims")
@Controller({ path: "claims", version: "1" })
export class ClaimsPrepareController {
  constructor(private readonly claims: ClaimsPrepareService) {}

  /** POST /api/v1/claims/registration/prepare — registerClaim calldata (auth + demo signing). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("registration/prepare")
  prepareRegistration(
    @Wallet() wallet: string,
    @Body() body: AttestationPrepareDto,
  ): Promise<PrepareResponseDto> {
    return this.claims.prepareRegistration(wallet, body);
  }
}
