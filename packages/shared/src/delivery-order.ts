/**
 * C7 · The delivery order — the HARD gate (Jess 2026-07-27).
 *
 * `docs/ORDERS-WORKING-FLOW.md` §5 is unambiguous about where the portal's real
 * refusal lives, and until this card the code had it one step early:
 *
 *   > **Issuing the delivery order is the hard gate**, not agreeing a date: a
 *   > date can be agreed with a customer while the goods and the money are
 *   > still coming.
 *
 * So this module is the gate that used to sit on `bookingConfirmGate`. It asks
 * ONE thing more than that gate does — *is this trip's paper allowed to exist?*
 * — and it asks it out of the SAME shared readings, never a second engine: the
 * goods answer and the money answer are `bookingConfirmGate`'s own fields, so
 * the confirm screen's warning and this refusal can never disagree about an
 * order. That mattered enough to be structural: C5 and C9 each found the same
 * number being read two ways by two surfaces, one card apart.
 *
 * WHY A DATE CHECK LIVES HERE TOO. §5 names Sunday and Malaysian public
 * holidays as the two hard calendar blocks. The confirm route already refuses a
 * Sunday, so nothing REGRESSES by keeping that there — but a booking made
 * before the holiday calendar knew about a date, or confirmed through an older
 * build, must not be able to put a truck on a day nobody runs. The document is
 * the last thing produced before the trip, so it is the right place to ask
 * again.
 *
 * PURE — no clock, no I/O, no calendar of its own: the holiday set is INJECTED,
 * exactly as `working-days.ts` takes it, so the calendar stays editable data
 * rather than a constant compiled into a gate.
 */

import { isSundayIso, type BookingGateResult } from "./booking-gate";

export interface DeliveryOrderIssueInput {
  /** D1/0277 — the CUSTOMER confirmed (not the logistics company's word). */
  bookingConfirmed: boolean;
  /** The customer-confirmed date (ISO), when there is one. */
  confirmedDateIso: string | null;
  /** The customer-confirmed time slot. 0277's CHECK makes it ride the date, so
   *  a confirmed booking missing one is a row from before that migration. */
  confirmedTimeSlot: string | null;
  /** The goods + money answers, from the ONE shared reading of this order. */
  gate: Pick<
    BookingGateResult,
    "goodsReady" | "notReadySkus" | "balanceReady" | "holding" | "storageOwing"
  >;
  /** Malaysian public holidays, injected as ISO dates (`myHolidaySet()`). */
  holidays?: ReadonlySet<string> | readonly string[];
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

/** Money as a plain sentence. RM with two decimals, as every other gate here. */
function rm(amount: number): string {
  return `RM ${amount.toFixed(2)}`;
}

/**
 * May this order's delivery order be issued?
 *
 * Every refusal names the thing that is missing AND what closes it, because a
 * gate that only states a fact leaves a new hire holding a phone and no idea
 * who to ring (COPY-STANDARD's error pattern).
 */
export function deliveryOrderIssueGate({
  bookingConfirmed,
  confirmedDateIso,
  confirmedTimeSlot,
  gate,
  holidays,
}: DeliveryOrderIssueInput): DeliveryOrderIssueResult {
  const reasons: string[] = [];

  if (!bookingConfirmed || !confirmedDateIso || !confirmedTimeSlot) {
    reasons.push(
      "The customer has not confirmed a delivery date and time slot yet — record the confirmation first.",
    );
  } else if (isSundayIso(confirmedDateIso)) {
    reasons.push("Sunday is not a delivery working day — pick another date");
  } else if (has(holidays, confirmedDateIso)) {
    reasons.push(
      "The confirmed date is a public holiday — pick another date with the customer.",
    );
  }

  if (!gate.goodsReady) {
    reasons.push(
      gate.notReadySkus.length > 0
        ? `Goods not reserved to this order yet: ${gate.notReadySkus.join(", ")} — reserve them, or book a second trip.`
        : "Goods not reserved to this order yet — reserve them, or book a second trip.",
    );
  }

  if (!gate.balanceReady) {
    // C9's split, kept: say WHICH money is missing. "RM 150 outstanding" on an
    // order the customer paid in full sends an operator hunting the wrong thing.
    const goods = gate.holding - gate.storageOwing;
    reasons.push(
      goods > 0 && gate.storageOwing > 0
        ? `${rm(goods)} outstanding and ${rm(gate.storageOwing)} of storage fee not collected — collect both before the delivery order is issued.`
        : gate.storageOwing > 0
          ? `Storage fee of ${rm(gate.storageOwing)} not collected — collect it, or a manager releases the delivery.`
          : `${rm(gate.holding)} outstanding — collect it before the delivery order is issued.`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}
