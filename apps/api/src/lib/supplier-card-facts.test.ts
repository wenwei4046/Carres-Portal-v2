import { describe, expect, it } from "vitest";
import { supplierPoFactsOf, type SupplierFactRows } from "./supplier-card-facts";

const base: SupplierFactRows = {
  pos: [
    {
      id: "PO-A",
      status: "open",
      placed_at: "2026-10-01T02:00:00Z",
      official_delivery_date: "2026-10-20",
      eta_date: "2026-10-21",
      do_number: null,
      do_uploaded_at: null,
      destination_id: "d1",
      suppliers: { name: "Sleepwell" },
    },
    {
      id: "PO-X",
      status: "cancelled",
      placed_at: "2026-10-01T02:00:00Z",
      official_delivery_date: "2026-10-20",
      eta_date: null,
      do_number: null,
      do_uploaded_at: null,
      destination_id: "d1",
      suppliers: [{ name: "Gone" }],
    },
  ],
  lines: [{ po_id: "PO-A", destination_id: null }],
  destinations: [{ id: "d1", name: "Carres Klang Warehouse" }],
  promises: [
    { po_id: "PO-A", answer: "confirmed", new_date: "2026-10-20", about_date: "2026-10-20", previous_date: null, reason: null, evidence: null, recorded_at: "2026-10-02T01:00:00Z" },
    { po_id: "PO-A", answer: "delayed", new_date: "2026-10-30", about_date: "2026-10-20", previous_date: "2026-10-20", reason: "Production Delay", evidence: "wa.jpg", recorded_at: "2026-10-10T01:00:00Z" },
  ],
  receipts: [
    { po_id: "PO-A", goods_received_at: "2026-10-29T03:00:00Z", status: "voided" },
  ],
};

describe("supplierPoFactsOf reads Purchasing and the Warehouse, never guesses", () => {
  it("keeps the immutable original date, takes the LATEST reply and Purchasing's effective arrival", () => {
    const [a, ...rest] = supplierPoFactsOf(base);
    expect(rest).toHaveLength(0); // a cancelled PO is not a supplier of this delivery
    expect(a).toMatchObject({
      poNo: "PO-A",
      supplier: "Sleepwell",
      issued: true,
      originalIso: "2026-10-20",
      effectiveIso: "2026-10-30",
      reply: { answer: "delayed", reason: "Production Delay", evidence: "wa.jpg" },
      deliverTo: "Carres Klang Warehouse",
      supplierDo: null,
    });
  });

  it("a voided receipt is not a GRN; a live one is", () => {
    expect(supplierPoFactsOf(base)[0].grnIso).toBeNull();
    const live = { ...base, receipts: [{ po_id: "PO-A", goods_received_at: "2026-10-29T03:00:00Z", status: "posted" }] };
    expect(supplierPoFactsOf(live)[0].grnIso).toBe("2026-10-29");
  });

  it("with no reply the original date stands; the Supplier DO comes from the PO", () => {
    const quiet = { ...base, promises: [], pos: [{ ...base.pos[0], do_number: "DO-5531", do_uploaded_at: "2026-10-19T02:00:00Z" }] };
    const [a] = supplierPoFactsOf(quiet);
    expect(a.effectiveIso).toBe("2026-10-20");
    expect(a.supplierDo).toEqual({ number: "DO-5531", atIso: "2026-10-19T02:00:00Z" });
  });
});
