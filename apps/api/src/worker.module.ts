import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ChainModule } from "./chain/chain.module";
import { validateEnv } from "./config/env.validation";
import { IndexerModule } from "./indexer/indexer.module";
import { PrismaModule } from "./prisma/prisma.module";

/**
 * Root module for the indexer WORKER process (a separate entrypoint from the HTTP API).
 * Shares Config/Prisma/Chain with the API but runs only the indexer poll loop.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    ChainModule,
    IndexerModule,
  ],
})
export class WorkerModule {}
