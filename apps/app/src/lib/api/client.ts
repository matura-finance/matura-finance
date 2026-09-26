import type { z } from "zod";

import { env } from "../env";

/** A coded API error carrying the machine `code` alongside the HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** Shape of the coded-error envelope the API returns (`common/http-errors.ts`). */
interface ErrorEnvelope {
  code?: unknown;
  message?: unknown;
}

function extractError(status: number, body: unknown): ApiError {
  const env_ = (body ?? {}) as ErrorEnvelope;
  const code = typeof env_.code === "string" ? env_.code : `HTTP_${String(status)}`;
  const message =
    typeof env_.message === "string" ? env_.message : `Request failed (${String(status)})`;
  return new ApiError(status, code, message);
}

export interface RequestOptions<T> {
  method?: "GET" | "POST";
  path: string;
  schema: z.ZodType<T>;
  body?: unknown;
  token?: string;
  /** Signal used by react-query for cancellation. */
  signal?: AbortSignal;
}

/**
 * Typed fetch wrapper: injects `Authorization: Bearer`, JSON-encodes the body, and
 * validates the response through a Zod schema. Throws {@link ApiError} with the machine
 * `code` on non-2xx. Authed hooks map a 401 to a session clear (see `useClearSessionOn401`).
 */
export async function apiRequest<T>({
  method = "GET",
  path,
  schema,
  body,
  token,
  signal,
}: RequestOptions<T>): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== undefined) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${env.apiUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  const raw: unknown = response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) throw extractError(response.status, raw);

  return schema.parse(raw);
}
