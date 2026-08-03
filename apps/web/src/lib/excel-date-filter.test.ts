import { describe, it, expect } from "vitest";
import {
  F_NONE,
  F_TODAY,
  F_YESTERDAY,
  F_THIS_WEEK,
  F_LAST_WEEK,
  F_THIS_MONTH,
  F_LAST_MONTH,
  dateFilterMatches,
  datePresetOptions,
  monthLabel,
  rangeValue,
  weekStartIso,
} from "./excel-date-filter";

/**
 * The Excel date ▼ (Jess, 2026-08-02 — frozen on the Purchase Orders
 * Register): presets · month buckets · Custom Date Range. Fixture today =
 * 2026-07-30, a Thursday — this week is Mon Jul 27 → Sun Aug 2.
 */
const TODAY = "2026-07-30";

describe("dateFilterMatches — the presets", () => {
  it("Today / Yesterday are exact days", () => {
    expect(dateFilterMatches("2026-07-30", F_TODAY, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-07-29", F_TODAY, TODAY)).toBe(false);
    expect(dateFilterMatches("2026-07-29", F_YESTERDAY, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-07-30", F_YESTERDAY, TODAY)).toBe(false);
  });

  it("This Week runs Monday to Sunday; Last Week is the seven days before", () => {
    expect(weekStartIso(TODAY)).toBe("2026-07-27");
    expect(dateFilterMatches("2026-07-27", F_THIS_WEEK, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-08-02", F_THIS_WEEK, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-08-03", F_THIS_WEEK, TODAY)).toBe(false);
    expect(dateFilterMatches("2026-07-26", F_THIS_WEEK, TODAY)).toBe(false);
    expect(dateFilterMatches("2026-07-26", F_LAST_WEEK, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-07-20", F_LAST_WEEK, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-07-19", F_LAST_WEEK, TODAY)).toBe(false);
  });

  it("This Month / Last Month bucket by calendar month, across a year edge", () => {
    expect(dateFilterMatches("2026-07-01", F_THIS_MONTH, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-06-30", F_THIS_MONTH, TODAY)).toBe(false);
    expect(dateFilterMatches("2026-06-15", F_LAST_MONTH, TODAY)).toBe(true);
    // January's "Last Month" is December of the PREVIOUS year.
    expect(dateFilterMatches("2025-12-31", F_LAST_MONTH, "2026-01-05")).toBe(true);
  });

  it("a null date matches only the — option", () => {
    expect(dateFilterMatches(null, F_NONE, TODAY)).toBe(true);
    expect(dateFilterMatches(null, F_TODAY, TODAY)).toBe(false);
    expect(dateFilterMatches("2026-07-30", F_NONE, TODAY)).toBe(false);
  });
});

describe("dateFilterMatches — month buckets and Custom Date Range", () => {
  it("m:YYYY-MM matches its month only", () => {
    expect(dateFilterMatches("2026-08-09", "m:2026-08", TODAY)).toBe(true);
    expect(dateFilterMatches("2026-09-01", "m:2026-08", TODAY)).toBe(false);
  });

  it("r:from:to is inclusive on both ends", () => {
    const r = rangeValue("2026-08-01", "2026-08-15");
    expect(r).toBe("r:2026-08-01:2026-08-15");
    expect(dateFilterMatches("2026-08-01", r, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-08-15", r, TODAY)).toBe(true);
    expect(dateFilterMatches("2026-07-31", r, TODAY)).toBe(false);
    expect(dateFilterMatches("2026-08-16", r, TODAY)).toBe(false);
  });

  it("an exact ISO day still matches itself", () => {
    expect(dateFilterMatches("2026-08-09", "2026-08-09", TODAY)).toBe(true);
    expect(dateFilterMatches("2026-08-10", "2026-08-09", TODAY)).toBe(false);
  });
});

describe("the menu itself", () => {
  it("offers Jess's six presets in Excel's order", () => {
    expect(datePresetOptions().map((o) => o.label)).toEqual([
      "Today",
      "Yesterday",
      "This Week",
      "Last Week",
      "This Month",
      "Last Month",
    ]);
  });

  it("monthLabel speaks short month + year", () => {
    expect(monthLabel("2026-08")).toBe("Aug 2026");
    expect(monthLabel("2025-12")).toBe("Dec 2025");
  });
});
