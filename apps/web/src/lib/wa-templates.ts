/**
 * wa-templates — the locked WhatsApp templates (Jess 2026-07-13, two-tone
 * refine; copy source of truth = docs/whatsapp-chase-templates.md).
 *
 * Every audience gets TWO tones:
 *   Reminder — gentle, first contact.
 *   Chase    — firmer follow-up.
 *
 * Audience → lead id (locked): CUSTOMER + LOGISTIC are REF-led, SUPPLIER is
 * PO-led — never the SO number (external parties don't speak SO).
 *
 * Copy rules (locked):
 *  - Multi-line: REAL line breaks ("\n"); `waEncode` turns them into %0A for a
 *    wa.me deep link. Clipboard copy keeps the real breaks.
 *  - {items} = ONE line per item: "{qty}× {model}".
 *  - Customer messages carry NO delivery date and no pressure phrasing
 *    ("settle by", "deliver on time") — the logistic partner contacts the
 *    customer for the final slot; if the customer asks about delivery, ops
 *    replies with the partner's contact.
 *  - {salutation} = the optional preferred-name/title field when set, else the
 *    Title-Cased customer name. NEVER auto-infer Mr/Ms.
 */

/** "LEE WEI YANG" → "Lee Wei Yang". Leaves CJK and mixed tokens intact. */
export function titleCaseName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) =>
      /^[A-Za-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w,
    )
    .join(" ");
}

/** The customer salutation: the optional preferred-name/title field if set,
 *  else Title-Case of the customer name. Never auto-infers Mr/Ms. */
export function salutationOf(
  preferred: string | null | undefined,
  customerName: string | null | undefined,
): string {
  const p = (preferred ?? "").trim();
  if (p) return p;
  const n = (customerName ?? "").trim();
  return n ? titleCaseName(n) : "there";
}

/** RM figure for templates — thousands-separated, no currency prefix
 *  (the template carries "RM " itself). */
export function rmAmount(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString();
}

/** {items} block — ONE line per item: "{qty}× {model}". */
export function itemsBlock(lines: { sku: string; qty: number }[]): string {
  if (lines.length === 0) return "—";
  return lines.map((l) => `${l.qty}× ${l.sku}`).join("\n");
}

// ── CUSTOMER (money) — REF-led, no delivery date, no pressure ───────────────
export interface CustomerChaseInput {
  /** Resolved salutation (see salutationOf). */
  salutation: string;
  ref: string | null;
  /** Live Outstanding = Total − Collected, already thousands-formatted. */
  outstanding: string;
  lines: { sku: string; qty: number }[];
}

/** Gentle first contact. */
export function buildCustomerReminder(i: CustomerChaseInput): string {
  return (
    `Hi ${i.salutation},\n` +
    `Just a friendly reminder regarding your order.\n` +
    `\n` +
    `REF: ${i.ref ?? "—"}\n` +
    `Outstanding: RM ${i.outstanding}\n` +
    `Item: ${itemsBlock(i.lines)}\n` +
    `\n` +
    `Do let us know once arranged. Thank you!`
  );
}

/** Delivery-eve FINAL reminder (page-rebuild §3.2, Jess 2026-07-15): the
 *  Balance panel's Remind switches to this tone when delivery is today/
 *  tomorrow and the balance is still owing. This is the ONE customer template
 *  allowed to reference delivery timing — the locked "no delivery date" rule
 *  still holds for the ordinary reminder/chase. `when` = "today"/"tomorrow". */
export function buildCustomerFinalReminder(
  i: CustomerChaseInput & { when: string },
): string {
  return (
    `Hi ${i.salutation},\n` +
    `Final reminder — your delivery is arranged for ${i.when} and the balance below is still outstanding.\n` +
    `\n` +
    `REF: ${i.ref ?? "—"}\n` +
    `Outstanding: RM ${i.outstanding}\n` +
    `Item: ${itemsBlock(i.lines)}\n` +
    `\n` +
    `Kindly settle before delivery so everything can proceed as planned. Thank you!`
  );
}

/** Firmer follow-up. */
export function buildCustomerChase(i: CustomerChaseInput): string {
  return (
    `Hi ${i.salutation},\n` +
    `Following up on your order — the balance below is still outstanding.\n` +
    `\n` +
    `REF: ${i.ref ?? "—"}\n` +
    `Outstanding: RM ${i.outstanding}\n` +
    `Item: ${itemsBlock(i.lines)}\n` +
    `\n` +
    `Kindly arrange payment so we can proceed. Thank you!`
  );
}

// ── LOGISTIC partner — REF-led (never SO) ────────────────────────────────────
export interface LogisticChaseInput {
  logistic: string | null;
  ref: string | null;
  customer: string | null;
  region: string | null;
  lines: { sku: string; qty: number }[];
  /** Display deadline, e.g. "6 Jul 26" or "TBD". */
  deadline: string;
  overdue: boolean;
}

