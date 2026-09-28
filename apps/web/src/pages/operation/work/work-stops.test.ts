import { describe, expect, it } from "vitest";
import type { RouteNode, SalesOrderRouteMap } from "@carres/shared";
import { workStopsOf, type WorkAct } from "./work-stops";

/* SO-1333 as the Route resolver reads it on 2026-09-28 (test data): two POs
   issued 3 Sep and not marked sent, nothing received, NETS assigned, no
   Scheduled delivery, RM 2,284.00 unpaid. */
function node(id: string, kind: RouteNode["kind"], title: string, lines: string[], mark: RouteNode["mark"] = "waiting", requirements: RouteNode["requirements"] = []): RouteNode {
  /* `lines` are broken to fit the Route box; `spoken` keeps whole sentences. */
  return { id, kind, branch: "goods", title, mark, lines: lines.flatMap((l) => l.split(" ")), spoken: lines, requirements, action: null, door: null, current: false, x: 0, y: 0, w: 0, h: 0 };
}

const route: SalesOrderRouteMap = {
  orderId: "o-1333",
  soNumber: "SO-1333",
  customerName: "12341234",
  nodes: [
    node("so", "sales-order", "SALES ORDER", ["SO-1333"], "complete"),
    node("l1:PO260903-4316:purchasing", "purchasing", "PURCHASING", ["PO260903-4316", "Issued: 2026-09-03"], "current"),
    node("l1:PO260903-4316:supplier", "supplier", "SUPPLIER", ["PO Delivery Date: 2026-09-14"]),
    node("l1:PO260903-4316:receiving", "receiving", "RECEIVING", ["Warehouse received 0 of 1"], "future"),
    node("l1:stock", "stock", "STOCK", ["Warehouse has 0 of 1 Units ready", "Warehouse has not received the goods"]),
    node("l2:PO260903-7907:purchasing", "purchasing", "PURCHASING", ["PO260903-7907", "Issued: 2026-09-03"], "current"),
    node("l2:PO260903-7907:supplier", "supplier", "SUPPLIER", ["PO Delivery Date: 2026-09-15"]),
    node("l2:PO260903-7907:receiving", "receiving", "RECEIVING", ["Warehouse received 0 of 1"], "future"),
    node("l2:stock", "stock", "STOCK", ["Warehouse has 0 of 1 Units ready", "Warehouse has not received the goods"]),
    node("logistics", "logistics", "LOGISTICS", ["NETS"], "complete"),
    node("delivery-date", "delivery-date", "DELIVERY DATE", ["Logistics has not scheduled the delivery", "Requested delivery: 2026-09-30"]),
    node("money", "money", "PAYMENT", ["Hold delivery", "Customer has not paid RM 2,284.00 · Customer must pay by 2026-09-28"]),
    node("gate", "delivery-order", "DELIVERY ORDER", ["Not ready for delivery"], "future", [
      { id: "goods", met: false, text: "Goods not ready (0 of 2)" },
      { id: "logistics", met: true, text: "Logistics chosen" },
    ]),
    node("deliver", "deliver", "DELIVER", ["Logistics has not delivered the goods"], "future"),
    node("photo", "delivery-photo", "DELIVERY PHOTO", ["Logistics has not uploaded the delivery photo"], "future"),
  ],
  edges: [],
  bands: [],
  linkedProblems: [],
  proposedChange: null,
  width: 0,
  height: 0,
};

const acts: WorkAct[] = [
  { key: "w1:PO260903-4316", occurrenceId: "w1", kind: "send_po", stop: "purchasing", title: "Send PO260903-4316 to Ohana", why: "Sending not confirmed", missed: true, button: "PO sent to supplier", poId: "PO260903-4316", party: "supplier" },
  { key: "w1:PO260903-7907", occurrenceId: "w1", kind: "send_po", stop: "purchasing", title: "Send PO260903-7907 to Nice Future", why: "Sending not confirmed", missed: true, button: "PO sent to supplier", poId: "PO260903-7907", party: "supplier" },
  { key: "w2", occurrenceId: "w2", kind: "delivery_date", stop: "delivery-date", title: "Call NETS", why: "Get the scheduled delivery date · due Mon, 28 Sep", missed: false, button: "Update date and time", party: "logistics" },
];

