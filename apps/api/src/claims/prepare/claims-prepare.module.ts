import { Module } from "@nestjs/common";

import { ClaimsPrepareController } from "./claims-prepare.controller";
import { ClaimsPrepareService } from "./claims-prepare.service";
import { IssuersModule } from "../../issuers/issuers.module";

@Module({
  imports: [IssuersModule],
  controllers: [ClaimsPrepareController],
  providers: [ClaimsPrepareService],
})
export class ClaimsPrepareModule {}
