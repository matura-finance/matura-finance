import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { ChainModule } from "../chain/chain.module";
import { validateEnv } from "../config/env.validation";
import { PrismaModule } from "../prisma/prisma.module";

/**
 * Minimal context for one-shot admin CLIs (Config + Prisma + Chain). Deliberately does NOT
 * import IndexerModule, so running a CLI never starts the poll loop.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    ChainModule,
  ],
})
export class AdminCliModule {}
