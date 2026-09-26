import { Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { AccountService } from "./account.service";
import { Public } from "../auth/public.decorator";
import { PortfolioDto } from "../common/dto";

@Public()
@Throttle({ default: { limit: 60, ttl: 60000 } })
@ApiTags("account")
@Controller({ path: "account", version: "1" })
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** GET /api/v1/account/:wallet — portfolio (empty is a 200 with no claims). */
  @ApiOkResponse({ type: PortfolioDto })
  @Get(":wallet")
  getAccount(@Param("wallet") wallet: string): Promise<PortfolioDto> {
    return this.account.getPortfolio(wallet);
  }
}
