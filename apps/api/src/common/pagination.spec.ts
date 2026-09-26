import { BadRequestException } from "@nestjs/common";

import { decodeCursor, encodeCursor } from "./pagination";

describe("keyset cursor", () => {
  it("round-trips a keyset", () => {
    const keyset = { block: 12_345_678_901_234_567_890n, logIndex: 7 };
    const decoded = decodeCursor(encodeCursor(keyset));
    expect(decoded.block).toBe(keyset.block);
    expect(decoded.logIndex).toBe(keyset.logIndex);
  });

  it("rejects a garbage cursor with 400", () => {
    expect(() => decodeCursor("!!!not-base64-json!!!")).toThrow(BadRequestException);
  });

  it("rejects a structurally-invalid cursor with 400", () => {
    const bad = Buffer.from(JSON.stringify({ b: "notnumber", l: -1 }), "utf8").toString("base64url");
    expect(() => decodeCursor(bad)).toThrow(BadRequestException);
  });
});
