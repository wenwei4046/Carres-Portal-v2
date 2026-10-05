import { describe, expect, it } from "vitest";
import { lineKind } from "./line-category";
import type { RouteGoodsFacts } from "./sales-order-route-goods";
import {
  SALES_ORDER_STOCK_STATUSES,
  salesOrderStockOf,
  stockIssueWord,
  stockStatusOfCounts,
  stockStatusWord,
} from "./sales-order-stock-status";

const po = (over: Record<string, unknown> & { id: string }) => ({
  status: "open",
  supplier_id: "s1",
  destination_id: "d1",
  placed_at: "2026-09-03T03:00:00Z",
  official_delivery_date: "2026-09-18",
  eta_date: "2026-09-18",
  version: 1,
  lines: [],
  promises: [],
  arrival_confirmations: [],
  ...over,
});

const facts = (over: Partial<RouteGoodsFacts> = {}): RouteGoodsFacts => ({
  todayIso: "2026-10-05",
  lines: [{ id: "L1", sku: "B1201S", label: "King", qty: 2 }],
  sources: [],
  purchaseOrders: [],
  receipts: [],
  units: [],
  readyStock: {},
  ...over,
});
const reserved = (code: string, over: Record<string, unknown> = {}) => ({
  unit_code: code,
  status: "reserved",
  reserved_order_line_id: "L1",
  sku: "B1201S",
  ...over,
});
const onPo = (qty: number, received: number, over: Record<string, unknown> = {}) => ({
  sources: [{ order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty }],
  purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty, received_qty: received, ...over }] })],
});

describe("the approved words and tones", () => {
  it("four states, one tone each — complete green, partial blue, waiting grey; no red", () => {
    expect(SALES_ORDER_STOCK_STATUSES.map((s) => [s.label, s.tone])).toEqual([
      ["To purchase", "neutral"],
      ["Awaiting goods", "neutral"],
      ["Partially ready", "info"],
      ["Ready", "success"],
    ]);
    expect(SALES_ORDER_STOCK_STATUSES.find((s) => s.key === "ready")!.legend).toBe(
      "All required goods are usable and allocated to this order. Delivery may still need other conditions.",
    );
    expect(stockIssueWord(2)).toBe("2 damaged or wrong");
    expect(stockStatusWord("awaiting_goods")).toBe("Awaiting goods");
  });
});

