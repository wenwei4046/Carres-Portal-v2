import { describe, expect, it } from "vitest";
import { routeGoodsLinesOf, type RouteGoodsFacts } from "./sales-order-route-goods";

const promise = (over: Record<string, unknown>) => ({
  kind: "tomorrow_delivery",
  po_version: 1,
  channel: "WhatsApp",
  recipient: "Supplier group",
  evidence: "evidence/1.png",
  reported_by: "Supplier",
  reported_at: "2026-09-10T02:00:00Z",
  recorded_by: "u1",
  recorded_at: "2026-09-10T02:00:00Z",
  new_date: null,
  po_line_id: null,
  about_qty: null,
  answer_group: null,
  answer: null,
  reason: null,
  ...over,
});

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
  todayIso: "2026-09-10",
  lines: [{ id: "L1", sku: "B1201S", label: "B1201S · King", qty: 1 }],
  sources: [],
  purchaseOrders: [],
  receipts: [],
  units: [],
  readyStock: {},
  ...over,
});

describe("a purchase order joins the line its lineage names — never a SKU match", () => {
  it("two lines of one SKU: each PO joins the lane `po_line_sources` names", () => {
    const lines = routeGoodsLinesOf(
      facts({
        lines: [
          { id: "L1", sku: "B1201S", label: "B1201S · King", qty: 1 },
          { id: "L2", sku: "B1201S", label: "B1201S · King", qty: 2 },
        ],
        sources: [
          { order_line_id: "L2", po_id: "PO-2", po_line_id: "pl2", qty: 2 },
          { order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 1 },
        ],
        purchaseOrders: [
          po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] }),
          po({ id: "PO-2", lines: [{ id: "pl2", sku: "B1201S", qty: 2, received_qty: 0 }] }),
        ],
      }),
    );
    expect(lines.map((l) => [l.lineId, l.sources.map((s) => s.poId)])).toEqual([
      ["L1", ["PO-1"]],
      ["L2", ["PO-2"]],
    ]);
  });

  it("a cancelled purchase order covers nothing", () => {
    const [line] = routeGoodsLinesOf(
      facts({
        sources: [{ order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 1 }],
        purchaseOrders: [po({ id: "PO-1", status: "cancelled", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] })],
      }),
    );
    expect(line!.sources).toEqual([]);
    expect(line!.onOrderQty).toBe(0);
    expect(line!.uncoveredQty).toBe(1);
  });

  it("lineage that names no line joins by SKU only when exactly one line carries that SKU", () => {
    const one = routeGoodsLinesOf(
      facts({
        sources: [{ order_line_id: null, po_id: "PO-1", po_line_id: "pl1", qty: 1 }],
        purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] })],
      }),
    );
    expect(one[0]!.sources.map((s) => s.poId)).toEqual(["PO-1"]);
    const two = routeGoodsLinesOf(
      facts({
        lines: [
          { id: "L1", sku: "B1201S", label: "a", qty: 1 },
          { id: "L2", sku: "B1201S", label: "b", qty: 1 },
        ],
        sources: [{ order_line_id: null, po_id: "PO-1", po_line_id: "pl1", qty: 1 }],
        purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] })],
      }),
    );
    expect(two.flatMap((l) => l.sources)).toEqual([]);
  });
});

describe("SUPPLIER reads the immutable date and the newest answer", () => {
  const base = {
    sources: [{ order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 1 }],
  };

  it("prints the original date, and no second date while the supplier said nothing new", () => {
    const [line] = routeGoodsLinesOf(
      facts({ ...base, purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] })] }),
    );
    expect(line!.sources[0]).toMatchObject({
      issuedAt: "2026-09-03",
      poDeliveryDate: "2026-09-18",
      expectedArrival: null,
      confirmed: false,
    });
  });

  it("a later promise is Delayed with its governed reason; an earlier one is Earlier", () => {
    const delayed = routeGoodsLinesOf(
      facts({
        ...base,
        purchaseOrders: [
          po({
            id: "PO-1",
            lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }],
            promises: [promise({ po_line_id: "pl1", about_qty: 1, new_date: "2026-09-28", answer: "delayed", reason: "Production delay" })],
          }),
        ],
      }),
    );
    expect(delayed[0]!.sources[0]!.expectedArrival).toEqual({ date: "2026-09-28", change: "delayed", reason: "Production delay" });
    const earlier = routeGoodsLinesOf(
      facts({
        ...base,
        purchaseOrders: [
          po({
            id: "PO-1",
            lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }],
            promises: [promise({ po_line_id: "pl1", about_qty: 1, new_date: "2026-09-15", answer: "earlier" })],
          }),
        ],
      }),
    );
    expect(earlier[0]!.sources[0]!.expectedArrival).toEqual({ date: "2026-09-15", change: "earlier", reason: null });
  });

  it("a confirmed answer completes it; an answer without evidence is no answer", () => {
    const confirmed = routeGoodsLinesOf(
      facts({
        ...base,
        purchaseOrders: [
          po({
            id: "PO-1",
            lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }],
            promises: [promise({ po_line_id: "pl1", about_qty: 1, new_date: "2026-09-18", answer: "confirmed" })],
          }),
        ],
      }),
    );
    expect(confirmed[0]!.sources[0]).toMatchObject({ confirmed: true, expectedArrival: null });
    const bare = routeGoodsLinesOf(
      facts({
        ...base,
        purchaseOrders: [
          po({
            id: "PO-1",
            lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }],
            promises: [promise({ po_line_id: "pl1", about_qty: 1, new_date: "2026-09-28", answer: "delayed", evidence: null })],
          }),
        ],
      }),
    );
    expect(bare[0]!.sources[0]).toMatchObject({ confirmed: false, expectedArrival: null });
  });

  it("the day-before check is open one working day before the arrival, and closed once confirmed", () => {
    const open = routeGoodsLinesOf(
      facts({
        ...base,
        todayIso: "2026-09-17",
        purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] })],
      }),
    );
    expect(open[0]!.sources[0]!.dayBeforeCheckOpen).toBe(true);
    const early = routeGoodsLinesOf(
      facts({
        ...base,
        todayIso: "2026-09-10",
        purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] })],
      }),
    );
    expect(early[0]!.sources[0]!.dayBeforeCheckOpen).toBe(false);
    const done = routeGoodsLinesOf(
      facts({
        ...base,
        todayIso: "2026-09-17",
        purchaseOrders: [
          po({
            id: "PO-1",
            lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }],
            arrival_confirmations: [{ po_version: 1, for_date: "2026-09-18", destination_id: "d1" }],
          }),
        ],
      }),
    );
    expect(done[0]!.sources[0]).toMatchObject({ dayBeforeCheckOpen: false, confirmed: true });
  });
});

