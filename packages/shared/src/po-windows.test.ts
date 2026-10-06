import { describe, expect, it } from "vitest";
import {
  effectivePoArrivalOf,
  poExpectedArrivalsOf,
  poDateForIssue,
  poWindowFor,
  poWindowCalendarOf,
  poWindowKeyOf,
  poWindowTimeWord,
  parsePoWindowKey,
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

describe("poExpectedArrivalsOf — one expected arrival per line / batch (0587)", () => {
  const evidenced = { kind: "tomorrow_delivery", po_version: 1, channel: "whatsapp", recipient: "g", evidence: "PO-1/a.png", reported_by: "Ah Hock", reported_at: "2026-09-20T02:00:00Z", recorded_by: "u", recorded_at: "2026-09-20T02:05:00Z", about_date: "2026-10-12", previous_date: null, reason: null, answer: "confirmed" };
  const lines = [{ id: "L1", qty: 4, receivedQty: 0 }, { id: "L2", qty: 2, receivedQty: 0 }, { id: "L3", qty: 1, receivedQty: 1 }];
  it("no answer → every open line arrives on the original; a received line is absent", () => {
    expect(poExpectedArrivalsOf({ version: 1, officialDeliveryDate: "2026-10-12", etaDate: null, promises: [], lines })).toEqual([
      { poLineId: "L1", qty: 4, arrival: "2026-10-12", answer: null, reason: null },
      { poLineId: "L2", qty: 2, arrival: "2026-10-12", answer: null, reason: null },
    ]);
  });
  it("a line's newest answer group gives its batches; a line without one takes the PO-level answer; the PO-level arrival is the LAST", () => {
    const promises = [
      { ...evidenced, new_date: "2026-10-16", answer: "delayed", reason: "Transport delay", recorded_at: "2026-09-19T00:00:00Z" },
      { ...evidenced, po_line_id: "L1", about_qty: 3, answer_group: "g1", new_date: "2026-10-12" },
      { ...evidenced, po_line_id: "L1", about_qty: 1, answer_group: "g1", new_date: "2026-10-19", answer: "delayed", reason: "Partial quantity ready" },
      { ...evidenced, po_line_id: "L1", about_qty: 4, answer_group: "g0", new_date: "2026-10-30", answer: "delayed", reason: "Other", recorded_at: "2026-09-18T00:00:00Z" },
    ];
    const po = { version: 1, officialDeliveryDate: "2026-10-12", etaDate: null, promises, lines };
    expect(poExpectedArrivalsOf(po)).toEqual([
      { poLineId: "L1", qty: 3, arrival: "2026-10-12", answer: "confirmed", reason: null },
      { poLineId: "L1", qty: 1, arrival: "2026-10-19", answer: "delayed", reason: "Partial quantity ready" },
      { poLineId: "L2", qty: 2, arrival: "2026-10-16", answer: "delayed", reason: "Transport delay" },
    ]);
    expect(effectivePoArrivalOf(po)).toBe("2026-10-19");
  });
});

describe("the window days follow the PO Days setting (Jess 2026-09-25)", () => {
  it("a PO Day that is also an Office day opens windows; an unticked weekday does not", () => {
    const monWedFri = poWindowCalendarOf([1, 3, 5], new Set());
    // Monday 21 Sep after the last window → next PO Day is Wednesday, not Tuesday.
    expect(poWindowFor(my("2026-09-21T17:00:00"), STANDARD, null, monWedFri)).toMatchObject({ date: "2026-09-23", time: "11:30" });
    // Tuesday demand waits for Wednesday's first window.
    expect(poWindowFor(my("2026-09-22T09:00:00"), STANDARD, null, monWedFri)).toMatchObject({ date: "2026-09-23", time: "11:30" });
  });
  it("ticking Saturday never opens a window on an Office off day", () => {
    const withSaturday = poWindowCalendarOf([1, 2, 3, 4, 5, 6], new Set());
    expect(poWindowFor(my("2026-09-26T09:00:00"), STANDARD, null, withSaturday)).toMatchObject({ date: "2026-09-28" });
  });
  it("a public holiday closes the window day", () => {
    const cal = poWindowCalendarOf([1, 2, 3, 4, 5], new Set(["2026-09-24"]));
    expect(poWindowFor(my("2026-09-23T17:00:00"), STANDARD, null, cal)).toMatchObject({ date: "2026-09-25" });
  });
});

describe("window keys and words", () => {
  it("round-trips the key and spells the clock", () => {
    expect(poWindowKeyOf({ date: "2026-09-25", time: "11:30" })).toBe("2026-09-25T11:30");
    expect(parsePoWindowKey("2026-09-25T16:00")).toEqual({ date: "2026-09-25", time: "16:00" });
    expect(parsePoWindowKey("po_window:2026-09-25T16:00")).toBeNull();
    expect(poWindowTimeWord("11:30")).toBe("11:30 AM");
    expect(poWindowTimeWord("16:00")).toBe("4:00 PM");
    expect(poWindowTimeWord("12:05")).toBe("12:05 PM");
    expect(poWindowTimeWord("00:15")).toBe("12:15 AM");
  });
});
