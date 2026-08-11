/**
 * The Sales Orders register's FACTS — one file, no React, fully testable.
 *
 * **THE REGISTER LAW (Loo, 2026-08-09) is what this file exists to enforce.**
 * *"Build this page as if you were building Microsoft Excel. Every order is
 * exactly ONE row. Every column is exactly ONE fact."* A fact is a string or a
 * number. Nothing here returns markup, and nothing here decides what to DO
 * about an order — *"Every register answers only: what records exist? Never:
 * what should I do?"*
 *
 * Keeping the facts out of the component is not tidiness. It is the only way
 * the law can be TESTED: `CLAUDE.md` — *"a rule that exists only as
 * documentation is temporary and incomplete."*
 */
import { orderMoney, type OrderMoney } from "@carres/shared";
import type { operationOrderListRow } from "@/lib/queries";

/**
 * **Rental orders are not customer orders on this register** (SO-1 FINAL).
 * The Rental module owns a rent-to-own agreement end to end; migration 0275
 * mints a Sales Order alongside the agreement so the rented item has one, and
 * that minted row is the agreement's shadow, not a sale. Measured on production
 * 2026-08-09: 8 such orders, **0 priced**, 1 line each — so on a register whose
 * job is *what did they buy, what is it worth* they answer neither question.
 */
export function isRental(o: operationOrderListRow): boolean {
  return o.source_system === "rental";
}

/** Delivered — the only completion fact the ORDER itself carries. It is NOT
 *  "settled": `docs/orders/MASTER.md` §2.4 — *"Delivered is not paid."* */
export function isDelivered(o: operationOrderListRow): boolean {
  return o.status === "delivered" || o.operation_stage === "delivered";
}

/**
 * ⭐ A BROKEN PROMISE IS A FACT ABOUT THE RECORD, NEVER AN INSTRUCTION.
 *
 * **The REGISTER LAW is not bent by this.** *"Every register answers only:
 * what records exist? Never: what should I do?"* — and *"the day we promised
 * has passed and the goods have not gone"* is the ORDER'S OWN TRUTH, read
 * from two fields the row already carries. What to DO about it belongs to
 * Work (SO V2 Cards 9/10), and this file still cannot say it.
 *
 * It therefore changes the date's TONE and never its words: no status is
 * minted, no verb reaches the screen, and `docs/01-design-tokens.md` §2.2
 * gives colour `status` as one of its four jobs.
 *
 * `today` is INJECTED — the clock is the caller's, so the fact is testable
 * without freezing time.
 */
export function promiseBroken(o: operationOrderListRow, today: string): boolean {
  if (o.delivery_date_tbd || !o.delivery_date) return false;
  if (isDelivered(o)) return false;
  return o.delivery_date < today;
}

/**
 * D1's PO coverage, per line — *is this item bought yet?*
 *
 * Two rungs, and both are somebody's record:
 *   1. `source_po` — the PO number the AutoCount import wrote on the line.
 *   2. `po_skus`   — the SKUs a REAL purchase order covers for this order
 *                    (D1's own field). No number rides it, so the answer is
 *                    this repository's already-shipped `PO issued` string
 *                    (`currentOf`), never a fifth spelling.
 *
 * **The blank carries ONE meaning: nothing proves a purchase order covers
 * this line.** A pre-D1 Worker sends `po_skus` as `undefined`, which lands on
 * the same blank — "we do not know" and "nothing proves it" are the same
 * sentence here, so the cell never accuses.
 */
export function onPoOf(
  o: operationOrderListRow,
  l: { sku: string; source_po?: string | null },
): string {
  if (l.source_po) return l.source_po;
  return (o.po_skus ?? []).includes(l.sku) ? "PO issued" : "";
}

