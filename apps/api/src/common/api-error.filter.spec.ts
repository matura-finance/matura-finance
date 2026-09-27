import type { ArgumentsHost } from "@nestjs/common";
import type { ApiErrorResponse } from "@matura/shared";

import { AllExceptionsFilter } from "./api-error.filter";
import { conflict } from "./http-errors";
import { Prisma } from "../generated/prisma/client";

interface Captured {
  status: number;
  body: ApiErrorResponse;
}

function run(exception: unknown): Captured {
  const captured: Partial<Captured> = {};
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: ApiErrorResponse) {
      captured.body = payload;
      return this;
    },
  };
  const request = { method: "GET", url: "/api/v1/claims/0xabc" };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter();
  filter.catch(exception, host);
  return captured as Captured;
}

describe("AllExceptionsFilter redaction", () => {
  it("maps a raw Prisma known-request error to a generic 500 with no meta/SQL/stack in the body", () => {
    const secretTable = "SecretInternalTable";
    const error = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed on the fields",
      {
        code: "P2002",
        clientVersion: "6.19.0",
        meta: { target: [secretTable, "column_leak"] },
      },
    );

    const { status, body } = run(error);

    expect(status).toBe(500);
    expect(body).toEqual({
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(secretTable);
    expect(serialized).not.toContain("P2002");
    expect(serialized).not.toContain("meta");
    expect(serialized).not.toContain("stack");
  });

  it("never surfaces a thrown Error message (which could carry a secret) to the client body", () => {
    const secret = "super-secret-connection-string";
    const { status, body } = run(new Error(`db failed: ${secret}`));

    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(body.error.message).toBe("Internal server error");
  });

  it("preserves a framework 4xx status (e.g. 413 body-parser) but redacts the underlying message", () => {
    // body-parser's PayloadTooLargeError is NOT a Nest HttpException: it carries `status`/`statusCode`.
    const bodyParserError = Object.assign(new Error("request entity too large: /secret/path"), {
      status: 413,
      statusCode: 413,
      type: "entity.too.large",
    });

    const { status, body } = run(bodyParserError);

    expect(status).toBe(413);
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(body.error.message).toBe("Payload too large");
    expect(JSON.stringify(body)).not.toContain("/secret/path");
  });

  it("does not upgrade a non-HttpException 5xx status to a leaky response (stays generic 500)", () => {
    const upstream = Object.assign(new Error("upstream failed at 10.0.0.5:5432"), { status: 503 });
    const { status, body } = run(upstream);
    expect(status).toBe(500);
    expect(body.error.code).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });

  it("passes a coded domain HttpException through with its status, code, and message", () => {
    const { status, body } = run(
      conflict("ROUTE_INTENT_UNAVAILABLE", "Route intent already consumed"),
    );

    expect(status).toBe(409);
    expect(body.error.code).toBe("ROUTE_INTENT_UNAVAILABLE");
    expect(body.error.message).toBe("Route intent already consumed");
  });
});
