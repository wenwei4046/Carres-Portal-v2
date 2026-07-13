/**
 * wa-templates — the locked WhatsApp chase templates (Jess Round 1A, 2026-07-13).
 * Round 1A copies the text to the clipboard (no stored partner number yet);
 * `waEncode` readies the same text for a wa.me deep link later.
 */

export interface ChaseItemsInput {
  /** Combined order lines (sku + qty). */
  lines: { sku: string; qty: number }[];
}

/** Items summary: single line → the sku itself; multi → "{n} items ({units} units)". */
export function chaseItemsLabel(lines: { sku: string; qty: number }[]): string {
  if (lines.length === 0) return "—";
  if (lines.length === 1) return lines[0].sku;
  const units = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  return `${lines.length} items (${units} units)`;
}

export interface LogisticChaseInput {
  logistic: string | null;
  soId: string; // "SO-1153"
  ref: string | null;
  customer: string | null;
  region: string | null;
  lines: { sku: string; qty: number }[];
  /** Display deadline, e.g. "6 Jul 26" or "TBD". */
  deadline: string;
  overdue: boolean;
}

/** Locked logistic chase template. */
export function buildLogisticChase(i: LogisticChaseInput): string {
  return (
    `Hi ${i.logistic ?? "team"}, need delivery arrangement. ` +
    `${i.soId} · REF ${i.ref ?? "—"} · ${i.customer ?? "—"}${i.region ? ` (${i.region})` : ""}. ` +
    `Item: ${chaseItemsLabel(i.lines)}. ` +
    `Deadline: ${i.deadline}${i.overdue ? " — overdue" : ""}. ` +
    `Pls confirm delivery date + time slot with customer. TQ`
  );
}

export interface SupplierChaseInput {
  poNo: string | null;
  ref: string | null;
  soId: string;
  lines: { sku: string; qty: number }[];
  deadline: string;
}

/** Locked supplier chase template. */
export function buildSupplierChase(i: SupplierChaseInput): string {
  return (
    `Hi, checking stock ETA. ` +
    `${i.poNo ?? "—"} · our ref ${i.ref ?? "—"} (${i.soId}). ` +
    `Item: ${chaseItemsLabel(i.lines)}. ` +
    `Needed by: ${i.deadline}. ` +
    `Pls advise when stock ready. TQ`
  );
}

/** URL-encoded body, ready for `https://wa.me/<number>?text=` later (1B). */
export function waEncode(text: string): string {
  return encodeURIComponent(text);
}
