import { Controller, Get, Param } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { AccountService } from "./account.service";
import { Public } from "../auth/public.decorator";
import { PortfolioDto } from "../common/dto";

@Public()
@ApiTags("account")
@Controller({ path: "account", version: "1" })
export class AccountController {
  constructor(private readonly account: AccountService) {}

  /** GET /api/v1/account/:wallet — portfolio (empty is a 200 with no claims). */
  @Get(":wallet")
  getAccount(@Param("wallet") wallet: string): Promise<PortfolioDto> {
    return this.account.getPortfolio(wallet);
  }
}
