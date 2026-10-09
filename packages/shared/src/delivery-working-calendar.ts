/**
 * THE DELIVERY CALENDAR — the ONE working calendar every Delivery date counts
 * on (ACTION-FLOW-STANDARD Law 2A; owner order 9 Oct 2026: "the Delivery date
 * calculations must connect to their own effective calendar").
 *
 *   Working days  Monday–Saturday. Sunday is closed. Saturday runs at reduced
 *                 capacity — a capacity fact, never a non-working day.
 *   Holidays      the Selangor public-holiday calendar Warehouse Settings
 *                 already stores for the DISPATCHING Site (Carres Klang,
 *                 Selangor): its saved policy names the country/state
 *                 (`warehouse_holiday_policies`), the ACTIVE imported calendar
 *                 for that state (`warehouse_holiday_calendars`) holds the
 *                 dates (`warehouse_holiday_dates`). Replacement (observed)
 *                 days are public holidays too and count.
 *
 * ⭐ EXPLICIT FALLBACK. A year with no imported date keeps the BUILT-IN
 * Selangor + national list (`my-holidays.ts`) for that year, and
 * `holidaySource` / `recordedYears` say so. Nothing is invented; importing
 * 2026 never empties early 2027. Production has no calendar imported today,
 * so the built-in list is what runs there until one is.
 *
 * It is NOT the Office calendar. The Office holidays (Kuala Lumpur, Settings →
 * Office) move Office ACTIONS only — when Operation acts on a fact — never a
 * Delivery FACT. There is no second holiday editor: the dates are edited in
 * Settings → Warehouse → Public Holidays, and this module only reads them.
 *
 * Everything Delivery dates — `Assign logistics by`, the Logistics card's
 * three checks, the contact / deliver / photo deadlines, the delivery-day
 * refusal, the payment-due FACT — passes `deliveryWorkingDayOptions(cal)` to
 * the one engine (`working-days.ts`).
 *
 * PURE — no I/O, no clock.
 */
import { z } from "zod";
import { MY_HOLIDAYS_2026, MY_HOLIDAYS_2027_EARLY } from "./my-holidays";
import type { IsoDate, WorkingDayOptions } from "./working-days";

/** Monday–Saturday (0=Sun … 6=Sat). */
export const DELIVERY_WORK_DAYS: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6]);
/** Sunday is the Delivery week's one closed weekday. */
export const DELIVERY_OFF_DAYS: readonly number[] = Object.freeze([0]);
/** The governed holiday observance: the dispatching Warehouse is in Selangor. */
export const DELIVERY_HOLIDAY_REGION = "Selangor";

export interface DeliveryHoliday {
  date: IsoDate;
  name: string;
}

export interface DeliveryCalendar {
  /** Non-working weekdays — Sunday. */
  offDays: readonly number[];
  /** The state whose public holidays count (the dispatching Site's policy state, else Selangor). */
  region: string;
  /** The holidays in force: imported years from Warehouse Settings, the built-in list for every other year. */
  holidays: DeliveryHoliday[];
  /** `warehouse` = every year in force was imported · `built_in` = none was · `mixed` = some were. */
  holidaySource: "warehouse" | "built_in" | "mixed";
  /** The years whose dates came from the imported Warehouse calendar. */
  recordedYears: number[];
}

const BUILT_IN: DeliveryHoliday[] = [...MY_HOLIDAYS_2026, ...MY_HOLIDAYS_2027_EARLY].map((h) => ({
  date: h.date,
  name: h.name,
}));
const BUILT_IN_YEARS: readonly number[] = [...new Set(BUILT_IN.map((h) => Number(h.date.slice(0, 4))))];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** No imported calendar: Monday–Saturday with the built-in Selangor + national list. */
export const DEFAULT_DELIVERY_CALENDAR: DeliveryCalendar = Object.freeze({
  offDays: DELIVERY_OFF_DAYS,
  region: DELIVERY_HOLIDAY_REGION,
  holidays: BUILT_IN,
  holidaySource: "built_in",
  recordedYears: [],
}) as DeliveryCalendar;

/**
 * Build the calendar from the imported dates of the dispatching Site's active
 * calendar. A year with no imported date keeps the built-in list for that
 * year — the explicit fallback above.
 */
