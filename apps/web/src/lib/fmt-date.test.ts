import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appTodayIso, fmtDate, fmtDateShort, fmtMonth } from "./fmt-date";

/* THE YEAR RULE is relative to "now", so every expectation here pins the clock.
   Without the pin these assertions would silently change meaning on 1 January
   and the suite would start failing on a day nobody deployed anything. The
   pinned instant is 2026-08-15 09:00 MYT, the day of the owner ruling. */
const RULING_DAY = new Date("2026-08-15T01:00:00Z");

describe("Carres date formatting", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(RULING_DAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("the year rule — owner ruling 2026-08-15", () => {
    it("drops the year for a date in the current year", () => {
      expect(fmtDate("2026-08-12")).toBe("Wed, 12 Aug");
      expect(fmtDateShort("2026-08-12")).toBe("12 Aug");
    });

    it("keeps the year for a date that is NOT in the current year", () => {
      expect(fmtDate("2027-01-15")).toBe("Fri, 15 Jan 27");
      expect(fmtDateShort("2027-01-15")).toBe("15 Jan 27");
      expect(fmtDate("2025-12-31")).toBe("Wed, 31 Dec 25");
    });

    it("keeps the weekday on every date, in both years", () => {
      // The no-relative-date-words ruling makes the weekday the thing an
      // operator reads the day off. Dropping the year never drops the day.
      expect(fmtDate("2026-08-12").startsWith("Wed, ")).toBe(true);
      expect(fmtDate("2027-01-15").startsWith("Fri, ")).toBe(true);
    });

    it("moves both spellings on the SAME predicate", () => {
      // fmtDate and fmtDateShort differ by the weekday and by nothing else.
      // A drift here is the rule fragmenting into two rules.
      for (const iso of ["2026-01-01", "2026-12-31", "2027-01-01", "2025-12-31"]) {
        const long = fmtDate(iso);
        const short = fmtDateShort(iso);
        expect(long.endsWith(short)).toBe(true);
      }
    });

    it("compares years in Kuala Lumpur time, not the runner's", () => {
      // 2026-12-31 16:05 UTC is already 2027-01-01 00:05 in MYT. An operator
      // in Malaysia has entered the new year; a UTC runner has not. The
      // business timezone decides, so 2027 dates are "this year" from here.
      vi.setSystemTime(new Date("2026-12-31T16:05:00Z"));
      expect(fmtDate("2027-03-04")).toBe("Thu, 4 Mar");
      expect(fmtDate("2026-03-04")).toBe("Wed, 4 Mar 26");
    });
  });

  describe("a printed document keeps its year", () => {
    it("prints the year on demand even in the current year", () => {
      expect(fmtDate("2026-08-12", { year: "always" })).toBe("Wed, 12 Aug 26");
      expect(fmtDate("2027-01-15", { year: "always" })).toBe("Fri, 15 Jan 27");
    });

    it("carries the time as well", () => {
      expect(fmtDate("2026-04-16T03:00:00Z", { time: true, year: "always" })).toBe(
        "Thu, 16 Apr 26 11:00",
      );
    });
  });

  it("renders timestamps in Kuala Lumpur time regardless of the runner timezone", () => {
    expect(fmtDate("2026-04-16T03:00:00Z", { time: true })).toBe("Thu, 16 Apr 11:00");
    expect(fmtDateShort("2026-04-16T17:00:00Z")).toBe("17 Apr");
  });

  it("keeps a bare business date on the written calendar day", () => {
    expect(fmtDate("2026-04-16")).toBe("Thu, 16 Apr");
    expect(fmtDateShort("2026-04-16")).toBe("16 Apr");
  });

  it("keeps the empty and invalid fallbacks", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
    expect(fmtDateShort(null)).toBe("—");
    expect(fmtDateShort("not-a-date")).toBe("—");
  });

  it("still spells a MONTH with its full year — a period is not a day", () => {
    // fmtMonth names a month in a switcher, where two adjacent entries may sit
    // either side of a year boundary. The year rule is about a DAY on a row.
    expect(fmtMonth("2026-07")).toBe("Jul 2026");
  });

  it("has no second no-year formatter left in the module", async () => {
    // `fmtDayChip` was deleted by the ruling: the year rule made it identical
    // to `fmtDate` except on the one input where it would have been wrong.
    const mod = await import("./fmt-date");
    // appYearNow / appTodayIso are the business-timezone clock, not a spelling.
    expect(Object.keys(mod).sort()).toEqual([
      "appTodayIso", "appYearNow", "fmtDate", "fmtDateShort", "fmtMonth",
    ]);
  });
});

describe("appTodayIso — today in the business timezone", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("names the Malaysian day, not the UTC one, in the small hours", () => {
    // 23:30 UTC on 14 Aug is already 07:30 on 15 Aug in Kuala Lumpur.
    vi.setSystemTime(new Date("2026-08-14T23:30:00Z"));
    expect(appTodayIso()).toBe("2026-08-15");
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-08-14"); // the wrong spelling
  });

  it("agrees with UTC in the afternoon", () => {
    vi.setSystemTime(new Date("2026-08-15T06:00:00Z"));
    expect(appTodayIso()).toBe("2026-08-15");
  });
});
