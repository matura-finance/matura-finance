import { Global, Module } from "@nestjs/common";

import { ChainService } from "./chain.service";
import { ContractsService } from "./contracts.service";

/**
 * Global chain-access module. `@Global` because the indexer, read-through, prepare, and
 * health layers all consume these services — mirrors the global `PrismaModule`.
 */
@Global()
@Module({
  providers: [ChainService, ContractsService],
  exports: [ChainService, ContractsService],
})
export class ChainModule {}
