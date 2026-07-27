/**
 * T7 · Delivery queues + auto-overdue (delivery execution queue, Jess 2026-07-27).
 *
 * The delivery lifecycle is FOUR real queues, not one blob of "delivery work":
 *
 *   Assign logistics → Confirm delivery date → Deliver today
 *   → Upload delivery photo
 *
 * The point of this module is the SECOND half of the card: **each step carries
 * its own deadline, so a queue item turns overdue BY ITSELF** — nobody has to
 * watch it. A row that is not assigned 3 working days before the customer's
 * date is late whether or not an operator opened the page that morning.
 *
 * Deadlines (L1, Jess): assign ≥3 working days before the promised date ·
 * confirm ≥1 working day before it · deliver ON the customer's confirmed date ·
 * photo same or next working day after delivery.
 *
 * WORKING days, not calendar days — Carres runs Mon–Sat and pauses on Selangor
 * public holidays, so "3 days before Monday" is Wednesday, not Friday. The math
 * is delegated to `working-days.ts` (already shipped with procurement
 * 2026-07-21); this module does NOT reimplement it and, like it, takes the
 * holiday set by INJECTION so the calendar stays editable data.
 *
 * PURE — no I/O, no clock. `todayIso` is always passed in, so a test can sit on
 * any date and the caller owns the timezone question (MYT for this business).
 *
 * `label` is the queue's word AND the action the NEXT column names (C-vocab
 * law, Jess 2026-07-19: a row sits in exactly the queue its action names, so
 * the counts match by construction — never a synonym between the two
 * surfaces). C1 (2026-07-27) moved the WORDS themselves into
 * `order-action-words.ts`: a queue word carries no party, and the row line that
 * names one (`Call NETS — confirm delivery date`) comes from the same module,
 * so a queue and a row can never spell the same action two ways.
 */

import {
  orderActionQueue,
  type OrderActionKey,
} from "./order-action-words";
import {
  addWorkingDays,
  subtractWorkingDays,
  type IsoDate,
  type WorkingDayOptions,
} from "./working-days";

export type DeliveryQueueKey = "assign" | "chase" | "deliver_today" | "photo";

/** Which date a step's deadline is measured from. */
export type DeliveryQueueAnchor = "delivery_date" | "confirmed_date" | "delivered_at";

export interface DeliveryQueueDef {
  key: DeliveryQueueKey;
  /** Which action this step is — the words live in `order-action-words.ts`. */
  actionKey: OrderActionKey;
  /** The queue row's label — the action's QUEUE word, so it carries no party. */
  label: string;
  /** Tooltip: what sits in the queue + when it turns late. */
  description: string;
  anchor: DeliveryQueueAnchor;
  /** Working days BEFORE the anchor the step is due (positive), AFTER it
   *  (negative), or 0 for "the anchor day itself". */
  leadWorkingDays: number;
}

export const DELIVERY_QUEUES: readonly DeliveryQueueDef[] = [
  {
    key: "assign",
    actionKey: "assign_logistics",
    label: orderActionQueue("assign_logistics"),
    anchor: "delivery_date",
    leadWorkingDays: 3,
    description:
      "Stock is in but no logistics company is picked yet — late once the customer's date is under 3 working days away",
  },
  {
    key: "chase",
    actionKey: "confirm_delivery_date",
    label: orderActionQueue("confirm_delivery_date"),
    anchor: "delivery_date",
    leadWorkingDays: 1,
    description:
      "Logistics assigned but the customer has not confirmed a date + slot — late once the promised date is 1 working day away",
  },
  {
    key: "deliver_today",
    actionKey: "deliver_today",
    label: orderActionQueue("deliver_today"),
    anchor: "confirmed_date",
    leadWorkingDays: 0,
    description: "The customer confirmed TODAY as the delivery day — it goes out today",
  },
  {
    key: "photo",
    actionKey: "upload_delivery_photo",
    label: orderActionQueue("upload_delivery_photo"),
    anchor: "delivered_at",
    leadWorkingDays: -1,
    description:
      "Delivered with no delivery photo attached yet — late one working day after the delivery",
  },
];

/** The four queue labels in lifecycle order — the DELIVERY facet renders these. */
export const DELIVERY_QUEUE_LABELS = DELIVERY_QUEUES.map((q) => q.label) as [
  string,
  ...string[],
];

/**
 * The step a queue word names, or null when the word is not a delivery step.
 *
 * The C-vocab law says a row sits in exactly the queue its action names, so
 * every surface that groups rows by queue does this same lookup. Naming it once
 * keeps the Orders list and the Delivery module reading ONE mapping instead of
 * one of them growing a synonym.
 */
export function deliveryQueueForLabel(label: string): DeliveryQueueDef | null {
  return DELIVERY_QUEUES.find((q) => q.label === label) ?? null;
}

export function deliveryQueueByKey(key: DeliveryQueueKey): DeliveryQueueDef {
  const def = DELIVERY_QUEUES.find((q) => q.key === key);
  // Unreachable for a typed key; throwing beats returning a silent wrong step.
  if (!def) throw new Error(`delivery-queue: unknown step "${key}"`);
  return def;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The step's OWN deadline — the last day it can be done without being late.
 *
 * `anchorIso` may be a date or a timestamp (`delivered_at` is a timestamp); only
 * the calendar-date part is used, because a deadline is a calendar fact. Returns
 * null when there is no anchor to measure from (TBD delivery date, no confirmed
 * date, not delivered yet) — a step with no anchor can never be late, which is
 * how a TBD order stays silent instead of crying wolf.
 */
export function deliveryStepDueIso(
  step: DeliveryQueueKey,
  anchorIso: string | null | undefined,
  opts: WorkingDayOptions = {},
): IsoDate | null {
  if (!anchorIso) return null;
  const anchor = anchorIso.slice(0, 10);
  if (!ISO_DATE.test(anchor)) return null;
  const { leadWorkingDays } = deliveryQueueByKey(step);
  if (leadWorkingDays === 0) return anchor;
  return leadWorkingDays > 0
    ? subtractWorkingDays(anchor, leadWorkingDays, opts)
    : addWorkingDays(anchor, -leadWorkingDays, opts);
}

/**
 * Has this step blown its own deadline? Strictly after the due date — a step due
 * TODAY is not late today (the operator still has the day to do it).
 */
export function deliveryStepOverdue(
  step: DeliveryQueueKey,
  anchorIso: string | null | undefined,
  todayIso: string,
  opts: WorkingDayOptions = {},
): boolean {
  const due = deliveryStepDueIso(step, anchorIso, opts);
  if (!due || !todayIso) return false;
  return todayIso.slice(0, 10) > due;
}
