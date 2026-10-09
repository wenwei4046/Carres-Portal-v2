import { describe, expect, it } from "vitest";
import type { OutrightOrderFacts } from "@carres/shared";
import type { PaymentMonitorRow } from "@carres/shared/payment-monitor";
import { ApiError } from "@/lib/api";
import type { RegisterRow } from "../sales-order-columns";
import { COLUMNS, timeWords, type CellContext, type OwnedRead, type PayByRead } from "./outright-columns";
import { readStateOf } from "./pay-by";

const row = (over: Partial<RegisterRow["o"]> = {}) =>
  ({
    id: "o1",
    so: 1001,
    o: { id: "o1", order_lines: [{ sku: "MS12", qty: 1 }], allocated_units: [], ...over },
  }) as unknown as RegisterRow;

const facts = (over: Partial<OutrightOrderFacts> = {}): OutrightOrderFacts => ({
  pic: { userId: "u1", name: "Shasha" },
  poCount: 1,
  supplierDos: ["DO-778"],
  grns: ["GRN-11"],
  delivery: { dateIso: "2026-10-20", time: "2 PM to 5 PM", source: "arrangement", partnerId: "p1", partnerName: "NETS" },
  loading: { hasDo: true, kind: "handed_over", at: "2026-10-02T03:00:00Z" },
  locations: ["Carres Klang"],
  financeHold: null,
  ...over,
});

const ctxOf = (owned: OwnedRead, payBy: PayByRead = { state: "ok", row: null }, payment = "unpaid"): CellContext => ({
  payment: () => payment,
  owned: () => owned,
  payBy: () => payBy,
});
const ok = (f: OutrightOrderFacts | null, failed: Record<string, boolean> = {}): OwnedRead => ({
  state: "ok", facts: f, cases: "none", failed,
});
const t = (key: string, ctx: CellContext, r = row()) => COLUMNS[key]!.cell(r, ctx);

describe("Outright list cells read each owner and keep three states apart", () => {
  it("prints the owner's own facts", () => {
    const ctx = ctxOf(ok(facts()));
    expect(t("pic", ctx).t).toBe("Shasha");
    expect(t("sdo", ctx).t).toBe("DO-778");
    expect(t("grnNo", ctx).t).toBe("GRN-11");
    expect(t("logi", ctx).t).toBe("NETS");
    expect(t("appt", ctx)).toMatchObject({ t: "Scheduled", sub: "2 PM to 5 PM" });
    expect(t("delivery", ctx)).toMatchObject({ t: "20 Oct 26", sub: "Tue" });
    expect(t("load", ctx).t).toBe("Handed over");
    expect(t("loc", ctx).t).toBe("Carres Klang");
    expect(t("hold", ctx).t).toBe("No Finance hold");
  });

  it("an empty record is Not recorded / Not scheduled / Not assigned — the record was read", () => {
    const ctx = ctxOf(ok(facts({
      pic: null, supplierDos: [], grns: [], locations: [],
      delivery: { dateIso: null, time: null, source: null, partnerId: null, partnerName: null },
      loading: { hasDo: false, kind: null, at: null },
    })));
    expect(t("pic", ctx).t).toBe("Not recorded");
    expect(t("sdo", ctx).t).toBe("Not yet");
    expect(t("appt", ctx).t).toBe("Not scheduled");
    expect(t("delivery", ctx).t).toBe("Not scheduled");
    expect(t("logi", ctx).t).toBe("Not assigned");
    expect(t("load", ctx).t).toBe("Not yet");
  });

  it("a PIC whose name RLS hides is No access, never Not recorded", () => {
    const ctx = ctxOf(ok(facts({ pic: { userId: "u9", name: null } })));
    expect(t("pic", ctx).t).toBe("No access");
  });

  it("a failed owner read is Could not read — amber, with the governed sentence", () => {
    const ctx = ctxOf(ok(facts(), { purchasing: true, delivery: true, pic: true }));
    const sdo = t("sdo", ctx);
    expect(sdo).toMatchObject({ t: "Could not read", fg: "warn" });
    expect(sdo.title).toBe("Could not read Purchasing for this order. This does not mean there is no Supplier DO.");
    expect(t("logi", ctx).t).toBe("Could not read");
    expect(t("pic", ctx).t).toBe("Could not read");
    // A read that did not fail still answers.
    expect(t("hold", ctx).t).toBe("No Finance hold");
  });

  it("Finance hold unknown is never 'No Finance hold'", () => {
    expect(t("hold", ctxOf(ok(facts(), { finance: true }))).t).toBe("Could not read");
    expect(t("hold", ctxOf({ state: "failed" })).t).toBe("Could not read");
    expect(t("hold", ctxOf({ state: "denied" })).t).toBe("No access");
    expect(t("hold", ctxOf({ state: "loading" })).t).toBe("Loading");
    expect(t("hold", ctxOf(ok(facts({ financeHold: { reason: "Cheque not cleared" } }))))).toMatchObject({
      t: "Hold delivery", pill: true, tone: "warn", sub: "Finance hold · Cheque not cleared",
    });
  });

  it("a server that answered without this order's facts is Could not read, not empty", () => {
    expect(t("grnNo", ctxOf(ok(null))).t).toBe("Could not read");
  });

  it("Pay by is Payments' own deadline, and an unread clock is never 'no deadline'", () => {
    const monitorRow = { timing: { dueIso: "2026-10-16", late: false, fact: "Payment due Fri, 16 Oct" } } as unknown as PaymentMonitorRow;
    expect(t("payDue", ctxOf(ok(facts()), { state: "ok", row: monitorRow })).t).toBe("16 Oct 26");
    expect(t("payDue", ctxOf(ok(facts()), { state: "ok", row: null })).t).toBe("Not recorded");
    expect(t("payDue", ctxOf(ok(facts()), { state: "failed" })).t).toBe("Could not read");
    expect(t("payDue", ctxOf(ok(facts()), { state: "denied" })).t).toBe("No access");
    expect(t("payDue", ctxOf(ok(facts()), { state: "failed" }, "paid")).t).toBe("Paid");
  });

  it("an unreadable Service read is Could not read for Problems", () => {
    expect(t("problems", ctxOf({ state: "ok", facts: facts(), cases: null, failed: { cases: true } })).t).toBe("Could not read");
  });
});

describe("timeWords", () => {
  it("prints a stored window without a dash", () => {
    expect(timeWords("Morning (9am\u201312pm)")).toBe("Morning (9am to 12pm)");
    expect(timeWords("2pm-5pm")).toBe("2pm to 5pm");
    expect(timeWords("Morning (9am to 12pm)")).toBe("Morning (9am to 12pm)");
    expect(timeWords("")).toBeUndefined();
  });
});

describe("readStateOf", () => {
  const q = (over: Partial<{ isPending: boolean; isError: boolean; error: unknown }>) => ({ isPending: false, isError: false, error: null, ...over });
  it("a refusal (403) is denied, any other error failed, then loading", () => {
    expect(readStateOf([q({}), q({ isError: true, error: new ApiError(403, "no", null) })])).toBe("denied");
    expect(readStateOf([q({ isError: true, error: new ApiError(500, "boom", null) })])).toBe("failed");
    expect(readStateOf([q({ isPending: true })])).toBe("loading");
    expect(readStateOf([q({})])).toBe("ok");
  });
});
