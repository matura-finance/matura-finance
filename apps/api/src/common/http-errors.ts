import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

// Coded HTTP errors: carry a stable machine `code` (in addition to the HTTP status) so a
// programmatic/agent client can branch on the specific domain reason — the several distinct
// 409s/422s in the prepare flows would otherwise all collapse to CONFLICT/UNPROCESSABLE_ENTITY.
// The AllExceptionsFilter surfaces `code` from the exception's object response.

export function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

export function unprocessable(code: string, message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ code, message });
}

export function notFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}
