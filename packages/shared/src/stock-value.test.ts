import { describe, expect, it } from "vitest";
import { lastDayOf, stockValueQuery, stockValueReport, type StockValueAnswer, type StockValueUnit } from "./stock-value";

const unit = (over: Partial<StockValueUnit>): StockValueUnit => ({
  id: "u", unit_code: "U1-000-001", sku: "SOFA-3S", qty: 1, scope: "unit", status: "free", bucket: "warehouse",
  site_name: "Carres Klang", holder_name: null, po_no: "PO-1", unit_cost: "520.00", value: "520.00", ...over,
});
const answer = (units: StockValueUnit[]): StockValueAnswer => ({
  month_end: "2026-09-30", cut_at: "2026-09-30T16:00:00Z", today: "2026-10-03", provisional: true, units,
  left_out: { consignment_units: 0, consignment_qty: 0 },
});

describe("the provisional stock value", () => {
  it("adds each group in sen, and counts Units with no cost apart, never as zero", () => {
    const r = stockValueReport(answer([
      unit({}),
      unit({ id: "q", unit_code: "QTY-000000001", scope: "quantity", qty: 12, unit_cost: "2.15", value: "25.80" }),
      unit({ id: "s", bucket: "showroom", unit_cost: null, value: null }),
      unit({ id: "t", bucket: "transit", unit_cost: "0", value: "0.00" }),
    ]));
    expect(r.buckets.map((b) => [b.bucket, b.units, b.qty, b.value, b.noCost])).toEqual([
      ["warehouse", 2, 13, 54580, 0],
      ["showroom", 1, 1, 0, 1],
      ["transit", 1, 1, 0, 0],
      ["repair", 0, 0, 0, 0],
      ["unclassified", 0, 0, 0, 0],
    ]);
    expect(r.total).toEqual({ units: 4, qty: 15, value: 54580, noCost: 1 });
  });

  it("refuses a value that is not the quantity times the cost, an unknown group or a broken quantity", () => {
    expect(() => stockValueReport(answer([unit({ value: "521.00" })]))).toThrow("Stock value does not add up.");
    expect(() => stockValueReport(answer([unit({ value: null })]))).toThrow("Stock value does not add up.");
    expect(() => stockValueReport(answer([unit({ unit_cost: null, value: "1.00" })]))).toThrow("Stock value does not add up.");
    expect(() => stockValueReport(answer([unit({ bucket: "dealer" as never })]))).toThrow("Stock value does not add up.");
    expect(() => stockValueReport(answer([unit({ qty: 0 })]))).toThrow("Stock value does not add up.");
  });

  it("reads a month end", () => {
    expect(lastDayOf("2026-02")).toBe("2026-02-28");
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
    expect(lastDayOf("2026-12")).toBe("2026-12-31");
    expect(stockValueQuery.safeParse({ monthEnd: "2026-09-30" }).success).toBe(true);
    expect(stockValueQuery.safeParse({ monthEnd: "Sep" }).success).toBe(false);
  });
});
