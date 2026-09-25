import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { ApiErrorResponse } from "@matura/shared";
import type { Request, Response } from "express";

interface ResolvedError {
  status: number;
  code: string;
  message: string;
}

/**
 * Catch-all exception filter. Maps every thrown error to the shared `ApiError`
 * envelope. Full detail (stack, Prisma `error.meta`, environment) is logged
 * server-side ONLY and is never serialized into the client response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, code, message } = this.resolve(exception);

    this.logger.error(
      `${request.method} ${request.url} -> ${String(status)} ${code}: ${message}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    const body: ApiErrorResponse = {
      error: { code, message },
    };

    response.status(status).json(body);
  }

  private resolve(exception: unknown): ResolvedError {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: this.codeForStatus(status),
        message: exception.message,
      };
    }

    // Unknown/unexpected errors: never leak internals to the client.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: "INTERNAL_SERVER_ERROR",
      message: "Internal server error",
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "UNPROCESSABLE_ENTITY";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "TOO_MANY_REQUESTS";
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_SERVER_ERROR" : "ERROR";
    }
  }
}
