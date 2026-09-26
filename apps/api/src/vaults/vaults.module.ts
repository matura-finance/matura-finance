import { Module } from "@nestjs/common";

import { VaultsController } from "./vaults.controller";
import { VaultsService } from "./vaults.service";
import { CursorModule } from "../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [VaultsController],
  providers: [VaultsService],
})
export class VaultsModule {}
