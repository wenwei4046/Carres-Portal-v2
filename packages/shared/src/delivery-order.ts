/**
 * C7 · The delivery order — the HARD gate (Jess 2026-07-27), corrected by the
 * owner ruling of 2026-08-16 ("decision A", `docs/orders/MASTER.md` §8):
 *
 *   outstanding money does not block the DO
 *   an OPEN Finance exception is the ONLY money blocker
 *   CLEARED removes the block
 *
 * WHAT THIS GATE STILL REFUSES — unchanged: a booking the customer has not
 * confirmed (date AND slot), a Sunday, a Malaysian public holiday, and goods
 * not reserved to this order. WHAT IT NO LONGER REFUSES: a balance. A customer
 * may owe any amount, of any age, and the paper still issues — collection runs
 * independently of the delivery, and the collect action survives it.
 *
 * THE ONE MONEY QUESTION LEFT is `financeExceptionHolds` — the same predicate
 * the action engine and the route canvas ask (`finance-exception.ts`, 0355).
 * One predicate, three readers, so the map, the worklist and this refusal can
 *  never disagree about an order (Architecture Law D). That discipline is why
 * decision B refused to ship the earlier split: a gate that counts requirements
 * the server does not is the screen telling a lie, in either direction.
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
 * exactly as `working-days.ts` takes it, and the Finance exceptions are handed
 * in as rows the caller read from the one owning table. Nothing here computes
 * an exception from a balance — that would rebuild the retired gate under a
 * new name.
 */

import { isSundayIso, type BookingGateResult } from "./booking-gate";
import {
  financeExceptionReason,
  type FinanceException,
} from "./finance-exception";

export interface DeliveryOrderIssueInput {
  /** D1/0277 — the CUSTOMER confirmed (not the logistics company's word). */
  bookingConfirmed: boolean;
  /** The customer-confirmed date (ISO), when there is one. */
  confirmedDateIso: string | null;
  /** The customer-confirmed time slot. 0277's CHECK makes it ride the date, so
   *  a confirmed booking missing one is a row from before that migration. */
  confirmedTimeSlot: string | null;
  /** The goods answer, from the ONE shared reading of this order. The money
   *  fields that used to ride beside it are gone from this gate on purpose —
   *  decision A retired them, and accepting-but-ignoring them would let a
   *  caller believe money still counts. */
  gate: Pick<BookingGateResult, "goodsReady" | "notReadySkus">;
  /** `order_finance_exceptions` (0355) — the rows for THIS order, read from
   *  the one owning table. Only an OPEN one refuses. */
  financeExceptions: ReadonlyArray<FinanceException>;
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

/**
 * May this order's delivery order be issued?
 *
 * Every refusal names the thing that is missing AND what closes it, because a
 * gate that only states a fact leaves a new hire holding a phone and no idea
 * who to ring (COPY-STANDARD's error pattern). The Finance refusal names
 * Finance, because Finance is the only party that can clear it.
 */
export function deliveryOrderIssueGate({
  bookingConfirmed,
  confirmedDateIso,
  confirmedTimeSlot,
  gate,
  financeExceptions,
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

  // ⭐ THE ONE MONEY BLOCKER (decision A). An outstanding balance never lands
  // here; only an explicit OPEN Finance exception does, and the sentence names
  // who clears it. `financeExceptionReason` is the shared spelling — this gate
  // never words the refusal for itself.
  const financeReason = financeExceptionReason(financeExceptions);
  if (financeReason) {
    reasons.push(financeReason);
  }

  return { ok: reasons.length === 0, reasons };
}
