import { Module } from "@nestjs/common";

import { ExecutionsPrepareController } from "./executions-prepare.controller";
import { ExecutionsPrepareService } from "./executions-prepare.service";
import { CursorModule } from "../../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [ExecutionsPrepareController],
  providers: [ExecutionsPrepareService],
})
export class ExecutionsPrepareModule {}
