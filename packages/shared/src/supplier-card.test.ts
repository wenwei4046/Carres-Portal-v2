import { describe, expect, it } from "vitest";
import { supplierCardModel, type SupplierPoFact } from "./supplier-card";
import { missionRouteModel, type MissionRouteInput } from "./mission-route";

const spell = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

const po = (over: Partial<SupplierPoFact>): SupplierPoFact => ({
  poNo: "PO260924-1001",
  supplier: "Sleepwell",
  issued: true,
  originalIso: "2026-10-20",
  effectiveIso: "2026-10-20",
  reply: null,
  supplierDo: null,
  deliverTo: "Carres Klang Warehouse",
  grnIso: null,
  ...over,
});

const three = [
  po({ poNo: "PO-A", supplier: "Sleepwell", effectiveIso: "2026-10-30", reply: { answer: "delayed", reason: "Production Delay", evidence: "wa.jpg", recordedAtIso: "2026-10-15T01:00:00Z" } }),
  po({ poNo: "PO-B", supplier: "ABC Furniture", effectiveIso: "2026-10-22" }),
  po({ poNo: "PO-C", supplier: "XYZ Bedding", issued: false, originalIso: null, effectiveIso: null }),
];

describe("the Supplier card is one card for every supplier (§5.10)", () => {
  it("prints group progress plus the highest-material exception, never a name", () => {
    const m = supplierCardModel({ todayIso: "2026-10-16", pos: three, spell });
    expect(m.heading).toBe("Supplier · 3 suppliers");
    expect(m.status).toEqual({ text: "2 of 3 POs issued · 1 delayed", tone: "attention" });
    expect(m.status.text).not.toMatch(/Sleepwell|PO-/);
    expect(m.rows.map((r) => [r.poNo, r.stateText])).toEqual([
      ["PO-A", "Delayed"],
      ["PO-C", "PO not issued"],
      ["PO-B", "Expected"],
    ]);
    expect(m.rows[0].originalIso).toBe("2026-10-20"); // the original date survives the delay
  });

  it("one supplier is named in the heading; no PO says so", () => {
    expect(supplierCardModel({ todayIso: "2026-10-16", pos: [po({})], spell }).heading).toBe("Supplier · Sleepwell");
    expect(supplierCardModel({ todayIso: "2026-10-16", pos: [], spell }).status.text).toBe("No purchase order for this Sales Order");
  });

  it("confirmation is needed one Office working day before arrival — the Supplier DO closes it", () => {
    const fri = supplierCardModel({ todayIso: "2026-10-16", pos: [po({ effectiveIso: "2026-10-19" })], spell });
    expect(fri.rows[0].stateText).toBe("Confirmation needed today");
    expect(fri.status.text).toBe("1 of 1 dates ready · 1 confirmation needed");
    const early = supplierCardModel({ todayIso: "2026-10-12", pos: [po({ effectiveIso: "2026-10-19" })], spell });
    expect(early.rows[0].state).toBe("expected");
    const has = supplierCardModel({ todayIso: "2026-10-16", pos: [po({ effectiveIso: "2026-10-19", supplierDo: { number: "DO-5531", atIso: "2026-10-16T02:00:00Z" } })], spell });
    expect(has.rows[0].state).toBe("expected");
    expect(has.rows[0].checksDone).toBe(3);
  });

  it("a default-date confirmation right after PO issue is not the pre-arrival confirmation", () => {
    const m = supplierCardModel({
      todayIso: "2026-10-16",
      pos: [po({ effectiveIso: "2026-10-19", reply: { answer: "confirmed", reason: null, evidence: null, recordedAtIso: "2026-10-01T01:00:00Z" } })],
      spell,
    });
    expect(m.rows[0].state).toBe("confirmationNeeded");
  });

  it("GRN is the Warehouse's fact: received, short received, arrival missed", () => {
    const m = supplierCardModel({
      todayIso: "2026-10-30",
      pos: [po({ grnIso: "2026-10-20", orderedQty: 2, receivedQty: 2 }), po({ poNo: "PO-B", supplier: "ABC", effectiveIso: "2026-11-04" })],
      spell,
    });
    expect(m.status.text).toBe("1 of 2 received · 1 arriving 4 Nov");
    expect(supplierCardModel({ todayIso: "2026-10-30", pos: [po({ grnIso: "2026-10-20", orderedQty: 2, receivedQty: 1 })], spell }).rows[0].stateText).toBe("Short received");
    const missed = supplierCardModel({ todayIso: "2026-10-22", pos: [po({ effectiveIso: "2026-10-20" })], spell });
    expect(missed.rows[0].stateText).toBe("Arrival missed · Follow up supplier");
    expect(missed.status.tone).toBe("missed");
  });
});

