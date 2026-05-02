import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn (tailwind-merge wrapper)", () => {
  it("joins truthy class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1");
  });

  it("dedupes tailwind conflicts (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles falsy values", () => {
    expect(cn("foo", false && "bar", null, undefined, "baz")).toBe("foo baz");
  });
});
