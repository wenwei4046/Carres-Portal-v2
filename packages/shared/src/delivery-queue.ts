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
 * **confirm ≥3 working days before it** · deliver ON the customer's confirmed
 * date · photo same or next working day after delivery.
 *
 * ⚠️ THE CONFIRM LEAD WAS 1 AND THIS SENTENCE KEPT SAYING SO. SO V2 Card 3
 * (owner ruling 2026-08-11) moved the customer-call window to THREE actual
 * working days and migration 0342 moved the live
 * `logistics_call_working_days` setting with it; `DELIVERY_QUEUES` below was
 * updated and this header was not. A stale deadline in the one comment a
 * reader opens first is worse than no comment: it was read as current law
 * and reported as a conflict with the very ruling it predates. The queue
 * DATA is the truth — and the confirm lead alone is a SETTING, so the number
 * here is a seed, not the law.
 *
 * WORKING days, not calendar days — the Delivery calendar runs Mon–Sat and
 * pauses on the Selangor public holidays, so "3 days before Monday" is
 * Wednesday, not Friday. The math is delegated to `working-days.ts`; this
 * module does NOT reimplement it and takes the calendar by INJECTION — every
 * caller passes `deliveryWorkingDayOptions(cal)` (`delivery-working-calendar.ts`:
 * the stored Warehouse Selangor calendar, else the built-in list).
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
    // DEL-04 (Delivery MASTER §2.1, owner 2026-09-29 · confirmed 9 Oct 2026):
    // a SETTING — `Delivery Settings → Delivery Rules → Assign logistics by`
    // (0673). The number here is the seed used only where no settings row is
    // supplied. Its anchor is the Scheduled delivery, else the Requested one
    // (`assignLogisticsDueIso`); the PO issue day only OPENS the action.
    leadWorkingDays: 3,
    // CARD 3 (owner ruling 2026-08-13, Rule 1): "Assign Logistics early. The
    // purpose is capacity planning. Do NOT wait until stock is physically ready
    // before assigning logistics." The old wording here said "Stock is in
    // but..." — it described a gate the engine never had (`deliveryAction`
    // raises this step from order birth) and told the operator the opposite of
    // the rule. The DEADLINE is unchanged; only the sentence was wrong.
    // The deadline is the stored `Assign logistics by` (DEL-04), never a
    // hardcoded "under 3 working days away" (COPY "Stored deadline settings
    // words").
    description:
      "No logistics company is picked yet. Assign one as soon as the route is known, whether or not the goods are in. Late after the Assign logistics by date set in Delivery Settings, Delivery Rules",
  },
  {
    key: "chase",
    actionKey: "confirm_delivery_date",
    label: orderActionQueue("confirm_delivery_date"),
    anchor: "delivery_date",
    // P1: this ONE step's lead is a setting (`logistics_call_working_days`,
    // Purchasing → Settings). The number here is the seed, used only where no
    // settings row is supplied (tests). SO V2 CARD 3 (owner ruling 2026-08-11)
    // set the target call window to THREE actual working days before delivery
    // — migration 0342 moved the live setting and this seed together.
    // The three other steps are not settings: they are the shape of the work.
    leadWorkingDays: 3,
    description:
      "Logistics assigned but the customer has not confirmed a date + slot. Late once the promised date is the configured number of working days away",
  },
  {
    key: "deliver_today",
    actionKey: "deliver_today",
    label: orderActionQueue("deliver_today"),
    anchor: "confirmed_date",
    leadWorkingDays: 0,
    description: "The customer confirmed TODAY as the delivery day. It goes out today",
  },
  {
    key: "photo",
    actionKey: "upload_delivery_photo",
    label: orderActionQueue("upload_delivery_photo"),
    anchor: "delivered_at",
    leadWorkingDays: -1,
    description:
      "Delivered with no delivery photo attached yet. Late one working day after the delivery",
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
 * The step leads a SETTING may move. `chase` is the Contact lead (DEL-05, P1
 * §2: "days before the delivery date the logistics call is raised" — the
 * shared `logistics_call_working_days`); `assign` is the assignment lead
 * (DEL-04, Delivery Rules, 0673). `deliver_today` and `photo` are the shape
 * of the work, not a policy number. `assign` is optional so a caller that
 * read only the Contact lead keeps the seed for assignment.
 */
export interface DeliveryQueueLeads {
  chase: number;
  assign?: number;
}

/** Build the leads from the settings rows. One helper, so the Orders list,
 *  the Delivery module and the Work feed cannot read a setting two ways. */
export function deliveryQueueLeads(settings: {
  logisticsCallWorkingDays: number;
  /** `Delivery Settings → Delivery Rules → Assign logistics by` (0673). */
  assignmentLeadWorkingDays?: number | null;
}): DeliveryQueueLeads {
  const assign = settings.assignmentLeadWorkingDays;
  return {
    chase: Math.max(0, Math.trunc(settings.logisticsCallWorkingDays)),
    ...(typeof assign === "number" && Number.isFinite(assign) ? { assign: Math.max(0, Math.trunc(assign)) } : {}),
  };
}

function stepLeadWorkingDays(
  step: DeliveryQueueKey,
  leads: DeliveryQueueLeads | undefined,
): number {
  if (step === "chase" && leads) return leads.chase;
  if (step === "assign" && leads?.assign !== undefined) return leads.assign;
  return deliveryQueueByKey(step).leadWorkingDays;
}

/**
 * ⭐ ASSIGN LOGISTICS BY — the ONE assignment deadline (DEL-04, Delivery
 * MASTER §2.1, owner 2026-09-29 · confirmed 9 Oct 2026). The Work item, the
 * Logistics card, the Orders list and the Order Route all read THIS.
 *
 *   deadline = `assign` lead Delivery working days (`opts` =
 *              `deliveryWorkingDayOptions(cal)`: Mon–Sat minus the Delivery
 *              holidays) before the Scheduled delivery, else the Requested
 *              delivery.
 *
 * The opening trigger (the PO issue day, or the day a stock order entered
 * Operations — `openedIso`) is NOT the deadline. An order that opens inside
 * the cut-off is due the day it opens: the system never fabricates an earlier
 * staff omission. No customer date ⇒ null — the action stays visible with no
 * invented countdown.
 */
export function assignLogisticsDueIso(input: {
  scheduledIso?: string | null;
  requestedIso?: string | null;
  openedIso?: string | null;
  opts?: WorkingDayOptions;
  leads?: DeliveryQueueLeads;
}): IsoDate | null {
  const valid = (iso: string | null | undefined) => {
    const d = (iso ?? "").slice(0, 10);
    return ISO_DATE.test(d) ? d : null;
  };
  const anchor = valid(input.scheduledIso) ?? valid(input.requestedIso);
  if (!anchor) return null;
  const due = subtractWorkingDays(anchor, stepLeadWorkingDays("assign", input.leads), input.opts ?? {});
  const opened = valid(input.openedIso);
  return opened && opened > due ? opened : due;
}

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
  leads?: DeliveryQueueLeads,
): IsoDate | null {
  if (!anchorIso) return null;
  const anchor = anchorIso.slice(0, 10);
  if (!ISO_DATE.test(anchor)) return null;
  const leadWorkingDays = stepLeadWorkingDays(step, leads);
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
  leads?: DeliveryQueueLeads,
): boolean {
  const due = deliveryStepDueIso(step, anchorIso, opts, leads);
  if (!due || !todayIso) return false;
  return todayIso.slice(0, 10) > due;
}
