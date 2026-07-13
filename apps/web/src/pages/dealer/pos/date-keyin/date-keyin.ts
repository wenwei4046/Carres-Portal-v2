/**
 * date-keyin — pure date helpers for the POS date pickers (Loo 2026-07-14).
 *
 * The POS keeps ISO `yyyy-mm-dd` strings in the draft (unchanged contract);
 * everything here converts between ISO and {y, m, d} parts WITHOUT going
 * through `new Date(isoString)` (which parses as UTC and shifts days in MYT).
 * Months are 0-based throughout, matching JS Date.
 */

export interface DateParts {
  y: number;
  m: number; // 0-based
  d: number;
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

export function partsFromIso(iso: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

export function isoFromParts(p: DateParts): string {
  return `${p.y}-${pad2(p.m + 1)}-${pad2(p.d)}`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** Day-of-week (0=Sun) for a local calendar date, TZ-safe. */
export function dowOf(p: DateParts): number {
  return new Date(p.y, p.m, p.d).getDay();
}

/** Age in whole years on `todayIso`; negative if the birthday is in the future. */
export function ageOn(todayIso: string, birth: DateParts): number {
  const t = partsFromIso(todayIso);
  if (!t) return 0;
  let a = t.y - birth.y;
  if (t.m < birth.m || (t.m === birth.m && t.d < birth.d)) a--;
  return a;
}

/** "Tue, 28 Jul 2026" — trigger readout for delivery/proceed fields. */
export function fmtTriggerDate(iso: string): string {
  const p = partsFromIso(iso);
  if (!p) return "";
  return `${DOW_SHORT[dowOf(p)]}, ${pad2(p.d)} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** "01 Apr 1990" — birthday trigger readout (weekday is noise there). */
export function fmtBirthday(iso: string): string {
  const p = partsFromIso(iso);
  if (!p) return "";
  return `${pad2(p.d)} ${MONTHS_SHORT[p.m]} ${p.y}`;
}

/** "Tue 28 Jul" — compact date for calendar footers. */
export function fmtChipDate(iso: string): string {
  const p = partsFromIso(iso);
  if (!p) return "";
  return `${DOW_SHORT[dowOf(p)]} ${p.d} ${MONTHS_SHORT[p.m]}`;
}
