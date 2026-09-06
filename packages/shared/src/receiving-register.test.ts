import { describe, it, expect } from "vitest";
import {
  buildGrnRegisterView,
  expectedArrivalCounts,
  type GrnRegisterFactRow,
} from "./receiving-register";
import type { PoDatePromise } from "./po-workspace";

/**
 * The Receiving page's ONE register arithmetic (owner correction 2026-09-06):
 * server-side pagination and rail counts over the WHOLE filtered result set,
 * and Calendar markers from the governed `Supplier Delivery Date` — never a
 * self-computed estimate.
 */

const row = (over: Partial<GrnRegisterFactRow> & { id: string }): GrnRegisterFactRow => ({
  categories: ["Mattress"],
  supplierName: "Nice Future",
  siteName: "Carres Klang",
  supplierDeliveryDateIso: "2026-09-08",
  searchText: `${over.id} PO-2001 DO-5512 Nice Future`,
  ...over,
});

const ROWS: GrnRegisterFactRow[] = [
  row({ id: "g1" }),
  row({ id: "g2", categories: ["Sofa"], supplierName: "Ohana", siteName: "Carres Setia", supplierDeliveryDateIso: "2026-09-09", searchText: "g2 PO-2002 DO-7000 Ohana" }),
  row({ id: "g3", categories: ["Mattress", "Bedframe"], supplierDeliveryDateIso: null }),
];

describe("buildGrnRegisterView — filters, facets, the page slice", () => {
  it("no selection: total is everything, facets count the whole set", () => {
    const v = buildGrnRegisterView(ROWS, {}, 0, 50);
    expect(v.total).toBe(3);
    expect(v.pageIds).toEqual(["g1", "g2", "g3"]);
    expect(v.facets.category).toEqual({ Mattress: 2, Bedframe: 1, Sofa: 1 });
    expect(v.facets.supplier).toEqual({ "Nice Future": 2, Ohana: 1 });
    expect(v.facets.site).toEqual({ "Carres Klang": 2, "Carres Setia": 1 });
  });

  it("the page slice obeys offset/limit while total stays the filtered whole", () => {
    const v = buildGrnRegisterView(ROWS, {}, 1, 1);
    expect(v.total).toBe(3);
    expect(v.pageIds).toEqual(["g2"]);
  });

  it("a category pick narrows rows and the OTHER facets; its own facet keeps every choice countable", () => {
    const v = buildGrnRegisterView(ROWS, { category: "Sofa" }, 0, 50);
    expect(v.pageIds).toEqual(["g2"]);
    // Category counts ignore the category pick — clicking Mattress would show 2.
    expect(v.facets.category).toEqual({ Mattress: 2, Bedframe: 1, Sofa: 1 });
    // Supplier counts respect it — clicking Nice Future under Sofa shows 0 rows.
    expect(v.facets.supplier).toEqual({ Ohana: 1 });
  });

  it("the Calendar's Supplier Delivery Date narrows EVERY section and the total", () => {
    const v = buildGrnRegisterView(ROWS, { expected: "2026-09-08" }, 0, 50);
    expect(v.total).toBe(1);
    expect(v.pageIds).toEqual(["g1"]);
    // g3 has no supplier date — it never matches a picked date.
    expect(v.facets.category).toEqual({ Mattress: 1 });
    expect(v.facets.supplier).toEqual({ "Nice Future": 1 });
  });

  it("search matches the governed text case-insensitively and narrows facets", () => {
    const v = buildGrnRegisterView(ROWS, { q: "ohana" }, 0, 50);
    expect(v.total).toBe(1);
    expect(v.pageIds).toEqual(["g2"]);
    expect(v.facets.site).toEqual({ "Carres Setia": 1 });
  });
});

describe("expectedArrivalCounts — the Calendar's markers", () => {
  const promise = (date: string): PoDatePromise =>
    ({
      kind: "tomorrow_delivery",
      answer: "confirmed",
      about_date: null,
      previous_date: null,
      new_date: date,
      po_version: 1,
      channel: "whatsapp",
      recipient: "Ohana group",
      evidence: "evidence/reply.jpg",
      reported_by: "Factory PIC",
      reported_at: "2026-09-01T02:00:00Z",
      recorded_by: "u-1",
      recorded_at: "2026-09-01T03:00:00Z",
      reason: null,
      remarks: null,
    }) as PoDatePromise;

  const po = (over: Record<string, unknown>) => ({
    status: "open",
    version: 1,
    promises: [promise("2026-09-08")],
    purchase_order_lines: [{ qty: 3, received_qty: 0 }],
    ...over,
  });

  it("counts open, still-owing POs per governed Supplier Delivery Date", () => {
    expect(
      expectedArrivalCounts([po({}), po({}), po({ promises: [promise("2026-09-09")] })]),
    ).toEqual({ "2026-09-08": 2, "2026-09-09": 1 });
  });

  it("a fully received or closed PO stops being expected", () => {
    expect(
      expectedArrivalCounts([
        po({ purchase_order_lines: [{ qty: 3, received_qty: 3 }] }),
        po({ status: "cancelled" }),
      ]),
    ).toEqual({});
  });

  it("a PO whose supplier never evidenced a date marks nothing — our own estimate is not an arrival", () => {
    expect(expectedArrivalCounts([po({ promises: [] })])).toEqual({});
    // An un-evidenced reply is recorded but never the governed date.
    const bare = { ...promise("2026-09-10"), evidence: null };
    expect(expectedArrivalCounts([po({ promises: [bare] })])).toEqual({});
  });
});
