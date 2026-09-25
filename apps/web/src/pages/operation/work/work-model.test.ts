import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import { filterWork, parseWorkWeek, workFocusDay, workHoliday, workLayoutFor, workModuleCounts, workRailDates, workSections, workWeek } from "./work-model";

function row(overrides: Partial<WorkRow> = {}): WorkRow {
  return {
    source: {} as OperationWorkItem,
    id: "orders:1:ask_delivery_date",
    ruleKey: "ask_delivery_date",
    module: "orders",
    soRef: "SO-1318",
    orderId: "1",
    action: "Ask customer for a delivery date",
    ownerRule: "salesperson",
    ownerDutyKey: null,
    normalOwner: { userId: "sh", name: "Shasha" },
    activeCover: null,
    actingPerson: { userId: "sh", name: "Shasha" },
    ownerState: "primary",
    ownerName: "Shasha",
    ownerUserId: "sh",
    tone: "warning",
    locked: false,
    broken: false,
    dueIso: "2026-09-16",
    workingDaysLate: 0,
    problem: "No delivery date",
    recipient: "Tan Qu Qu",
    requiredResult: "Customer Delivery exists",
    completionFact: "orders.delivery_date exists",
    destination: "/operation/orders/so/1",
    line: "Ask customer for a delivery date",
    customer: "Tan Qu Qu",
    ownerId: "sh",
    normalOwnerId: "sh",
    deliveryDoNumber: null,
    timingBucket: "today",
    ...overrides,
  };
}

describe("Work presentation model", () => {
  it("keeps the locked section order and gives broken commitments one home", () => {
    const sections = workSections([
      row({ id: "no-date", timingBucket: "no_date", dueIso: null }),
      row({ id: "later", timingBucket: "later" }),
      row({ id: "broken", broken: true, timingBucket: "overdue", workingDaysLate: 2 }),
      row({ id: "late", timingBucket: "overdue", workingDaysLate: 1 }),
    ]);
    expect(sections.map((section) => section.label)).toEqual([
      "Broken commitments",
      "Missed",
      "Later",
      "No working date",
    ]);
    expect(sections.flatMap((section) => section.items).filter((item) => item.id === "broken")).toHaveLength(1);
  });

  it("searches object, recipient, problem, action and required result", () => {
    const rows = [row()];
    for (const search of ["SO-1318", "Tan Qu Qu", "No delivery", "Ask customer", "Customer Delivery"])
      expect(filterWork(rows, { search, when: "all", module: "all", covered: false })).toHaveLength(1);
  });

  it("keeps Later and No date separate and filters cover structurally", () => {
    const rows = [
      row({ id: "later", timingBucket: "later" }),
      row({ id: "none", timingBucket: "no_date", dueIso: null, ownerState: "covered" }),
    ];
    expect(filterWork(rows, { search: "", when: "later", module: "all", covered: false }).map((item) => item.id)).toEqual(["later"]);
    expect(filterWork(rows, { search: "", when: "all", module: "all", covered: true }).map((item) => item.id)).toEqual(["none"]);
  });
});

describe("workWeek — the day strip in a Kuala Lumpur browser", () => {
  const MON_TO_FRI = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
  const savedTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Asia/Kuala_Lumpur";
  });
  afterAll(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it("runs on the UTC+8 clock", () => {
    expect(new Date("2026-09-17T00:00:00").getTimezoneOffset()).toBe(-480);
  });

  it("shows Monday to Friday for a Thursday, a Monday and a Sunday", () => {
    expect(workWeek("2026-09-17", [])).toEqual(MON_TO_FRI);
    expect(workWeek("2026-09-14", [])).toEqual(MON_TO_FRI);
    expect(workWeek("2026-09-20", [])).toEqual(MON_TO_FRI);
  });

  it("adds Saturday only when something is due that day", () => {
    expect(workWeek("2026-09-17", ["2026-09-19"])).toEqual([...MON_TO_FRI, "2026-09-19"]);
    expect(workWeek("2026-09-17", ["2026-09-18", null])).toEqual(MON_TO_FRI);
  });
});