function route(over: Partial<MissionRouteInput> = {}): MissionRouteInput {
  const sup = supplierCardModel({ todayIso: "2026-10-24", pos: three, spell });
  return {
    todayIso: "2026-10-24",
    proceededIso: "2026-09-18",
    loan: null,
    supplier: sup,
    fromStock: false,
    contact: { dueIso: "2026-10-24", state: "open" },
    requestedIso: "2026-10-27",
    scheduledIso: null,
    deliveredIso: null,
    payment: { owedText: null, deadlineIso: null, affects: false, financeHold: false },
    spell,
    ...over,
  };
}

describe("the Order Route is one compact line", () => {
  it("prints Proceed · PO · GRN · Contact · Delivery with one blue point", () => {
    const m = missionRouteModel(route());
    expect(m.points.map((p) => p.label)).toEqual(["Proceed", "PO", "GRN", "Contact", "Delivery"]);
    expect(m.points.map((p) => p.status)).toEqual(["Done", "2 of 3", "0 of 3", "Due today", "Requested"]);
    expect(m.points.find((p) => p.key === "po")?.dateText).toBe("22–30 Oct");
    expect(m.points.filter((p) => p.tone === "current")).toHaveLength(1);
    expect(m.header).toEqual({ text: "3 days left", tone: "future" });
    expect(m.points.at(-1)?.final).toBe(true);
  });

  it("Loan appears only with a loan record", () => {
    expect(missionRouteModel(route()).points.some((p) => p.key === "loan")).toBe(false);
    expect(missionRouteModel(route({ loan: { state: "offered", atIso: "2026-09-20" } })).points[1]).toMatchObject({ key: "loan", status: "Offered" });
  });

  it("payment is one exception line, never a point and never Blocked", () => {
    const m = missionRouteModel(route({ payment: { owedText: "RM 1,250.00", deadlineIso: "2026-10-23", affects: true, financeHold: false } }));
    expect(m.paymentLine).toEqual({ text: "Payment · RM 1,250.00 to collect by 23 Oct", tone: "attention" });
    expect(m.points.some((p) => /Payment|Blocked/.test(p.label + p.status))).toBe(false);
    expect(missionRouteModel(route({ payment: { owedText: "RM 5.00", deadlineIso: null, affects: false, financeHold: true } })).paymentLine?.text).toBe(
      "Payment · Finance is holding this delivery",
    );
  });

  it("from stock with no PO; delivered ends the mission", () => {
    const empty = supplierCardModel({ todayIso: "2026-10-24", pos: [], spell });
    const m = missionRouteModel(route({ supplier: empty, fromStock: true, deliveredIso: "2026-10-27", contact: { dueIso: "2026-10-24", state: "done" } }));
    expect(m.points.map((p) => p.status)).toEqual(["Done", "From stock", "In stock", "Done", "Done"]);
    expect(m.points.at(-1)?.label).toBe("Delivered");
    expect(m.header).toBeNull();
  });

  it("a delivery date passed without a result is late, in red", () => {
    const m = missionRouteModel(route({ todayIso: "2026-10-29", scheduledIso: "2026-10-27", contact: { dueIso: "2026-10-24", state: "done" } }));
    expect(m.header).toEqual({ text: "2 days late", tone: "missed" });
    expect(m.points.at(-1)?.tone).toBe("missed");
  });
});
