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
      description: "Booqit King · Ready Stock",
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

describe("context draft papers retain the owning allocation walls", () => {
  it("prints residual purchase quantities per destination/date without recipient data or official dates", async () => {
    const { contextPurchaseDraftPos } = await import("./manual-purchase-draft-po");
    const context = { version: 1, origin: "manual", purpose: "general_purchase", proceedDate: "2026-10-18", stockDeliveryDate: null,
      serviceCaseId: null, reason: "company_use", companyPersonName: "", projectReference: "", explanation: "", forecastChangeReason: "",
      recipients: [{ name: "PRIVATE TEST RECIPIENT", phone: "PRIVATE TEST PHONE" }], lines: [{ id: "TEST-line", sku: "TEST-SKU", qty: 5, attrs: { fabric: "TEST" },
        recipientNeeds: [], stockProposals: [{ qty: 1 }], allocations: [
          { id: "TEST-a", destinationId: "TEST-A", supplierDeliveryDate: "2026-11-20", qty: 2, recipients: [] },
          { id: "TEST-b", destinationId: "TEST-B", supplierDeliveryDate: "2026-11-20", qty: 1, recipients: [] },
          { id: "TEST-c", destinationId: "TEST-A", supplierDeliveryDate: "2026-11-21", qty: 1, recipients: [] },
        ] }] } as unknown as import("@carres/shared").PurchaseRequestContext;
    const papers = contextPurchaseDraftPos({ context, items: [{ sku: "TEST-SKU", label: "TEST goods", supplier: "TEST supplier" }],
      destinations: [{ id: "TEST-A", name: "TEST A", address: "TEST address A" }, { id: "TEST-B", name: "TEST B", address: "TEST address B" }],
      suppliers: [{ name: "TEST supplier" }], plan: [{ sku: "TEST-SKU", category: "sofa" }], collectedSupplierNames: new Set() });
    expect(papers).toHaveLength(3);
    expect(papers.map(p => p.data.lines[0].qty)).toEqual([2,1,1]);
    expect(papers.map(p => p.data.destination.name)).toEqual(["TEST A","TEST B","TEST A"]);
    for (const paper of papers) expect(paper.data).toMatchObject({ draft: true, issue_date: "", eta_date: null, so_refs: [] });
    expect(JSON.stringify(papers)).not.toContain("PRIVATE TEST");
    expect(new Set(papers.map(p => p.key)).size).toBe(3);
    const repeated = structuredClone(context.lines[0]); repeated.id = "TEST-second-line";
    repeated.allocations = [{ ...repeated.allocations[0], id: "TEST-second-source", qty: 1 }];
    const merged = contextPurchaseDraftPos({ context: { ...context, lines: [...context.lines, repeated] },
      items: [{ sku: "TEST-SKU", label: "TEST goods", supplier: "TEST supplier" }],
      destinations: [{ id: "TEST-A", name: "TEST A" }, { id: "TEST-B", name: "TEST B" }], suppliers: [],
      plan: [{ sku: "TEST-SKU", category: "sofa" }], collectedSupplierNames: new Set() });
    expect(merged[0].data.lines).toHaveLength(1);
    expect(merged[0].data.lines[0].qty).toBe(3);
  });
});
