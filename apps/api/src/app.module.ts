import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ZodValidationPipe } from "nestjs-zod";

import { AccountModule } from "./account/account.module";
import { ActivityModule } from "./activity/activity.module";
import { ChainModule } from "./chain/chain.module";
import { ClaimsReadModule } from "./claims/read/claims-read.module";
import { AllExceptionsFilter } from "./common/api-error.filter";
import { validateEnv } from "./config/env.validation";
import { ExecutionsReadModule } from "./executions/read/executions-read.module";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    ChainModule,
    HealthModule,
    AccountModule,
    ClaimsReadModule,
    ExecutionsReadModule,
    ActivityModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
