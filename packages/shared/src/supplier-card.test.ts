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

describe("the Supplier card is one card for every supplier", () => {
  it("names the group, never pretending there is one supplier", () => {
    const m = supplierCardModel({ todayIso: "2026-10-16", pos: three, spell });
    expect(m.heading).toBe("Supplier · 3 suppliers");
    expect(m.status).toEqual({ text: "Sleepwell delayed to 30 Oct · 2 of 3 POs issued", tone: "attention" });
    expect(m.rows[0].poNo).toBe("PO-A");
    expect(m.rows[0].replyWord).toBe("Delayed · Production Delay");
    expect(m.rows[0].originalIso).toBe("2026-10-20");
    expect(m.rows.map((r) => r.poNo)).toEqual(["PO-A", "PO-C", "PO-B"]);
    expect(m.rows[1].replyWord).toBe("Not issued");
  });

  it("one supplier is named in the heading; no PO says so", () => {
    expect(supplierCardModel({ todayIso: "2026-10-16", pos: [po({})], spell }).heading).toBe("Supplier · Sleepwell");
    expect(supplierCardModel({ todayIso: "2026-10-16", pos: [], spell }).status.text).toBe("No purchase order for this Sales Order");
  });

  it("the Supplier DO is needed one Office working day before the latest date", () => {
    const fri = supplierCardModel({ todayIso: "2026-10-16", pos: [po({ effectiveIso: "2026-10-19" })], spell });
    expect(fri.rows[0].doLine).toBe("Needed by 16 Oct");
    expect(fri.rows[0].doTone).toBe("current");
    const early = supplierCardModel({ todayIso: "2026-10-12", pos: [po({ effectiveIso: "2026-10-19" })], spell });
    expect(early.rows[0].doLine).toBe("Not needed yet");
    const has = supplierCardModel({ todayIso: "2026-10-16", pos: [po({ supplierDo: { number: "DO-5531", atIso: "2026-10-16T02:00:00Z" } })], spell });
    expect(has.rows[0].doLine).toBe("DO-5531 · 16 Oct");
  });

  it("GRN is the Warehouse's fact", () => {
    const m = supplierCardModel({ todayIso: "2026-10-30", pos: [po({ grnIso: "2026-10-20" }), po({ poNo: "PO-B", supplier: "ABC", grnIso: null })], spell });
    expect(m.status.text).toBe("GRN received for 1 of 2");
    expect(m.rows.find((r) => r.poNo === "PO-B")?.grnLine).toBe("Not received yet");
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
    expect(m.points.map((p) => p.status)).toEqual(["Done", "1 delayed", "0 of 3 received", "Due today", "Requested"]);
    expect(m.points.find((p) => p.key === "po")?.dateText).toBe("22–30 Oct");
    expect(m.points.filter((p) => p.tone === "current")).toHaveLength(1);
    expect(m.header).toEqual({ text: "3 days left", tone: "future" });
    expect(m.points.at(-1)?.final).toBe(true);
  });

  it("Loan appears only with a loan record", () => {
    expect(missionRouteModel(route({ loan: { state: "offered", atIso: "2026-09-20" } })).points[1]).toMatchObject({ key: "loan", status: "Offered" });
  });

  it("payment is one exception line, never a point and never Blocked", () => {
    const m = missionRouteModel(route({ payment: { owedText: "RM 1,250.00", deadlineIso: "2026-10-23", affects: true, financeHold: false } }));
    expect(m.paymentLine).toEqual({ text: "Payment · RM 1,250.00 to collect by 23 Oct", tone: "attention" });
    expect(m.points.some((p) => p.label === "Payment")).toBe(false);
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
