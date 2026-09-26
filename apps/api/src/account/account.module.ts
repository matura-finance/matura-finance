import { Module } from "@nestjs/common";

import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";
import { CursorModule } from "../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [AccountController],
  providers: [AccountService],
})
export class AccountModule {}
