import { Module } from "@nestjs/common";

import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";
import { CursorModule } from "../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
