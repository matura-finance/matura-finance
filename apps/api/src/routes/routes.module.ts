import { Module } from "@nestjs/common";

import { RoutesController } from "./routes.controller";
import { RoutesService } from "./routes.service";
import { RouteIntentService } from "./route-intent.service";

/**
 * Best-execution routing. Relies on the @Global Chain/Cursor/Prisma modules for
 * chain reads, the projection cursor, and persistence.
 */
@Module({
  controllers: [RoutesController],
  providers: [RoutesService, RouteIntentService],
})
export class RoutesModule {}
