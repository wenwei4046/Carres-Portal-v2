import { describe, expect, it } from "vitest";
import {
  effectivePoArrivalOf,
  poDateForIssue,
  poWindowFor,
  poWindowMissions,
  supplierPoWindows,
  type PoWindowSettings,
} from "./po-windows";

const STANDARD: PoWindowSettings = { first: "11:30", second: "16:00", secondEnabled: true };
const ONE_WINDOW: PoWindowSettings = { first: "11:30", second: "16:00", secondEnabled: false };
/** Malaysia wall-clock → an instant (UTC+8, no daylight saving). */
const my = (local: string) => new Date(`${local}+08:00`).toISOString();

describe("supplierPoWindows — which windows a supplier may use", () => {
  it("the standard windows, first then second", () => {
    expect(supplierPoWindows(STANDARD, null)).toEqual([
      { time: "11:30", kind: "standard" }, { time: "16:00", kind: "standard" },
    ]);
  });
  it("the second window can be switched off", () => {
    expect(supplierPoWindows(ONE_WINDOW, null)).toEqual([{ time: "11:30", kind: "standard" }]);
  });
  it("a supplier cut-off between the windows makes the later window invalid", () => {
    expect(supplierPoWindows(STANDARD, "14:00")).toEqual([{ time: "11:30", kind: "standard" }]);
  });
  it("a supplier cut-off before every window is the supplier's own window", () => {
    expect(supplierPoWindows(STANDARD, "10:00")).toEqual([{ time: "10:00", kind: "supplier" }]);
  });
});

describe("poWindowFor — which window demand belongs to (Malaysia time, Purchasing working days)", () => {
  it("Tue 09:05 → Tue 11:30", () => {
    expect(poWindowFor(my("2026-09-22T09:05:00"), STANDARD, null)).toMatchObject({ date: "2026-09-22", time: "11:30", kind: "standard", dueAt: "2026-09-22T11:30:00+08:00" });
  });
  it("Tue 11:30 exactly → Tue 16:00 (it must arrive BEFORE a window)", () => {
    expect(poWindowFor(my("2026-09-22T11:30:00"), STANDARD, null)).toMatchObject({ date: "2026-09-22", time: "16:00" });
  });
  it("Tue 16:20 → Wed 11:30", () => {
    expect(poWindowFor(my("2026-09-22T16:20:00"), STANDARD, null)).toMatchObject({ date: "2026-09-23", time: "11:30" });
  });
  it("Tue 12:00 with the second window off → Wed 11:30", () => {
    expect(poWindowFor(my("2026-09-22T12:00:00"), ONE_WINDOW, null)).toMatchObject({ date: "2026-09-23", time: "11:30" });
  });
  it("Fri 17:00 → Mon 11:30 (the weekend is not a Purchasing working day)", () => {
    expect(poWindowFor(my("2026-09-18T17:00:00"), STANDARD, null)).toMatchObject({ date: "2026-09-21", time: "11:30" });
  });
  it("Tue 15 Sep 17:00 → Thu 17 Sep 11:30 (Wed 16 Sep is Malaysia Day)", () => {
    expect(poWindowFor(my("2026-09-15T17:00:00"), STANDARD, null)).toMatchObject({ date: "2026-09-17", time: "11:30" });
  });
  it("Sat 10:00 → Mon 11:30", () => {
    expect(poWindowFor(my("2026-09-19T10:00:00"), STANDARD, null)).toMatchObject({ date: "2026-09-21", time: "11:30" });
  });
  it("a supplier with a 10:00 cut-off: Tue 09:00 → Tue 10:00; Tue 10:30 → Wed 10:00 (never a later invalid window)", () => {
    expect(poWindowFor(my("2026-09-22T09:00:00"), STANDARD, "10:00")).toMatchObject({ date: "2026-09-22", time: "10:00", kind: "supplier" });
    expect(poWindowFor(my("2026-09-22T10:30:00"), STANDARD, "10:00")).toMatchObject({ date: "2026-09-23", time: "10:00", kind: "supplier" });
  });
  it("a supplier with a 14:00 cut-off: Tue 12:00 → Wed 11:30, never Tue 16:00", () => {
    expect(poWindowFor(my("2026-09-22T12:00:00"), STANDARD, "14:00")).toMatchObject({ date: "2026-09-23", time: "11:30" });
  });
  it("the date is Malaysia's, whatever the device clock says: 23:30 UTC Mon is Tue 07:30 in KL → Tue 11:30", () => {
    expect(poWindowFor("2026-09-21T23:30:00.000Z", STANDARD, null)).toMatchObject({ date: "2026-09-22", time: "11:30" });
  });
});

