import { OFFICE_OFF_DAYS } from "./order-action-due";
import { countWorkingDays, type IsoDate, type WorkingDayOptions } from "./working-days";

/**
 * ── `PO Safety Days` — ONE ENGINE, EVERY PURCHASING LISTING ────────────────
 *
 * `docs/COPY-STANDARD.md` → Purchasing UI dictionary (owner ruling
 * 2026-09-18): *the working-day margin remaining if the outstanding demand
 * were ordered today, after supplier production and transit, relative to the
 * applicable required date.*
 *
 * ⛔ FOUR THINGS IT IS NOT, and the dictionary names every one of them because
 * each has been shipped somewhere as though it were this number:
 *
 *   · NOT the Order By date. That is a DAY; this is a COUNT of days, and a
 *     column that prints one under the other's heading is the whole defect.
 *   · NOT always 14. The Sales Order lane keeps its governed 14-working-day
 *     planning reserve; Manual Purchase measures against its own required
 *     arrival date and adds no reserve at all.
 *   · NOT days since the request was created.
 *   · NOT ZERO WHEN IT IS UNKNOWN. Missing production days, missing transit
 *     days, no required date, or coverage nobody could read all mean the
 *     margin CANNOT BE COMPUTED — and `0` means *order today or you are late*,
 *     which is a specific and alarming claim to make on no evidence.
 *
 * The margin is derived from the Order By the planning engine already walked
 * back through supplier production and transit. Recomputing the walk here
 * would be the second arithmetic Law D forbids; this counts working days
 * between today and that date and nothing else.
 *
 * ⚠️ IT COUNTS ON THE OFFICE CALENDAR (Mon–Fri), NOT THE DEFAULT ONE.
 * `working-days.ts` defaults to Sunday off, which is the WAREHOUSE's week
 * (`docs/ACTION-FLOW-STANDARD.md` Law 2A — three calendars, and this file does
 * not define them). The margin answers *how many days does a BUYER have left
 * to raise this purchase order*, and a buyer does not work Saturdays. Taking
 * the default would have paid the operator a day of margin that nobody is in
 * the office to spend. A caller may still pass office holidays.
 */
const OFFICE = { offDays: OFFICE_OFF_DAYS } as const;

export interface PoSafetyDays {
  /** Working days from today to Order By. Negative = the date has passed. */
  days: number | null;
  /** `true` once Order By is behind us — the margin is spent, not merely 0. */
  passed: boolean;
}

/** Nothing to buy, so no margin is owed — a blank, not a zero. */
export const PO_SAFETY_DAYS_NONE: PoSafetyDays = { days: null, passed: false };

/**
 * The margin for ONE line.
 *
 * `orderBy` null means the engine could not plan the line (missing Supplier ×
 * Category production days, missing transit days, or no required date). That
 * is UNKNOWN and it stays unknown all the way to the cell.
 */
export function poSafetyDaysOf(
  todayIso: IsoDate,
  orderBy: string | null,
  opts: WorkingDayOptions = {},
): PoSafetyDays {
  if (!orderBy) return PO_SAFETY_DAYS_NONE;
  const today = todayIso.slice(0, 10);
  const by = orderBy.slice(0, 10);
  const calendar: WorkingDayOptions = { ...OFFICE, ...opts };
  if (by < today) {
    /* PAST THE DATE. The count is how many working days LATE, carried
       negative so a sort puts the worst first without a second field. */
    return { days: -countWorkingDays(by, today, calendar), passed: true };
  }
  return { days: countWorkingDays(today, by, calendar), passed: false };
}

/**
 * ⭐ THE PARENT SHOWS THE TIGHTEST OUTSTANDING LINE (dictionary, 2026-09-18) —
 * and `none remaining is blank`.
 *
 * "Tightest" is the SMALLEST margin, which on a request with one late line and
 * one comfortable line is the late one. A line the engine could not plan
 * contributes no number; it does not contribute a zero, and it does not make
 * the whole request unknown either — the request's other lines still have real
 * margins a buyer can act on.
 *
 * An EMPTY list (nothing outstanding) is blank: a request with nothing left to
 * buy is not late and is not early, it is finished.
 */
export function tightestPoSafetyDays(
  todayIso: IsoDate,
  outstandingOrderBys: readonly (string | null)[],
  opts: WorkingDayOptions = {},
): PoSafetyDays {
  const margins = outstandingOrderBys
    .map((by) => poSafetyDaysOf(todayIso, by, opts))
    .filter((m): m is { days: number; passed: boolean } => m.days != null);
  if (margins.length === 0) return PO_SAFETY_DAYS_NONE;
  return margins.reduce((worst, m) => (m.days < worst.days ? m : worst));
}

/**
 * THE CELL'S WORDS. A number is a number; an unknown margin says so, in the
 * governed absence the rest of the portal uses for a fact nobody recorded.
 */
export function poSafetyDaysWord(m: PoSafetyDays): string | null {
  return m.days == null ? null : String(m.days);
}
