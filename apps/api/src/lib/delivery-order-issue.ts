import {
  deliveryOrderIssueGate,
  myHolidaySet,
  orderActionDone,
  type DeliveryGroupKey,
} from "@carres/shared";
import { loadBookingContext } from "./booking-context";
import { todayIsoMYT } from "./today";

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
 *   · **The number** (owner ruling 2026-09-23, Delivery MASTER §3.1) is DRAWN
 *     by the database's one allocator (`delivery_document_number_draw`, 0575):
 *     `DO2609-4827` for Outright, `SDO2609-48271` for Subscription, random,
 *     unique across every order and never reused. A reprint reads the stored
 *     number and always matches the original.
 *   · **The gate** — `deliveryOrderIssueGate`: confirmed date + slot, no
 *     Sunday, no Malaysian public holiday, goods reserved, MONEY IN FULL or an
 *     APPROVED Delivery Payment Approval (owner ruling 2026-08-19, 0362), and
 *     no OPEN Finance exception (0355 — the second blocker). A blocked order
 *     issues nothing and the reasons name what is still open. The database
 *     asserts the money law again on the mint itself (0362's trigger), so no
 *     path around this module can issue an unapproved owing order's paper.
 *
 * FAIL-SOFT AT EVERY HOOK. The doors that call this after their own act
 * (confirm / clear / reserve) treat any failure here as "not issued yet" —
 * an issuance hiccup must never undo or refuse the act the operator just
 * completed. The gate facts persist, so the next door's attempt (or the
 * Request Delivery Order door) issues it.
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

export { todayIsoMYT };

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
  opts?: {
    /** The manual `Request Delivery Order` door (card §5, 2026-08-19): the
     *  SAME path and the SAME gates, minus only waiting for the customer's
     *  booking confirmation — outstation trips need the paper before the
     *  partner has scheduled the customer. Never a free-form create. */
    waitBookingConfirm?: boolean;
  },
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

  // ⭐ The two money questions (owner ruling 2026-08-19): the outstanding
  // figure against the approval record (0362), and Finance's exception (0355)
  // — each read from its one owning table, never derived from each other; the
  // gate words every refusal itself through the shared spellings.
  const [feRes, paRes] = await Promise.all([
    sb
      .from("order_finance_exceptions")
      .select("id, status, reason, opened_at, cleared_at, clear_evidence")
      .eq("order_id", orderId),
    sb
      .from("order_delivery_payment_approvals")
      .select("id, status, request_reason, requested_at, decided_at, decision_reason")
      .eq("order_id", orderId),
  ]);
  if (feRes.error) {
    return { outcome: "error", body: { message: feRes.error.message }, status: 500 };
  }
  if (paRes.error) {
    return { outcome: "error", body: { message: paRes.error.message }, status: 500 };
  }

  const issue = deliveryOrderIssueGate({
    bookingConfirmed: (control?.booking_stage as string | null) === "confirmed",
    confirmedDateIso: (control?.confirmed_date as string | null) ?? null,
    confirmedTimeSlot: (control?.confirmed_time_slot as string | null) ?? null,
    gate,
    financeExceptions: (feRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        status: row.status as "open" | "cleared",
        reason: row.reason as string,
        openedAt: (row.opened_at as string | null) ?? null,
        clearedAt: (row.cleared_at as string | null) ?? null,
        clearEvidence: (row.clear_evidence as string | null) ?? null,
      }),
    ),
    paymentApprovals: (paRes.data ?? []).map(
      (row: Record<string, unknown>) => ({
        id: row.id as string,
        status: row.status as "pending" | "approved" | "refused",
        requestReason: row.request_reason as string,
        requestedAt: (row.requested_at as string | null) ?? null,
        decidedAt: (row.decided_at as string | null) ?? null,
        decisionReason: (row.decision_reason as string | null) ?? null,
      }),
    ),
    holidays: myHolidaySet(),
    waitBookingConfirm: opts?.waitBookingConfirm ?? true,
  });
  if (!issue.ok) return { outcome: "blocked", reasons: issue.reasons };

  // The number is DRAWN, never derived (0575): the allocator picks the
  // business's prefix, redraws a clash and keeps every number forever. A
  // re-issued trip (rescheduled, redelivered) is a new document with a new
  // number; the old one keeps its own.
  const drawn = await drawDeliveryOrderNumber(sb, orderId);
  if (!drawn.ok) return { outcome: "error", body: drawn.body, status: drawn.status };
  const doNumber = drawn.doNumber;
  // 0542 · A SPLIT TRIP (the booking names its groups) mints through its own
  // governed door: the one-live index is keyed by trip, so an earlier trip
  // that already ran keeps its document and this trip gets its own.
  if (bookedScope) {
    const { data, error } = await sb.rpc("delivery_trip_document_mint", {
      p_order_id: orderId,
      p_do_number: doNumber,
    });
    if (error) return { outcome: "error", body: { message: error.message }, status: 500 };
    const minted = (data as { do_number?: string } | null)?.do_number ?? doNumber;
    if (minted !== doNumber) return { outcome: "already", doNumber: minted };
  } else {
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
  }

  // The audit line. FAIL-SOFT, the same door and the same rule as T4/T6/T8: an
  // annotation hiccup must never undo a document that has been issued.
  try {
    await sb.rpc("operation_add_annotation", {
      p_order_id: orderId,
      p_content:
        opts?.waitBookingConfirm === false
          ? `${orderActionDone("issue_delivery_order")} — ${doNumber} — on Request Delivery Order`
          : `${orderActionDone("issue_delivery_order")} — ${doNumber}`,
      p_tag: null,
    });
  } catch {
    // Recorded nowhere else is better than refusing a document that exists.
  }

  return { outcome: "issued", doNumber };
}

