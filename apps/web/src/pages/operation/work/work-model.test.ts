import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import { filterWork, workFocusDay, workHoliday, workLayoutFor, workSections, workWeek } from "./work-model";

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
  it("keeps promise failures in their lawful date group without a duplicate section", () => {
    const sections = workSections([
      row({ id: "no-date", timingBucket: "no_date", dueIso: null }),
      row({ id: "later", timingBucket: "later" }),
      row({ id: "broken", broken: true, timingBucket: "overdue", workingDaysLate: 2 }),
      row({ id: "late", timingBucket: "overdue", workingDaysLate: 1 }),
    ]);
    expect(sections.map((section) => section.label)).toEqual(["Missed", "Later", "No working date"]);
    expect(sections[0]?.items.map((item) => item.id)).toEqual(expect.arrayContaining(["broken", "late"]));
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

describe("workLayoutFor — panels follow the Work area width", () => {
  it("uses three panels from 1132px, two from 768px, else one", () => {
    expect(workLayoutFor(1132)).toBe("three");
    expect(workLayoutFor(1131)).toBe("two");
    expect(workLayoutFor(950)).toBe("two");
    expect(workLayoutFor(768)).toBe("two");
    expect(workLayoutFor(767)).toBe("one");
  });
});
