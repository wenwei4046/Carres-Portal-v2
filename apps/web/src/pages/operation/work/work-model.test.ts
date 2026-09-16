import { describe, expect, it } from "vitest";
import type { OperationWorkItem } from "@carres/shared";
import type { WorkRow } from "../use-open-work";
import { filterWork, workSections } from "./work-model";

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
