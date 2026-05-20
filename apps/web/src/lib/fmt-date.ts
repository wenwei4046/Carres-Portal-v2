const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format an ISO date string as "Tue, 20 May 26".
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
