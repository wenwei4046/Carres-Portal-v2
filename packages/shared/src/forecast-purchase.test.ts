import { describe, expect, it } from "vitest";
import {
  forecastPurchaseAddDays,
  forecastPurchaseDeliveryDate,
  forecastPurchaseInScope,
  forecastPurchaseIssueShortfall,
  forecastPurchaseModels,
  forecastPurchaseRequestCount,
  forecastPurchaseRequestGroups,
  forecastPurchaseSizeRow,
  forecastPurchaseSuggestion,
  forecastPurchaseToAsk,
  forecastPurchaseWindow,
  type ForecastPurchaseSize,
} from "./forecast-purchase";

const size = (over: Partial<ForecastPurchaseSize>): ForecastPurchaseSize => ({
  sku: "TEST-A-Q", modelId: "m-a", model: "TEST model A", category: "mattress", size: "Queen",
  supplierId: "s1", supplier: "TEST supplier", sold: [0, 0, 0], sold14: 0, free: 0, onPo: 0,
  inProgress: 0, requests: [], deliveryDate: "2026-10-20", ...over,
});
const waiting = (qty: number) => [{ id: "r1", no: "MPR-TEST-1", qty, state: "waiting" as const, fromForecast: true }];

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

describe("forecastPurchaseSuggestion — from stock alone", () => {
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
});

