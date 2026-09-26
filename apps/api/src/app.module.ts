import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import Redis from "ioredis";
import { ZodValidationPipe } from "nestjs-zod";

import type { Env } from "./config/env.validation";

import { AccountModule } from "./account/account.module";
import { ActivityModule } from "./activity/activity.module";
import { AuthModule } from "./auth/auth.module";
import { WalletAuthGuard } from "./auth/wallet-auth.guard";
import { ChainModule } from "./chain/chain.module";
import { ClaimsPrepareModule } from "./claims/prepare/claims-prepare.module";
import { ClaimsReadModule } from "./claims/read/claims-read.module";
import { AllExceptionsFilter } from "./common/api-error.filter";
import { CursorModule } from "./cursor/cursor.module";
import { validateEnv } from "./config/env.validation";
import { ExecutionsPrepareModule } from "./executions/prepare/executions-prepare.module";
import { ExecutionsReadModule } from "./executions/read/executions-read.module";
import { HealthModule } from "./health/health.module";
import { IssuersModule } from "./issuers/issuers.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QuotesModule } from "./quotes/quotes.module";
import { RoutesModule } from "./routes/routes.module";
import { SettlementsPrepareModule } from "./settlements/prepare/settlements-prepare.module";
import { VaultsModule } from "./vaults/vaults.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const redisUrl = config.get("REDIS_URL", { infer: true });
        return {
          throttlers: [{ ttl: 60000, limit: 100 }],
          // Shared store only when REDIS_URL is set (multi-instance); else per-instance in-memory.
          storage:
            redisUrl === undefined
              ? undefined
              : new ThrottlerStorageRedisService(new Redis(redisUrl)),
        };
      },
    }),
    PrismaModule,
    ChainModule,
    CursorModule,
    AuthModule,
    HealthModule,
    AccountModule,
    ClaimsReadModule,
    ExecutionsReadModule,
    ActivityModule,
    VaultsModule,
    QuotesModule,
    IssuersModule,
    ClaimsPrepareModule,
    ExecutionsPrepareModule,
    SettlementsPrepareModule,
    RoutesModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Fail-closed wallet auth: every route requires a valid SIWE JWT unless marked @Public().
    { provide: APP_GUARD, useClass: WalletAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
