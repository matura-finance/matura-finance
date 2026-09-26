import { Module } from "@nestjs/common";

import { ExecutionsReadController } from "./executions-read.controller";
import { ExecutionsReadService } from "./executions-read.service";
import { CursorModule } from "../../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [ExecutionsReadController],
  providers: [ExecutionsReadService],
})
export class ExecutionsReadModule {}
