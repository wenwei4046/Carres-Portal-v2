import { describe, expect, it } from "vitest";

import { CANONICAL_SIZES, canonicalSize, sizeName } from "./mattress-sizes";

describe("canonicalSize", () => {
  it("expands the standard MY size codes to their full names", () => {
    expect(canonicalSize("S")).toEqual({ code: "S", name: "Single" });
    expect(canonicalSize("SS")).toEqual({ code: "SS", name: "Super Single" });
    expect(canonicalSize("Q")).toEqual({ code: "Q", name: "Queen" });
    expect(canonicalSize("K")).toEqual({ code: "K", name: "King" });
    expect(canonicalSize("SK")).toEqual({ code: "SK", name: "Super King" });
  });

  it("resolves the full name back to the same entry (idempotent)", () => {
    expect(canonicalSize("King")).toEqual({ code: "K", name: "King" });
    expect(canonicalSize("Super Single")).toEqual({ code: "SS", name: "Super Single" });
  });

  it("is case- and separator-insensitive", () => {
    expect(canonicalSize("k")).toEqual({ code: "K", name: "King" });
    expect(canonicalSize(" ss ")).toEqual({ code: "SS", name: "Super Single" });
    expect(canonicalSize("super-single")).toEqual({ code: "SS", name: "Super Single" });
    expect(canonicalSize("SUPERKING")).toEqual({ code: "SK", name: "Super King" });
  });

  it("passes an unknown token through unchanged (trimmed) — never drops data", () => {
    expect(canonicalSize("4")).toEqual({ code: "4", name: "4" });
    expect(canonicalSize("  Bespoke ")).toEqual({ code: "Bespoke", name: "Bespoke" });
  });
});

describe("sizeName", () => {
  it("returns just the full name", () => {
    expect(sizeName("K")).toBe("King");
    expect(sizeName("SS")).toBe("Super Single");
    expect(sizeName("Queen")).toBe("Queen");
  });
});

describe("CANONICAL_SIZES", () => {
  it("lists the standard sizes in display order", () => {
    expect(CANONICAL_SIZES.map((s) => s.name)).toEqual([
      "Single",
      "Super Single",
      "Queen",
      "King",
      "Super King",
    ]);
  });
});
