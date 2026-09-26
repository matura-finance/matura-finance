import { Module } from "@nestjs/common";

import { IndexerService } from "./indexer.service";

/** Indexer worker module. Loaded by the worker process, NOT the HTTP API. */
@Module({
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}
