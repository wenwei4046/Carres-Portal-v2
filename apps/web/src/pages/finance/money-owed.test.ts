import { describe, expect, it } from "vitest";
import {
  ageBucket,
  arAging,
  inAgeScope,
  malaysiaDay,
  orderAgeDays,
  outstandingTotal,
  rowsInAgeScope,
  type CustomerOwingRow,
} from "./money-owed";

/* The aging definition finance_ar_aging used (0062/0125): today − placing day,
   buckets 0-30 · 31-60 · 61-90 · 90+ with each upper edge inclusive, Overdue
   = older than 30 days. Here both days are Malaysia days. */

const TODAY = "2026-10-14";
// Midnight in Malaysia is 16:00 UTC the day before.
const mytMidnight = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return `${d.toISOString().slice(0, 10)}T16:00:00Z`;
};
const justBefore = (day: string) => mytMidnight(day).replace("16:00:00Z", "15:59:59Z");

const row = (placedAt: string | null, outstanding: number) => ({ placedAt, outstanding }) as unknown as CustomerOwingRow;

describe("A/R aging", () => {
  it("reads a timestamp as its Malaysia day", () => {
    expect(malaysiaDay("2026-09-13T16:00:00Z")).toBe("2026-09-14");
    expect(malaysiaDay("2026-09-13T15:59:59Z")).toBe("2026-09-13");
    expect(malaysiaDay("2026-09-13")).toBe("2026-09-13");
    expect(malaysiaDay(null)).toBeNull();
    expect(malaysiaDay("not a date")).toBeNull();
  });

  it.each([
    ["2026-09-14", 30, "0-30"],
    ["2026-09-13", 31, "31-60"],
    ["2026-08-15", 60, "31-60"],
    ["2026-08-14", 61, "61-90"],
    ["2026-07-16", 90, "61-90"],
    ["2026-07-15", 91, "90+"],
  ] as const)("placed %s (Malaysia) is %i days old → %s", (day, days, bucket) => {
    // Placed at the first second of that Malaysia day …
    expect(orderAgeDays(mytMidnight(day), TODAY)).toBe(days);
    // … and one second earlier is the day before: one day older.
    expect(orderAgeDays(justBefore(day), TODAY)).toBe(days + 1);
    expect(ageBucket(days)).toBe(bucket);
  });

  it("Overdue is older than 30 days: 30 is not overdue, 31 is", () => {
    expect(inAgeScope(30, "over-30")).toBe(false);
    expect(inAgeScope(31, "over-30")).toBe(true);
    expect(inAgeScope(91, "over-30")).toBe(true);
  });

  it("an order placed today, or dated after today, is 0 days old", () => {
    expect(orderAgeDays(mytMidnight(TODAY), TODAY)).toBe(0);
    expect(orderAgeDays("2026-10-20T02:00:00Z", TODAY)).toBe(0);
  });

  it("the buckets add up to Outstanding, and Overdue is the three older buckets", () => {
    const rows = [
      row(mytMidnight("2026-09-14"), 100), // 30 days
      row(justBefore("2026-09-14"), 200), // 31 days
      row(mytMidnight("2026-08-14"), 300), // 61 days
      row(mytMidnight("2026-07-15"), 400.5), // 91 days
    ];
    const aging = arAging(rows, TODAY)!;
    expect(aging.buckets).toEqual({
      "0-30": { orders: 1, total: 100 },
      "31-60": { orders: 1, total: 200 },
      "61-90": { orders: 1, total: 300 },
      "90+": { orders: 1, total: 400.5 },
    });
    expect(aging.overdue).toEqual({ orders: 3, total: 900.5 });
    const sum = Object.values(aging.buckets).reduce((s, b) => s + b.total, 0);
    expect(sum).toBe(outstandingTotal(rows).total);
    expect(rowsInAgeScope(rows, "over-30", TODAY)).toHaveLength(3);
  });

  it("an order with no placing date makes the aging unreadable, never 0-30", () => {
    expect(orderAgeDays(null, TODAY)).toBeNull();
    expect(arAging([row(mytMidnight("2026-10-01"), 50), row(null, 70)], TODAY)).toBeNull();
    expect(rowsInAgeScope([row(null, 70)], "0-30", TODAY)).toEqual([]);
  });
});
