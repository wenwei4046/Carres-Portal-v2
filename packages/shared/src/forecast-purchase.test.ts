import { describe, expect, it } from "vitest";
import {
  forecastPurchaseAddDays,
  forecastPurchaseInScope,
  forecastPurchaseModels,
  forecastPurchasePoGroups,
  forecastPurchaseSuggestion,
  forecastPurchaseWindow,
  type ForecastPurchaseSize,
} from "./forecast-purchase";

const size = (over: Partial<ForecastPurchaseSize>): ForecastPurchaseSize => ({
  sku: "TEST-A-Q", modelId: "m-a", model: "TEST model A", category: "mattress", size: "Queen",
  supplierId: "s1", supplier: "TEST supplier", sold: [0, 0, 0], sold14: 0, free: 0, onPo: 0, ...over,
});

describe("forecastPurchaseWindow", () => {
  it("reads two months ago, last month and this month, and this week's Monday with the next two", () => {
    expect(forecastPurchaseWindow("2026-10-13")).toEqual({
      months: ["2026-08", "2026-09", "2026-10"],
      mondays: ["2026-10-12", "2026-10-19", "2026-10-26"],
      from: "2026-08-01",
      after14: "2026-09-29",
    });
  });

  it("a Monday is its own week's Monday, and a Sunday belongs to the week before", () => {
    expect(forecastPurchaseWindow("2026-10-12").mondays[0]).toBe("2026-10-12");
    expect(forecastPurchaseWindow("2026-10-18").mondays[0]).toBe("2026-10-12");
  });

  it("crosses a year end", () => {
    expect(forecastPurchaseWindow("2027-01-05").months).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(forecastPurchaseAddDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("forecastPurchaseSuggestion", () => {
  it("holds 14 days of sales and buys at most one week of sales a Monday", () => {
    // 7 sold in 14 days: 0.5 a day, level 7, at most 4 a Monday.
    expect(forecastPurchaseSuggestion({ sold14: 7, free: 0, onPo: 0 })).toEqual({ level: 7, cap: 4, weeks: [4, 4, 4] });
  });

  it("suggests only what free stock does not cover", () => {
    expect(forecastPurchaseSuggestion({ sold14: 6, free: 5, onPo: 0 }).weeks[0]).toBe(1);
    expect(forecastPurchaseSuggestion({ sold14: 6, free: 6, onPo: 0 }).weeks[0]).toBe(0);
    expect(forecastPurchaseSuggestion({ sold14: 6, free: 9, onPo: 0 }).weeks[0]).toBe(0);
  });

  it("counts what is already on a PO for stock as stock", () => {
    expect(forecastPurchaseSuggestion({ sold14: 6, free: 2, onPo: 4 }).weeks[0]).toBe(0);
  });

  it("nothing sold in 14 days suggests nothing, now or later", () => {
    expect(forecastPurchaseSuggestion({ sold14: 0, free: 0, onPo: 0 })).toEqual({ level: 0, cap: 1, weeks: [0, 0, 0] });
  });

  it("the next Mondays assume sales continue and each suggestion arrives", () => {
    // 14 sold: 1 a day, level 14, at most 7 a Monday. Stock 10.
    // Monday 1: 14 − 10 = 4. Then 14 in hand, 7 sell: buy 7 back, twice.
    expect(forecastPurchaseSuggestion({ sold14: 14, free: 10, onPo: 0 }).weeks).toEqual([4, 7, 7]);
  });

  it("a skipped week suggests 0 now and the shortfall follows next Monday", () => {
    expect(forecastPurchaseSuggestion({ sold14: 14, free: 10, onPo: 0, skipped: true }).weeks).toEqual([0, 7, 7]);
  });
});

describe("forecastPurchaseModels", () => {
  it("lists a model that sold in the three months, sizes in the fixed order, best seller of last month first", () => {
    const rows = forecastPurchaseModels({ sizes: [
      size({ sku: "A-S", size: "Single", sold: [0, 1, 0] }),
      size({ sku: "A-K", size: "King", sold: [2, 3, 1], sold14: 4, free: 1 }),
      size({ sku: "A-Q", size: "Queen", sold: [1, 0, 0] }),
      size({ sku: "B-Q", modelId: "m-b", model: "TEST model B", size: "Queen", sold: [0, 9, 2], sold14: 2 }),
      size({ sku: "C-Q", modelId: "m-c", model: "TEST model C", size: "Queen" }),
    ] });
    expect(rows.map((r) => r.model)).toEqual(["TEST model B", "TEST model A"]);
    const a = rows[1]!;
    expect(a.sizes.map((s) => s.size)).toEqual(["King", "Queen", "Single"]);
    expect(a.sold).toEqual([3, 4, 1]);
    expect(a.have).toBe(1);
    // King: 4 in 14 days, level 4, cap 2, stock 1: suggest 2.
    expect(a.sizes[0]!.suggested).toBe(2);
    expect(a.weeks[0]).toBe(2);
    expect(a.suggestedSizes).toBe(1);
  });

  it("says why a size cannot be ticked: enough stock, or no supplier in Catalog", () => {
    const [row] = forecastPurchaseModels({ sizes: [
      size({ sku: "A-K", size: "King", sold: [0, 2, 2], sold14: 2, free: 5 }),
      size({ sku: "A-Q", size: "Queen", sold: [0, 2, 2], sold14: 2, supplierId: null, supplier: null }),
    ] });
    expect(row!.sizes.map((s) => s.block)).toEqual(["enough", "no_supplier"]);
    expect(row!.block).toBe("no_supplier");
    expect(row!.suggestedSizes).toBe(0);
  });
});

describe("scope and PO count", () => {
  it("keeps every mattress and the Jager bedframe as stock, nothing else", () => {
    expect(forecastPurchaseInScope("mattress", "anything")).toBe(true);
    expect(forecastPurchaseInScope("bedframe", "jager")).toBe(true);
    expect(forecastPurchaseInScope("bedframe", "other")).toBe(false);
    expect(forecastPurchaseInScope("sofa", null)).toBe(false);
    expect(forecastPurchaseInScope("accessory", null)).toBe(false);
  });

  it("one PO per supplier and category", () => {
    expect(forecastPurchasePoGroups([
      { supplierId: "s1", category: "mattress" }, { supplierId: "s1", category: "mattress" },
      { supplierId: "s2", category: "bedframe" }, { supplierId: "s2", category: "mattress" },
    ])).toBe(3);
  });
});
