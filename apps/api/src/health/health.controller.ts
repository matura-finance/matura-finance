import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { Public } from "../auth/public.decorator";

import { HealthService, type ReadinessReport } from "./health.service";

@Public()
@ApiTags("health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(): { status: "ok" } {
    return this.health.liveness();
  }

  @Get("ready")
  async ready(): Promise<ReadinessReport> {
    const report = await this.health.readiness();
    if (report.status !== "ok") throw new ServiceUnavailableException(report);
    return report;
  }
}
