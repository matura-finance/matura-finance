import { Module } from "@nestjs/common";

import { CursorModule } from "../cursor/cursor.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [CursorModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
