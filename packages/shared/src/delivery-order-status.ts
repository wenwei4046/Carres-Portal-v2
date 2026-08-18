/**
 * Delivery Order DOCUMENT status — ONE arithmetic (Architecture Law D).
 *
 * The blueprint card (2026-08-16) rules the register's status set:
 *
 *   Created → Out for delivery → Delivered, plus Delivery exception
 *   (+ Cancelled, the void stamp — an order cancellation or a system
 *    reschedule voids a document; staff never do)
 *
 * NOTHING IS STORED. The status is derived from the facts the modules already
 * own: the void stamp on the DO row (0356) and the append-only
 * `delivery_attempts` history (0344) matched to this document's number. A
 * stored status a second writer could contradict is the retired
 * `payment_status` defect — see docs/orders/MASTER.md §8.
 *
 * KNOWN BOUNDARY, reported not hidden (the canvas's own "no `In transit` is
 * invented" rule): `Out for delivery` is registered vocabulary, but no fact
 * records the warehouse→logistics handover today (docs/delivery/MASTER.md §4's
 * chain is approved target, not built). Until that fact exists this arithmetic
 * never returns it — a status derived from "the date is today" would claim a
 * departure nobody recorded (§2.5: no step nobody records).
 *
 * A FAILED TRIP KEEPS ITS EXCEPTION FOREVER (owner ruling 2026-08-16): the
 * latest attempt against THIS number governs; a rebooked trip is a NEW
 * document, so nothing here ever rewrites an exception into Delivered.
 */

import { deliveryReasonByKey } from "./delivery-reasons";

export type DeliveryOrderStatusKind =
  | "created"
  | "out_for_delivery"
  | "delivered"
  | "exception"
  | "cancelled";

/** The operator words — capsule pill text on the register and object page.
 *  Registered in docs/STATUS-STANDARD.md / docs/COPY-STANDARD.md; no internal
 *  enum reaches a screen (COPY-STANDARD 2026-08-15). */
export const DELIVERY_ORDER_STATUS_LABEL: Record<DeliveryOrderStatusKind, string> = {
  created: "Created",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Delivery exception",
  cancelled: "Cancelled",
};

export interface DeliveryOrderAttemptFact {
  /** `delivery_attempts.result` (0344). */
  result: "delivered" | "partial" | "failed";
  /** T4 Reason Library key, when the result carries one. */
  reasonKey: string | null;
  /** ISO stamp — used only to find the LATEST attempt. */
  recordedAt: string;
}

export interface DeliveryOrderStatusInput {
  /** `ops_delivery_orders.voided_at` (0356). */
  voidedAt: string | null;
  /** `ops_delivery_orders.void_reason`. */
  voidReason: "order_cancelled" | "rescheduled" | null;
  /** The attempts recorded against THIS document's number (0344). */
  attempts: ReadonlyArray<DeliveryOrderAttemptFact>;
}

export interface DeliveryOrderStatus {
  kind: DeliveryOrderStatusKind;
  /** The pill word. */
  label: string;
  /** The exception's ONE reason in the library's own words; null otherwise. */
  reasonLabel: string | null;
}

export function deliveryOrderStatusOf(
  input: DeliveryOrderStatusInput,
): DeliveryOrderStatus {
  if (input.voidedAt) {
    return {
      kind: "cancelled",
      label: DELIVERY_ORDER_STATUS_LABEL.cancelled,
      reasonLabel:
        input.voidReason === "order_cancelled"
          ? "Order cancelled"
          : input.voidReason === "rescheduled"
            ? "Rescheduled"
            : null,
    };
  }

  const latest = [...input.attempts].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt),
  )[input.attempts.length - 1];

  if (!latest) {
    return { kind: "created", label: DELIVERY_ORDER_STATUS_LABEL.created, reasonLabel: null };
  }

  if (latest.result === "delivered") {
    return { kind: "delivered", label: DELIVERY_ORDER_STATUS_LABEL.delivered, reasonLabel: null };
  }

  // partial and failed are both the document's ONE exception + one reason
  // (§7's rule: one Exception plus a Reason, never a family of failure words).
  return {
    kind: "exception",
    label: DELIVERY_ORDER_STATUS_LABEL.exception,
    reasonLabel: deliveryReasonByKey(latest.reasonKey)?.label ?? null,
  };
}
