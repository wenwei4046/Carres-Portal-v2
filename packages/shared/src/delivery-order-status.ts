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
 * `Out for delivery` (slice 1 of the §4 chain, 0363): a DO whose goods are
 * **Received by Logistics** and not yet resulted derives it. Ready for
 * Handover alone does NOT; Handed Over alone does NOT — Logistics receipt is
 * the fact that puts the goods on the road (§4: receipt is not delivery).
 * It is still never derived from the calendar — a departure nobody recorded
 * is not a fact (§2.5: no step nobody records).
 *
 * A FAILED TRIP KEEPS ITS EXCEPTION FOREVER (owner ruling 2026-08-16): the
 * latest attempt against THIS number governs; a rebooked trip is a NEW
 * document, so nothing here ever rewrites an exception into Delivered — and
 * any recorded RESULT outranks the handover derivation.
 */

import { deliveryReasonByKey } from "./delivery-reasons";

export type DeliveryOrderStatusKind =
  | "created"
  | "out_for_delivery"
  | "arrived"
  | "delivered"
  | "exception"
  | "cancelled";

/** The operator words — capsule pill text on the register and object page.
 *  Registered in docs/STATUS-STANDARD.md / docs/COPY-STANDARD.md; no internal
 *  enum reaches a screen (COPY-STANDARD 2026-08-15).
 *
 *  `Arrived` (【DELIVERY】 CARD 20, 2026-09-13): an INTERMEDIATE Journey leg's
 *  document whose goods reached the named partner warehouse. `Delivered` is
 *  reserved for goods that reached the CUSTOMER (Delivery MASTER §14.1 — leg 1
 *  completion never means the customer received them). */
export const DELIVERY_ORDER_STATUS_LABEL: Record<DeliveryOrderStatusKind, string> = {
  created: "Created",
  out_for_delivery: "Out for delivery",
  arrived: "Arrived",
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

/** The §4 chain facts (0363) — kinds only; the arithmetic needs nothing more. */
export type DeliveryHandoverKind =
  | "ready_for_handover"
  | "handed_over"
  | "received_by_logistics";

export interface DeliveryOrderStatusInput {
  /** `ops_delivery_orders.voided_at` (0356). */
  voidedAt: string | null;
  /** `ops_delivery_orders.void_reason`. */
  voidReason: "order_cancelled" | "rescheduled" | null;
  /** The attempts recorded against THIS document's number (0344). */
  attempts: ReadonlyArray<DeliveryOrderAttemptFact>;
  /** The handover facts recorded on THIS document (0363). */
  handoverEvents: ReadonlyArray<{ kind: DeliveryHandoverKind }>;
  /** 0491 — true when this document is a Journey leg BEFORE the last one: its
   *  `delivered` result is an ARRIVAL at the named partner warehouse, and the
   *  customer leg still owes its own result. Absent = a whole-order document
   *  or the customer leg. */
  intermediateLeg?: boolean;
  /** The intermediate leg's named stop (`JB transit warehouse`) — line two of
   *  `Arrived`. */
  legStop?: string | null;
}

export interface DeliveryOrderStatus {
  kind: DeliveryOrderStatusKind;
  /** The pill word. */
  label: string;
  /** The exception's ONE reason in the library's own words; null otherwise. */
  reasonLabel: string | null;
  /** `Arrived` only: the partner warehouse the goods reached; null otherwise. */
  stop: string | null;
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
      stop: null,
    };
  }

  const latest = [...input.attempts].sort((a, b) =>
    a.recordedAt.localeCompare(b.recordedAt),
  )[input.attempts.length - 1];

  if (!latest) {
    // §4 slice 1 (0363): only LOGISTICS RECEIPT puts the goods on the road.
    // Ready for Handover / Handed Over alone derive nothing new — and a
    // recorded result (the branches below) always outranks this derivation.
    const received = input.handoverEvents.some(
      (e) => e.kind === "received_by_logistics",
    );
    if (received) {
      return {
        kind: "out_for_delivery",
        label: DELIVERY_ORDER_STATUS_LABEL.out_for_delivery,
        reasonLabel: null,
        stop: null,
      };
    }
    return { kind: "created", label: DELIVERY_ORDER_STATUS_LABEL.created, reasonLabel: null, stop: null };
  }

  if (latest.result === "delivered") {
    /* An intermediate Journey leg's success is an ARRIVAL at the named partner
       warehouse (0491/0496 store it as the leg's `delivered` result, moving no
       Unit). `Delivered` is the customer's word and stays with the customer
       leg — Delivery MASTER §14.1, ERP-ARCHITECTURE §3.5.1. */
    if (input.intermediateLeg) {
      return {
        kind: "arrived",
        label: DELIVERY_ORDER_STATUS_LABEL.arrived,
        reasonLabel: null,
        stop: input.legStop?.trim() || null,
      };
    }
    return { kind: "delivered", label: DELIVERY_ORDER_STATUS_LABEL.delivered, reasonLabel: null, stop: null };
  }

  // partial and failed are both the document's ONE exception + one reason
  // (§7's rule: one Exception plus a Reason, never a family of failure words).
  return {
    kind: "exception",
    label: DELIVERY_ORDER_STATUS_LABEL.exception,
    reasonLabel: deliveryReasonByKey(latest.reasonKey)?.label ?? null,
    stop: null,
  };
}
