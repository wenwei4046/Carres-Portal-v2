import {
  deliveryOrderIssueGate,
  docNumber,
  myHolidaySet,
  orderActionDone,
  type DeliveryGroupKey,
} from "@carres/shared";
import { loadBookingContext } from "./booking-context";

/**
 * SLICE 2 · AUTOMATIC DELIVERY ORDER ISSUANCE
 * (`docs/cards/CARD-2026-08-16-order-route-implementation-plan.md`,
 * `docs/orders/MASTER.md` §8: "When every requirement is met the SYSTEM issues
 * the DO. There is no Release button, no Approve button and no manual bypass
 * in any state.")
 *
 * This is the ONE issuing path. The manual POST door, the booking-confirm
 * door, the finance-clear door and the stock-reserve doors all call it —
 * automation changed WHO triggers the act, never WHAT the act verifies
 * (`docs/delivery/MASTER.md`: issue still rechecks scope, goods, calendar and
 * the Finance hold atomically).
 *
 * WHAT IT KEEPS, deliberately:
 *   · **Idempotence.** An order that already carries a `do_number` gets that
 *     number back — a second number would be a second document for one trip.
 *     The mint writes only into an empty column (`.is("do_number", null)`), so
 *     two concurrent callers cannot produce two numbers; the loser re-reads
 *     the winner's.
 *   · **The LOCKED number scheme** — `docNumber`, `DO-DDMMYY-NNNN`, tail
 *     seeded on the ORDER id, date = the day it is issued (Jess 2026-07-19).
 *     A reprint reads the stored number and always matches the original.
 *   · **The gate** — `deliveryOrderIssueGate`, unchanged: confirmed date +
 *     slot, no Sunday, no Malaysian public holiday, goods reserved, and no
 *     OPEN Finance exception (decision A). A blocked order issues nothing and
 *     the reasons name what is still open.
 *
 * FAIL-SOFT AT EVERY HOOK. The doors that call this after their own act
 * (confirm / clear / reserve) treat any failure here as "not issued yet" —
 * an issuance hiccup must never undo or refuse the act the operator just
 * completed. The gate facts persist, so the next door's attempt (or the
 * manual POST backstop) issues it.
 */

export type DeliveryOrderAttempt =
  /** Minted now, by this call. */
  | { outcome: "issued"; doNumber: string }
  /** The order already carried its number (or a concurrent caller won). */
  | { outcome: "already"; doNumber: string | null }
  /** The gate refused; `reasons` name what is still open, actionably. */
  | { outcome: "blocked"; reasons: string[] }
  /** A read/write failed; the caller's fail-soft rule applies. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { outcome: "error"; body: any; status: any };

/** Today in MYT. The Worker's clock is UTC; between 16:00 and midnight UTC that
 *  is already tomorrow in Klang, and the document's DDMMYY segment means the
 *  day it was issued IN KLANG, not in Greenwich. */
export function todayIsoMYT(): string {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Issue this order's delivery order if — and only if — every requirement is
 * met. Pure function of the module facts it reads; stores nothing new.
 *
 * `sb` is the calling door's client: the operation doors pass the user's own
 * client (RLS enforced as before); the finance-clear door passes the admin
 * client because Finance may clear its exception but the SYSTEM — not the
 * finance user — writes the document (see `finance/exceptions.ts`).
 */
export async function attemptDeliveryOrderIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
): Promise<DeliveryOrderAttempt> {
  // The trip's scope is the one ALREADY booked (`booking_groups`), never a
  // caller's opinion: this issues the paper for the trip the customer
  // confirmed, and it does not get to decide what that trip carries.
  const first = await loadBookingContext(sb, orderId, null);
  if (!first.ok) return { outcome: "error", body: first.body, status: first.status };
  const bookedScope =
    (first.ctx.control?.booking_groups as DeliveryGroupKey[] | null) ?? null;
  const loaded = bookedScope
    ? await loadBookingContext(sb, orderId, bookedScope)
    : first;
  if (!loaded.ok)
    return { outcome: "error", body: loaded.body, status: loaded.status };
  const { order, control, gate } = loaded.ctx;

  // Already issued → the same number. Not an error: a second number would be a
  // second document for one trip.
  if (order.do_number) return { outcome: "already", doNumber: order.do_number };

  // ⭐ Decision A (owner ruling 2026-08-16) — the ONE money question left is
  // whether Finance opened an exception (0355). Read from the owning table,
  // never derived from a balance; the gate words the refusal itself through
  // the shared spelling.
  const { data: financeExceptions, error: feError } = await sb
    .from("order_finance_exceptions")
    .select("id, status, reason, opened_at, cleared_at, clear_evidence")
    .eq("order_id", orderId);
  if (feError) {
    return { outcome: "error", body: { message: feError.message }, status: 500 };
  }

  const issue = deliveryOrderIssueGate({
    bookingConfirmed: (control?.booking_stage as string | null) === "confirmed",
    confirmedDateIso: (control?.confirmed_date as string | null) ?? null,
    confirmedTimeSlot: (control?.confirmed_time_slot as string | null) ?? null,
    gate,
    financeExceptions: (financeExceptions ?? []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        status: row.status as "open" | "cleared",
        reason: row.reason as string,
        openedAt: (row.opened_at as string | null) ?? null,
        clearedAt: (row.cleared_at as string | null) ?? null,
        clearEvidence: (row.clear_evidence as string | null) ?? null,
      }),
    ),
    holidays: myHolidaySet(),
  });
  if (!issue.ok) return { outcome: "blocked", reasons: issue.reasons };

  // The document date is TODAY — the day it is issued and handed over, which is
  // what the locked scheme's DDMMYY segment means.
  const doNumber = docNumber({
    prefix: "DO",
    date: todayIsoMYT(),
    seed: order.id,
    digits: 4,
  });
  // `is("do_number", null)` makes the mint idempotent at the DATABASE, not just
  // in the read above: two callers arriving at the same moment cannot produce
  // two numbers, and the loser re-reads the winner's.
  const { data: updated, error } = await sb
    .from("orders")
    .update({ do_number: doNumber })
    .eq("id", orderId)
    .is("do_number", null)
    .select("id, do_number")
    .maybeSingle();
  if (error) {
    return { outcome: "error", body: { message: error.message }, status: 500 };
  }
  if (!updated) {
    const { data: raced } = await sb
      .from("orders")
      .select("id, do_number")
      .eq("id", orderId)
      .maybeSingle();
    return {
      outcome: "already",
      doNumber: (raced?.do_number as string | null) ?? null,
    };
  }

  // The audit line. FAIL-SOFT, the same door and the same rule as T4/T6/T8: an
  // annotation hiccup must never undo a document that has been issued.
  try {
    await sb.rpc("operation_add_annotation", {
      p_order_id: orderId,
      p_content: `${orderActionDone("issue_delivery_order")} — ${doNumber}`,
      p_tag: null,
    });
  } catch {
    // Recorded nowhere else is better than refusing a document that exists.
  }

  return { outcome: "issued", doNumber };
}
