import { describe, expect, it } from "vitest";
import { manualPurchaseDraftPos, type ManualPurchaseDraftLine } from "./manual-purchase-draft-po";

const line = (over: Partial<ManualPurchaseDraftLine> = {}): ManualPurchaseDraftLine => ({
  key: "l1",
  sku: "B1201S-K",
  item: "Booqit King",
  supplierName: "Hooka",
  qty: 2,
  attrs: { color: "Sand", fabric_name: "CG-012" },
  ...over,
});

const draft = (lines: ManualPurchaseDraftLine[], collected: string[] = []) =>
  manualPurchaseDraftPos({
    lines,
    purposeLabel: "Ready Stock",
    destination: { name: "Carres Klang", address: "Lot 5, Klang" },
    suppliers: [
      { name: "Hooka", address: "Jalan Hooka 1" },
      { name: "Ohana", address: "Jalan Ohana 2" },
    ],
    collectedSupplierNames: new Set(collected),
  });

describe("manualPurchaseDraftPos — the create page's draft PO paper", () => {
  it("is a DRAFT: no number, no version, no PO dates, no Unit IDs", () => {
    const [po] = draft([line()]);
    expect(po!.data).toMatchObject({
      draft: true,
      po_number: "DRAFT",
      version: 0,
      issue_date: "",
      eta_date: null,
      delivery_working_days: null,
    });
    expect(po!.data.lines[0]).not.toHaveProperty("unit_codes");
  });

  it("prints the supplier and warehouse addresses and the chosen configuration", () => {
    const [po] = draft([line()]);
    expect(po!.data.supplier).toEqual({ name: "Hooka", address: "Jalan Hooka 1", contact: null });
    expect(po!.data.destination).toEqual({ name: "Carres Klang", address: "Lot 5, Klang" });
    expect(po!.data.lines[0]).toMatchObject({
      sku: "B1201S-K",
      model_name: "Booqit King",
      description: "Ready Stock",
      qty: 2,
      attrs: { color: "Sand", fabric_name: "CG-012" },
    });
  });

  it("draws one paper per supplier — a PO never carries two", () => {
    const pos = draft([
      line({ key: "a" }),
      line({ key: "b", sku: "JAGER-SS", item: "Jager", supplierName: "Ohana" }),
      line({ key: "c", sku: "B1201S-Q", item: "Booqit Queen" }),
    ]);
    expect(pos.map((p) => p.supplierName)).toEqual(["Hooka", "Ohana"]);
    expect(pos[0]!.data.lines.map((l) => l.sku)).toEqual(["B1201S-K", "B1201S-Q"]);
  });

  it("keeps a line with no supplier on a paper that says so", () => {
    const pos = draft([line({ supplierName: null })]);
    expect(pos[0]!.supplierName).toBe("Supplier not set");
    expect(pos[0]!.data.supplier.address).toBeNull();
  });

  it("is still one paper before any item is chosen", () => {
    const pos = draft([]);
    expect(pos).toHaveLength(1);
    expect(pos[0]!.data.lines).toEqual([]);
    expect(pos[0]!.data.destination.name).toBe("Carres Klang");
  });

  it("says We collect only for a supplier Carres collects from", () => {
    expect(draft([line()])[0]!.data.delivery_method).toBeNull();
    expect(draft([line()], ["Hooka"])[0]!.data.delivery_method).toBe("we_collect");
  });
});
