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
      // A coded error (thrown via ../common/http-errors) carries a stable domain `code` in its
      // object response so clients can branch on the specific reason, not just the HTTP status.
      const domain = extractCoded(exception.getResponse());
      return {
        status,
        code: domain.code ?? this.codeForStatus(status),
        message: domain.message ?? exception.message,
      };
    }

    // Request-layer framework errors that aren't Nest HttpExceptions — body-parser's
    // PayloadTooLargeError (413) and malformed-body parse failures (400). Identify them by their
    // body-parser `type` (NOT a bare numeric status), so an outbound RPC/undici error that happens
    // to carry a 4xx `status` (e.g. 429/404) still falls through to a generic 500 and stays visible
    // to 5xx alerting. The code/message derive from the status ONLY (never `error.message`).
    const clientStatus = extractBodyParserStatus(exception);
    if (clientStatus !== null) {
      const code = this.codeForStatus(clientStatus);
      return { status: clientStatus, code, message: genericMessageForStatus(clientStatus) };
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
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return "PAYLOAD_TOO_LARGE";
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "UNPROCESSABLE_ENTITY";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "TOO_MANY_REQUESTS";
      default:
        return status >= HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_SERVER_ERROR" : "ERROR";
    }
  }
}

/**
 * Canonical client status for the body-parser errors we treat as truthful 4xx. Keyed by the
 * body-parser `error.type` so the mapping can't be spoofed by a rogue numeric `status` on some
 * other (e.g. outbound) error.
 */
const BODY_PARSER_STATUS_BY_TYPE: Record<string, number> = {
  "entity.too.large": HttpStatus.PAYLOAD_TOO_LARGE,
  "entity.parse.failed": HttpStatus.BAD_REQUEST,
};

/**
 * Map a body-parser request error to its canonical client status (413/400), or null for anything
 * else. Detects the framework error by its `type` (or constructor name as a fallback), never by a
 * bare numeric status — an outbound RPC error carrying `status: 429` must NOT be treated as 4xx.
 */
function extractBodyParserStatus(exception: unknown): number | null {
  if (typeof exception !== "object" || exception === null) return null;
  const obj = exception as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type : undefined;
  if (type !== undefined && type in BODY_PARSER_STATUS_BY_TYPE) {
    return BODY_PARSER_STATUS_BY_TYPE[type] ?? null;
  }
  // Fallback: body-parser's PayloadTooLargeError may arrive without a `type` in some paths.
  if (exception instanceof Error && exception.constructor.name === "PayloadTooLargeError") {
    return HttpStatus.PAYLOAD_TOO_LARGE;
  }
  return null;
}

/** A safe, status-derived client message (never echoes the underlying error text). */
function genericMessageForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return "Bad request";
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return "Payload too large";
    default:
      return "Request error";
  }
}

/** Pull a domain `{ code, message }` from an HttpException's object response, if present. */
function extractCoded(res: string | object): { code?: string; message?: string } {
  if (typeof res !== "object") return {};
  const obj = res as Record<string, unknown>;
  return {
    code: typeof obj.code === "string" ? obj.code : undefined,
    message: typeof obj.message === "string" ? obj.message : undefined,
  };
}
