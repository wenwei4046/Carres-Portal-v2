import { describe, expect, it } from "vitest";
import { DEFAULT_OFFICE_CALENDAR, officeCalendarOf, officeOffDays, officeWorkingDayOptions } from "./office-calendar";
import { addWorkingDays, isWorkingDay } from "./working-days";

describe("the Office calendar", () => {
  it("owner defaults: Monday to Friday, 9:00 to 18:00, lunch 13:00 to 14:00, built-in holidays", () => {
    const cal = officeCalendarOf(null, null);
    expect(cal.workDays).toEqual([1, 2, 3, 4, 5]);
    expect(officeOffDays(cal)).toEqual([0, 6]);
    expect([cal.start, cal.end, cal.lunchStart, cal.lunchEnd]).toEqual(["09:00", "18:00", "13:00", "14:00"]);
    expect(cal.holidaySource).toBe("built_in");
    expect(cal.recordedYears).toEqual([]);
    expect(cal.holidays).toEqual(DEFAULT_OFFICE_CALENDAR.holidays);
  });

  it("every built-in year recorded reads as the Office list", () => {
    const cal = officeCalendarOf(null, [
      { holiday_date: "2026-01-01", name: "New Year's Day" },
      { holiday_date: "2027-01-01", name: "New Year's Day" },
    ]);
    expect(cal.holidaySource).toBe("office");
    expect(cal.holidays.map((h) => h.date)).toEqual(["2026-01-01", "2027-01-01"]);
  });

  it("recorded Office holidays replace the built-in list for that year only, and say so", () => {
    const cal = officeCalendarOf({ work_days: [1, 2, 3, 4, 5] }, [{ holiday_date: "2026-02-02", name: "Federal Territory Day" }]);
    expect(cal.holidaySource).toBe("mixed");
    expect(cal.recordedYears).toEqual([2026]);
    // 2026 built-in dates are gone; early 2027 built-in dates stay in force.
    expect(cal.holidays.some((h) => h.date === "2026-12-25")).toBe(false);
    expect(cal.holidays.some((h) => h.date === "2027-01-01")).toBe(true);
    const opts = officeWorkingDayOptions(cal);
    expect(isWorkingDay("2026-02-02", opts)).toBe(false); // Monday holiday
    expect(isWorkingDay("2026-02-07", opts)).toBe(false); // Saturday
    expect(addWorkingDays("2026-01-30", 1, opts)).toBe("2026-02-03"); // Fri + 1 skips weekend + holiday
  });

  it("a stored working week is obeyed; unreadable values keep the owner default", () => {
    const cal = officeCalendarOf({ work_days: [1, 2, 3, 4, 5, 6], start_time: "nonsense", lunch_end: "14:30:00" }, []);
    expect(officeOffDays(cal)).toEqual([0]);
    expect(cal.start).toBe("09:00");
    expect(cal.lunchEnd).toBe("14:30");
  });
});
