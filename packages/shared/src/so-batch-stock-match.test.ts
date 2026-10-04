import { describe, expect, it } from "vitest";
import type { ReadyStockUnit } from "./so-batch-ready-stock";
import { matchSoBatchReadyStock, type SoBatchStockDemand } from "./so-batch-stock-match";

const demand = (id: string, date: string | null, proceed = "2026-10-01"): SoBatchStockDemand => ({
  orderId: `order-${id}`, orderLineId: id, remainingQty: 1, requestedDeliveryDate: date, proceededAt: proceed,
});
const unit = (id: string, overrides: Partial<ReadyStockUnit> = {}): ReadyStockUnit => ({
  itemId: id, unitCode: id, identityScope: "unit", sku: "A", condition: "new", siteName: "Carres Klang",
  holderName: null, ownership: "carres_owned", supplier: null, qty: 1, dateIn: "2026-09-01",
  matchingLineIds: ["a", "b", "c"], reservedForLineId: null, blocked: null, ...overrides,
});
const options = { siteName: "Carres Klang" };

describe("whole-scope Ready Stock suggestions", () => {
  it("gives scarce stock to the earliest customer date, then Proceed Date, undated last", () => {
    const offers = matchSoBatchReadyStock([demand("c", null), demand("b", "2026-10-10", "2026-10-02"), demand("a", "2026-10-10")], [unit("U1")], options);
    expect(offers.map(offer => offer.orderLineId)).toEqual(["a"]);
  });
  it("supports the approved configurable Proceed Date priority", () => {
    expect(matchSoBatchReadyStock([demand("a", "2026-10-20"), demand("b", "2026-10-10", "2026-10-02")], [unit("U1")], { ...options, priority: "proceed_date" })[0]?.orderLineId).toBe("a");
  });
  it("uses FIFO and never gives the same Unit to two same-SKU lines", () => {
    const offers = matchSoBatchReadyStock([demand("a", "2026-10-10"), demand("b", "2026-10-11")], [unit("U2", { dateIn: "2026-09-02" }), unit("U1"), unit("U1")], options);
    expect(offers.map(offer => offer.units.map(row => row.itemId))).toEqual([["U1"], ["U2"]]);
  });
  it("keeps exact goods compatibility supplied by the source read", () => {
    expect(matchSoBatchReadyStock([demand("a", "2026-10-10"), demand("b", "2026-10-11")], [unit("U1", { matchingLineIds: ["b"] })], options)[0]?.orderLineId).toBe("b");
  });
  it("excludes other sites, supplier property, counted stock, blocked and saved Units", () => {
    const candidates = [unit("other", { siteName: "Other" }), unit("supplier", { ownership: "supplier_consignment" }), unit("counted", { identityScope: "quantity" }), unit("blocked", { blocked: "no_line_needs_it" }), unit("saved", { reservedForLineId: "a" })];
    expect(matchSoBatchReadyStock([demand("a", "2026-10-10")], candidates, options)).toEqual([]);
  });
  it("uses stable location identity even when two sites share a display name", () => {
    const offers = matchSoBatchReadyStock([demand("a", null)], [unit("other", { warehouseId: "wh-other" }), unit("chosen", { warehouseId: "wh-chosen" })], { warehouseId: "wh-chosen" });
    expect(offers[0]?.units.map(row => row.itemId)).toEqual(["chosen"]);
  });
  it("does not change inputs or reinterpret confirmed demand coverage", () => {
    const inputs = [demand("a", "2026-10-10"), { ...demand("b", null), remainingQty: 0 }];
    const candidates = [unit("U1")];
    const before = JSON.stringify({ inputs, candidates });
    expect(matchSoBatchReadyStock(inputs, candidates, options)).toHaveLength(1);
    expect(JSON.stringify({ inputs, candidates })).toBe(before);
  });
  it("merges repeated compatible reads but refuses conflicting Unit facts", () => {
    expect(matchSoBatchReadyStock([demand("b", null)], [unit("U1", { matchingLineIds: ["a"] }), unit("U1", { matchingLineIds: ["b"] })], options)).toHaveLength(1);
    expect(() => matchSoBatchReadyStock([], [unit("U1"), unit("U1", { siteName: "Other" })], options)).toThrow("stock_candidate_changed");
  });
  it("refuses duplicate lines and invalid quantities instead of overallocating", () => {
    expect(() => matchSoBatchReadyStock([demand("a", null), demand("a", null)], [], options)).toThrow("invalid_stock_match_demand");
    expect(() => matchSoBatchReadyStock([{ ...demand("a", null), remainingQty: NaN }], [], options)).toThrow("invalid_stock_match_demand");
  });
});
