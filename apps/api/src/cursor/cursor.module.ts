import { Module } from "@nestjs/common";

import { CursorService } from "./cursor.service";

/** Read access to the indexer cursor, consumed by the read + health layers. */
@Module({
  providers: [CursorService],
  exports: [CursorService],
})
export class CursorModule {}
