/**
 * Excel's date ▼ vocabulary (Jess, 2026-08-02 — frozen on the Purchase Orders
 * Register, built to flow back to every date column in the portal):
 *
 *   Today · Yesterday · This Week · Last Week · This Month · Last Month ·
 *   the month buckets the data actually holds · Custom Date Range…
 *
 * One matcher answers every option, so a column filter cannot drift from the
 * menu that offered it. Values are sentinels (`__today__`), month buckets
 * (`m:2026-08`), custom ranges (`r:2026-08-01:2026-08-15`) or an exact ISO
 * day — all plain strings, so they live in the same selected-Set the kit's
 * ColumnFilter already carries and Clear keeps working unchanged.
 */

export const F_NONE = "__none__";
export const F_TODAY = "__today__";
export const F_YESTERDAY = "__yesterday__";
export const F_THIS_WEEK = "__this_week__";
export const F_LAST_WEEK = "__last_week__";
export const F_THIS_MONTH = "__this_month__";
export const F_LAST_MONTH = "__last_month__";

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the ISO week `iso` falls in. */
export function weekStartIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return addDaysIso(iso, -dow);
}

function inRange(v: string, from: string, to: string): boolean {
  return v >= from && v <= to;
}

/** `r:2026-08-01:2026-08-15` — the Custom Date Range… value. */
export function rangeValue(from: string, to: string): string {
  return `r:${from}:${to}`;
}

/** Does a date hit one Excel preset / month bucket / range / sentinel? */
export function dateFilterMatches(
  date: string | null,
  value: string,
  today: string,
): boolean {
  if (value === F_NONE) return date == null;
  if (date == null) return false;
  const ws = weekStartIso(today);
  switch (value) {
    case F_TODAY:
      return date === today;
    case F_YESTERDAY:
      return date === addDaysIso(today, -1);
    case F_THIS_WEEK:
      return inRange(date, ws, addDaysIso(ws, 6));
    case F_LAST_WEEK:
      return inRange(date, addDaysIso(ws, -7), addDaysIso(ws, -1));
    case F_THIS_MONTH:
      return date.slice(0, 7) === today.slice(0, 7);
    case F_LAST_MONTH: {
      const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() - 1);
      return date.slice(0, 7) === d.toISOString().slice(0, 7);
    }
    default:
      // `m:2026-08` — one month bucket. `r:from:to` — a custom range
      // (ISO dates carry no colon, so the split is unambiguous).
      if (value.startsWith("m:")) return date.slice(0, 7) === value.slice(2);
      if (value.startsWith("r:")) {
        const [, from, to] = value.split(":");
        return from != null && to != null && inRange(date, from, to);
      }
      return date === value;
  }
}

export function monthLabel(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString("en-MY", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The six presets, in Excel's own order — every date ▼ starts with these. */
export function datePresetOptions(): { value: string; label: string }[] {
  return [
    { value: F_TODAY, label: "Today" },
    { value: F_YESTERDAY, label: "Yesterday" },
    { value: F_THIS_WEEK, label: "This Week" },
    { value: F_LAST_WEEK, label: "Last Week" },
    { value: F_THIS_MONTH, label: "This Month" },
    { value: F_LAST_MONTH, label: "Last Month" },
  ];
}
