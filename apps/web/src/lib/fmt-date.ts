const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const APP_TIME_ZONE = "Asia/Kuala_Lumpur";

function appDateParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    dow: value("weekday"),
    day: value("day"),
    mon: value("month"),
    yr: value("year"),
    hh: value("hour"),
    mm: value("minute"),
  };
}

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
  // Bare business dates have no timezone and must keep their written day.
  // Timestamps are always displayed in Carres' MYT business timezone, never
  // the browser/runner timezone (GitHub CI is UTC; operators are in Malaysia).
  const bare = iso.length === 10;
  const d = new Date(bare ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return "—";
  const p = bare
    ? {
        dow: DAYS[d.getUTCDay()],
        day: String(d.getUTCDate()),
        mon: MONTHS[d.getUTCMonth()],
        yr: String(d.getUTCFullYear()).slice(2),
        hh: "00",
        mm: "00",
      }
    : appDateParts(d);
  if (opts?.time) {
    return `${p.dow}, ${p.day} ${p.mon} ${p.yr} ${p.hh}:${p.mm}`;
  }
  return `${p.dow}, ${p.day} ${p.mon} ${p.yr}`;
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
  const bare = iso.length === 10;
  const d = new Date(bare ? `${iso}T00:00:00Z` : iso);
  if (isNaN(d.getTime())) return "—";
  if (bare) {
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  }
  const p = appDateParts(d);
  return `${p.day} ${p.mon} ${p.yr}`;
}