describe("poDateForIssue — the window decides the PO Date", () => {
  it("issued Tue 15:00 → PO Date Tue; issued Tue 16:30 → PO Date Wed; issued Fri 18:00 → PO Date Mon", () => {
    expect(poDateForIssue(my("2026-09-22T15:00:00"), STANDARD, null)).toBe("2026-09-22");
    expect(poDateForIssue(my("2026-09-22T16:30:00"), STANDARD, null)).toBe("2026-09-23");
    expect(poDateForIssue(my("2026-09-18T18:00:00"), STANDARD, null)).toBe("2026-09-21");
  });
  it("a supplier's earlier cut-off wins: issued Tue 10:30 for a 10:00 supplier → PO Date Wed", () => {
    expect(poDateForIssue(my("2026-09-22T10:30:00"), STANDARD, "10:00")).toBe("2026-09-23");
  });
});

describe("effectivePoArrivalOf — one definition of the effective arrival", () => {
  const evidenced = { kind: "tomorrow_delivery", po_version: 2, channel: "whatsapp", recipient: "g", evidence: "PO-1/a.png", reported_by: "Ah Hock", reported_at: "2026-09-20T02:00:00Z", recorded_by: "u", recorded_at: "2026-09-20T02:05:00Z", answer: "delayed", about_date: "2026-10-12", previous_date: null, reason: "Transport delay" };
  it("no answer → the original PO Delivery Date, never the live planning date", () => {
    expect(effectivePoArrivalOf({ version: 2, officialDeliveryDate: "2026-10-12", etaDate: "2026-10-09", promises: [] })).toBe("2026-10-12");
  });
  it("the latest evidenced answer on the CURRENT version wins", () => {
    expect(effectivePoArrivalOf({ version: 2, officialDeliveryDate: "2026-10-12", etaDate: null, promises: [
      { ...evidenced, new_date: "2026-10-20", recorded_at: "2026-09-20T02:05:00Z" },
      { ...evidenced, new_date: "2026-10-23", recorded_at: "2026-09-21T02:05:00Z" },
    ] })).toBe("2026-10-23");
  });
  it("an answer on an earlier version, or without evidence, does not move it", () => {
    expect(effectivePoArrivalOf({ version: 2, officialDeliveryDate: "2026-10-12", etaDate: null, promises: [
      { ...evidenced, po_version: 1, new_date: "2026-10-20" },
      { ...evidenced, evidence: null, new_date: "2026-10-21" },
    ] })).toBe("2026-10-12");
  });
  it("an unknown original falls back to the live planning date", () => {
    expect(effectivePoArrivalOf({ version: 1, officialDeliveryDate: null, etaDate: "2026-10-09", promises: [] })).toBe("2026-10-09");
  });
});

describe("poWindowMissions — one mission per window, never one per Sales Order", () => {
  const demand = (id: string, so: string, supplierId: string, supplierName: string, admittedAt: string, cutoff: string | null = null) =>
    ({ id, orderId: `o-${so}`, orderLabel: so, supplierId, supplierName, admittedAt, supplierCutoff: cutoff });

  it("groups the exact source lines into their window, by supplier, and says when each is due", () => {
    const missions = poWindowMissions([
      demand("line-1", "SO2609-4801", "s-nf", "Nice Future", my("2026-09-22T08:10:00")),
      demand("line-2", "SO2609-4801", "s-hk", "Hookka", my("2026-09-22T09:40:00")),
      demand("line-3", "SO2609-4802", "s-nf", "Nice Future", my("2026-09-22T10:55:00")),
      demand("line-4", "SO2609-4803", "s-nf", "Nice Future", my("2026-09-22T12:15:00")),
      demand("line-5", "SO2609-4804", "s-dl", "Dorsettloft", my("2026-09-22T09:00:00"), "10:00"),
    ], STANDARD, my("2026-09-22T11:45:00"));
    expect(missions.map((m) => [m.id, m.dueAt, m.missed, m.lineCount, m.suppliers.map((s) => `${s.supplierName}:${s.lines.map((l) => l.id).join("+")}`)])).toEqual([
      ["po_window:2026-09-22T10:00", "2026-09-22T10:00:00+08:00", true, 1, ["Dorsettloft:line-5"]],
      ["po_window:2026-09-22T11:30", "2026-09-22T11:30:00+08:00", true, 3, ["Hookka:line-2", "Nice Future:line-1+line-3"]],
      ["po_window:2026-09-22T16:00", "2026-09-22T16:00:00+08:00", false, 1, ["Nice Future:line-4"]],
    ]);
  });

  it("matching one Sales Order never pulls its unrelated lines into another window", () => {
    const missions = poWindowMissions([
      demand("line-1", "SO2609-4801", "s-nf", "Nice Future", my("2026-09-22T08:10:00")),
      demand("line-9", "SO2609-4801", "s-nf", "Nice Future", my("2026-09-22T13:00:00")),
    ], STANDARD, my("2026-09-22T08:30:00"));
    expect(missions.map((m) => m.suppliers.flatMap((s) => s.lines.map((l) => l.id)))).toEqual([["line-1"], ["line-9"]]);
  });
});
