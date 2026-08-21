import { describe, expect, it } from "vitest";
import { catalogPriceHint, skuEditPatch } from "./SalesOrderWorkspace";

/**
 * THE OFFICE CREATE DOOR ASKS THE CATALOG (2026-08-21).
 *
 * Measured before this change: the Ops create door took a SKU as FREE TEXT and
 * a unit price as a free number, while the POS one screen away could only ever
 * offer SKUs the catalog holds and derived the price from `product_skus.price`.
 * A typo produced a line no stock, PO or readiness engine recognises, and
 * creation still succeeded.
 *
 * The two rules below are the whole behaviour change, and both are deliberately
 * PERMISSIVE — see each test for why refusing would be the worse defect.
 */
const SOFA = { price: 1950, label: "Hookka Lounger · 3-Seater" };

describe("catalogPriceHint — the catalog is shown, never enforced", () => {
  it("says nothing when the catalog has no row for the SKU", () => {
    // 975 live units are in this bucket. A field that nags about every
    // AutoCount line teaches the operator to ignore the hint.
    expect(catalogPriceHint(undefined, 0)).toBeUndefined();
    expect(catalogPriceHint(undefined, 1234)).toBeUndefined();
  });

  it("states the catalog price when the line agrees with it", () => {
    expect(catalogPriceHint(SOFA, 1950)).toBe("Catalog RM 1950.00");
  });

  it("says the line DIFFERS rather than refusing it", () => {
    // An order may legitimately sell at another figure — a discount, a bundle,
    // goodwill. `product_skus.price` is the CATALOG's number (0175 makes it
    // principal-only); `order_lines.unit_price` is the ORDER's number.
    expect(catalogPriceHint(SOFA, 1800)).toBe("Catalog RM 1950.00 — this line differs");
    expect(catalogPriceHint(SOFA, 0)).toBe("Catalog RM 1950.00 — this line differs");
  });

  it("is a HINT and never an error string — red has one job", () => {
    // Guard on the contract, not the wording: whatever this returns is passed
    // to Input's `hint`, never its `error`. If a later change starts returning
    // something that reads as a refusal, this test is where the argument goes.
    const out = catalogPriceHint(SOFA, 1800);
    expect(out).not.toMatch(/invalid|refus|must|required|error/i);
  });
});

describe("skuEditPatch — fill a blank price, never overwrite a typed one", () => {
  it("fills the catalog price into a fresh line", () => {
    // 0 is the field's EMPTY state (a new line starts there), not a decision to
    // sell for nothing, so filling it is completion rather than correction.
    expect(skuEditPatch("HK-3S", SOFA, 0)).toEqual({ sku: "HK-3S", unit_price: 1950 });
  });

  it("leaves a price the operator already typed alone", () => {
    // The whole reason this is a patch function and not an assignment: an
    // agreed price must survive the operator correcting a typo in the SKU.
    expect(skuEditPatch("HK-3S", SOFA, 1800)).toEqual({ sku: "HK-3S" });
  });

  it("passes an unlisted SKU straight through — the office may still type one", () => {
    // Refusing here would make AutoCount reality unenterable, which is a worse
    // defect than the free text it replaces. The catalog stops being the silent
    // default; it does not become a gate.
    expect(skuEditPatch("1013Jager/Fab3-Queen/ PC151-18", undefined, 0)).toEqual({
      sku: "1013Jager/Fab3-Queen/ PC151-18",
    });
    expect(skuEditPatch("Transport Fees", undefined, 250)).toEqual({ sku: "Transport Fees" });
  });

  it("never returns unit_price when there is nothing to fill it from", () => {
    expect(skuEditPatch("ZZZ", undefined, 0)).not.toHaveProperty("unit_price");
  });
});