describe("a request in progress is not stock", () => {
  it("never changes the suggestion, the forecast or Free stock; it only lowers what can still be asked", () => {
    const plain = forecastPurchaseSizeRow(size({ sold14: 6, free: 1, onPo: 2 }));
    const asked = forecastPurchaseSizeRow(size({ sold14: 6, free: 1, onPo: 2, inProgress: 2, requests: waiting(2) }));
    // Level 6, 3 in stock: 3 suggested either way.
    expect(asked.suggestion).toEqual(plain.suggestion);
    expect(asked.suggested).toBe(3);
    expect(asked.have).toBe(3);
    expect(plain.toAsk).toBe(3);
    expect(asked.toAsk).toBe(1);
    expect(asked.block).toBeNull();
  });

  it("a size fully asked for cannot be ticked and says it is requested; with nothing suggested it says enough", () => {
    expect(forecastPurchaseSizeRow(size({ sold14: 6, inProgress: 3, requests: waiting(3) })).block).toBe("requested");
    expect(forecastPurchaseSizeRow(size({ sold14: 6, inProgress: 9, requests: waiting(9) })).toAsk).toBe(0);
    expect(forecastPurchaseSizeRow(size({ sold14: 6, free: 9 })).block).toBe("enough");
    expect(forecastPurchaseToAsk(3, 5)).toBe(0);
  });

  it("a model keeps its full suggestion and says separately what is in progress and on a PO", () => {
    const [row] = forecastPurchaseModels({ sizes: [
      size({ sku: "A-K", size: "King", sold: [0, 6, 6], sold14: 6, free: 1, onPo: 2, inProgress: 3, requests: waiting(3) }),
      size({ sku: "A-Q", size: "Queen", sold: [0, 4, 4], sold14: 4 }),
    ] });
    expect(row!.sizes.map((s) => s.block)).toEqual(["requested", null]);
    expect(row!.weeks[0]).toBe(5);       // 3 + 2 suggested from stock
    expect(row!.toAsk).toBe(2);          // only the Queen can still be asked
    expect(row!.inProgress).toBe(3);
    expect(row!.onPo).toBe(2);
    expect(row!.have).toBe(3);           // what is asked for is not stock
    expect(row!.suggestedSizes).toBe(1);
    expect(row!.block).toBeNull();
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

describe("requests", () => {
  it("groups the ticked sizes into one request per supplier and category, asking only what can still be asked", () => {
    const [a, c] = forecastPurchaseModels({ sizes: [
      size({ sku: "A-K", size: "King", sold: [0, 6, 6], sold14: 6, inProgress: 1, requests: waiting(1) }),
      size({ sku: "A-Q", size: "Queen", sold: [0, 4, 4], sold14: 4, deliveryDate: "2026-10-22" }),
      size({ sku: "C-Q", modelId: "c", model: "TEST model C", category: "bedframe", supplierId: "s2", supplier: "TEST supplier two", sold: [0, 2, 2], sold14: 2, deliveryDate: "2026-10-23" }),
    ] });
    const groups = forecastPurchaseRequestGroups([...a!.sizes, ...c!.sizes]);
    expect(groups.map((g) => [g.key, g.supplier, g.category, g.pieces, g.deliveryDate])).toEqual([
      ["s1|mattress", "TEST supplier", "mattress", 4, "2026-10-22"],
      ["s2|bedframe", "TEST supplier two", "bedframe", 1, "2026-10-23"],
    ]);
    // King: 3 suggested, 1 in progress: asks 2, and carries what it read as in progress.
    expect(groups[0]!.lines.map((l) => [l.sku, l.qty, l.inProgress])).toEqual([["A-K", 2, 1], ["A-Q", 2, 0]]);
    expect(forecastPurchaseRequestCount([...a!.sizes, ...c!.sizes])).toBe(2);
  });

  it("a group has no Delivery Date when one of its lines has none", () => {
    const [a] = forecastPurchaseModels({ sizes: [
      size({ sku: "A-K", size: "King", sold: [0, 6, 6], sold14: 6 }),
      size({ sku: "A-Q", size: "Queen", sold: [0, 4, 4], sold14: 4, deliveryDate: null }),
    ] });
    expect(forecastPurchaseRequestGroups(a!.sizes)[0]!.deliveryDate).toBeNull();
  });

  it("a size with no supplier or nothing left to ask is never put on a request", () => {
    const [row] = forecastPurchaseModels({ sizes: [
      size({ sku: "A-K", size: "King", sold: [0, 6, 6], sold14: 6, supplierId: null, supplier: null }),
      size({ sku: "A-Q", size: "Queen", sold: [0, 4, 4], sold14: 4, free: 9 }),
      size({ sku: "A-S", size: "Single", sold: [0, 4, 4], sold14: 4, inProgress: 2, requests: waiting(2) }),
    ] });
    expect(forecastPurchaseRequestGroups(row!.sizes)).toEqual([]);
  });

  it("the Delivery Date is the plan's, never before the Settings floor, and none when the plan has none", () => {
    expect(forecastPurchaseDeliveryDate("2026-10-20", "2026-10-13", 0)).toBe("2026-10-20");
    expect(forecastPurchaseDeliveryDate("2026-10-20", "2026-10-13", 3)).toBe("2026-10-20");
    expect(forecastPurchaseDeliveryDate("2026-10-20", "2026-10-13", 14)).toBe("2026-10-27");
    expect(forecastPurchaseDeliveryDate(null, "2026-10-13", 14)).toBeNull();
  });
});

describe("the recheck before a PO is issued", () => {
  it("passes while the forecast still suggests at least what is being issued", () => {
    expect(forecastPurchaseIssueShortfall({ asking: 3, suggested: 3, known: true })).toEqual({ ok: true });
    expect(forecastPurchaseIssueShortfall({ asking: 2, suggested: 5, known: true })).toEqual({ ok: true });
  });

  it("stops when stock or a PO arrived, or sales fell, since the approval", () => {
    expect(forecastPurchaseIssueShortfall({ asking: 3, suggested: 1, known: true })).toEqual({ ok: false, reason: "coverage_changed" });
    expect(forecastPurchaseIssueShortfall({ asking: 1, suggested: 0, known: true })).toEqual({ ok: false, reason: "coverage_changed" });
  });

  it("stops for a size that is no longer forecast stock", () => {
    expect(forecastPurchaseIssueShortfall({ asking: 1, suggested: 0, known: false })).toEqual({ ok: false, reason: "not_forecast_stock" });
  });
});

describe("scope", () => {
  it("keeps every mattress and the Jager bedframe as stock, nothing else (handoff value)", () => {
    expect(forecastPurchaseInScope("mattress", "anything")).toBe(true);
    expect(forecastPurchaseInScope("bedframe", "jager")).toBe(true);
    expect(forecastPurchaseInScope("bedframe", "other")).toBe(false);
    expect(forecastPurchaseInScope("sofa", null)).toBe(false);
    expect(forecastPurchaseInScope("accessory", null)).toBe(false);
  });
});
