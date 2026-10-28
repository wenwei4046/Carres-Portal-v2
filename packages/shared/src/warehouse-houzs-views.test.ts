// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): Stock Card and Loading
// List, Houzs way, counted from Units. Jess was not part of this decision.
import { describe, expect, it } from "vitest";
import { loadingListRows, stockCardLines, type StockCardEvent } from "./warehouse-houzs-views";
import type { WarehouseOutboundCard } from "./warehouse-outbound";

const ev = (seq: number, unitId: string, event: string, fromValue: string | null, toValue: string | null): StockCardEvent => ({
  seq, unitId, event, fromValue, toValue, eventAt: `2026-10-0${seq}T00:00:00Z`,
});

describe("stockCardLines", () => {
  const units = [
    { id: "a", unitCode: "U1-000-001", qty: 1, siteId: "klang" },
    { id: "b", unitCode: "U1-000-002", qty: 1, siteId: "pj" },
  ];
  const events = [
    ev(1, "a", "unit_born", null, "incoming"),
    ev(2, "a", "status_changed", "incoming", "free"), // received at Klang: IN
    ev(3, "b", "unit_born", null, "free"), // born on hand at Klang: IN
    ev(4, "b", "site_changed", "klang", "pj"), // moved to PJ
    ev(5, "a", "reservation_changed", null, "SO-1"), // not a stock line
    ev(6, "a", "status_changed", "free", "sold"), // OUT
  ];

  it("all Sites: a move between Sites is not a line, a sale is", () => {
    const lines = stockCardLines(units, events, null);
    expect(lines.map((l) => [l.seq, l.qtyIn, l.qtyOut, l.balance])).toEqual([
      [2, 1, 0, 1],
      [3, 1, 0, 2],
      [6, 0, 1, 1],
    ]);
  });

  it("one Site: the move out of Klang is an OUT there", () => {
    const lines = stockCardLines(units, events, "klang");
    expect(lines.map((l) => [l.seq, l.qtyIn, l.qtyOut, l.balance])).toEqual([
      [2, 1, 0, 1],
      [3, 1, 0, 2],
      [4, 0, 1, 1],
      [6, 0, 1, 0],
    ]);
    expect(stockCardLines(units, events, "pj").map((l) => [l.seq, l.balance])).toEqual([[4, 1]]);
  });
});

describe("loadingListRows", () => {
  it("lists what is still to load per item per DO; loaded lines leave", () => {
    const card = {
      doNumber: "DO-1", source: "SO-1", eventDate: "2026-10-23", fromLocation: "Carres Klang",
      warehouseSiteId: "klang", toCustomer: "TEST", logisticsPartner: "AL", vehicle: null,
      products: [
        { sku: "A", name: "Sofa", qty: 2, loaded: 1, driverConfirmed: 0 },
        { sku: "B", name: "Bed", qty: 1, loaded: 1, driverConfirmed: 0 },
      ],
    } as unknown as WarehouseOutboundCard;
    const rows = loadingListRows([card]);
    expect(rows.map((r) => [r.doNumber, r.sku, r.qty, r.toLoad])).toEqual([["DO-1", "A", 2, 1]]);
  });
});
