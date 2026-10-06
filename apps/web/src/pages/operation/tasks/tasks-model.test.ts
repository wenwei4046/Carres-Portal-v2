import { describe, expect, it } from "vitest";
import type { WorkRow } from "../use-open-work";
import { partiesWord, previewLine, taskList, taskRowWords } from "./tasks-model";

const TODAY = "2026-10-05"; // a Monday
const row = (over: Partial<WorkRow> & { id: string }): WorkRow => ({
  module: "delivery",
  ruleKey: "confirm_delivery_date",
  dueIso: TODAY,
  timingBucket: "today",
  line: "Call AL",
  problem: "Get the scheduled delivery date",
  ownerId: "me",
  ownerState: "primary",
  normalOwner: null,
  source: { object: { kind: "delivery_scope", id: "o1", label: "SO-1368" } },
  ...over,
} as unknown as WorkRow);

describe("tasks list arithmetic", () => {
  const rows = [
    row({ id: "a", dueIso: "2026-09-01", timingBucket: "overdue", module: "purchasing" }),
    row({ id: "b" }),
    row({ id: "c", dueIso: "2026-10-06", timingBucket: "later", module: "receiving" }),
    row({ id: "d", dueIso: "2026-10-10", timingBucket: "later" }),
    row({ id: "e", dueIso: null, timingBucket: "no_date" }),
    row({ id: "f", dueIso: "2026-10-20", timingBucket: "later" }), // next week: not counted this week
  ];

  it("Missed first, each day counts only that day, Saturday always drawn, No date apart", () => {
    const list = taskList(rows, TODAY, TODAY, null);
    expect(list.missed.map((r) => r.id)).toEqual(["a"]);
    expect(list.days.map((d) => d.weekday)).toEqual(["MON", "TUE", "WED", "THU", "FRI", "SAT"]);
    expect(list.days.map((d) => d.rows.length)).toEqual([1, 1, 0, 0, 0, 1]);
    expect(list.days[0]!.today).toBe(true);
    expect(list.noDate.map((r) => r.id)).toEqual(["e"]);
  });

  it("the Module filter's counts add up exactly to the list, before the choice", () => {
    const all = taskList(rows, TODAY, TODAY, null);
    expect(all.total).toBe(5);
    expect(Object.values(all.moduleCounts).reduce((s, n) => s + n, 0)).toBe(all.total);
    const delivery = taskList(rows, TODAY, TODAY, "delivery");
    expect(delivery.moduleCounts).toEqual(all.moduleCounts); // the choice never changes a count
    expect(delivery.missed).toHaveLength(0);
    expect(delivery.days[1]!.rows).toHaveLength(0);
  });

  it("row words: the act on line 1, the document and what is owed on line 2", () => {
    expect(taskRowWords(row({ id: "x" }))).toMatchObject({ act: "Call AL", detail: "SO-1368 · Get the scheduled delivery date", missedDate: null, noDate: null });
    expect(taskRowWords(row({ id: "y", dueIso: null, timingBucket: "no_date" })).noDate).toBe("No date · set by Delivery");
    expect(taskRowWords(row({ id: "z", dueIso: "2026-10-02", timingBucket: "overdue" })).missedDate).toBe("Fri, 2 Oct");
  });

  it("names the parties and fits the closed preview", () => {
    expect(partiesWord(["Ohana"])).toBe("Ohana");
    expect(partiesWord(["Ohana", "Nice Future", "Ohana"])).toBe("Ohana and Nice Future");
    expect(partiesWord(["A", "B", "C"])).toBe("A and 2 more");
    expect(previewLine(["Receive goods from Ohana", "Call AL"])).toBe("Receive goods from Ohana · Call AL");
    expect(previewLine(["Send 2 POs to Nice Future", "Send 14 POs to Nice Future", "x", "y"])).toBe("Send 2 POs to Nice Future · +3");
  });
});