describe("RECEIVING counts this line's share, and keeps counting after a receipt", () => {
  it("3 of 5 received names the latest posted GRN by its stored number, and the damaged count", () => {
    const [line] = routeGoodsLinesOf(
      facts({
        lines: [{ id: "L1", sku: "B1201S", label: "B1201S · King", qty: 5 }],
        sources: [{ order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 5 }],
        purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 5, received_qty: 3, damaged_qty: 1, wrong_item_qty: 1 }] })],
        receipts: [
          { id: "r1", po_id: "PO-1", grn_no: "GRN2609-0040", goods_received_at: "2026-09-18", status: "posted", line_ids: ["pl1"] },
          { id: "r2", po_id: "PO-1", grn_no: "GRN2609-0041", goods_received_at: "2026-09-19", status: "posted", line_ids: ["pl1"] },
          { id: "r3", po_id: "PO-1", grn_no: null, goods_received_at: "2026-09-20", status: "draft", line_ids: ["pl1"] },
          { id: "r4", po_id: "PO-1", grn_no: "GRN2609-0042", goods_received_at: "2026-09-21", status: "voided", line_ids: ["pl1"] },
        ],
      }),
    );
    expect(line!.sources[0]).toMatchObject({
      qty: 5,
      receivedQty: 3,
      pendingQty: 2,
      damagedOrWrongQty: 2,
      latestGrn: { id: "r2", number: "GRN2609-0041", receivedAt: "2026-09-19" },
    });
  });

  it("a PO line shared by two Sales Order lines is received in lineage order, never counted twice", () => {
    const lines = routeGoodsLinesOf(
      facts({
        lines: [
          { id: "L1", sku: "B1201S", label: "a", qty: 2 },
          { id: "L2", sku: "B1201S", label: "b", qty: 2 },
        ],
        sources: [
          { order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 2 },
          { order_line_id: "L2", po_id: "PO-1", po_line_id: "pl1", qty: 2 },
        ],
        purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 4, received_qty: 3 }] })],
      }),
    );
    expect(lines.map((l) => l.sources[0]!.receivedQty)).toEqual([2, 1]);
  });
});

describe("STOCK reads the Units bound to the line", () => {
  it("counts the Units reserved to THIS line, and says why the rest is short", () => {
    const noPo = routeGoodsLinesOf(facts({ lines: [{ id: "L1", sku: "B1201S", label: "x", qty: 2 }], units: [{ unit_code: "U1-000-231", status: "reserved", reserved_order_line_id: "L1", sku: "B1201S" }] }));
    expect(noPo[0]).toMatchObject({ readyQty: 1, unitCodes: ["U1-000-231"], uncoveredQty: 1, shortBecause: "not-ordered" });
    const onPo = routeGoodsLinesOf(
      facts({
        sources: [{ order_line_id: "L1", po_id: "PO-1", po_line_id: "pl1", qty: 1 }],
        purchaseOrders: [po({ id: "PO-1", lines: [{ id: "pl1", sku: "B1201S", qty: 1, received_qty: 0 }] })],
      }),
    );
    expect(onPo[0]).toMatchObject({ readyQty: 0, uncoveredQty: 0, shortBecause: "not-received" });
  });

  it("offers Ready Stock only while the line is short and an eligible Unit exists for its SKU", () => {
    const offer = routeGoodsLinesOf(facts({ readyStock: { B1201S: 2 } }));
    expect(offer[0]!.readyStockQty).toBe(2);
    const whole = routeGoodsLinesOf(
      facts({ readyStock: { B1201S: 2 }, units: [{ unit_code: "U1", status: "reserved", reserved_order_line_id: "L1", sku: "B1201S" }] }),
    );
    expect(whole[0]).toMatchObject({ readyQty: 1, readyStockQty: 0, shortBecause: null });
  });

  it("a Unit that names no line joins the first line of its SKU that still has room", () => {
    const lines = routeGoodsLinesOf(
      facts({
        lines: [
          { id: "L1", sku: "B1201S", label: "a", qty: 1 },
          { id: "L2", sku: "B1201S", label: "b", qty: 1 },
        ],
        units: [
          { unit_code: "U1", status: "sold", reserved_order_line_id: null, sku: "B1201S" },
          { unit_code: "U2", status: "reserved", reserved_order_line_id: null, sku: "B1201S" },
        ],
      }),
    );
    expect(lines.map((l) => l.unitCodes)).toEqual([["U1"], ["U2"]]);
  });
});
