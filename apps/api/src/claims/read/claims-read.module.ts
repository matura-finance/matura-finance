import { Module } from "@nestjs/common";

import { ClaimsReadController } from "./claims-read.controller";
import { ClaimsReadService } from "./claims-read.service";

@Module({
  controllers: [ClaimsReadController],
  providers: [ClaimsReadService],
})
export class ClaimsReadModule {}
