/**
 * THE OFFICE CALENDAR — the one stored Office calendar every Office-based
 * deadline reads (Carres Settings List OFF-01 · OFF-02 · OFF-03 · OFF-04 ·
 * OFF-05, owner confirmed 9 Oct 2026): working weekdays, standard hours,
 * one-hour flexi, lunch, and the Office public holidays.
 *
 * Stored by Settings → Office (`office_calendar` + `office_holidays`, with a
 * change record). Consumers never keep their own weekday or holiday copy: the
 * Work feed, the payment collection clock, the Order Route and the activity
 * check read this shape through `officeWorkingDayOptions` /
 * `officeOwnerCalendar`.
 *
 * Supplier workweeks, Warehouse site calendars and logistics company
 * schedules are separate calendars and are NOT this one.
 *
 * Holidays: until an authorised editor records the Office (Kuala Lumpur)
 * holidays for a year, the built-in list (`my-holidays.ts`) stays in force
 * and `holidaySource` says so — no Kuala Lumpur date is invented.
 */
import { MY_HOLIDAYS_2026, MY_HOLIDAYS_2027_EARLY } from "./my-holidays";
import type { OwnerCalendar } from "./collection-clock";
import type { IsoDate, WorkingDayOptions } from "./working-days";

export interface OfficeHoliday {
  date: IsoDate;
  name: string;
}

export interface OfficeCalendar {
  /** Working weekdays, 0=Sun … 6=Sat. Owner default Monday–Friday. */
  workDays: number[];
  /** Standard office hours, "HH:MM" (owner default 09:00–18:00). */
  start: string;
  end: string;
  /** Owner-approved flexi allowance in minutes (default 60). */
  flexiMinutes: number;
  /** Default lunch, "HH:MM" (13:00–14:00), and how far it may shift (60). */
  lunchStart: string;
  lunchEnd: string;
  lunchShiftMinutes: number;
  /** The calendar's holiday region word (owner default `Kuala Lumpur`). */
  holidayRegion: string;
  /** The Office holidays in force. */
  holidays: OfficeHoliday[];
  /** `office` = recorded in Settings · `built_in` = the built-in list is still in use. */
  holidaySource: "office" | "built_in";
}

const BUILT_IN: OfficeHoliday[] = [...MY_HOLIDAYS_2026, ...MY_HOLIDAYS_2027_EARLY].map((h) => ({
  date: h.date,
  name: h.name,
}));

/** The owner-confirmed defaults (9 Oct 2026), with the built-in holiday list. */
export const DEFAULT_OFFICE_CALENDAR: OfficeCalendar = Object.freeze({
  workDays: [1, 2, 3, 4, 5],
  start: "09:00",
  end: "18:00",
  flexiMinutes: 60,
  lunchStart: "13:00",
  lunchEnd: "14:00",
  lunchShiftMinutes: 60,
  holidayRegion: "Kuala Lumpur",
  holidays: BUILT_IN,
  holidaySource: "built_in",
}) as OfficeCalendar;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build the calendar from stored rows. A stored holiday list that is empty
 * keeps the built-in list (and says so); anything unreadable falls back to the
 * owner default for that field, never to a guess.
 */
export function officeCalendarOf(
  stored: Partial<{
    work_days: number[] | null;
    start_time: string | null;
    end_time: string | null;
    flexi_minutes: number | null;
    lunch_start: string | null;
    lunch_end: string | null;
    lunch_shift_minutes: number | null;
    holiday_region: string | null;
  }> | null,
  holidays: ReadonlyArray<{ holiday_date: string; name: string | null }> | null,
): OfficeCalendar {
  const d = DEFAULT_OFFICE_CALENDAR;
  const time = (v: string | null | undefined, fallback: string) => {
    const t = (v ?? "").slice(0, 5);
    return HHMM.test(t) ? t : fallback;
  };
  const days = (stored?.work_days ?? []).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  const recorded = (holidays ?? [])
    .filter((h) => ISO.test(String(h.holiday_date).slice(0, 10)))
    .map((h) => ({ date: String(h.holiday_date).slice(0, 10), name: (h.name ?? "").trim() || "Public holiday" }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    workDays: days.length > 0 ? [...new Set(days)].sort() : d.workDays,
    start: time(stored?.start_time, d.start),
    end: time(stored?.end_time, d.end),
    flexiMinutes: Number.isFinite(stored?.flexi_minutes) ? Number(stored!.flexi_minutes) : d.flexiMinutes,
    lunchStart: time(stored?.lunch_start, d.lunchStart),
    lunchEnd: time(stored?.lunch_end, d.lunchEnd),
    lunchShiftMinutes: Number.isFinite(stored?.lunch_shift_minutes) ? Number(stored!.lunch_shift_minutes) : d.lunchShiftMinutes,
    holidayRegion: (stored?.holiday_region ?? "").trim() || d.holidayRegion,
    holidays: recorded.length > 0 ? recorded : d.holidays,
    holidaySource: recorded.length > 0 ? "office" : "built_in",
  };
}

/** The non-working weekdays of this calendar (0=Sun … 6=Sat). */
export function officeOffDays(cal: OfficeCalendar): number[] {
  return [0, 1, 2, 3, 4, 5, 6].filter((n) => !cal.workDays.includes(n));
}

/** The working-day options every Office-based deadline passes to the engine. */
export function officeWorkingDayOptions(cal: OfficeCalendar): WorkingDayOptions {
  return { offDays: officeOffDays(cal), holidays: new Set(cal.holidays.map((h) => h.date)) };
}

/** The Office calendar as an action owner's calendar (collection clock). */
export function officeOwnerCalendar(cal: OfficeCalendar): OwnerCalendar {
  return Object.freeze({ offDays: officeOffDays(cal) });
}

/** The name of an Office holiday on `iso`, or null. */
export function officeHolidayName(cal: OfficeCalendar, iso: IsoDate): string | null {
  return cal.holidays.find((h) => h.date === iso.slice(0, 10))?.name ?? null;
}
