const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format an ISO date string as **"Tue, 20 May 26"** — weekday FIRST
 * (Loo, 2026-07-30; supersedes the date-first spelling of 2026-06-12).
 *
 * The weekday moved to the front because it makes a date COLUMN line up: the
 * prefix is always three characters, where a leading day number is one or two
 * and pushes the weekday around. Every date in the portal comes from here, so
 * this is the only place the spelling exists.
 *
 * Returns "—" for null/undefined/invalid input.
 *
 * Append time=true to include HH:MM → "Tue, 20 May 26 14:30".
 */
export function fmtDate(
  iso: string | null | undefined,
  opts?: { time?: boolean },
): string {
  if (!iso) return "—";
  // Bare dates (YYYY-MM-DD) need a timezone anchor so new Date() doesn't
  // shift them to the day before in UTC-minus zones.
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return "—";
  const dow = DAYS[d.getDay()];
  const day = d.getDate();
  const mon = MONTHS[d.getMonth()];
  const yr = String(d.getFullYear()).slice(2);
  if (opts?.time) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${dow}, ${day} ${mon} ${yr} ${hh}:${mm}`;
  }
  return `${dow}, ${day} ${mon} ${yr}`;
}

/**
 * Format a `YYYY-MM` period as "Jul 2026". For month switchers and any screen
 * that names a month rather than a day.
 *
 * Lives here rather than beside each caller so the portal has ONE month
 * spelling, and reads the parts directly instead of going through
 * `toLocaleDateString` (COPY-STANDARD: never hand a date to the locale).
 */
export function fmtMonth(period: string | null | undefined): string {
  if (!period) return "—";
  const [y, m] = period.slice(0, 7).split("-").map(Number);
  const mon = MONTHS[(m ?? 0) - 1];
  if (!mon || !Number.isFinite(y)) return "—";
  return `${mon} ${y}`;
}

/**
 * Format an ISO date as "12 Jun 26" (no weekday). For compact spots like the
 * Calendar panel's selected-day header.
 */
export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
}
