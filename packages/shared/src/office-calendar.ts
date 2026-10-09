/**
 * THE OFFICE CALENDAR — the one stored Office calendar every Office-based
 * deadline reads (Carres Settings List OFF-01 · OFF-02 · OFF-03 · OFF-04 ·
 * OFF-05, owner confirmed 9 Oct 2026): working weekdays, standard hours,
 * one-hour flexi, lunch, and the Office public holidays.
 *
 * Stored by Settings → Office (`office_calendar` + `office_holidays`, with a
 * change record). Consumers never keep their own weekday or holiday copy: the
 * Work feed, the payment collection clock's ACTION day, the Order Route and
 * the activity check read this shape through `officeWorkingDayOptions` /
 * `officeOwnerCalendar`. Delivery FACTS (and the payment-due fact) count on
 * the Delivery calendar (`delivery-working-calendar.ts`), never this one.
 *
 * Supplier workweeks, Warehouse site calendars and logistics company
 * schedules are separate calendars and are NOT this one.
 *
 * Holidays: until an authorised editor records the Office (Kuala Lumpur)
 * holidays for a YEAR, the built-in list (`my-holidays.ts`) stays in force for
 * that year and `recordedYears` / `holidaySource` say so — no Kuala Lumpur
 * date is invented, and recording 2026 never empties early 2027.
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
  /** The Office holidays in force: recorded years from Settings, the built-in list for every other year. */
  holidays: OfficeHoliday[];
  /** `office` = every year in force was recorded in Settings · `built_in` = no year was ·
   *  `mixed` = some years recorded, others still on the built-in list. */
  holidaySource: "office" | "built_in" | "mixed";
  /** The years whose holidays an editor recorded in Settings → Office. */
  recordedYears: number[];
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
  recordedYears: [],
}) as OfficeCalendar;

/** The years the built-in list covers (2026 and early 2027 today). */
export const BUILT_IN_HOLIDAY_YEARS: readonly number[] = [...new Set(BUILT_IN.map((h) => Number(h.date.slice(0, 4))))];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build the calendar from stored rows. A year with no recorded holidays keeps
 * the built-in list for that year (and says so); anything unreadable falls
 * back to the owner default for that field, never to a guess.
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
  const recordedYears = [...new Set(recorded.map((h) => Number(h.date.slice(0, 4))))].sort((a, b) => a - b);
  const kept = d.holidays.filter((h) => !recordedYears.includes(Number(h.date.slice(0, 4))));
  const inForce = [...recorded, ...kept].sort((a, b) => a.date.localeCompare(b.date));
  const builtInYearsLeft = BUILT_IN_HOLIDAY_YEARS.filter((y) => !recordedYears.includes(y));
  return {
    workDays: days.length > 0 ? [...new Set(days)].sort() : d.workDays,
    start: time(stored?.start_time, d.start),
    end: time(stored?.end_time, d.end),
    flexiMinutes: Number.isFinite(stored?.flexi_minutes) ? Number(stored!.flexi_minutes) : d.flexiMinutes,
    lunchStart: time(stored?.lunch_start, d.lunchStart),
    lunchEnd: time(stored?.lunch_end, d.lunchEnd),
    lunchShiftMinutes: Number.isFinite(stored?.lunch_shift_minutes) ? Number(stored!.lunch_shift_minutes) : d.lunchShiftMinutes,
    holidayRegion: (stored?.holiday_region ?? "").trim() || d.holidayRegion,
    holidays: inForce,
    holidaySource: recordedYears.length === 0 ? "built_in" : builtInYearsLeft.length === 0 ? "office" : "mixed",
    recordedYears,
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

/** The Office calendar as an action owner's calendar (collection clock):
 *  the Office weekdays AND the Office holidays, so a Kuala Lumpur-only
 *  holiday moves the Office ACTION day and never the Delivery FACT day. */
export function officeOwnerCalendar(cal: OfficeCalendar): OwnerCalendar {
  return Object.freeze({ offDays: officeOffDays(cal), holidays: new Set(cal.holidays.map((h) => h.date)) });
}

/**
 * THE RESPONSIBLE PERSON'S CALENDAR for an action day (owner correction
 * 9 Oct 2026): the person's own recorded working weekdays (People/HR,
 * `hr_employees.work_days`, 0678) combined with the Office holidays — the
 * module calendar of Operation's work. No week recorded ⇒ the Office working
 * weekdays.
 *
 * Sources (derived, not new law): workspace/MASTER.md "People/HR also owns
 * each employee's normal working-week eligibility … the Shared Duty Resolver
 * combines the person calendar with the module calendar for the resolved
 * actor"; ACTION-FLOW-STANDARD Law 2A (Operation counts on the Office
 * calendar); Settings List OFF-05 (Office holidays = Kuala Lumpur).
 *
 * It decides only WHEN staff act. It never reaches a payment FACT
 * (`dueIso` / `askIso`), which `collectionClock` counts on the Delivery
 * calendar alone.
 */
export function personOwnerCalendar(cal: OfficeCalendar, workDays?: readonly number[] | null): OwnerCalendar {
  const recorded = personWorkDaysOf(workDays);
  const offDays = recorded
    ? [0, 1, 2, 3, 4, 5, 6].filter((n) => !recorded.includes(n))
    : officeOffDays(cal);
  return Object.freeze({ offDays, holidays: new Set(cal.holidays.map((h) => h.date)) });
}

/** A recorded working week (a non-empty set of 0..6), or null = not recorded. */
export function personWorkDaysOf(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const days = [...new Set(raw.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort();
  return days.length > 0 ? days : null;
}

/** The name of an Office holiday on `iso`, or null. */
export function officeHolidayName(cal: OfficeCalendar, iso: IsoDate): string | null {
  return cal.holidays.find((h) => h.date === iso.slice(0, 10))?.name ?? null;
}
