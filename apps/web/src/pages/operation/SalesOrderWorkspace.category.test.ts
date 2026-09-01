import { describe, expect, it } from "vitest";
import { categoryWord } from "./SalesOrderWorkspace";
import { lineClass } from "@carres/shared";

/**
 * D9 IN THE SALES ORDER DOCUMENT — the category word asks the CATALOG.
 *
 * `56239a3c` (PR #859) moved Stock onto the catalog; PR #867 moved the loan
 * flow. This screen was the remaining place a category was still deduced from
 * SKU TEXT, and it is the one an operator compares against the POS.
 *
 * `5539-1A(LHF)` is not invented — it is one of thirteen production SKUs read
 * off live orders on 2026-08-08 that the keyword classifier returns `unknown`
 * for. It is the whole reason this file exists.
 */
const MISSED = "5539-1A(LHF)";

describe("categoryWord — the catalog answers, the parser only fills gaps", () => {
  it("the headline: a sofa the keyword list cannot see prints SOFA when the catalog says so", () => {
    expect(lineClass(MISSED)).toBe("unknown");
    expect(categoryWord({ sku: MISSED })).toBe("NOT IN CATALOG");
    expect(categoryWord({ sku: MISSED, category: "sofa" })).toBe("SOFA");
  });

  it("the DOCUMENT's own snapshot still outranks the catalog", () => {
    // An order line is a frozen record. If it was sold as a bedframe, a later
    // catalog edit does not rewrite history.
    expect(
      categoryWord({ sku: MISSED, attrs: { category: "bedframe" }, category: "sofa" }),
    ).toBe("BEDFRAME");
  });

  it("the catalog outranks the SKU-text parser, not merely fills for it", () => {
    // The parser gets this one RIGHT by keyword ("forte" is in the mattress
    // list). If the catalog disagrees, the catalog wins — that is what one
    // owner means.
    expect(lineClass("FORTE-L1202F-Q")).toBe("mattress");
    expect(categoryWord({ sku: "FORTE-L1202F-Q", category: "sofa" })).toBe("SOFA");
  });

  it("a native SKU prefix still names kinds the classifier has no branch for", () => {
    // `guarantee:` / `service:` are real SKU heads; lineClass returns unknown
    // for both, so dropping this rung would print NOT IN CATALOG over a guarantee.
    expect(categoryWord({ sku: "guarantee:5yr-sofa" })).toBe("GUARANTEE");
    expect(categoryWord({ sku: "service:disposal" })).toBe("SERVICE");
  });

  it("null means asked-and-silent and falls through exactly as before", () => {
    // 975 live units have no catalog row (2026-08-19). A regression here empties
    // the word off real screens rather than improving it.
    expect(categoryWord({ sku: MISSED, category: null })).toBe("NOT IN CATALOG");
    expect(categoryWord({ sku: "Transport Fees", category: null })).toBe("ACCESSORY");
    expect(categoryWord({ sku: "1013Jager/Fab3-Queen/ PC151-18", category: null })).toBe("BEDFRAME");
  });

  it("ABSENT is not null — an older Worker sends no key and the parser answers", () => {
    expect(categoryWord({ sku: "FORTE-L1202F-Q" })).toBe("MATTRESS");
  });

  it("`Not in catalog` is the unknown word (CS:1082) — an unrecognised line is never called an Accessory", () => {
    // The trap this test guards: folding `unknown` into `acc` (which
    // `resolvedCategory` does by design) would retire a ruled word and print
    // ACCESSORY over goods nothing recognised. That is D9's original lie.
    expect(categoryWord({ sku: "ZZZ-NOTHING-RECOGNISES-THIS" })).toBe("NOT IN CATALOG");
  });

  it("formatting is unchanged — underscores and dashes become spaces, upper case", () => {
    expect(categoryWord({ sku: "x", category: "bed_frame" })).toBe("BED FRAME");
    expect(categoryWord({ sku: "x", category: "  sofa  " })).toBe("SOFA");
  });
});
