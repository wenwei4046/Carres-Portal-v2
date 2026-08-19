/**
 * THE MONEY STATE IS DERIVED, NEVER KEYED
 * (SALES ORDER V2 · CARD 4 closing slice, 2026-08-13).
 *
 * The collections desk used to read `ops_order_control.payment_status` — a word
 * an operator picked from a dropdown — for its facet, its row pill AND its
 * "still to collect" predicate. That is a SECOND money truth standing beside
 * `orderMoney`, and the measurement is what settles it: on production ONE row
 * of 88 carries the column, so the facet read `Unset` for 87 orders while 25 of
 * them had money in and the shared rule knew exactly which. A hand-typed `Paid`
 * on an order owing RM 5,000 was one click away from lying to the desk, and
 * `payment_status` is one of the three competing stores Card 4 exists to close.
 *
 * The WORDS do not change: `Paid · Partial · Unpaid` are the same three the
 * dropdown offered, `Overdue` comes from Card 4's own collection clock (past
 * the T−1 final deadline and still owing) and `No price yet` is the register's
 * word for an order nobody has priced. `Follow Up` is retired — it was never a
 * money fact, and the desk already states when the customer was last spoken to.
 *
 * The COLUMN keeps its data. It loses its AUTHORITY, exactly as Card 1 retired
 * the legacy stage words.
 *
 * PURE — the caller hands in the answers of the one arithmetic and the one
 * clock; this module owns no second calculation of its own.
 */

import type { CollectionAttention } from "@carres/shared";

export type MoneyState = "Overdue" | "Unpaid" | "Partial" | "Paid" | "No price yet";

/** Facet order: the ones that need a call first, the settled ones last. */
export const MONEY_STATE_ORDER: MoneyState[] = [
  "Overdue",
  "Unpaid",
  "Partial",
  "Paid",
  "No price yet",
];

export function moneyStateOf(input: {
  /** `orderMoney.known` — false when nobody has put a figure on the order. */
  known: boolean;
  /** Goods owing + storage owing, the desk's collectable total. */
  owing: number;
  /** What has actually come in (goods paid + live storage collections). */
  paid: number;
  /** `collectionClock(...).attention` — `late` = past the T−2 deadline
   *  (owner ruling 2026-08-19). */
  attention: CollectionAttention;
}): MoneyState {
  // An unpriced order names no figure, so it can be neither paid nor owing —
  // `null` and zero are different answers (payment MASTER §2).
  if (!input.known) return "No price yet";
  if (input.owing <= 0) return "Paid";
  if (input.attention === "late") return "Overdue";
  return input.paid > 0 ? "Partial" : "Unpaid";
}
