import { describe, expect, it } from "vitest";

import {
  OFFICE_OFF_DAYS,
  ORDER_ACTION_DUES,
  orderActionDueDef,
  orderActionDueIso,
  orderActionOverdue,
} from "./order-action-due";
import { DEFAULT_OFF_DAYS } from "./working-days";

// Anchor week used throughout, so a reader never has to look a weekday up:
//   Mon 27 Jul · Tue 28 · Wed 29 · Thu 30 · Fri 31 · Sat 1 Aug · Sun 2 · Mon 3
const MON = "2026-07-27";
const TUE = "2026-07-28";
const WED = "2026-07-29";
const THU = "2026-07-30";
const FRI = "2026-07-31";
const SAT = "2026-08-01";
const SUN = "2026-08-02";
const NEXT_MON = "2026-08-03";
const NEXT_TUE = "2026-08-04";
const NEXT_WED = "2026-08-05";

describe("order-action-due · the definitions", () => {
  it("carries exactly the two delay clocks, and nothing else has a Due here", () => {
    expect(ORDER_ACTION_DUES.map((d) => d.key)).toEqual([
      "delay_planning",
      "arrange_new_delivery_date",
    ]);
    // Every other Due lives in its own module — a copy here would be a second
    // home for a number (Law 0A).
    expect(orderActionDueDef("assign_logistics")).toBeNull();
    expect(orderActionDueDef("confirm_delivery_date")).toBeNull();
    expect(orderActionDueDef("issue_po")).toBeNull();
    expect(orderActionDueDef("collect")).toBeNull();
  });

  it("is §3's two numbers: 2 working days, then the same working day", () => {
    expect(orderActionDueDef("delay_planning")).toEqual({
      key: "delay_planning",
      workingDays: 2,
      calendar: "office",
      anchor: "delay_detected_at",
    });
    expect(orderActionDueDef("arrange_new_delivery_date")).toEqual({
      key: "arrange_new_delivery_date",
      workingDays: 0,
      calendar: "office",
      anchor: "delay_decision_at",
    });
  });

  it("counts on the OFFICE week, which is NOT the engine default", () => {
    // Law 2A: office = Mon–Fri; the shared engine still defaults to the
    // warehouse week (Mon–Sat). If these two ever became equal, this module
    // would be silently counting Saturdays again.
    expect([...OFFICE_OFF_DAYS]).toEqual([0, 6]);
    expect([...DEFAULT_OFF_DAYS]).toEqual([0]);
  });
});

describe("order-action-due · Delay planning — 2 working days", () => {
  it("Monday detection is due Wednesday", () => {
    expect(orderActionDueIso("delay_planning", MON)).toBe(WED);
  });

  it("skips the WEEKEND — Thursday detection is due Monday, not Saturday", () => {
    expect(orderActionDueIso("delay_planning", THU)).toBe(NEXT_MON);
  });

  it("skips a public holiday", () => {
    // Wed 29 Jul is a holiday: Mon + 2 working days lands on Thursday.
    expect(orderActionDueIso("delay_planning", MON, [WED])).toBe(THU);
  });

  it("a Saturday detection starts its clock on MONDAY (Law 2A)", () => {
    // The warehouse works Saturday and the office does not, so the office clock
    // may not already be running while nobody could act on it.
    expect(orderActionDueIso("delay_planning", SAT)).toBe(NEXT_WED);
    expect(orderActionDueIso("delay_planning", SUN)).toBe(NEXT_WED);
  });

  it("accepts a timestamp and reads only its calendar date", () => {
    expect(orderActionDueIso("delay_planning", `${MON}T09:14:00+08:00`)).toBe(WED);
  });

  it("turns late the day AFTER the due date, never on it", () => {
    expect(orderActionOverdue("delay_planning", MON, WED)).toBe(false);
    expect(orderActionOverdue("delay_planning", MON, THU)).toBe(true);
  });
});

describe("order-action-due · Arrange new delivery date — the SAME working day", () => {
  it("is due the day the decision was recorded", () => {
    expect(orderActionDueIso("arrange_new_delivery_date", TUE)).toBe(TUE);
    expect(orderActionDueIso("arrange_new_delivery_date", FRI)).toBe(FRI);
  });

  it("a Friday decision is NOT late on Saturday and IS late on Monday", () => {
    // §3, verbatim: "A decision recorded on a Friday afternoon is due that
    // Friday; it turns late on the next working day." Saturday is not an office
    // working day, so it is not that day.
    expect(orderActionOverdue("arrange_new_delivery_date", FRI, FRI)).toBe(false);
    expect(orderActionOverdue("arrange_new_delivery_date", FRI, SAT)).toBe(false);
    expect(orderActionOverdue("arrange_new_delivery_date", FRI, SUN)).toBe(false);
    expect(orderActionOverdue("arrange_new_delivery_date", FRI, NEXT_MON)).toBe(true);
  });

  it("a holiday is not the next working day either", () => {
    // Decision on Thursday; Friday is a public holiday, so it is late on Monday.
    expect(orderActionOverdue("arrange_new_delivery_date", THU, FRI, [FRI])).toBe(
      false,
    );
    expect(
      orderActionOverdue("arrange_new_delivery_date", THU, NEXT_MON, [FRI]),
    ).toBe(true);
  });

  it("a decision recorded on a non-working day is due the next working day", () => {
    expect(orderActionDueIso("arrange_new_delivery_date", SUN)).toBe(NEXT_MON);
    expect(orderActionOverdue("arrange_new_delivery_date", SUN, NEXT_MON)).toBe(
      false,
    );
    expect(orderActionOverdue("arrange_new_delivery_date", SUN, NEXT_TUE)).toBe(
      true,
    );
  });
});

describe("order-action-due · no anchor, no alarm", () => {
  it("an action with no Due has no deadline and can never be late", () => {
    expect(orderActionDueIso("issue_po", MON)).toBeNull();
    expect(orderActionOverdue("issue_po", MON, NEXT_MON)).toBe(false);
  });

  it("a missing anchor is silence, not a deadline of today", () => {
    for (const anchor of [null, undefined, "", "not-a-date"]) {
      expect(orderActionDueIso("delay_planning", anchor)).toBeNull();
      expect(orderActionOverdue("delay_planning", anchor, NEXT_MON)).toBe(false);
      expect(orderActionDueIso("arrange_new_delivery_date", anchor)).toBeNull();
      expect(orderActionOverdue("arrange_new_delivery_date", anchor, NEXT_MON)).toBe(
        false,
      );
    }
  });

  it("an unreadable today is silence too", () => {
    expect(orderActionOverdue("delay_planning", MON, "")).toBe(false);
    expect(orderActionOverdue("delay_planning", MON, "soon")).toBe(false);
  });
});