/**
 * What ONE line is called, in words.
 *
 * The ladder, and every rung is a fact somebody wrote down:
 *   1. `label`  — `Model · Variant` from the catalog, resolved server-side by
 *                 the same helper the Sales Order document uses.
 *   2. `sku`    — the text the order itself carries. On an AutoCount-imported
 *                 line this IS the product name the salesperson typed
 *                 (`1013Jager/Fab3-King/PC151-01`); there is no code to hide.
 *
 * **Measured 2026-08-09, and it is why there is a rung 2 at all:** of 84
 * distinct SKUs on live orders, 37 are in the catalog. Every NATIVE line
 * resolves (81 of 82). Every AutoCount line misses (0 of 94). At go-live the
 * import is gone (`CLAUDE.md` §6) and rung 2 stops being reachable for
 * anything but a genuinely new product.
 */
export function lineName(l: { sku: string; label?: string | null }): string {
  const label = l.label?.trim();
  return label && label.length > 0 ? label : l.sku;
}

/** How many items the register names before it stops. Two, because two names
 *  and a tail is what fits on ONE row at the measured width. The reader who
 *  needs the rest has the ▸ expansion (STAGE 1: 2990's register expands) and
 *  the document. */
const NAMED_ITEMS = 2;

/**
 * The whole order in one line of words: `Booqit · CNR ×1 · Jager · Queen ×2`,
 * and `+2 more` when there are more than two products.
 */
export function itemsSummary(o: operationOrderListRow): string {
  const lines = o.order_lines ?? [];
  if (lines.length === 0) return "";
  const named = lines.slice(0, NAMED_ITEMS).map((l) => `${lineName(l)} ×${l.qty}`);
  const rest = lines.length - NAMED_ITEMS;
  return rest > 0 ? `${named.join(" · ")} · +${rest} more` : named.join(" · ");
}

/**
 * Money, through the ONE shared rule and nothing else (SO-1: *"money via
 * @carres/shared orderMoney only"*).
 *
 * `storageOwing` is deliberately NOT passed. Storage is a DELIVERY-side clock
 * with its own waiver and its own collection flag — it is not part of what the
 * customer committed to buy, and this register carries only the commitment.
 */
export function moneyOfOrder(o: operationOrderListRow): OrderMoney {
  const lines = o.order_lines ?? [];
  const price = (r: { qty: number; unit_price?: number | string | null }) =>
    Number(r.unit_price ?? 0) * Number(r.qty ?? 0);
  return orderMoney({
    lineSum: lines.reduce((s, l) => s + price(l), 0),
    addonSum: (o.order_addons ?? []).reduce((s, a) => s + price(a), 0),
    paid: o.paid,
    controlBalance: null,
  });
}

/**
 * ⭐ **A BLANK MAY NEVER CARRY TWO MEANINGS** (SO-1 FINAL).
 *
 * Three states, three different sentences, never an empty cell:
 * ```
 * owed      RM 2,500        the number
 * settled   Paid in full    priced, and nothing is left
 * unpriced  No price yet    nobody has put a figure on this order
 * ```
 */
export type MoneyState =
  | { kind: "amount"; value: number }
  | { kind: "settled" }
  | { kind: "unpriced" };

export function outstandingState(m: OrderMoney): MoneyState {
  if (!m.known) return { kind: "unpriced" };
  return m.outstanding > 0 ? { kind: "amount", value: m.outstanding } : { kind: "settled" };
}

/** The order's worth. It is never "settled" — an order either has a price or
 *  nobody has given it one. */
export function valueState(m: OrderMoney): MoneyState {
  return m.known && m.total != null
    ? { kind: "amount", value: m.total }
    : { kind: "unpriced" };
}

/** Digits only, so `012-345 6789` and `0123456789` are one customer. */
export function digits(s: string): string {
  return s.replace(/\D+/g, "");
}

/**
 * The four things search answers: SO number · customer · phone · item.
 * Item matches the NAME the row prints and the raw sku behind it, because an
 * operator reading a printed order has the code and one reading the screen has
 * the name.
 */
export function searchHaystack(o: operationOrderListRow): string {
  const items = (o.order_lines ?? []).flatMap((l) => [lineName(l), l.sku]).join(" ");
  return [
    `so-${o.so}`,
    String(o.so),
    o.customer_name,
    (o.source_ref ?? []).filter(Boolean).join(" "),
    items,
  ]
    .join(" ")
    .toLowerCase();
}
