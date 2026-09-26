import { Module } from "@nestjs/common";

import { ExecutionsPrepareController } from "./executions-prepare.controller";
import { ExecutionsPrepareService } from "./executions-prepare.service";

@Module({
  controllers: [ExecutionsPrepareController],
  providers: [ExecutionsPrepareService],
})
export class ExecutionsPrepareModule {}
