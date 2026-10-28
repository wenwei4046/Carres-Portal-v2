/**
 * A door into the Sales Order list by the customer's original requested
 * delivery date (COPY "SO table and filters": version 1's preserved request).
 * Purchasing's Monthly demand opens `/operation/orders?tab=all&requested=…`
 * with one month, or before / after a window edge; the list keeps the same
 * words in its condition chip. One copy, read by Sales Order Outright and the
 * earlier register.
 */
import { fmtDate, fmtMonth } from "@/lib/fmt-date";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function todayMYT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** The Order list narrowed by a month door: one month, or beyond a window edge. */
export type RequestedNarrowing = { kind: "month" | "before" | "after" | "range" | "overdue" | "unconfirmed"; month: string };

export function requestedNarrowingOf(value: string | null): RequestedNarrowing | null {
  if (!value) return null;
  if (value === "overdue" || value === "unconfirmed") return { kind: value, month: "" };
  if (/^range:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [, from, to] = value.split(":");
    if (from! <= to! && [from, to].every(d => !Number.isNaN(Date.parse(d!)))) return { kind: "range", month: `${from}:${to}` };
    return null;
  }
  const match = /^(?:(before|after):)?(\d{4}-(?:0[1-9]|1[0-2]))$/.exec(value);
  if (!match) return null;
  return { kind: (match[1] as "before" | "after" | undefined) ?? "month", month: match[2]! };
}

export function requestedNarrowingWord(n: RequestedNarrowing): string {
  if (n.kind === "overdue") return "Late";
  if (n.kind === "unconfirmed") return "Date not confirmed";
  /* No dash on a screen (COPY): a range reads `{date} to {date}`. */
  if (n.kind === "range") return n.month.split(":").map(d => fmtDate(d)).join(" to ");
  const month = fmtMonth(n.month);
  return n.kind === "before" ? `Before ${month}` : n.kind === "after" ? `After ${month}` : month;
}

export function inRequestedNarrowing(iso: string | null, n: RequestedNarrowing, fullyDelivered = false): boolean {
  if (n.kind === "unconfirmed") return !iso;
  if (n.kind === "overdue") return Boolean(iso && iso.slice(0, 10) < todayMYT() && !fullyDelivered);
  if (n.kind === "range") { const [from, to] = n.month.split(":"); return Boolean(iso && iso.slice(0, 10) >= from! && iso.slice(0, 10) <= to!); }
  const month = iso?.slice(0, 7) ?? "";
  if (!MONTH_RE.test(month)) return false;
  return n.kind === "before" ? month < n.month : n.kind === "after" ? month > n.month : month === n.month;
}

