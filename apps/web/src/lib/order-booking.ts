/**
 * T10 — the order list row → booking adapter.
 *
 * ONE place turns a list row into the four booking fields, so every surface
 * that asks "when is this order's truck moving" asks the SAME question of the
 * SAME columns: the Orders list Delivery column (`logisticStateOf`) and the
 * right-rail delivery calendar. The rule itself lives in `@carres/shared`
 * (`bookingDayOf`) — this file only unwraps PostgREST's embed shape and hands
 * the fields over. Nothing here decides anything.
 *
 * Why an adapter at all: `ops_order_control` arrives as an object OR a
 * one-element array depending on how PostgREST resolves the relation, and a
 * second copy of that unwrap is exactly how two screens start disagreeing.
 */

import { bookingDayOf, scheduledDeliveryOf, type BookingDay, type BookingRead } from "@carres/shared";
import type { operationOrderListRow, opsRemarkEmbed } from "./queries";

/** The 1:1 `ops_order_control` overlay, whichever shape PostgREST returned. */
export function orderControlOf(
  o: Pick<operationOrderListRow, "ops_order_control">,
): opsRemarkEmbed | null | undefined {
  const raw = o.ops_order_control;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** The four D1 booking fields (0277), named. The customer's confirmed day is
 *  `scheduledDeliveryOf`'s one precedence (document, then Delivery's own
 *  arrangement, then the legacy booking) — the drawer's Delivery card and the
 *  Monitor read the same rule, so a day Delivery confirmed is never "not
 *  confirmed" here just because the legacy overlay was never touched. */
export function orderBookingRead(
  o: Pick<operationOrderListRow, "ops_order_control"> &
    Partial<Pick<operationOrderListRow, "ops_delivery_orders" | "ops_delivery_arrangements">>,
): BookingRead {
  const ovl = orderControlOf(o);
  const booking: BookingRead = {
    stage: ovl?.booking_stage ?? null,
    confirmedDate: ovl?.confirmed_date ?? null,
    confirmedSlot: ovl?.confirmed_time_slot ?? null,
    provisionalDate: ovl?.logistic_eta ?? null,
  };
  const doc = o.ops_delivery_orders?.find((d) => (d.leg ?? 0) === 0 && !d.voided_at);
  const arrangement = o.ops_delivery_arrangements?.find((a) => (a.leg ?? 0) === 0);
  const scheduled = scheduledDeliveryOf({
    document: doc ? { deliveryDate: doc.delivery_date, timeSlot: doc.time_slot } : null,
    arrangement: arrangement
      ? { confirmedDate: arrangement.confirmed_date, confirmedTime: arrangement.confirmed_time }
      : null,
    booking,
  });
  if (scheduled.iso && scheduled.source !== "booking") {
    return { ...booking, stage: "confirmed", confirmedDate: scheduled.iso, confirmedSlot: scheduled.time };
  }
  return booking;
}

/** Which day this order's truck sits on, and how solid that day is. */
export function orderBookingDay(
  o: Parameters<typeof orderBookingRead>[0],
): BookingDay {
  return bookingDayOf(orderBookingRead(o));
}
