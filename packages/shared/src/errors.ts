import { z } from "zod";

/**
 * A structured, client-safe API error. `details` is optional and typed as
 * `unknown` (not `any`) so callers must narrow before use. Server-side detail
 * (stack traces, Prisma metadata, env) must never be serialized into it.
 */
export const ApiError = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
    details: z.unknown().optional(),
  })
  .strict();

/** A validated API error. */
export type ApiError = z.infer<typeof ApiError>;

/** The envelope wrapping an `ApiError` in an error-response body. */
export const ApiErrorResponse = z
  .object({
    error: ApiError,
  })
  .strict();

/** A validated API error-response envelope. */
export type ApiErrorResponse = z.infer<typeof ApiErrorResponse>;
