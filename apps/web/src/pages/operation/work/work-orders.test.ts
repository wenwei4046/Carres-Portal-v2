import { describe, expect, it } from "vitest";
import type { PoWindowWork } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import { workOrderGroups, type WorkOrderIndex } from "./work-orders";

function row(id: string, over: { ruleKey: string; module: WorkRow["module"]; kind: string; objectId: string; label: string; bucket?: WorkRow["timingBucket"]; recipient?: string | null; dueIso?: string | null }): WorkRow {
  return {
    id,
    ruleKey: over.ruleKey,
    module: over.module,
    timingBucket: over.bucket ?? "today",
    recipient: over.recipient ?? null,
    dueIso: over.dueIso ?? "2026-09-28",
    action: "Do it",
    problem: "Why",
    destination: "/x",
    source: { object: { kind: over.kind, id: over.objectId, label: over.label } },
  } as unknown as WorkRow;
}

function windowWith(pos: Array<{ poId: string; supplier: string; sent: boolean; orderIds: string[] }>, demandRows: string[] = []): PoWindowWork {
  return {
    key: "2026-09-03T11:30",
    date: "2026-09-03",
    time: "11:30",
    timeWord: "11:30 AM",
    dueAt: "2026-09-03T11:30:00+08:00",
    demand: { items: 0, orders: 0, rowIds: demandRows, suppliers: [] },
    pos: pos.map((p) => ({ poId: p.poId, documentNo: p.poId, supplierId: null, supplierName: p.supplier, sent: p.sent, channel: null, act: p.sent ? null : `Send ${p.poId} to ${p.supplier}`, orderIds: p.orderIds })),
    unsent: pos.filter((p) => !p.sent).length,
    card: { objectLabel: "11:30 AM PO window", problem: "", action: "", recipient: null, requiredResult: "" },
  };
}

const spell = (iso: string) => (iso === "2026-09-28" ? "Mon, 28 Sep" : iso);

describe("workOrderGroups", () => {
  const index: WorkOrderIndex = {
    poOrders: new Map([["PO260903-4316", ["o-1333"]], ["PO260903-7907", ["o-1333"]], ["PO-SHARED", ["o-1", "o-2"]]]),
    orderBySo: new Map([[1333, "o-1333"]]),
    soByOrder: new Map([["o-1333", 1333]]),
    windows: [windowWith([
      { poId: "PO260903-4316", supplier: "Ohana", sent: false, orderIds: ["o-1333"] },
      { poId: "PO260903-7907", supplier: "Nice Future", sent: false, orderIds: ["o-1333"] },
    ])],
  };

  it("counts a PO window ONCE on its order, while it puts one Send act per unsent PO", () => {
    const groups = workOrderGroups([
      row("w1", { ruleKey: "purchasing.po_window", module: "purchasing", kind: "po_window", objectId: "2026-09-03T11:30", label: "11:30 AM PO window", bucket: "overdue" }),
      row("d1", { ruleKey: "confirm_delivery_date", module: "delivery", kind: "sales_order", objectId: "o-1333", label: "SO-1333", recipient: "NETS" }),
    ], index, spell);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe("SO-1333");
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.acts.map((a) => a.title)).toEqual([
      "Send PO260903-4316 to Ohana",
      "Send PO260903-7907 to Nice Future",
      "Call NETS",
    ]);
    expect(groups[0]!.acts[2]!.why).toBe("Get the scheduled delivery date · due Mon, 28 Sep");
  });

  it("never copies a PO act onto each order when the PO serves several orders: it opens the PO view (A3)", () => {
    const groups = workOrderGroups([
      row("p1", { ruleKey: "purchasing.supplier_date_passed", module: "purchasing", kind: "purchase_order", objectId: "PO-SHARED", label: "PO-SHARED", recipient: "Ohana" }),
      row("p2", { ruleKey: "purchasing.confirm_tomorrows_delivery", module: "purchasing", kind: "purchase_order", objectId: "PO-SHARED", label: "PO-SHARED", recipient: "Ohana" }),
    ], index, spell);
    expect(groups.map((g) => [g.key, g.orderId, g.poId, g.items.length, g.acts.length])).toEqual([["po:PO-SHARED", null, "PO-SHARED", 2, 2]]);
  });

  it("places a PO act on the one order its PO serves", () => {
    const groups = workOrderGroups([
      row("p2", { ruleKey: "purchasing.supplier_date_passed", module: "purchasing", kind: "purchase_order", objectId: "PO260903-4316", label: "PO260903-4316", recipient: "Ohana", dueIso: "2026-09-14" }),
    ], index, spell);
    expect(groups[0]!.orderId).toBe("o-1333");
    expect(groups[0]!.acts[0]).toMatchObject({ kind: "supplier_answer", stop: "supplier", title: "Ask Ohana when the goods will arrive", button: "Record supplier answer" });
  });

  it("keeps a window that still has demand to buy as its own row, too", () => {
    const withDemand: WorkOrderIndex = { ...index, windows: [windowWith([{ poId: "PO260903-4316", supplier: "Ohana", sent: false, orderIds: ["o-1333"] }], ["row-1"])] };
    const groups = workOrderGroups([
      row("w1", { ruleKey: "purchasing.po_window", module: "purchasing", kind: "po_window", objectId: "2026-09-03T11:30", label: "11:30 AM PO window" }),
    ], withDemand, spell);
    expect(groups.map((g) => g.key).sort()).toEqual(["item:w1", "order:o-1333"]);
  });
});
