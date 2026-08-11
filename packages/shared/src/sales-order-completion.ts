/**
 * CARD 8 — DERIVED COMPLETION · the one arithmetic
 * (owner ruling 2026-08-11, docs/orders/MASTER.md).
 *
 *   Goods clear
 *   + Money clear in BOTH directions
 *   + Loan clear, including the supplier return
 *   = No Action Required
 *
 * **Delivered ≠ Complete. Cancelled ≠ Complete.** There is no `completed`
 * status column and no button — completion is DERIVED, here and only here
 * (Law D), from the four tracks the earlier cards made true:
 *
 *   GOODS      Card 1's commitment − Card 2's allocation (units sold to the
 *              SO). A reserved-but-undelivered unit keeps the track open; a
 *              CANCELLED order owes no goods but still may not hold stock.
 *   MONEY IN   Card 4's `orderMoney` — outstanding > 0 keeps it open, and it
 *              survives delivery.
 *   MONEY OUT  Card 7's refunds — a requested or approved-but-unpaid refund
 *              means Carres still owes the customer.
 *   LOAN       Card 6's obligations — an un-recovered loan, or a supplier
 *              borrow not yet returned to the supplier, stays open even when
 *              goods and money are clear.
 *
 * PURE — no I/O. Callers feed it the same authoritative reads the tracks
 * already own; this module adds no third arithmetic for any of them.
 */

import type { SalesOrderAllocation } from "./sales-order-allocation";

export type CompletionTrackKey = "goods" | "money_in" | "money_out" | "loan";

export interface CompletionTrack {
  key: CompletionTrackKey;
  open: boolean;
  /** One measured sentence a surface may show — the fact, not a verb. */
  why: string | null;
}

export interface OrderCompletion {
  /** Every track clear — the derived whole-SO answer. NEVER stored. */
  noActionRequired: boolean;
  tracks: CompletionTrack[];
  /** The open track keys, for quick badge rendering. */
  openTracks: CompletionTrackKey[];
}

export interface CompletionInput {
  /** `orders.status = 'cancelled'` — the one legacy word this derivation may
   *  read, because cancellation is a CONTRACT fact (GATE 7 freezes it), not a
   *  fulfilment summary. */
  cancelled: boolean;
  /** Card 2's allocation for this SO (commitment lines vs units). */
  allocation: Pick<SalesOrderAllocation, "totals">;
  /** Card 4's money — `outstanding` and whether a figure exists at all. */
  money: { outstanding: number; known: boolean };
  /** Card 7's refunds — statuses only. */
  refunds: ReadonlyArray<{ status: "requested" | "approved" | "rejected" | "paid" }>;
  /** Card 6's loans — the two halves of "clear". */
  loans: ReadonlyArray<{
    status: "on_loan" | "returned";
    source: "warehouse" | "supplier";
    returned_to_supplier_at: string | null;
  }>;
}

export function resolveOrderCompletion(input: CompletionInput): OrderCompletion {
  const t = input.allocation.totals;

  // GOODS — a live order owes every committed unit until it is SOLD; a
  // reserved unit is not delivered. A cancelled order owes no goods, but a
  // unit still reserved to it is unfinished business either way.
  let goodsOpen: boolean;
  let goodsWhy: string | null = null;
  if (input.cancelled) {
    goodsOpen = t.reservedQty > 0;
    if (goodsOpen) goodsWhy = `${t.reservedQty} unit(s) still reserved to a cancelled order`;
  } else {
    const undelivered = Math.max(0, t.committedQty - t.soldQty);
    goodsOpen = undelivered > 0;
    if (goodsOpen) goodsWhy = `${undelivered} of ${t.committedQty} committed unit(s) not delivered`;
  }

  // MONEY IN — outstanding survives delivery; UNKNOWN money never blocks
  // (a number nobody knows may not stand between a customer and completion —
  // the same rule the gates follow), but it is stated.
  const moneyInOpen = input.money.known && input.money.outstanding > 0;
  const moneyInWhy = moneyInOpen
    ? `RM ${input.money.outstanding.toFixed(2)} still owed by the customer`
    : null;

  // MONEY OUT — a requested refund is undecided; an approved one is a debt
  // until it is paid.
  const openRefunds = input.refunds.filter(
    (r) => r.status === "requested" || r.status === "approved",
  );
  const moneyOutOpen = openRefunds.length > 0;
  const moneyOutWhy = moneyOutOpen
    ? openRefunds.some((r) => r.status === "approved")
      ? "an approved refund is unpaid — Carres still owes the customer"
      : "a refund request is undecided"
    : null;

  // LOAN — recovery from the customer AND, for a supplier borrow, the return
  // to the supplier. Two separate facts; both must be clear.
  const unrecovered = input.loans.filter((l) => l.status === "on_loan").length;
  const unreturnedSupplier = input.loans.filter(
    (l) => l.source === "supplier" && l.returned_to_supplier_at == null,
  ).length;
  const loanOpen = unrecovered > 0 || unreturnedSupplier > 0;
  const loanWhy = loanOpen
    ? unrecovered > 0
      ? `${unrecovered} loan item(s) not recovered from the customer`
      : `${unreturnedSupplier} borrowed item(s) not returned to the supplier`
    : null;

  const tracks: CompletionTrack[] = [
    { key: "goods", open: goodsOpen, why: goodsWhy },
    { key: "money_in", open: moneyInOpen, why: moneyInWhy },
    { key: "money_out", open: moneyOutOpen, why: moneyOutWhy },
    { key: "loan", open: loanOpen, why: loanWhy },
  ];
  const openTracks = tracks.filter((x) => x.open).map((x) => x.key);
  return {
    noActionRequired: openTracks.length === 0,
    tracks,
    openTracks,
  };
}
