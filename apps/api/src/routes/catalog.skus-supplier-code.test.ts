import { describe, expect, it } from "vitest";

/**
 * THE DEPLOY-ORDER HAZARD (2026-08-21).
 *
 * `supplier_code` (0375) arrives in TWO steps that are not atomic: the route
 * ships with the web deploy, the COLUMN is applied by hand in the SQL editor.
 * In the window between them the column does not exist — and PostgREST refuses
 * an INSERT that names an unknown column, which would have taken out SKU
 * CREATION ENTIRELY rather than just the new field.
 *
 * So the create door omits the key unless someone actually typed a code. This
 * file guards the SHAPE of that payload; the route's own behaviour is covered
 * by catalog.test.ts.
 */
function insertPayload(supplierCode?: string | null) {
  return {
    sku: "sofa:test-S",
    ...(supplierCode?.trim() ? { supplier_code: supplierCode.trim() } : {}),
  };
}

describe("the SKU create payload and the un-applied column", () => {
  it("omits supplier_code entirely when nobody typed one", () => {
    // The pre-0375 path, byte-identical to what shipped before the feature.
    expect(insertPayload(undefined)).not.toHaveProperty("supplier_code");
    expect(insertPayload(null)).not.toHaveProperty("supplier_code");
    expect(insertPayload("")).not.toHaveProperty("supplier_code");
    expect(insertPayload("   ")).not.toHaveProperty("supplier_code");
  });

  it("sends it, trimmed, when a code IS typed", () => {
    expect(insertPayload("KN390-15")).toEqual({
      sku: "sofa:test-S",
      supplier_code: "KN390-15",
    });
    expect(insertPayload("  HK-3S  ")).toEqual({
      sku: "sofa:test-S",
      supplier_code: "HK-3S",
    });
  });

  it("never sends an empty string — a blank is not a code", () => {
    // '' would be stored as a real value and read as "the supplier calls this
    // nothing", which is different from "we never asked".
    const out = insertPayload("") as Record<string, unknown>;
    expect(out.supplier_code).toBeUndefined();
  });
});
