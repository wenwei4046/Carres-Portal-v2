import { describe, it, expect } from "vitest";
import {
  buildGrnRegisterView,
  expectedArrivalCounts,
  grnDateMonths,
  grnDateWeeks,
  grnWeekStart,
  type GrnRegisterFactRow,
} from "./receiving-register";
import type { PoDatePromise } from "./po-workspace";

/**
 * The Receiving page's ONE register arithmetic (owner correction 2026-09-06;
 * rail overwritten by the owner ruling 2026-09-17 and PURCHASING CARD 12):
 * server-side pagination and rail counts over the WHOLE filtered result set,
 * the six rail groups, and the Arrival Schedule's expected-arrival markers
 * from the governed supplier reply — never a self-computed estimate.
 */

const row = (over: Partial<GrnRegisterFactRow> & { id: string }): GrnRegisterFactRow => ({
  categories: ["Mattress"],
  supplierName: "Nice Future",
  siteName: "Carres Klang",
  grnDateIso: "2026-09-16",
  damaged: false,
  wrongItem: false,
  extra: false,
  cancelled: false,
  searchText: `${over.id} PO-2001 DO-5512 Nice Future`,
  ...over,
});

const ROWS: GrnRegisterFactRow[] = [
  row({ id: "g1" }),
  row({ id: "g2", categories: ["Sofa"], supplierName: "Ohana", siteName: "Carres Setia", grnDateIso: "2026-09-17", searchText: "g2 PO-2002 DO-7000 Ohana" }),
  row({ id: "g3", categories: ["Mattress", "Bedframe"], grnDateIso: null }),
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

  it("a GRN date pick narrows EVERY section and the total", () => {
    const v = buildGrnRegisterView(
      ROWS,
      { from: "2026-09-16", to: "2026-09-16" },
      0,
      50,
    );
    expect(v.total).toBe(1);
    expect(v.pageIds).toEqual(["g1"]);
    // g3 has no recorded creation date — it is never given one to match.
    expect(v.facets.category).toEqual({ Mattress: 1 });
    expect(v.facets.supplier).toEqual({ "Nice Future": 1 });
    // The GRN-date facet itself keeps every day countable.
    expect(v.facets.grnDate).toEqual({ "2026-09-16": 1, "2026-09-17": 1 });
  });

  it("a week is one inclusive range, not seven picks", () => {
    const v = buildGrnRegisterView(
      ROWS,
      { from: "2026-09-14", to: "2026-09-20" },
      0,
      50,
    );
    expect(v.total).toBe(2);
    expect(v.pageIds).toEqual(["g1", "g2"]);
  });

  it("search matches the governed text case-insensitively and narrows facets", () => {
    const v = buildGrnRegisterView(ROWS, { q: "ohana" }, 0, 50);
    expect(v.total).toBe(1);
    expect(v.pageIds).toEqual(["g2"]);
    expect(v.facets.site).toEqual({ "Carres Setia": 1 });
  });
});

describe("the rail's `Received with` rows — a record, never a to-do list", () => {
  const FOUND: GrnRegisterFactRow[] = [
    // One GRN carries TWO exceptions — which is exactly why the three counts
    // may never be added into a total.
    row({ id: "f1", damaged: true, wrongItem: true }),
    row({ id: "f2", extra: true, supplierName: "Ohana" }),
    row({ id: "f3" }),
    row({ id: "f4", cancelled: true, damaged: true }),
  ];

  it("counts GRNs, overlapping, and the sum exceeds the matching records", () => {
    const v = buildGrnRegisterView(FOUND, {}, 0, 50);
    expect(v.facets.receivedWith).toEqual({ damaged: 2, wrong_item: 1, extra: 1 });
    // 2 + 1 + 1 = 4 while only three GRNs carry an exception: NEVER a total.
    const records = FOUND.filter((r) => r.damaged || r.wrongItem || r.extra);
    expect(records).toHaveLength(3);
  });

  it("picking Damaged goods narrows the rows and the other groups", () => {
    const v = buildGrnRegisterView(FOUND, { receivedWith: "damaged" }, 0, 50);
    expect(v.pageIds).toEqual(["f1", "f4"]);
    expect(v.facets.supplier).toEqual({ "Nice Future": 2 });
    // Its own group stays fully countable — clicking Extra goods shows 1.
    expect(v.facets.receivedWith).toEqual({ damaged: 2, wrong_item: 1, extra: 1 });
  });

  it("Cancelled GRNs is a row of its own, and the default listing holds both", () => {
    expect(buildGrnRegisterView(FOUND, {}, 0, 50).total).toBe(4);
    expect(buildGrnRegisterView(FOUND, {}, 0, 50).facets.cancelled).toBe(1);
    const only = buildGrnRegisterView(FOUND, { cancelled: true }, 0, 50);
    expect(only.pageIds).toEqual(["f4"]);
  });
});

describe("the GRN date ladder — weeks Monday to Sunday, only days that exist", () => {
  const COUNTS = {
    "2026-09-14": 2, // Monday
    "2026-09-20": 1, // Sunday of the same week
    "2026-09-21": 3, // the next Monday
    "2026-08-31": 1, // the month before
  };

  it("a week runs Monday to Sunday", () => {
    expect(grnWeekStart("2026-09-20")).toBe("2026-09-14");
    expect(grnWeekStart("2026-09-14")).toBe("2026-09-14");
    expect(grnWeekStart("2026-09-21")).toBe("2026-09-21");
  });

  it("weeks carry their own days, newest first, and never invent an empty day", () => {
    const weeks = grnDateWeeks(COUNTS);
    expect(weeks.map((w) => w.from)).toEqual(["2026-09-21", "2026-09-14", "2026-08-31"]);
    const middle = weeks[1]!;
    expect(middle.to).toBe("2026-09-20");
    expect(middle.count).toBe(3);
    // Sunday is listed; the five days with no GRN are not.
    expect(middle.days.map((d) => d.iso)).toEqual(["2026-09-20", "2026-09-14"]);
  });

  it("months fold the same day counts and carry their own inclusive range", () => {
    const months = grnDateMonths(COUNTS);
    expect(months.map((m) => [m.period, m.count])).toEqual([
      ["2026-09", 6],
      ["2026-08", 1],
    ]);
    expect(months[1]).toMatchObject({ from: "2026-08-01", to: "2026-08-31" });
  });
});

describe("expectedArrivalCounts — the Arrival Schedule's markers", () => {
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
