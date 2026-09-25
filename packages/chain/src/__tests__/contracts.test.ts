import { describe, expect, it } from "vitest";

import { contractAbis } from "../contracts.js";
import { zeroAddressBook } from "../addresses.js";

describe("contractAbis", () => {
  it("has exactly one ABI per AddressBook slot (names stay aligned)", () => {
    expect(Object.keys(contractAbis).sort()).toEqual(Object.keys(zeroAddressBook).sort());
  });

  it("every ABI is a non-empty array", () => {
    for (const abi of Object.values(contractAbis)) {
      expect(Array.isArray(abi)).toBe(true);
      expect(abi.length).toBeGreaterThan(0);
    }
  });
});
