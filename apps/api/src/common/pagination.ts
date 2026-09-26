import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

/**
 * Keyset pagination cursor over the append-only activity feed, ordered by
 * (blockNumber DESC, logIndex DESC). `blockNumber` is a decimal string (bigint can't
 * round-trip through JSON). Encoded as base64url of a Zod-validated envelope so a
 * tampered/garbage cursor is rejected with 400 rather than mis-querying.
 */
const CursorSchema = z.object({
  b: z.string().regex(/^\d+$/),
  l: z.number().int().min(0),
});

export interface Keyset {
  block: bigint;
  logIndex: number;
}

export function encodeCursor(keyset: Keyset): string {
  const json = JSON.stringify({ b: keyset.block.toString(), l: keyset.logIndex });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Keyset {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new BadRequestException("Invalid pagination cursor");
  }
  const result = CursorSchema.safeParse(parsed);
  if (!result.success) {
    throw new BadRequestException("Invalid pagination cursor");
  }
  return { block: BigInt(result.data.b), logIndex: result.data.l };
}
