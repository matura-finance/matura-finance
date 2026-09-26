import { BadRequestException } from "@nestjs/common";

import { normalizeWallet, validateBytes32 } from "./evm.util";

describe("normalizeWallet", () => {
  const checksummed = "0x52908400098527886E0F7030069857D2E4169EE7";

  it("lowercases a valid checksummed address", () => {
    expect(normalizeWallet(checksummed)).toBe(checksummed.toLowerCase());
  });

  it("accepts an all-lowercase address", () => {
    const lower = checksummed.toLowerCase();
    expect(normalizeWallet(lower)).toBe(lower);
  });

  it("rejects a malformed address with 400", () => {
    expect(() => normalizeWallet("0xnothex")).toThrow(BadRequestException);
    expect(() => normalizeWallet("not-an-address")).toThrow(BadRequestException);
  });
});

describe("validateBytes32", () => {
  const id = `0x${"ab".repeat(32)}`;

  it("accepts a 32-byte hex value", () => {
    expect(validateBytes32(id, "claimId")).toBe(id);
  });

  it("rejects a short/malformed value with 400", () => {
    expect(() => validateBytes32("0xabc", "claimId")).toThrow(BadRequestException);
    expect(() => validateBytes32(id.slice(0, -1), "claimId")).toThrow(BadRequestException);
  });
});
