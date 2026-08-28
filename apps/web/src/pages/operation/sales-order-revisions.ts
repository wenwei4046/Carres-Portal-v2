/**
 * STAGE 2 — the human-readable change history between two revisions:
 * `+ added` · `− removed` · `old → new`. Pure functions, no React — the diff
 * is DERIVED from the immutable snapshots (one arithmetic, Law D), never
 * stored alongside them where it could drift.
 */
import { LIFT_OPTIONS } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import type { SalesOrderSnapshot, SalesOrderSnapshotLine } from "@/lib/queries";

/** The header keys a revision can move, with the words the reader sees. */
const HEADER_LABELS: ReadonlyArray<[key: string, label: string, isDate?: boolean, suffix?: string]> = [
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
  ["delivery_date", "Requested Delivery Date", true],
  ["delivery_date_tbd", "Delivery date to be confirmed"],
  ["proceed_date", "Proceed date", true],
  ["delivery_floor", "Floor"],
  /* R-13 — 0354 widened the writer to the portal's remaining questions and
     `sales_order_snapshot` sees every one of them, but this table never grew.
     A save that moved ONLY these minted a revision whose diff printed NOTHING.
     Only the three carrying a governed label are added; the rest need a word. */
  ["customer_address_unknown", "Address not given yet"],
  ["customer_billing_same", "Billing address same as delivery"],
  ["delivery_stair_items", "Items needing stair carry"],
  ["delivery_has_lift", "Lift available?"],
  ["installment_months", "Instalment plan", false, " months"],
  ["salesperson_name", "Salesperson"],
  ["outlet_name", "Showroom"],
];

function word(v: unknown, isDate?: boolean, key?: string): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") {
    /* ⭐ THE LIFT ANSWER HAS TWO NAMED WORDS (COPY-STANDARD:1516). `Yes/No` is
       banned for this fact BY NAME, because a boolean cannot say the difference
       between *no lift* and *nobody asked* — which is the whole reason the POS
       and the object page both moved to two named answers. Both surfaces import
       `LIFT_OPTIONS`; neither may retype the words, so nor may this one.

       Fixing the LABEL alone would have left the banned values in place: one
       boolean branch serves every field here, so `Lift available?: Yes → No`
       is still `Yes/No`. The per-key hook is what makes the ruling reachable. */
    if (key === "delivery_has_lift") return v ? LIFT_OPTIONS[1] : LIFT_OPTIONS[0];
    return v ? "Yes" : "No";
  }
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

  for (const [key, label, isDate, suffix] of HEADER_LABELS) {
    const a = prev.header?.[key];
    const b = next.header?.[key];
    if ((a ?? null) === (b ?? null)) continue;
    /* ids move together with their names; the name row already speaks. */
    const before = word(a, isDate, key);
    const after = word(b, isDate, key);
    out.push(`${label}: ${before}${before === "—" ? "" : (suffix ?? "")} → ${after}${after === "—" ? "" : (suffix ?? "")}`);
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
