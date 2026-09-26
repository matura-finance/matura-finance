import { Module } from "@nestjs/common";

import { ClaimsReadController } from "./claims-read.controller";
import { ClaimsReadService } from "./claims-read.service";
import { CursorModule } from "../../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [ClaimsReadController],
  providers: [ClaimsReadService],
})
export class ClaimsReadModule {}
