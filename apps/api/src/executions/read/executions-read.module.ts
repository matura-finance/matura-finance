import { Module } from "@nestjs/common";

import { ExecutionsReadController } from "./executions-read.controller";
import { ExecutionsReadService } from "./executions-read.service";

@Module({
  controllers: [ExecutionsReadController],
  providers: [ExecutionsReadService],
})
export class ExecutionsReadModule {}
