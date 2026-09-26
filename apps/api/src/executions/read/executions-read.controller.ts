import { Controller, Get, Param } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { ExecutionsReadService } from "./executions-read.service";
import { Public } from "../../auth/public.decorator";
import { ExecutionDto } from "../../common/dto";

@Public()
@ApiTags("executions")
@Controller({ path: "executions", version: "1" })
export class ExecutionsReadController {
  constructor(private readonly executions: ExecutionsReadService) {}

  /** GET /api/v1/executions/:executionId — route execution + legs. */
  @ApiOkResponse({ type: ExecutionDto })
  @Get(":executionId")
  getExecution(@Param("executionId") executionId: string): Promise<ExecutionDto> {
    return this.executions.getExecution(executionId);
  }
}
