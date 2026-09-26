import { Body, Controller, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { ExecutionsPrepareService } from "./executions-prepare.service";
import { Wallet } from "../../auth/wallet.decorator";
import { ExecutionPrepareDto, PrepareResponseDto } from "../../common/prepare.dto";

@ApiBearerAuth()
@ApiTags("executions")
@Controller({ path: "executions", version: "1" })
export class ExecutionsPrepareController {
  constructor(private readonly executions: ExecutionsPrepareService) {}

  /** POST /api/v1/executions/prepare — ExecutionRoute typed data for the authenticated wallet. */
  @ApiCreatedResponse({ type: PrepareResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("prepare")
  prepare(@Wallet() wallet: string, @Body() body: ExecutionPrepareDto): Promise<PrepareResponseDto> {
    return this.executions.prepare(wallet, body);
  }
}
