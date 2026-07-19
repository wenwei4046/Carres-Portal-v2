import { describe, it, expect } from "vitest";

import {
  detectMissingLines,
  normalizeRefTokens,
  type AppendOrderRef,
  type MasterAppendRow,
} from "./master-append";

// Real-world fixtures from the 2026-07-18 "Master 18 Jul 26.xlsx" reconcile —
// each case is an actual order from that import's 12-unmatched list.

const row = (r: Partial<MasterAppendRow>): MasterAppendRow => ({
  ref: "X",
  itemGroup: "Sofa",
  qty: 1,
  detail: "item",
  po: "",
  ...r,
});

describe("normalizeRefTokens", () => {
  it("splits combined refs on + / , & and sorts uniq upper", () => {
    expect(normalizeRefTokens("CR0925 + TCF0394")).toEqual(["CR0925", "TCF0394"]);
    expect(normalizeRefTokens("TCF0394 +  CR0925")).toEqual(["CR0925", "TCF0394"]);
    expect(normalizeRefTokens("SO/20010")).toEqual(["20010", "SO"]);
    expect(normalizeRefTokens("  ")).toEqual([]);
  });
});

describe("detectMissingLines", () => {
  it("TCF0544 (true second sofa): candidate + clean when every portal line is in the sheet", () => {
    const orders: AppendOrderRef[] = [
      {
        id: "o1138",
        so: 1138,
        sourceRef: ["TCF0544"],
        lines: [{ sku: 'SF03-HK5535/30"(3 Seater)', sourcePo: "PO/2606-111" }],
      },
    ];
    const rows = [
      row({ ref: "TCF0544", detail: 'DSL9038/30"(3 Seater)', po: "PO/2606-099" }),
      row({ ref: "TCF0544", detail: 'SF03-HK5535/30"(3 Seater)', po: "PO/2606-111" }),
    ];
    const out = detectMissingLines(rows, orders);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      orderId: "o1138",
      so: 1138,
      po: "PO/2606-099",
      clean: true,
      portalUnaccounted: [],
    });
  });

  it("TCF0545 (model changed, portal newer): candidate but NOT clean — portal line unaccounted", () => {
    const orders: AppendOrderRef[] = [
      {
        id: "o1140",
        so: 1140,
        sourceRef: ["TCF0545"],
        lines: [{ sku: 'HK5531/28"(2 Seater + Lshape)', sourcePo: "PO/2606-113" }],
      },
    ];
    // The sheet only carries the STALE row — its PO is nowhere on the order,
    // and the portal's PO-113 line is nowhere in the sheet.
    const out = detectMissingLines(
      [row({ ref: "TCF0545", detail: 'DSL9055/28"(2 Seater + Lshape)', po: "PO/2606-101" })],
      orders,
    );
    expect(out).toHaveLength(1);
    expect(out[0].clean).toBe(false);
    expect(out[0].portalUnaccounted).toEqual([
      { sku: 'HK5531/28"(2 Seater + Lshape)', sourcePo: "PO/2606-113" },
    ]);
  });

  it("TCF0529 (portal line lost its PO): candidate but NOT clean — PO-less line counts as divergence", () => {
    const orders: AppendOrderRef[] = [
      {
        id: "o1104",
        so: 1104,
        sourceRef: ["TCF0529"],
        lines: [{ sku: 'Modulo AM9038/30"(2 Seater+L)', sourcePo: null }],
      },
    ];
    const out = detectMissingLines(
      [row({ ref: "TCF0529", detail: 'DSL9038/30"(2 Seater+L)', po: "PO/2606-032" })],
      orders,
    );
    expect(out).toHaveLength(1);
    expect(out[0].clean).toBe(false);
  });

  it("TCF0549 (sheet PO already on the order): no candidate", () => {
    const orders: AppendOrderRef[] = [
      {
        id: "o1132",
        so: 1132,
        sourceRef: ["TCF0549"],
        lines: [{ sku: 'DSL9055/28"', sourcePo: "PO/2606-103" }],
      },
    ];
    expect(
      detectMissingLines([row({ ref: "TCF0549", po: "PO/2606-103" })], orders),
    ).toHaveLength(0);
  });

  it("matches PO case/space-insensitively and inside multi-PO cells", () => {
    const orders: AppendOrderRef[] = [
      {
        id: "o1",
        so: 1,
        sourceRef: ["CR1"],
        lines: [{ sku: "a", sourcePo: "PO/2605-100, PO/2605-101" }],
      },
    ];
    expect(
      detectMissingLines([row({ ref: "CR1", po: " po/2605-101" })], orders),
    ).toHaveLength(0);
  });

  it("combined-ref rows group to the exact source_ref-set order, either token order", () => {
    const orders: AppendOrderRef[] = [
      { id: "oBoth", so: 2, sourceRef: ["CR0925", "TCF0394"], lines: [] },
      { id: "oSingle", so: 3, sourceRef: ["CR0925"], lines: [{ sku: "b", sourcePo: "PO/9" }] },
    ];
    const out = detectMissingLines(
      [
        row({ ref: "TCF0394 +  CR0925", detail: "sofa", po: "PO/1" }),
        row({ ref: "CR0925", detail: "bed", po: "PO/2" }),
      ],
      orders,
    );
    // combined row → oBoth (exact set); single row → oSingle (exact set).
    expect(out.map((c) => [c.orderId, c.po])).toEqual([
      ["oBoth", "PO/1"],
      ["oSingle", "PO/2"],
    ]);
  });

  it("rows with no PO are never candidates; unknown refs are skipped", () => {
    const orders: AppendOrderRef[] = [
      { id: "o1", so: 1, sourceRef: ["CR1"], lines: [] },
    ];
    expect(
      detectMissingLines(
        [row({ ref: "CR1", po: "" }), row({ ref: "NOPE", po: "PO/1" })],
        orders,
      ),
    ).toHaveLength(0);
  });
});
