import { Module } from "@nestjs/common";

import { SettlementsPrepareController } from "./settlements-prepare.controller";
import { SettlementsPrepareService } from "./settlements-prepare.service";
import { CursorModule } from "../../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [SettlementsPrepareController],
  providers: [SettlementsPrepareService],
})
export class SettlementsPrepareModule {}
