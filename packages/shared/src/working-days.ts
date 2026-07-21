/**
 * Working-day date engine — Carres procurement (2026-07-21).
 *
 * Every supplier lead time is counted in WORKING DAYS, not calendar days.
 * Carres factories + delivery run **Mon–Sat** (Sunday off, Jess D1=6-day week)
 * and pause on **Malaysia public holidays** (Selangor + national, Jess D2). A
 * "14-working-day" sofa lead is ~20 calendar days once weekends + holidays are
 * skipped — getting this right is the difference between promising a delivery
 * date the factory can actually hit and one it can't.
 *
 * This module is the SINGLE place that math lives. The MRP "raise-by" date
 * (= customer deadline − lead) and every ETA countdown call it.
 *
 * PURE + no I/O. The holiday set is INJECTED, never hardcoded here, so the
 * calendar stays editable data (a config the operator maintains — see
 * `my-holidays.ts` for the starter list). A wrong holiday list can never break
 * the engine; it just needs the data corrected.
 *
 * Dates are 'YYYY-MM-DD' strings — a calendar date has no timezone, so there is
 * no timezone math. A UTC anchor is used ONLY to read a date's day-of-week.
 */

export type IsoDate = string; // 'YYYY-MM-DD'

/** Non-working weekdays by default: Sunday only (Mon–Sat = 6-day week). 0=Sun … 6=Sat. */
export const DEFAULT_OFF_DAYS: readonly number[] = [0];

export interface WorkingDayOptions {
  /** Public holidays to skip, as 'YYYY-MM-DD'. */
  holidays?: ReadonlySet<IsoDate> | readonly IsoDate[];
  /** Weekday numbers that are non-working (0=Sun … 6=Sat). Defaults to [0] (Sundays off). */
  offDays?: readonly number[];
}

const EMPTY_HOLIDAYS: ReadonlySet<IsoDate> = new Set();

function toParts(iso: IsoDate): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) throw new Error(`working-days: invalid date "${iso}"`);
  return [y, m, d];
}

function toIso(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Day of week 0=Sun … 6=Sat, read from calendar parts via a UTC anchor. */
function weekdayOf(iso: IsoDate): number {
  const [y, m, d] = toParts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Step a calendar date by ±1 day, staying on the calendar (handles month/year rollover). */
function stepDay(iso: IsoDate, dir: 1 | -1): IsoDate {
  const [y, m, d] = toParts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + dir));
  return toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function asHolidaySet(h: WorkingDayOptions["holidays"]): ReadonlySet<IsoDate> {
  if (!h) return EMPTY_HOLIDAYS;
  return h instanceof Set ? h : new Set(h);
}

/** True when `iso` is a working day (not an off-day weekday, not a holiday). */
export function isWorkingDay(iso: IsoDate, opts: WorkingDayOptions = {}): boolean {
  const off = opts.offDays ?? DEFAULT_OFF_DAYS;
  if (off.includes(weekdayOf(iso))) return false;
  if (asHolidaySet(opts.holidays).has(iso.slice(0, 10))) return false;
  return true;
}

/**
 * Add `n` working days AFTER `from`.
 * `n = 0` returns `from` unchanged (even if `from` itself is a non-working day).
 * Used for ETA projections (order date + supplier lead → expected ready date).
 */
export function addWorkingDays(from: IsoDate, n: number, opts: WorkingDayOptions = {}): IsoDate {
  let cur = from.slice(0, 10);
  let left = Math.max(0, Math.trunc(n));
  while (left > 0) {
    cur = stepDay(cur, 1);
    if (isWorkingDay(cur, opts)) left--;
  }
  return cur;
}

/**
 * Subtract `n` working days BEFORE `from` — the procurement **raise-by** date
 * (customer deadline − supplier lead). Order later than this and the factory
 * can't finish in time.
 */
export function subtractWorkingDays(from: IsoDate, n: number, opts: WorkingDayOptions = {}): IsoDate {
  let cur = from.slice(0, 10);
  let left = Math.max(0, Math.trunc(n));
  while (left > 0) {
    cur = stepDay(cur, -1);
    if (isWorkingDay(cur, opts)) left--;
  }
  return cur;
}

/**
 * Working days strictly after `from` up to and including `to` (0 if `to <= from`).
 * Drives "PO is X working days late" / "must order in X working days" badges.
 */
export function countWorkingDays(from: IsoDate, to: IsoDate, opts: WorkingDayOptions = {}): number {
  const a = from.slice(0, 10);
  const b = to.slice(0, 10);
  if (b <= a) return 0;
  let cur = a;
  let count = 0;
  while (cur < b) {
    cur = stepDay(cur, 1);
    if (isWorkingDay(cur, opts)) count++;
  }
  return count;
}
