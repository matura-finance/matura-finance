import { Module } from "@nestjs/common";

import { IssuersController } from "./issuers.controller";
import { IssuersService } from "./issuers.service";
import { CursorModule } from "../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [IssuersController],
  providers: [IssuersService],
  exports: [IssuersService],
})
export class IssuersModule {}