describe("one order's Stock Status from the owners' records", () => {
  it("nothing bought, nothing bound: To purchase", () => {
    expect(salesOrderStockOf(facts())).toMatchObject({ status: "to_purchase", requiredQty: 2, usableQty: 0, purchasedQty: 0 });
  });

  it("Ready Stock covering the line: Ready", () => {
    const fact = salesOrderStockOf(facts({ units: [reserved("U1"), reserved("U2")] }));
    expect(fact).toMatchObject({ status: "ready", usableQty: 2, purchasedQty: 2, issueQty: 0 });
  });

  it("partial purchase: To purchase while any quantity is not bought", () => {
    expect(salesOrderStockOf(facts(onPo(1, 0))).status).toBe("to_purchase");
  });

  it("the whole quantity on a PO, nothing arrived: Awaiting goods", () => {
    expect(salesOrderStockOf(facts(onPo(2, 0)))).toMatchObject({ status: "awaiting_goods", purchasedQty: 2, usableQty: 0 });
  });

  it("partial receipt whose Unit is reserved for the line: Partially ready", () => {
    const fact = salesOrderStockOf(facts({ ...onPo(2, 1), units: [reserved("U1", { po_line_id: "pl1" })] }));
    expect(fact).toMatchObject({ status: "partially_ready", usableQty: 1, purchasedQty: 2, arrivedUnallocatedQty: 0 });
  });

  it("⚠ REAL GAP carried apart: goods received on the lineage but bound to nobody are counted, not yet mapped", () => {
    const fact = salesOrderStockOf(facts(onPo(2, 1)));
    expect(fact).toMatchObject({ status: "awaiting_goods", usableQty: 0, arrivedUnallocatedQty: 1 });
    expect(fact.lines[0]).toMatchObject({ arrivedUnallocatedQty: 1, status: "awaiting_goods" });
  });

  it("damaged or wrong goods in the receipt are never usable and show as the issue count, not a status", () => {
    const fact = salesOrderStockOf(facts(onPo(2, 0, { damaged_qty: 1, wrong_item_qty: 1 })));
    expect(fact).toMatchObject({ status: "awaiting_goods", usableQty: 0, issueQty: 2 });
    expect(SALES_ORDER_STOCK_STATUSES.map((s) => s.key)).not.toContain("issue");
  });

  it("a reserved Unit Stock controls (damaged, in repair) is not usable and counts as an issue", () => {
    const fact = salesOrderStockOf(facts({ units: [reserved("U1"), reserved("U2", { condition: "damaged" })] }));
    expect(fact).toMatchObject({ status: "partially_ready", usableQty: 1, purchasedQty: 2, issueQty: 1 });
    const repair = salesOrderStockOf(facts({ units: [reserved("U1", { needs_repair: true }), reserved("U2", { needs_repair: true })] }));
    expect(repair).toMatchObject({ status: "awaiting_goods", usableQty: 0, issueQty: 2 });
  });

  it("a cancelled Purchase Order covers nothing", () => {
    const cancelled = facts({
      sources: [{ order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 2 }],
      purchaseOrders: [po({ id: "PO-1", status: "cancelled", lines: [{ id: "pl1", sku: "B1201S", qty: 2, received_qty: 0 }] })],
    });
    expect(salesOrderStockOf(cancelled)).toMatchObject({ status: "to_purchase", purchasedQty: 0 });
  });

  it("⭐ one PO line shared by two Sales Orders: each order's share counts once, in lineage order", () => {
    const shared = {
      sources: [
        { order_id: "A", order_line_id: "A1", po_id: "PO-1", po_line_id: "pl1", qty: 1 },
        { order_id: "B", order_line_id: "B1", po_id: "PO-1", po_line_id: "pl1", qty: 1 },
      ],
      purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 2, received_qty: 1, damaged_qty: 1 }] })],
    };
    const a = salesOrderStockOf(facts({ ...shared, orderId: "A", lines: [{ id: "A1", sku: "B1201S", label: "a", qty: 1 }] }));
    const b = salesOrderStockOf(facts({ ...shared, orderId: "B", lines: [{ id: "B1", sku: "B1201S", label: "b", qty: 1 }] }));
    /* The good piece arrived for A's share; the damaged one is B's. Neither
       order is counted twice and neither order reads the other's goods. */
    expect([a.arrivedUnallocatedQty, b.arrivedUnallocatedQty]).toEqual([1, 0]);
    expect([a.issueQty, b.issueQty]).toEqual([0, 1]);
    expect([a.purchasedQty, b.purchasedQty]).toEqual([1, 1]);
  });

  it("insufficient quantity: one bound Unit of two required is Partially ready; one line's surplus never fills another", () => {
    expect(salesOrderStockOf(facts({ units: [reserved("U1")] }))).toMatchObject({ status: "partially_ready", usableQty: 1 });
    const twoLines = salesOrderStockOf(
      facts({
        lines: [
          { id: "L1", sku: "B1201S", label: "a", qty: 1 },
          { id: "L2", sku: "Q1201S", label: "b", qty: 1 },
        ],
        units: [reserved("U1"), reserved("U2")],
      }),
    );
    expect(twoLines).toMatchObject({ status: "partially_ready", requiredQty: 2, usableQty: 1 });
    expect(twoLines.lines.map((l) => l.status)).toEqual(["ready", "to_purchase"]);
  });

  it("delivered (sold) Units satisfy the goods: Ready, never To purchase", () => {
    const fact = salesOrderStockOf(facts({ units: [reserved("U1", { status: "sold" }), reserved("U2", { status: "sold", reserved_order_line_id: null })] }));
    expect(fact).toMatchObject({ status: "ready", usableQty: 2 });
  });

  it("service lines are not goods: a services-only order has no status (Not applicable)", () => {
    const service = ["DELIVERY", "DISPOSAL", "SERVICE"].find((sku) => lineKind(sku) === "service")!;
    expect(service).toBeTruthy();
    const only = salesOrderStockOf(facts({ lines: [{ id: "S1", sku: service, label: "s", qty: 1 }] }));
    expect(only).toMatchObject({ status: null, requiredQty: 0, lines: [] });
    const mixed = salesOrderStockOf(
      facts({ lines: [{ id: "L1", sku: "B1201S", label: "a", qty: 1 }, { id: "S1", sku: service, label: "s", qty: 1 }], units: [reserved("U1")] }),
    );
    expect(mixed).toMatchObject({ status: "ready", requiredQty: 1 });
    expect(mixed.lines.map((l) => l.lineId)).toEqual(["L1"]);
  });

  it("a line with no quantity is not required goods", () => {
    expect(salesOrderStockOf(facts({ lines: [{ id: "L1", sku: "B1201S", label: "a", qty: 0 }] })).status).toBeNull();
  });
});

describe("the ONE summary rule reads a line and an order alike", () => {
  const counts = (requiredQty: number, usableQty: number, purchasedQty: number) =>
    ({ requiredQty, usableQty, purchasedQty, issueQty: 0, arrivedUnallocatedQty: 0 });
  it.each([
    [counts(3, 3, 3), "ready"],
    [counts(3, 1, 1), "partially_ready"],
    [counts(3, 1, 3), "partially_ready"],
    [counts(3, 0, 3), "awaiting_goods"],
    [counts(3, 0, 2), "to_purchase"],
    [counts(0, 0, 0), null],
  ])("%j → %s", (c, expected) => {
    expect(stockStatusOfCounts(c)).toBe(expected);
  });
});
