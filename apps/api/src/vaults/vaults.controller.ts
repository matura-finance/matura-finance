import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { VaultsResponseDto } from "./vaults.dto";
import { VaultsService } from "./vaults.service";
import { Public } from "../auth/public.decorator";

@Public()
@ApiTags("vaults")
@Controller({ path: "vaults", version: "1" })
export class VaultsController {
  constructor(private readonly vaults: VaultsService) {}

  /** GET /api/v1/vaults — registered vaults with their mandates + fundable liquidity. */
  @Get()
  list(): Promise<VaultsResponseDto> {
    return this.vaults.list();
  }
}