export function deliveryCalendarOf(input: {
  region?: string | null;
  dates?: ReadonlyArray<{ onDate?: string | null; date?: string | null; name?: string | null }> | null;
} | null = null): DeliveryCalendar {
  const recorded = (input?.dates ?? [])
    .map((d) => ({ date: String(d.onDate ?? d.date ?? "").slice(0, 10), name: (d.name ?? "").trim() || "Public holiday" }))
    .filter((d) => ISO.test(d.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  // One row per date: a calendar may list two names on one day.
  const seen = new Set<string>();
  const unique = recorded.filter((d) => (seen.has(d.date) ? false : (seen.add(d.date), true)));
  const recordedYears = [...new Set(unique.map((h) => Number(h.date.slice(0, 4))))].sort((a, b) => a - b);
  const kept = BUILT_IN.filter((h) => !recordedYears.includes(Number(h.date.slice(0, 4))));
  const builtInYearsLeft = BUILT_IN_YEARS.filter((y) => !recordedYears.includes(y));
  return {
    offDays: DELIVERY_OFF_DAYS,
    region: (input?.region ?? "").trim() || DELIVERY_HOLIDAY_REGION,
    holidays: [...unique, ...kept].sort((a, b) => a.date.localeCompare(b.date)),
    holidaySource: recordedYears.length === 0 ? "built_in" : builtInYearsLeft.length === 0 ? "warehouse" : "mixed",
    recordedYears,
  };
}

/**
 * Which imported calendar is the Delivery one: the ACTIVE calendar for the
 * dispatching Site's saved policy country/state, else the active calendar for
 * Selangor. A calendar for another state (or a national-only one) is never
 * borrowed — it would drop the Selangor dates. Null ⇒ the built-in list.
 */
export function pickDeliveryHolidayCalendar<T extends { id: string; country: string | null; state: string | null; active: boolean }>(
  calendars: readonly T[],
  policy: { country: string | null; state: string | null } | null,
): T | null {
  const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
  const state = norm(policy?.state) || norm(DELIVERY_HOLIDAY_REGION);
  const country = norm(policy?.country);
  return (
    calendars.find((c) => c.active && norm(c.state) === state && (!country || norm(c.country) === country)) ?? null
  );
}

/** The working-day options every Delivery date passes to the engine. */
export function deliveryWorkingDayOptions(cal: DeliveryCalendar = DEFAULT_DELIVERY_CALENDAR): WorkingDayOptions {
  return { offDays: cal.offDays, holidays: deliveryHolidaySet(cal) };
}

/** The Delivery holidays as the engine's set. */
export function deliveryHolidaySet(cal: DeliveryCalendar = DEFAULT_DELIVERY_CALENDAR): Set<IsoDate> {
  return new Set(cal.holidays.map((h) => h.date));
}

/** The name of a Delivery holiday on `iso`, or null. */
export function deliveryHolidayName(cal: DeliveryCalendar, iso: IsoDate): string | null {
  return cal.holidays.find((h) => h.date === iso.slice(0, 10))?.name ?? null;
}

/** Why a day is not a delivery day: Sunday, a public holiday, or null (it is one). */
export type DeliveryDayRefusal = "sunday" | "holiday" | null;

export function deliveryDayRefusal(
  cal: DeliveryCalendar | ReadonlySet<IsoDate> | readonly IsoDate[],
  iso: IsoDate,
): DeliveryDayRefusal {
  const day = iso.slice(0, 10);
  if (!ISO.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  if (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() === 0) return "sunday";
  const set: ReadonlySet<IsoDate> =
    cal instanceof Set ? cal : Array.isArray(cal) ? new Set(cal as readonly IsoDate[]) : deliveryHolidaySet(cal as DeliveryCalendar);
  return set.has(day) ? "holiday" : null;
}

/** The wire shape (`GET /api/operation/delivery-settings/calendar`). */
export const deliveryCalendarResponseSchema = z.object({
  region: z.string(),
  holidays: z.array(z.object({ date: z.string(), name: z.string() })),
  holidaySource: z.enum(["warehouse", "built_in", "mixed"]),
  recordedYears: z.array(z.number()),
  /** False when Warehouse Settings could not be read — the built-in list answers. */
  stored: z.boolean(),
});
export type DeliveryCalendarResponse = z.infer<typeof deliveryCalendarResponseSchema>;

/** The response back into the calendar, failing safe to the default. */
export function deliveryCalendarFromResponse(r: Partial<DeliveryCalendarResponse> | null | undefined): DeliveryCalendar {
  if (!r || !Array.isArray(r.holidays)) return DEFAULT_DELIVERY_CALENDAR;
  return {
    offDays: DELIVERY_OFF_DAYS,
    region: r.region || DELIVERY_HOLIDAY_REGION,
    holidays: r.holidays.filter((h) => ISO.test(String(h.date).slice(0, 10))).map((h) => ({ date: h.date.slice(0, 10), name: h.name })),
    holidaySource: r.holidaySource ?? "built_in",
    recordedYears: r.recordedYears ?? [],
  };
}