/** Gentle first contact — ask for the arrangement. */
export function buildLogisticReminder(i: LogisticChaseInput): string {
  return (
    `Hi ${i.logistic ?? "team"},\n` +
    `Friendly reminder — this delivery still needs an arrangement.\n` +
    `\n` +
    `REF: ${i.ref ?? "—"}\n` +
    `Customer: ${i.customer ?? "—"}${i.region ? ` (${i.region})` : ""}\n` +
    `Item: ${itemsBlock(i.lines)}\n` +
    `Deadline: ${i.deadline}\n` +
    `\n` +
    `Please confirm the delivery date + time slot with the customer. Thank you!`
  );
}

/** Firmer follow-up — the deadline is at risk / passed. */
export function buildLogisticChase(i: LogisticChaseInput): string {
  return (
    `Hi ${i.logistic ?? "team"},\n` +
    `Following up — this delivery is still not booked${i.overdue ? " and the deadline has passed" : ""}.\n` +
    `\n` +
    `REF: ${i.ref ?? "—"}\n` +
    `Customer: ${i.customer ?? "—"}${i.region ? ` (${i.region})` : ""}\n` +
    `Item: ${itemsBlock(i.lines)}\n` +
    `Deadline: ${i.deadline}${i.overdue ? " — overdue" : ""}\n` +
    `\n` +
    `Please confirm the delivery date + time slot with the customer today. Thank you!`
  );
}

// ── SUPPLIER — PO-led (never SO) ─────────────────────────────────────────────
export interface SupplierChaseInput {
  poNo: string | null;
  ref: string | null;
  lines: { sku: string; qty: number }[];
  /** Display date the stock is needed by. */
  deadline: string;
}

/** Gentle first contact — ask for the ETA. */
export function buildSupplierReminder(i: SupplierChaseInput): string {
  return (
    `Hi,\n` +
    `Friendly reminder — checking the stock ETA for this PO.\n` +
    `\n` +
    `PO: ${i.poNo ?? "—"}\n` +
    `Our ref: ${i.ref ?? "—"}\n` +
    `Item: ${itemsBlock(i.lines)}\n` +
    `Needed by: ${i.deadline}\n` +
    `\n` +
    `Please advise when the stock will be ready. Thank you!`
  );
}

/** Firmer follow-up — still no ETA / stock late. */
export function buildSupplierChase(i: SupplierChaseInput): string {
  return (
    `Hi,\n` +
    `Following up — we still need the stock ETA for this PO.\n` +
    `\n` +
    `PO: ${i.poNo ?? "—"}\n` +
    `Our ref: ${i.ref ?? "—"}\n` +
    `Item: ${itemsBlock(i.lines)}\n` +
    `Needed by: ${i.deadline}\n` +
    `\n` +
    `Please confirm the ready date today so we can plan the delivery. Thank you!`
  );
}

// ── SUPPLIER GROUP — ONE message per supplier, covering many orders ──────────
// Suppliers speak the ORIGINAL CR/TCF ref (orders.source_ref[0]), never the SO.
// One WhatsApp group per supplier gets a single message listing every selected
// order's ref + items — Remind (before deadline) or Chase (already late).
export interface SupplierGroupRow {
  ref: string | null;
  /** PO number — included in the line only when `includePo` (sofa/bedframe
   *  suppliers key off the PO; mattress + logistic speak the ref only). */
  po?: string | null;
  items: { sku: string; qty: number }[];
}

/** One consolidated supplier message covering all `rows` (one row per order).
 *  `remind` = gentle (before deadline); `chase` = firmer (already late).
 *  `includePo` (Jess 2026-07-19): sofa/bedframe suppliers get "ref · PO";
 *  mattress suppliers + logistic partners get the ref alone. */
export function buildSupplierGroupMessage(
  mode: "remind" | "chase",
  supplierName: string,
  rows: SupplierGroupRow[],
  includePo = false,
): string {
  const opener =
    mode === "chase"
      ? `Hi ${supplierName} 👋 following up — we still need the ready date for these, customers are waiting:`
      : `Hi ${supplierName} 👋 checking on these open orders, please confirm the ready date for each:`;
  const closer =
    mode === "chase"
      ? `Please confirm a ready date today so we can plan delivery. Thank you!`
      : `Appreciate a ready date per order. Thank you!`;
  const body = rows
    .map((r) => {
      const label = includePo ? `${r.ref ?? "—"} · PO ${r.po ?? "—"}` : `${r.ref ?? "—"}`;
      return `${label}\t${itemsBlock(r.items)}\n`;
    })
    .join("");
  return `${opener}\n\n${body}\n${closer}`;
}

/** URL-encoded body, ready for `https://wa.me/<number>?text=` — real line
 *  breaks become %0A. */
export function waEncode(text: string): string {
  return encodeURIComponent(text);
}
