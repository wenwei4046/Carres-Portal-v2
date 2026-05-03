import {
  PROCEED_BLOCKER_LABEL,
  type Order,
  type ProceedBlocker,
  type ProceedBlockerCode,
} from "@carres/shared";

/**
 * Client-side mirror of the `proceed_order` RPC validation. Returns the
 * full list of blockers preventing this order from moving Place→Proceed.
 *
 * Used in three places:
 *   1. Dashboard — kanban card hint ("⚠ Customer name" first blocker).
 *   2. Orders list — row status (ready / N pending).
 *   3. Order detail — action panel showing all blockers + disabled Proceed.
 *
 * Server enforces the same rules. The client copy exists so the wizard +
 * detail UIs can pre-disable the button without a round-trip on every
 * keystroke.
 *
 * Mirrors `reference/proto/store.jsx proceedBlockers` + the SQL in
 * `supabase/migrations/0008_proceed_order_rpc.sql`.
 */
export function proceedBlockers(o: Order): ProceedBlocker[] {
  const blockers: ProceedBlocker[] = [];

  if (!o.customer.name?.trim()) {
    blockers.push({ code: "customer_name_required", message: PROCEED_BLOCKER_LABEL.customer_name_required });
  }
  if (!o.customer.phone?.trim()) {
    blockers.push({ code: "customer_phone_required", message: PROCEED_BLOCKER_LABEL.customer_phone_required });
  }
  if (o.customer.addressUnknown || !o.customer.address?.trim()) {
    blockers.push({ code: "delivery_address_required", message: PROCEED_BLOCKER_LABEL.delivery_address_required });
  }
  if (o.delivery.dateTbd || !o.delivery.date) {
    blockers.push({ code: "delivery_date_required", message: PROCEED_BLOCKER_LABEL.delivery_date_required });
  }
  if (!o.signatureUrl) {
    blockers.push({ code: "signature_required", message: PROCEED_BLOCKER_LABEL.signature_required });
  }
  if (!o.termsAccepted) {
    blockers.push({ code: "terms_not_accepted", message: PROCEED_BLOCKER_LABEL.terms_not_accepted });
  }
  // Defense-in-depth: detail-shape Order responses (pre-2C.1a) didn't include
  // totalAmount. Fall back to summing the embedded lines/addons so the client
  // gating doesn't false-positive "Order pricing" the way the action panel
  // did before the server fix shipped.
  const total =
    typeof o.totalAmount === "number"
      ? o.totalAmount
      : (o.lines?.reduce((s, l) => s + l.unitPrice * l.qty, 0) ?? 0) +
        (o.addons?.reduce((s, a) => s + a.unitPrice * a.qty, 0) ?? 0);

  if (total <= 0) {
    blockers.push({ code: "total_amount_missing", message: PROCEED_BLOCKER_LABEL.total_amount_missing });
  } else {
    const pct = Math.round((o.paid / total) * 100);
    if (pct < 50) {
      blockers.push({
        code: "payment_below_50",
        // Override default label with dynamic %, matching proto's prompt copy.
        message: `Payment ≥50% (now ${pct}%)`,
      });
    }
  }

  return blockers;
}

/** Convenience for the simple "is this Place order ready?" boolean check
 *  used by Dashboard kanban cards and the Orders list row badge. */
export function isProceedReady(o: Order): boolean {
  return o.status === "place" && proceedBlockers(o).length === 0;
}

export type { ProceedBlocker, ProceedBlockerCode };
