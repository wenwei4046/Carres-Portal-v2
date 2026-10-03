/**
 * The period a Finance statement reads, kept in the address (`?from=&to=`):
 * read it, choose it by whole month, list the months to choose from. Shared by
 * Reports (Profit and Loss) and Cash Flow (0638), so both read a period the
 * same way. Moved out of FinanceReports unchanged; `monthEnd` is the month-end
 * pack's own.
 */
import { monthEnd } from "../month-end-pack";

export { monthEnd };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as YYYY-MM-DD, or null. */
export function readDay(v: string | null): string | null {
  if (!v || !ISO_DAY.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d ? v : null;
}

export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** YYYY-MM when the period is exactly one whole month, else null. */
export function wholeMonth(from: string, to: string): string | null {
  const ym = from.slice(0, 7);
  return from === `${ym}-01` && to === monthEnd(ym) ? ym : null;
}

/** Every month from the ledger's first to this one, newest first, plus the
 *  month on screen if it falls outside that. */
export function monthChoices(goLive: string | null, today: string, shown: string | null): string[] {
  const last = today.slice(0, 7);
  const out = new Set<string>([last]);
  let ym = (goLive ?? today).slice(0, 7);
  for (let i = 0; ym <= last && i < 600; i += 1) {
    out.add(ym);
    ym = nextMonth(ym);
  }
  if (shown) out.add(shown);
  return [...out].sort().reverse();
}

/** The period in the address, or this month. An Up to before From is read as From. */
export function readPeriod(params: URLSearchParams, today: string): { from: string; to: string } {
  const ym = today.slice(0, 7);
  const from = readDay(params.get("from")) ?? `${ym}-01`;
  const to = readDay(params.get("to")) ?? monthEnd(ym);
  return { from, to: to < from ? from : to };
}
