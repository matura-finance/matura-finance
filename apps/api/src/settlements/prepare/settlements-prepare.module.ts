import { Module } from "@nestjs/common";

import { SettlementsPrepareController } from "./settlements-prepare.controller";
import { SettlementsPrepareService } from "./settlements-prepare.service";

@Module({
  controllers: [SettlementsPrepareController],
  providers: [SettlementsPrepareService],
})
export class SettlementsPrepareModule {}
