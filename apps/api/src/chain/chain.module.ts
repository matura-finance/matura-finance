import { Global, Module } from "@nestjs/common";

import { ChainService } from "./chain.service";

/**
 * Global chain-access module. `@Global` because the indexer, read-through, prepare, and
 * health layers all consume `ChainService` — mirrors the global `PrismaModule`.
 */
@Global()
@Module({
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
