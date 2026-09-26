import { Global, Module } from "@nestjs/common";

import { CursorService } from "./cursor.service";

/**
 * Read access to the indexer cursor. `@Global` because the read, prepare, and health layers
 * all consume it — mirrors the global `ChainModule`/`PrismaModule`. Import once in the root module.
 */
@Global()
@Module({
  providers: [CursorService],
  exports: [CursorService],
})
export class CursorModule {}
