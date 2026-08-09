/**
 * STAGE 2 — the human-readable change history between two revisions:
 * `+ added` · `− removed` · `old → new`. Pure functions, no React — the diff
 * is DERIVED from the immutable snapshots (one arithmetic, Law D), never
 * stored alongside them where it could drift.
 */
import { fmtDate } from "@/lib/fmt-date";
import type { SalesOrderSnapshot, SalesOrderSnapshotLine } from "@/lib/queries";

/** The header keys a revision can move, with the words the reader sees. */
const HEADER_LABELS: ReadonlyArray<[key: string, label: string, isDate?: boolean]> = [
  ["customer_name", "Customer"],
  ["customer_phone", "Phone"],
  ["customer_email", "Email"],
  ["customer_address", "Address"],
  ["customer_address_line1", "Address line 1"],
  ["customer_address_line2", "Address line 2"],
  ["customer_address_city", "City"],
  ["customer_address_state", "State"],
  ["customer_address_postcode", "Postcode"],
  ["customer_emergency", "Emergency contact"],
  ["customer_billing", "Billing address"],
  ["delivery_date", "Promised delivery", true],
  ["delivery_date_tbd", "Promised delivery TBD"],
  ["proceed_date", "Proceed date", true],
  ["delivery_floor", "Floor"],
  ["delivery_has_lift", "Lift"],
  ["salesperson_name", "Salesperson"],
  ["outlet_name", "Showroom"],
];

function word(v: unknown, isDate?: boolean): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (isDate) return fmtDate(String(v));
  return String(v);
}

/** What one line is called in a change sentence. */
function lineWord(l: SalesOrderSnapshotLine): string {
  return l.description?.trim() || l.sku;
}

/**
 * `prev → next`, in sentences. `prev = null` (Rev 1) describes the original:
 * one line naming the birth, never a wall of "+ added".
 */
export function describeRevisionChanges(
  prev: SalesOrderSnapshot | null,
  next: SalesOrderSnapshot,
): string[] {
  if (!prev) return ["Original — the agreement as first recorded"];
  const out: string[] = [];

  for (const [key, label, isDate] of HEADER_LABELS) {
    const a = prev.header?.[key];
    const b = next.header?.[key];
    if ((a ?? null) === (b ?? null)) continue;
    /* ids move together with their names; the name row already speaks. */
    out.push(`${label}: ${word(a, isDate)} → ${word(b, isDate)}`);
  }

  const prevById = new Map((prev.lines ?? []).map((l) => [l.id ?? l.sku, l]));
  const nextById = new Map((next.lines ?? []).map((l) => [l.id ?? l.sku, l]));
  for (const [id, b] of nextById) {
    const a = prevById.get(id);
    if (!a) {
      out.push(`+ added ${lineWord(b)} ×${b.qty}`);
      continue;
    }
    if (a.sku !== b.sku) out.push(`${lineWord(a)} → ${lineWord(b)}`);
    if (Number(a.qty) !== Number(b.qty)) out.push(`${lineWord(b)}: ×${a.qty} → ×${b.qty}`);
    if (Number(a.unit_price) !== Number(b.unit_price))
      out.push(`${lineWord(b)}: RM ${Number(a.unit_price)} → RM ${Number(b.unit_price)}`);
  }
  for (const [id, a] of prevById) {
    if (!nextById.has(id)) out.push(`− removed ${lineWord(a)} ×${a.qty}`);
  }
  return out;
}
