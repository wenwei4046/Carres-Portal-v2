/**
 * C7 · The delivery order — the HARD gate (Jess 2026-07-27), re-ruled by the
 * owner 2026-08-19 (`docs/orders/MASTER.md` §8, SUPERSEDING 2026-08-16):
 *
 *   Money in full BEFORE delivery. That is the only default.
 *   outstanding = 0, OR an APPROVED Delivery Payment Approval covers the order
 *   AND no OPEN Finance exception — the exception record (0355) is NOT
 *   retired; it is the second blocker, not the only one.
 *
 * The 2026-08-16 "outstanding never blocks the DO" law is REVERSED on the
 * owner's own evidence: on 2026-08-19 an order was delivered with money
 * uncollected and no approval — exactly the exposure the old rule permitted.
 * Operation cannot proceed on its own word; the only exception is a recorded
 * approval, black and white in the system (`delivery-payment-approval.ts`,
 * 0362), which authorises COD on the owner's exact terms.
 *
 * WHAT THIS GATE STILL REFUSES — unchanged: a booking the customer has not
 * confirmed (date AND slot), a Sunday, a Malaysian public holiday, and goods
 * not reserved to this order. Paid alone never issues a DO — the date and
 * goods gates still hold (owner re-confirmed 2026-08-19: "已付清也要有 ETA
 * 才发 DO").
 *
 * THE MANUAL DOOR (`Request Delivery Order`, card §5): outstation trips need
 * the document BEFORE a customer-confirmed booking exists, because the partner
 * schedules the customer. `waitBookingConfirm: false` walks the SAME gate
 * minus only the booking-confirm requirement — goods, money and the Finance
 * exception still refuse, and a confirmed date landing on a Sunday or public
 * holiday still refuses. It is never a free-form create.
 *
 * AN UNKNOWN VALUE NEVER BLOCKS (§8's own law): `orderMoney` reads an unpriced
 * order's goods owing as 0, so `outstanding` here is only ever a figure
 * somebody actually knows.
 *
 * PURE — no clock, no I/O, no calendar of its own: the holiday set is
 * INJECTED, and the Finance exceptions and payment approvals are handed in as
 * rows the caller read from the one owning table each. Nothing here computes
 * an exception or an approval from a balance.
 */

import { isSundayIso, type BookingGateResult } from "./booking-gate";
import {
  financeExceptionReason,
  type FinanceException,
} from "./finance-exception";
import {
  paymentApprovalReason,
  type DeliveryPaymentApproval,
} from "./delivery-payment-approval";

export interface DeliveryOrderIssueInput {
  /** D1/0277 — the CUSTOMER confirmed (not the logistics company's word). */
  bookingConfirmed: boolean;
  /** The customer-confirmed date (ISO), when there is one. */
  confirmedDateIso: string | null;
  /** The customer-confirmed time slot. 0277's CHECK makes it ride the date, so
   *  a confirmed booking missing one is a row from before that migration. */
  confirmedTimeSlot: string | null;
  /** The goods answer AND the money figure, from the ONE shared reading of
   *  this order (`bookingConfirmGate` → `orderMoney`). `outstanding` is goods
   *  + add-ons + chargeable storage − paid: the §8 arithmetic, never a second
   *  one computed here. */
  gate: Pick<BookingGateResult, "goodsReady" | "notReadySkus" | "outstanding">;
  /** `order_finance_exceptions` (0355) — the rows for THIS order, read from
   *  the one owning table. An OPEN one refuses regardless of payment. */
  financeExceptions: ReadonlyArray<FinanceException>;
  /** `order_delivery_payment_approvals` (0362) — the rows for THIS order.
   *  Only an APPROVED one opens the money gate; pending and refused keep it
   *  shut. */
  paymentApprovals: ReadonlyArray<DeliveryPaymentApproval>;
  /** Malaysian public holidays, injected as ISO dates (`myHolidaySet()`). */
  holidays?: ReadonlySet<string> | readonly string[];
  /** The manual `Request Delivery Order` door (card §5) passes `false`: the
   *  booking-confirm requirement is the ONLY one it does not wait for.
   *  Default `true` — the automatic path requires the confirmed booking. */
  waitBookingConfirm?: boolean;
}

export interface DeliveryOrderIssueResult {
  ok: boolean;
  /** Why not, in the order an operator can act on them. Empty when `ok`. */
  reasons: string[];
}

function has(
  holidays: DeliveryOrderIssueInput["holidays"],
  iso: string,
): boolean {
  if (!holidays) return false;
  const day = iso.slice(0, 10);
  return holidays instanceof Set
    ? holidays.has(day)
    : Array.from(holidays as readonly string[]).includes(day);
}

/**
 * May this order's delivery order be issued?
 *
 * Every refusal names the thing that is missing AND what closes it, because a
 * gate that only states a fact leaves a new hire holding a phone and no idea
 * who to ring (COPY-STANDARD's error pattern). The Finance refusal names
 * Finance; the money refusal names the collection and the approval door.
 */
export function deliveryOrderIssueGate({
  bookingConfirmed,
  confirmedDateIso,
  confirmedTimeSlot,
  gate,
  financeExceptions,
  paymentApprovals,
  holidays,
  waitBookingConfirm = true,
}: DeliveryOrderIssueInput): DeliveryOrderIssueResult {
  const reasons: string[] = [];

  if (!bookingConfirmed || !confirmedDateIso || !confirmedTimeSlot) {
    if (waitBookingConfirm) {
      reasons.push(
        "The customer has not confirmed a delivery date and time slot yet — record the confirmation first.",
      );
    }
    // The manual door does not wait for the confirmation — but a date that
    // EXISTS is still checked below, so a Sunday cannot slip through it.
  }
  if (confirmedDateIso) {
    if (isSundayIso(confirmedDateIso)) {
      reasons.push("Sunday is not a delivery working day — pick another date");
    } else if (has(holidays, confirmedDateIso)) {
      reasons.push(
        "The confirmed date is a public holiday — pick another date with the customer.",
      );
    }
  }

  if (!gate.goodsReady) {
    reasons.push(
      gate.notReadySkus.length > 0
        ? `Goods not reserved to this order yet: ${gate.notReadySkus.join(", ")} — reserve them, or book a second trip.`
        : "Goods not reserved to this order yet — reserve them, or book a second trip.",
    );
  }

  // ⭐ THE MONEY GATE (owner ruling 2026-08-19). Money in full before delivery
  // is the only default; the one exception is a recorded APPROVED payment
  // approval. `paymentApprovalReason` is the shared spelling — this gate never
  // words the refusal for itself.
  const moneyReason = paymentApprovalReason(gate.outstanding, paymentApprovals);
  if (moneyReason) {
    reasons.push(moneyReason);
  }

  // The SECOND money blocker: an OPEN Finance exception refuses regardless of
  // payment — an approval does not clear a Finance judgement (0355 unchanged).
  const financeReason = financeExceptionReason(financeExceptions);
  if (financeReason) {
    reasons.push(financeReason);
  }

  return { ok: reasons.length === 0, reasons };
}