const spell = (iso: string) => ({ "2026-09-03": "Thu, 3 Sep", "2026-09-14": "Mon, 14 Sep", "2026-09-15": "Tue, 15 Sep", "2026-09-28": "Mon, 28 Sep", "2026-09-30": "Wed, 30 Sep" })[iso] ?? iso;
const pos = [
  { poId: "PO260903-4316", documentNo: "PO260903-4316", supplierName: "Ohana", sent: false },
  { poId: "PO260903-7907", documentNo: "PO260903-7907", supplierName: "Nice Future", sent: false },
];

describe("workStopsOf — SO-1333", () => {
  const stops = workStopsOf({ route, acts, pos, logistics: null, spell });

  it("puts the stops holding an act first, in Route order, then every other stop", () => {
    expect(stops.map((s) => s.key)).toEqual([
      "purchasing",
      "delivery-date",
      "supplier",
      "receiving",
      "stock",
      "logistics",
      "money",
      "delivery-order",
      "deliver",
      "delivery-photo",
    ]);
    expect(stops.filter((s) => !s.quiet).map((s) => s.key)).toEqual(["purchasing", "delivery-date"]);
  });

  it("carries exactly the three acts, each on its own card, with its owning button", () => {
    const cards = stops.flatMap((s) => s.cards).filter((c) => c.act);
    expect(cards.map((c) => [c.title, c.act!.button])).toEqual([
      ["Send PO260903-4316 to Ohana", "PO sent to supplier"],
      ["Send PO260903-7907 to Nice Future", "PO sent to supplier"],
      ["Call NETS", "Update date and time"],
    ]);
  });

  it("marks the stop tone from its acts: missed red, due amber", () => {
    expect(stops.find((s) => s.key === "purchasing")!.tone).toBe("missed");
    expect(stops.find((s) => s.key === "delivery-date")!.tone).toBe("due");
  });

  it("gives a send card the PO issued step done and the send step as the act", () => {
    const card = stops[0]!.cards[0]!;
    expect(card.checklist.map((r) => [r.step, r.mark, r.value, r.doc])).toEqual([
      ["PO issued", "done", "Thu, 3 Sep", "PO260903-4316"],
      ["PO sent to supplier", "missed", "Sending not confirmed", null],
    ]);
    expect(card.progress).toBe("1 of 2 done");
  });

  it("shows one card per PO, not per goods line, and SUPPLIER waits while a PO is unsent", () => {
    const supplier = stops.find((s) => s.key === "supplier")!;
    expect(supplier.cards).toHaveLength(2);
    expect(supplier.status).toBe("Supplier has not confirmed the ready date");
    expect(supplier.progress).toBeNull();
  });

  it("never counts a fact: the DELIVERY ORDER card prints its requirements with no count", () => {
    const gate = stops.find((s) => s.key === "delivery-order")!;
    expect(gate.cards[0]!.progress).toBeNull();
    expect(gate.progress).toBeNull();
    expect(gate.cards[0]!.checklist.map((r) => r.step)).toEqual(["Goods not ready (0 of 2)", "Logistics chosen"]);
  });

  it("spells every ISO date the resolver hands over", () => {
    const text = JSON.stringify(stops);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("reads whole sentences, never the Route box's broken rows", () => {
    expect(stops.find((s) => s.key === "delivery-date")!.cards[0]!.checklist[0]!.value).toBe("Logistics has not scheduled the delivery");
    expect(stops.find((s) => s.key === "stock")!.status).toBe("Warehouse has 0 of 1 Units ready");
  });

  it("titles an unsent PO with no act of mine in Purchasing's own words", () => {
    const quiet = workStopsOf({ route, acts: [], pos, logistics: null, spell });
    expect(quiet.find((s) => s.key === "purchasing")!.status).toBe("Sending not confirmed");
  });

  it("prints no dash anywhere", () => {
    expect(JSON.stringify(stops)).not.toMatch(/[—–]/);
  });
});
