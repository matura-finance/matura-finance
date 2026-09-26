import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { ActivityService } from "./activity.service";
import { Public } from "../auth/public.decorator";
import { ActivityPageDto, ActivityQueryDto } from "../common/dto";

@Public()
@ApiTags("activity")
@Controller({ path: "activity", version: "1" })
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  /** GET /api/v1/activity/:wallet?cursor=&limit= — merged, keyset-paginated activity feed. */
  @Get(":wallet")
  getActivity(
    @Param("wallet") wallet: string,
    @Query() query: ActivityQueryDto,
  ): Promise<ActivityPageDto> {
    return this.activity.getActivity(wallet, query);
  }
}
