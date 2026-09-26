import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { IssuersService } from "./issuers.service";
import { Wallet } from "../auth/wallet.decorator";
import { AttestationPrepareDto, PrepareResponseDto } from "../common/prepare.dto";

@ApiTags("issuer")
@Controller({ path: "issuer", version: "1" })
export class IssuersController {
  constructor(private readonly issuers: IssuersService) {}

  /** POST /api/v1/issuer/attestations/prepare — ClaimAttestation typed data (auth required). */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("attestations/prepare")
  prepareAttestation(
    @Wallet() wallet: string,
    @Body() body: AttestationPrepareDto,
  ): Promise<PrepareResponseDto> {
    return this.issuers.prepareAttestation(wallet, body);
  }
}
