import { describe, expect, it } from "vitest";

import { AddressBook, ZERO_ADDRESS, zeroAddressBook } from "../addresses.js";

const VALID_ADDRESS = "0x1234567890abcdefABCDEF1234567890abcdef12";

describe("AddressBook", () => {
  it("parses a valid address book", () => {
    const book = {
      mockUsdt: VALID_ADDRESS,
      issuerRegistry: VALID_ADDRESS,
      claimRegistry: VALID_ADDRESS,
      router: VALID_ADDRESS,
      settlementManager: VALID_ADDRESS,
    };
    expect(AddressBook.parse(book)).toEqual(book);
  });

  it("parses the zero address book", () => {
    expect(() => AddressBook.parse(zeroAddressBook)).not.toThrow();
  });

  it("rejects a malformed address (too short)", () => {
    const book = {
      ...zeroAddressBook,
      router: "0x1234",
    };
    expect(() => AddressBook.parse(book)).toThrow();
  });

  it("rejects a non-hex address", () => {
    const book = {
      ...zeroAddressBook,
      mockUsdt: "0xZZZZ567890abcdefABCDEF1234567890abcdef12",
    };
    expect(() => AddressBook.parse(book)).toThrow();
  });

  it("rejects a missing key", () => {
    const book = {
      mockUsdt: VALID_ADDRESS,
      issuerRegistry: VALID_ADDRESS,
      claimRegistry: VALID_ADDRESS,
      router: VALID_ADDRESS,
    };
    expect(() => AddressBook.parse(book)).toThrow();
  });

  it("exposes the zero address constant", () => {
    expect(ZERO_ADDRESS).toBe("0x0000000000000000000000000000000000000000");
    expect(zeroAddressBook.mockUsdt).toBe(ZERO_ADDRESS);
  });
});