describe("workFocusDay — the day the focus list opens on", () => {
  it("keeps a working today", () => {
    expect(workFocusDay("2026-09-17", [])).toBe("2026-09-17");
  });

  it("moves a public holiday to the next working day", () => {
    expect(workHoliday("2026-09-16")).toBe("Malaysia Day");
    expect(workFocusDay("2026-09-16", [])).toBe("2026-09-17");
  });

  it("moves Sunday to Monday, and Saturday to Monday unless work is due that Saturday", () => {
    expect(workFocusDay("2026-09-20", [])).toBe("2026-09-21");
    expect(workFocusDay("2026-09-19", [])).toBe("2026-09-21");
    expect(workFocusDay("2026-09-19", ["2026-09-19"])).toBe("2026-09-19");
  });
});

describe("workLayoutFor — panels follow the page width", () => {
  it("uses three panels from 1280px, collapses only the rail from 768px, else one stage", () => {
    expect(workLayoutFor(1280)).toBe("three");
    expect(workLayoutFor(1279)).toBe("two");
    expect(workLayoutFor(768)).toBe("two");
    expect(workLayoutFor(767)).toBe("one");
  });
});

describe("workRailDates — the Date section in a Kuala Lumpur browser", () => {
  const savedTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Asia/Kuala_Lumpur";
  });
  afterAll(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it("names Monday to Friday of the week, the holiday, today and the counts", () => {
    const rail = workRailDates([
      row({ id: "a", dueIso: "2026-09-16", timingBucket: "later" }),
      row({ id: "b", dueIso: "2026-09-10", timingBucket: "overdue" }),
      row({ id: "c", dueIso: null, timingBucket: "no_date" }),
    ], "2026-09-15", "2026-09-17");
    expect(rail.month).toBe("Sep 2026");
    expect(rail.previousWeek).toBe("2026-09-07");
    expect(rail.nextWeek).toBe("2026-09-21");
    expect(rail.missed).toBe(1);
    expect(rail.noDate).toBe(1);
    /* Two work weeks (owner review 2026-09-25 item 20); the second Monday is marked. */
    expect(rail.days.map((d) => [d.iso, d.label, d.dayNumber, d.weekday, d.holiday, d.count, d.today, d.weekStart])).toEqual([
      ["2026-09-14", "Mon, 14 Sep", "14", "MON", null, 0, false, false],
      ["2026-09-15", "Tue, 15 Sep", "15", "TUE", null, 0, true, false],
      ["2026-09-16", "Wed, 16 Sep", "16", "WED", "Malaysia Day", 1, false, false],
      ["2026-09-17", "Thu, 17 Sep", "17", "THU", null, 0, false, false],
      ["2026-09-18", "Fri, 18 Sep", "18", "FRI", null, 0, false, false],
      ["2026-09-21", "Mon, 21 Sep", "21", "MON", null, 0, false, true],
      ["2026-09-22", "Tue, 22 Sep", "22", "TUE", null, 0, false, false],
      ["2026-09-23", "Wed, 23 Sep", "23", "WED", null, 0, false, false],
      ["2026-09-24", "Thu, 24 Sep", "24", "THU", null, 0, false, false],
      ["2026-09-25", "Fri, 25 Sep", "25", "FRI", null, 0, false, false],
    ]);
  });

  it("a missed action is counted once, under Missed, never again on its past weekday", () => {
    const rail = workRailDates([row({ dueIso: "2026-09-14", timingBucket: "overdue" })], "2026-09-17", "2026-09-14");
    expect(rail.missed).toBe(1);
    expect(rail.days[0]!.count).toBe(0);
  });

  it("a week across two months takes the month of its Thursday; the year turns cleanly", () => {
    expect(workRailDates([], "2026-09-17", "2026-09-28").month).toBe("Oct 2026");
    const turn = workRailDates([], "2026-12-30", "2026-12-28");
    expect(turn.days.slice(0, 5).map((d) => d.iso)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
    expect(turn.days[5]!.iso).toBe("2027-01-04");
    expect(turn.days).toHaveLength(10);
    expect(turn.days[4]!.dayNumber).toBe("1");
    expect(turn.nextWeek).toBe("2027-01-04");
  });

  it("a week URL value normalises to its Monday; anything else is no week", () => {
    expect(parseWorkWeek("2026-09-17")).toBe("2026-09-14");
    expect(parseWorkWeek("next")).toBeNull();
    expect(parseWorkWeek(null)).toBeNull();
  });

  it("module counts cover every admitted module and add up to the rows", () => {
    const counts = workModuleCounts([row({ module: "delivery" }), row({ module: "delivery" }), row({ module: "payment" })]);
    expect(counts).toEqual({ orders: 0, purchasing: 0, receiving: 0, delivery: 2, payment: 1, issue_tracker: 0 });
  });
});
