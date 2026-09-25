import { describe, expect, it } from "vitest";

import { cn } from "../utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("ignores falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });

  it("supports conditional object syntax", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  it("supports array inputs", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });

  it("dedupes conflicting tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("keeps non-conflicting utilities", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4");
  });
});
