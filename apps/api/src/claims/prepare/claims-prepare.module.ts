import { Module } from "@nestjs/common";

import { ClaimsPrepareController } from "./claims-prepare.controller";
import { ClaimsPrepareService } from "./claims-prepare.service";
import { CursorModule } from "../../cursor/cursor.module";
import { IssuersModule } from "../../issuers/issuers.module";

@Module({
  imports: [CursorModule, IssuersModule],
  controllers: [ClaimsPrepareController],
  providers: [ClaimsPrepareService],
})
export class ClaimsPrepareModule {}
