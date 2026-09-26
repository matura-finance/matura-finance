import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { Wallet } from "../auth/wallet.decorator";
import type { PrepareResponse } from "../common/prepare.dto";
import { RoutesService } from "./routes.service";
import {
  OptimizeRequestDto,
  OptimizeResponseDto,
  PrepareExecutionResponseDto,
  type OptimizeResponse,
} from "./routes.dto";

/**
 * Deterministic best-execution routing. Both endpoints are authenticated (wallet
 * from the SIWE JWT, never the body). `optimize` is throttled more tightly than
 * `prepare-execution` because it fans out chain reads.
 */
@ApiBearerAuth()
@ApiTags("routes")
@Controller({ path: "routes", version: "1" })
export class RoutesController {
  constructor(private readonly routes: RoutesService) {}

  @ApiCreatedResponse({ type: OptimizeResponseDto })
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("optimize")
  optimize(@Wallet() wallet: string, @Body() body: OptimizeRequestDto): Promise<OptimizeResponse> {
    return this.routes.optimize(wallet, body);
  }

  @ApiCreatedResponse({ type: PrepareExecutionResponseDto })
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(":routeId/prepare-execution")
  prepareExecution(
    @Wallet() wallet: string,
    @Param("routeId") routeId: string,
  ): Promise<PrepareResponse> {
    return this.routes.prepareExecution(wallet, routeId);
  }
}
