import { describe, it, expect } from "vitest";
import { normalizeRefs } from "./orders";

describe("normalizeRefs — canonical dedup key for combined AutoCount Refs", () => {
  it("is order-insensitive (the reordered-pair duplicate bug)", () => {
    expect(normalizeRefs("CR0925+TCF0394")).toEqual(["CR0925", "TCF0394"]);
    expect(normalizeRefs("TCF0394+CR0925")).toEqual(["CR0925", "TCF0394"]);
    // same canonical key regardless of input order
    expect(normalizeRefs("TCF0394+CR0925")).toEqual(normalizeRefs("CR0925+TCF0394"));
  });

  it("accepts +, /, comma and & as separators", () => {
    expect(normalizeRefs("A & B")).toEqual(["A", "B"]);
    expect(normalizeRefs("A/B")).toEqual(["A", "B"]);
    expect(normalizeRefs("A,B")).toEqual(["A", "B"]);
    expect(normalizeRefs("B & A")).toEqual(normalizeRefs("A + B"));
  });

  it("trims, upper-cases and dedupes", () => {
    expect(normalizeRefs("  cr0854  ")).toEqual(["CR0854"]);
    expect(normalizeRefs("CR1 + cr1 +  CR1 ")).toEqual(["CR1"]);
  });

  it("drops empty tokens (trailing/duplicate separators)", () => {
    expect(normalizeRefs("CR1 + + CR2 /")).toEqual(["CR1", "CR2"]);
    expect(normalizeRefs("   ")).toEqual([]);
  });

  it("keeps a single invoice untouched (as a one-element canonical set)", () => {
    expect(normalizeRefs("CR0973")).toEqual(["CR0973"]);
  });
});
