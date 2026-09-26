import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import { AuthService } from "./auth.service";
import { NonceResponseDto, SessionResponseDto, VerifyRequestDto } from "./auth.dto";
import { Public } from "./public.decorator";

@ApiTags("auth")
@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** GET /api/v1/auth/nonce — mints a single-use SIWE nonce. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOkResponse({ type: NonceResponseDto })
  @Get("nonce")
  issueNonce(): Promise<NonceResponseDto> {
    return this.auth.issueNonce();
  }

  /** POST /api/v1/auth/verify — verifies a signed SIWE message and mints a session token. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiCreatedResponse({ type: SessionResponseDto })
  @Post("verify")
  verify(@Body() body: VerifyRequestDto): Promise<SessionResponseDto> {
    return this.auth.verify(body.message, body.signature);
  }
}
