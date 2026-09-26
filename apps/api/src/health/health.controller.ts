import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";

import { Public } from "../auth/public.decorator";

import { HealthService, type ReadinessReport } from "./health.service";

@Public()
@ApiTags("health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @ApiOkResponse({ schema: { example: { status: "ok" } } })
  @Get()
  check(): { status: "ok" } {
    return this.health.liveness();
  }

  @ApiOkResponse({ description: "Readiness report" })
  @Get("ready")
  async ready(): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status !== "ok") throw new ServiceUnavailableException(report);
    return report;
  }
}
