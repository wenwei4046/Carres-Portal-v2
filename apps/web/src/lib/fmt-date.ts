const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format an ISO date string as "20 May 26, Tue" — date first, weekday last
 * (Jess 2026-06-12).
 * Returns "—" for null/undefined/invalid input.
 *
 * Append time=true to include HH:MM → "20 May 26, Tue 14:30".
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
    return `${day} ${mon} ${yr}, ${dow} ${hh}:${mm}`;
  }
  return `${day} ${mon} ${yr}, ${dow}`;
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