/**
 * 0491 · A JOURNEY LEG'S OWN DOCUMENT — the SAME issuing discipline, a
 * different scope (Delivery MASTER §3.1, §14.1). Leg 1 `Klang WH → JB
 * partner` and leg 2 `JB partner → Singapore customer` each carry their own
 * partner, agreed day, document, handover and result; the number is drawn
 * once and stored, so a reprint returns the same paper.
 *
 * The gate is the order's gate — money in full or an approved Delivery
 * Payment Approval, no OPEN Finance exception, goods reserved — read through
 * the ONE booking context; the leg's own readiness is its arrangement (0386):
 * a partner and an agreed day. The mint is the governed door
 * (`delivery_leg_document_mint`), never a direct insert; it also mirrors the
 * customer leg's number onto the order for the legacy readers.
 *
 * FAIL-SOFT AT EVERY HOOK, exactly as the whole-order path: the arrangement
 * save that called this keeps its record whatever happens here.
 */
export async function attemptLegDocumentIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
  leg: number,
): Promise<DeliveryOrderAttempt> {
  if (!Number.isInteger(leg) || leg < 1) {
    return { outcome: "blocked", reasons: ["A leg document names its leg"] };
  }
  const [orderRes, arrangementRes, existingRes] = await Promise.all([
    sb.from("orders").select("id, delivery_stops").eq("id", orderId).maybeSingle(),
    sb
      .from("ops_delivery_arrangements")
      .select("partner_id, partner_name:delivery_partners(name), confirmed_date, confirmed_time")
      .eq("order_id", orderId)
      .eq("leg", leg)
      .maybeSingle(),
    sb
      .from("ops_delivery_orders")
      .select("id, do_number, leg, voided_at")
      .eq("order_id", orderId),
  ]);
  if (orderRes.error) return { outcome: "error", body: { message: orderRes.error.message }, status: 500 };
  if (arrangementRes.error) return { outcome: "error", body: { message: arrangementRes.error.message }, status: 500 };
  if (existingRes.error) return { outcome: "error", body: { message: existingRes.error.message }, status: 500 };
  if (!orderRes.data) return { outcome: "error", body: { message: "Order not found" }, status: 404 };

  const stops = (orderRes.data.delivery_stops as Array<{ leg: number }> | null) ?? [];
  if (!stops.some((s) => Number(s.leg) === leg)) {
    return { outcome: "blocked", reasons: ["This leg is not on the order's Delivery Journey"] };
  }
  const live = ((existingRes.data ?? []) as Array<{ do_number: string; leg: number | null; voided_at: string | null }>)
    .find((d) => (d.leg ?? 0) === leg && !d.voided_at);
  if (live) return { outcome: "already", doNumber: live.do_number };

  const arrangement = arrangementRes.data as
    | { partner_id: string | null; confirmed_date: string | null; confirmed_time: string | null }
    | null;
  const reasons: string[] = [];
  if (!arrangement?.partner_id) reasons.push("Assign logistics for this leg");
  if (!arrangement?.confirmed_date) reasons.push("Confirm the delivery date for this leg");
  if (reasons.length > 0) return { outcome: "blocked", reasons };

  // The order's money and goods gate — ONE booking context, ONE gate (Law D).
  const loaded = await loadBookingContext(sb, orderId, null);
  if (!loaded.ok) return { outcome: "error", body: loaded.body, status: loaded.status };
  const [feRes, paRes] = await Promise.all([
    sb.from("order_finance_exceptions").select("id, status, reason, opened_at, cleared_at, clear_evidence").eq("order_id", orderId),
    sb.from("order_delivery_payment_approvals").select("id, status, request_reason, requested_at, decided_at, decision_reason").eq("order_id", orderId),
  ]);
  if (feRes.error) return { outcome: "error", body: { message: feRes.error.message }, status: 500 };
  if (paRes.error) return { outcome: "error", body: { message: paRes.error.message }, status: 500 };
  const issue = deliveryOrderIssueGate({
    bookingConfirmed: true,
    confirmedDateIso: arrangement!.confirmed_date,
    confirmedTimeSlot: arrangement!.confirmed_time ?? "Anytime",
    gate: loaded.ctx.gate,
    financeExceptions: (feRes.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      status: row.status as "open" | "cleared",
      reason: row.reason as string,
      openedAt: (row.opened_at as string | null) ?? null,
      clearedAt: (row.cleared_at as string | null) ?? null,
      clearEvidence: (row.clear_evidence as string | null) ?? null,
    })),
    paymentApprovals: (paRes.data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      status: row.status as "pending" | "approved" | "refused",
      requestReason: row.request_reason as string,
      requestedAt: (row.requested_at as string | null) ?? null,
      decidedAt: (row.decided_at as string | null) ?? null,
      decisionReason: (row.decision_reason as string | null) ?? null,
    })),
    holidays: myHolidaySet(),
    waitBookingConfirm: false,
  });
  if (!issue.ok) return { outcome: "blocked", reasons: issue.reasons };

  // The number is drawn by the one allocator (0575), exactly as the
  // whole-order path — never derived from the order or the leg.
  const drawn = await drawDeliveryOrderNumber(sb, orderId);
  if (!drawn.ok) return { outcome: "error", body: drawn.body, status: drawn.status };
  const doNumber = drawn.doNumber;

  const { data, error } = await sb.rpc("delivery_leg_document_mint", {
    p_order_id: orderId,
    p_leg: leg,
    p_do_number: doNumber,
  });
  if (error) return { outcome: "error", body: { message: error.message }, status: 500 };
  const minted = (data as { do_number?: string } | null)?.do_number ?? doNumber;
  return minted === doNumber ? { outcome: "issued", doNumber } : { outcome: "already", doNumber: minted };
}


/**
 * 0575 · Draw one Delivery Order number from the database's one allocator.
 * The allocator — not this module — decides the prefix from the order's
 * business, redraws a clash, keeps the number forever and refuses when a
 * month is used up (the width is fixed). Exported for the attach door.
 */
export async function drawDeliveryOrderNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: true; doNumber: string } | { ok: false; body: any; status: any }> {
  const { data, error } = await sb.rpc("delivery_document_number_draw", { p_order_id: orderId });
  if (error) return { ok: false, body: { message: error.message }, status: 500 };
  if (typeof data !== "string" || data.length === 0) {
    return { ok: false, body: { message: "No Delivery Order number was drawn" }, status: 500 };
  }
  return { ok: true, doNumber: data };
}
