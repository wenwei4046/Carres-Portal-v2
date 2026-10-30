import { describe, expect, it } from "vitest";
import { buildMrpLines, mrpCsv, mrpRows, type MrpSourceLine } from "./mrp";
import { buildToOrder, type ToOrderLine } from "./to-order";

const src = (over: Partial<MrpSourceLine> = {}): MrpSourceLine => ({
  lineId: "L1",
  orderId: "O1",
  so: 101,
  customer: "TEST",
  sku: "SKU-A",
  model: "Haven",
  variant: "King",
  category: "mattress",
  supplierName: "Test Supplier",
  delivery: "2026-11-20",
  placedAt: "2026-10-01",
  needed: 1,
  heldInStock: 0,
  heldOnPo: 0,
  ...over,
});

const ALL = { category: null, month: null, shortagesOnly: false };
const TODAY = "2026-10-30";

describe("the four MRP numbers", () => {
  it("Needed less In Stock less On PO is Shortage", () => {
    const lines = buildMrpLines([src({ needed: 10, heldInStock: 2, heldOnPo: 1 })], { "SKU-A": 3 }, TODAY);
    expect(mrpRows(lines, {}, ALL)[0]).toMatchObject({
      needed: 10, inStock: 2, onPo: 4, shortage: 4,
    });
  });

  it("an open PO bigger than the need leaves no Shortage and On PO stops at the need", () => {
    const lines = buildMrpLines([src({ needed: 2 })], { "SKU-A": 9 }, TODAY);
    expect(mrpRows(lines, {}, ALL)[0]).toMatchObject({ onPo: 2, shortage: 0 });
  });

  it("Free Stock is shown and does not lower Shortage", () => {
    const lines = buildMrpLines([src({ needed: 5 })], {}, TODAY);
    expect(mrpRows(lines, { "SKU-A": 5 }, ALL)[0]).toMatchObject({ freeStock: 5, shortage: 5 });
  });

  it("one open PO covers the earliest delivery once, never two orders", () => {
    const lines = buildMrpLines(
      [
        src({ lineId: "late", orderId: "O2", delivery: "2026-12-01", needed: 2 }),
        src({ lineId: "soon", orderId: "O1", delivery: "2026-11-01", needed: 2 }),
      ],
      { "SKU-A": 3 },
      TODAY,
    );
    expect(lines.find((l) => l.lineId === "soon")).toMatchObject({ onPo: 2, shortage: 0 });
    expect(lines.find((l) => l.lineId === "late")).toMatchObject({ onPo: 1, shortage: 1 });
    expect(mrpRows(lines, {}, ALL)[0]).toMatchObject({ needed: 4, onPo: 3, shortage: 1 });
  });

  it("a filter never moves PO cover between orders", () => {
    const lines = buildMrpLines(
      [
        src({ lineId: "nov", delivery: "2026-11-01", needed: 2 }),
        src({ lineId: "dec", delivery: "2026-12-01", needed: 2 }),
      ],
      { "SKU-A": 2 },
      TODAY,
    );
    expect(mrpRows(lines, {}, { ...ALL, month: "2026-12" })[0]).toMatchObject({ needed: 2, onPo: 0, shortage: 2 });
  });

  it("a line with no delivery date still counts and has its own filter", () => {
    const lines = buildMrpLines([src({ delivery: null, needed: 3 })], {}, TODAY);
    expect(mrpRows(lines, {}, { ...ALL, month: "none" })[0]).toMatchObject({ shortage: 3 });
  });

  it("Shortages hides a covered item, and the biggest Shortage comes first", () => {
    const lines = buildMrpLines(
      [
        src({ lineId: "a", sku: "SKU-A", needed: 1 }),
        src({ lineId: "b", sku: "SKU-B", needed: 4 }),
        src({ lineId: "c", sku: "SKU-C", needed: 1, heldInStock: 1 }),
      ],
      {},
      TODAY,
    );
    expect(mrpRows(lines, {}, { ...ALL, shortagesOnly: true }).map((r) => r.sku)).toEqual(["SKU-B", "SKU-A"]);
  });

  it("Shortage is the same number SO Batch Purchase has left to buy", () => {
    const sources = [
      src({ lineId: "a", needed: 3 }),
      src({ lineId: "b", orderId: "O2", needed: 2, delivery: "2026-12-01" }),
    ];
    const openPoBySku = { "SKU-A": 4 };
    const toOrderLines: ToOrderLine[] = sources.map((s) => ({
      lineId: s.lineId, orderId: s.orderId, sku: s.sku, category: s.category, supplierId: "S",
      qty: s.needed, deadline: s.delivery, leadDays: 0, placedAt: s.placedAt, committed: true,
      so: s.so, customerName: s.customer, modelName: s.model, variant: s.variant, variantKind: "size",
      buildKey: null, fabricName: null, legHeight: null, itemHeight: null, cost: null,
    }));
    const toBuy = buildToOrder({
      lines: toOrderLines, suppliers: [{ id: "S", name: "S" }],
      supply: { openPoBySku }, options: { today: TODAY },
    }).flatMap((p) => p.rows).flatMap((r) => r.builds).filter((b) => !b.fullyOnPo)
      .reduce((n, b) => n + b.qty, 0);
    expect(mrpRows(buildMrpLines(sources, openPoBySku, TODAY), {}, ALL)[0].shortage).toBe(toBuy);
    expect(toBuy).toBe(1);
  });
});

describe("mrpCsv", () => {
  it("prints the four numbers and quotes a SKU holding a quote", () => {
    const rows = mrpRows(buildMrpLines([src({ sku: 'Leg 4"', needed: 2 })], {}, TODAY), {}, ALL);
    expect(mrpCsv(rows).split("\r\n")[1]).toBe('"Leg 4""","Haven King","Mattress","Test Supplier","2","0","0","2","0"');
  });
});
