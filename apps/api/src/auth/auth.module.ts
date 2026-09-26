import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthJwtService } from "./jwt.service";
import { WalletAuthGuard } from "./wallet-auth.guard";

/**
 * SIWE auth wiring. Prisma + Chain are `@Global`, so no imports are needed.
 * Exports {@link AuthJwtService} + {@link WalletAuthGuard} for the app root to register
 * the guard globally (as `APP_GUARD`).
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthJwtService, WalletAuthGuard],
  exports: [AuthJwtService, WalletAuthGuard],
})
export class AuthModule {}
