/**
 * DELIVERY WORK STATUS — what an operator needs to DO about a scope, which is
 * not what the document is called.
 *
 * Owner correction 2026-08-24: Delivery Work was printing the DOCUMENT status
 * (`Created · Out for delivery · Delivered · Delivery exception`). `Created` is
 * a true fact about a piece of paper and a useless one on a planning screen —
 * it tells the operator that a document exists, never whether the warehouse has
 * the goods ready or whether anyone has agreed a day with the customer. Two
 * scopes reading `Created` can be a week apart in real work.
 *
 * So the two vocabularies are now deliberately separate and each keeps its own
 * home:
 *
 * ```
 * Delivery Orders Register   the DOCUMENT's own life
 *                            Created · Out for delivery · Delivered ·
 *                            Delivery exception · Cancelled
 *
 * Delivery Work              the OPERATION's progress
 *                            Waiting for customer date · Delivery confirmed ·
 *                            Waiting for warehouse · Ready for handover ·
 *                            Out for delivery · Delivered · Failed Delivery
 * ```
 *
 * `Created` may never appear in Delivery Work, and the operational words may
 * never appear in the Register. They are not synonyms and they are not ranks of
 * the same thing: one describes a document, the other describes a job.
 *
 * ── THE LADDER READS DOWNWARDS, AND THE LATEST REAL FACT WINS ───────────────
 *
 * Every rung is a FACT somebody recorded, never a guess from the calendar:
 *
 * ```
 * a recorded failure          → Failed Delivery
 * a recorded delivery         → Delivered
 * logistics signed for goods  → Out for delivery     (0363 received_by_logistics)
 * warehouse says goods ready  → Ready for handover   (0363 ready_for_handover)
 * a document exists           → Waiting for warehouse
 * a day is agreed             → Delivery confirmed
 * nothing agreed yet          → Waiting for customer date
 * ```
 *
 * A cancelled document drops the scope off the workspace entirely, so there is
 * no operational word for it — Delivery Work lists work that still has to
 * happen, and a voided trip has none.
 *
 * PURE: no clock, no I/O. `Date passed` / `Overdue` is a RAIL question about
 * today's date and is answered in the page's own module, deliberately not here
 * — a status is what happened, never what time it is.
 */

import type { DeliveryHandoverKind, DeliveryOrderAttemptFact } from "./delivery-order-status";
import { deliveryReasonByKey } from "./delivery-reasons";

export type DeliveryWorkStatusKind =
  | "waiting_customer_date"
  | "confirmed"
  | "waiting_warehouse"
  | "ready_for_handover"
  | "out_for_delivery"
  | "delivered"
  | "failed";

/**
 * ⭐ THE ONLY SPELLINGS. COPY-STANDARD owns these words; nothing may print a
 * synonym beside them. `Pending`, `In progress`, `Scheduled`, `Booked`,
 * `Awaiting` and `Created` are all banned here — the first four name a mood and
 * the fifth belongs to the document.
 */
export const DELIVERY_WORK_STATUS_LABEL: Record<DeliveryWorkStatusKind, string> = {
  waiting_customer_date: "Waiting for customer date",
  confirmed: "Delivery confirmed",
  waiting_warehouse: "Waiting for warehouse",
  ready_for_handover: "Ready for handover",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Failed Delivery",
};

export interface DeliveryWorkStatus {
  kind: DeliveryWorkStatusKind;
  label: string;
  /** A failure's ONE reason, in the reason library's own words. */
  reasonLabel: string | null;
}

export interface DeliveryWorkStatusInput {
  /** Delivery's own agreed operational date for this scope. */
  confirmedDate: string | null;
  /** Whether a live (non-void) Delivery Order exists for this scope. */
  hasDeliveryOrder: boolean;
  /** The §4 handover facts recorded on that document (0363). */
  handoverEvents: ReadonlyArray<{ kind: DeliveryHandoverKind }>;
  /** The delivery attempts recorded against it (0344). */
  attempts: ReadonlyArray<DeliveryOrderAttemptFact>;
}

/**
 * ONE arithmetic (Architecture Law D). The rail counts, the column and any
 * future report all call this — a second copy is how two surfaces start
 * disagreeing about whether a truck went out.
 */
export function deliveryWorkStatusOf(input: DeliveryWorkStatusInput): DeliveryWorkStatus {
  const say = (kind: DeliveryWorkStatusKind, reasonLabel: string | null = null) => ({
    kind,
    label: DELIVERY_WORK_STATUS_LABEL[kind],
    reasonLabel,
  });

  /* A RECORDED RESULT OUTRANKS EVERY DERIVATION — the DO model's own rule, and
     it holds here for the same reason: somebody was there. */
  const latest = [...input.attempts].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[
    input.attempts.length - 1
  ];
  if (latest) {
    if (latest.result === "delivered") return say("delivered");
    /* `partial` and `failed` are both ONE Failed Delivery carrying ONE reason
       (§7's rule) — never a family of failure words. */
    return say("failed", deliveryReasonByKey(latest.reasonKey)?.label ?? null);
  }

  const has = (kind: DeliveryHandoverKind) => input.handoverEvents.some((e) => e.kind === kind);
  /* Only the LOGISTICS RECEIPT puts goods on the road (0363 slice 1). Handed
     Over without a receipt is the warehouse's half of a handshake nobody has
     answered, so it stays `Ready for handover` and does not claim a departure. */
  if (has("received_by_logistics")) return say("out_for_delivery");
  if (has("ready_for_handover") || has("handed_over")) return say("ready_for_handover");

  /* The document exists and nothing physical has happened: the job is with the
     Warehouse. This is the rung `Created` used to occupy, and it names the
     owner instead of the paper. */
  if (input.hasDeliveryOrder) return say("waiting_warehouse");

  if (input.confirmedDate) return say("confirmed");
  return say("waiting_customer_date");
}
