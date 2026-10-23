import { describe, it, expect } from "vitest";
import { newPurchaseOrderBody, type NewPoDraft } from "./NewPurchaseOrderModal";

/** New Purchase Order (Weisiang's decision, Mr Lim, WhatsApp 2026-10-22): the draft becomes the request body only when complete. */
const S = "00000000-0000-4000-8000-000000000a01";
const D = "00000000-0000-4000-8000-000000000d01";
const draft = (patch: Partial<NewPoDraft> = {}): NewPoDraft => ({
  supplierId: S, destinationId: D, etaDate: "2026-11-20", note: "",
  lines: [{ key: 1, sku: "SOFA-1", qty: "2", price: "" }, { key: 2, sku: "BED-1", qty: "1", price: "450.50" }],
  ...patch,
});

describe("newPurchaseOrderBody", () => {
  it("builds a sourceless order: a blank price is left for the Catalog, an entered one is sent", () => {
    expect(newPurchaseOrderBody(draft({ note: "  Showroom  " }))).toEqual({
      supplierId: S, destinationId: D, etaDate: "2026-11-20", note: "Showroom",
      lines: [{ sku: "SOFA-1", qty: 2, price: null }, { sku: "BED-1", qty: 1, price: 450.5 }],
    });
  });

  it("a Consignment Order is the same body, marked consignment (Weisiang 2026-10-22)", () => {
    expect(newPurchaseOrderBody(draft(), true)).toMatchObject({ consignment: true, lines: [{ sku: "SOFA-1" }, { sku: "BED-1", price: 450.5 }] });
    expect(newPurchaseOrderBody(draft())).not.toHaveProperty("consignment");
  });

  it("skips an empty line but needs at least one item", () => {
    expect(newPurchaseOrderBody(draft({ lines: [{ key: 1, sku: "SOFA-1", qty: "1", price: "" }, { key: 2, sku: "", qty: "1", price: "" }] }))?.lines).toHaveLength(1);
    expect(newPurchaseOrderBody(draft({ lines: [{ key: 1, sku: "", qty: "1", price: "" }] }))).toBeNull();
  });

  it("is not ready without a supplier, a Deliver To, or a whole positive qty", () => {
    expect(newPurchaseOrderBody(draft({ supplierId: "" }))).toBeNull();
    expect(newPurchaseOrderBody(draft({ destinationId: "" }))).toBeNull();
    expect(newPurchaseOrderBody(draft({ lines: [{ key: 1, sku: "SOFA-1", qty: "0", price: "" }] }))).toBeNull();
    expect(newPurchaseOrderBody(draft({ lines: [{ key: 1, sku: "SOFA-1", qty: "1.5", price: "" }] }))).toBeNull();
    expect(newPurchaseOrderBody(draft({ lines: [{ key: 1, sku: "SOFA-1", qty: "1", price: "-3" }] }))).toBeNull();
  });
});
