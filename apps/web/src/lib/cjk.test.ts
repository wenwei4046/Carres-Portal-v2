import { describe, expect, it } from "vitest";
import { cjkClassName, isCjk } from "./cjk";

describe("isCjk + cjkClassName", () => {
  it("returns false / font-body for ASCII-only strings", () => {
    expect(isCjk("Loo Wen Wei")).toBe(false);
    expect(cjkClassName("Carres HQ")).toBe("font-body");
  });

  it("returns true / font-cjk for pure CJK strings", () => {
    expect(isCjk("王小明")).toBe(true);
    expect(cjkClassName("北区仓")).toBe("font-cjk");
  });

  it("returns true / font-cjk for mixed CJK + ASCII (any CJK triggers)", () => {
    expect(isCjk("Loo 王小明")).toBe(true);
    expect(cjkClassName("Carres 北区仓")).toBe("font-cjk");
  });

  it("handles empty / null / undefined as ASCII (font-body)", () => {
    expect(isCjk("")).toBe(false);
    expect(isCjk(null)).toBe(false);
    expect(isCjk(undefined)).toBe(false);
    expect(cjkClassName("")).toBe("font-body");
    expect(cjkClassName(null)).toBe("font-body");
    expect(cjkClassName(undefined)).toBe("font-body");
  });
});
