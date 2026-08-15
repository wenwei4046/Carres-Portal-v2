/**
 * CARD 9 — UNIFIED WORK ENGINE (owner ruling 2026-08-11, docs/orders/MASTER.md).
 *
 *   MODULES = TRUTH · WORK = ACTION · ISSUE TRACKER = ACCOUNTABILITY
 *
 * Work reads authoritative module facts and translates them into
 * **WHO + ACTION + ACTUAL WORKING DAY**. It owns no duplicate transaction
 * form and no free-standing completion status:
 *
 *   · Every rule in the engine names its FIVE PARTS — Trigger · Owner ·
 *     Action · Due rule · Completion fact. **If it cannot name an
 *     authoritative completion fact, it does not enter the engine** — the
 *     registry below is typed data and a test refuses an empty fact.
 *   · There is NO Done button for system work: an item leaves the set when
 *     its owning module records the completion fact, because the engines
 *     recompute from facts (V1's best idea, kept whole — ERP-ARCHITECTURE §4).
 *   · A HUMAN FOLLOW-UP is a different thing: explicitly created, labelled
 *     human, explicitly completable (`ops_tasks`). It never becomes module
 *     truth and it is NOT in this registry.
 *
 * This module does NOT re-derive any trigger (Law D): the per-module engines
 * (`order-actions` · `purchasing-supplier-calls` · `po-receiving` ·
 * `supplier-claim`) own WHAT is open. This module owns the COMPOSITION —
 * owner words, the due through the ONE shipped clock for each key, the
 * weekday+date spelling, and working-days-late. Late work keeps its ORIGINAL
 * due date; nothing here manufactures a `follow up` / `check` / `monitor`
 * duplicate.
 */

import { collectionClock } from "./collection-clock";
import { deliveryStepDueIso, type DeliveryQueueLeads } from "./delivery-queue";
import { orderActionDueIso, OFFICE_OFF_DAYS } from "./order-action-due";
import type { OrderOpenAction } from "./order-actions";
import { orderActionQueue, type OrderActionKey } from "./order-action-words";
import { countWorkingDays, type IsoDate, type WorkingDayOptions } from "./working-days";

// ─── The rule registry — five parts, or no entry ─────────────────────────────

export interface WorkRule {
  key: string;
  module: "orders" | "purchasing" | "receiving" | "claims";
  /** ① when the item exists — the owning engine's trigger, in words. */
  trigger: string;
  /** ② who — a rule, never a stored owner field (§2.2). */
  owner: string;
  /** ③ the act, named by the ONE word module for its surface. */
  action: string;
  /** ④ when it is due, and on WHICH calendar. */
  dueRule: string;
  /** ⑤ the authoritative fact that closes it. NEVER a tick-box. */
  completionFact: string;
}

/** Order-track rules — the keys `order-actions.ts` can raise. */
export const ORDER_WORK_RULES: readonly WorkRule[] = [
  {
    key: "issue_po",
    module: "orders",
    trigger: "no purchase order covers these goods (goodsUnordered)",
    owner: "the order's PIC (ops_order_control.assigned_staff)",
    action: orderActionQueue("issue_po"),
    dueRule:
      "the purchasing engine's order-by date (PO days · production days · buffer) — computed on Batch Purchase, not here",
    completionFact: "a purchase order covers the demand (purchase_orders via the engine's netting)",
  },
  {
    key: "confirm_ready_date",
    module: "orders",
    trigger: "goods on order, no standing supplier ready/arrival promise",
    owner: "the order's PIC",
    action: orderActionQueue("confirm_ready_date"),
    dueRule:
      "the purchasing calls calendar (customer date − buffer on the OFFICE week − production on the FACTORY week)",
    completionFact: "a standing supplier promise on the ledger (po_supplier_promises)",
  },
  {
    key: "delay_planning",
    module: "orders",
    trigger: "the supplier's date overshoots the promised date and nobody decided about THIS date",
    owner: "the order's PIC",
    action: orderActionQueue("delay_planning"),
    dueRule: "2 working days from delay_detected_at, OFFICE calendar",
    completionFact: "a decision recorded about this supplier date (delay_decision + delay_decision_eta, 0304)",
  },
  {
    key: "arrange_new_delivery_date",
    module: "orders",
    trigger: "the decision is 'new_date' and no reachable booking exists",
    owner: "the order's PIC",
    action: orderActionQueue("arrange_new_delivery_date"),
    dueRule: "the SAME office working day as delay_decision_at",
    completionFact: "a customer-confirmed date + slot on/after the supplier's ready date (0277)",
  },
  {
    key: "assign_logistics",
    module: "orders",
    trigger: "the order needs delivering and no company is chosen",
    owner: "the order's PIC",
    action: orderActionQueue("assign_logistics"),
    dueRule: "3 working days before the promised date, delivery week + MY holidays",
    completionFact: "a company recorded (orders.delivery_partners / ops_assigned_logistic)",
  },
  {
    key: "confirm_delivery_date",
    module: "orders",
    trigger: "logistics assigned, customer has not confirmed date + slot",
    owner: "the order's PIC",
    action: orderActionQueue("confirm_delivery_date"),
    dueRule:
      "logistics_call_working_days (3 — Card 3's ruling) before the promised date, delivery week + MY holidays",
    completionFact: "a customer-confirmed date AND slot with evidence (booking_stage='confirmed', 0277)",
  },
  {
    key: "issue_delivery_order",
    module: "orders",
    trigger: "date + slot confirmed · core goods ready · money passed · DO not issued",
    owner: "the order's PIC",
    action: orderActionQueue("issue_delivery_order"),
    dueRule:
      "1 working day before the confirmed date (logistics ask for the DO the evening before) — the collection clock's own due arithmetic",
    completionFact: "the document exists (orders.do_number)",
  },
  {
    key: "deliver_today",
    module: "orders",
    trigger: "the confirmed date is today and nothing has been delivered",
    owner: "the order's PIC",
    action: orderActionQueue("deliver_today"),
    dueRule: "the confirmed date itself",
    completionFact:
      "a delivery attempt with its result (delivery_attempts, 0344) — Delivered, or one Exception with its reason",
  },
  {
    key: "upload_delivery_photo",
    module: "orders",
    trigger: "delivered with no photo on file",
    owner: "the order's PIC",
    action: orderActionQueue("upload_delivery_photo"),
    dueRule: "1 working day after the delivery, delivery week + MY holidays",
    completionFact: "a photo in the ledger (ops_order_control.delivery_photos, 0280)",
  },
  {
    key: "collect",
    module: "orders",
    trigger: "outstanding > RM 0 — and it survives delivery",
    owner: "the order's PIC",
    action: orderActionQueue("collect"),
    dueRule:
      "T−1 working day before the delivery (confirmed, else promised) — the Card 4 collection clock; T−3/T−2 attention",
    completionFact: "outstanding = RM 0 through the one money arithmetic (orderMoney over orders.paid)",
  },
];

/** Cross-module rules — registered so the five-part discipline covers every
 *  engine; their items render on their own surfaces (the CALLS calendar, the
 *  Receiving rail, the Claims queue) and join the composed feed when their
 *  server feeds are wired (Card 9's recorded boundary). */
export const MODULE_WORK_RULES: readonly WorkRule[] = [
  {
    key: "purchasing.confirm_ready_date",
    module: "purchasing",
    trigger: "an open PO owing goods with no standing ready/arrival promise",
    owner: "the month's PO-duty holder (ops_po_duty; buddy cover by the Orders pool's absence law)",
    action: "Confirm ready date",
    dueRule: "customer date − buffer (OFFICE week) − production (FACTORY week)",
    completionFact: "a standing promise row (po_supplier_promises)",
  },
  {
    key: "purchasing.confirm_tomorrows_delivery",
    module: "purchasing",
    trigger: "the expected arrival is tomorrow",
    owner: "the month's PO-duty holder",
    action: "Confirm tomorrow's delivery",
    dueRule: "the office working day before the arrival",
    completionFact: "a tomorrow_delivery promise about that day (po_supplier_promises)",
  },
  {
    key: "purchasing.confirm_balance_delivery_date",
    module: "purchasing",
    trigger: "a short delivery left a PO line owing goods",
    owner: "the month's PO-duty holder",
    action: "Confirm balance delivery date",
    dueRule: "opens with the short receipt; the calls calendar files it",
    completionFact: "a balance promise for the line (po_supplier_promises)",
  },
  {
    key: "receiving.check_in",
    module: "receiving",
    trigger: "goods have an arrival promise and no posted Receiving Session covers them",
    // `offset−1` used to stand here with no direction, and it was read
    // backwards where it mattered. The rota reaches FORWARD: GRN duty for a
    // month is the NEXT month's `ops_po_duty` row (`grnDutyMonth`) — see
    // `purchasing/MASTER.md` §2.2, whose table is the evidence.
    owner: "the month's GRN-duty holder (ops_po_duty, the FOLLOWING month; never the PO holder)",
    action: "Check in",
    dueRule: "the promised arrival day",
    completionFact: "a posted Receiving Session (warehouse_receipts + receiving_events 'posted')",
  },
  {
    key: "claims.confirm_what_happens_next",
    module: "claims",
    trigger: "a claim has the supplier's answer and no Carres resolution",
    owner: "the PO-duty holder of the month the claim was OPENED — forever",
    action: "Confirm what happens next",
    dueRule: "no clock yet — the claims queue lists it until resolved",
    completionFact: "customer_resolution recorded (supplier_claims, 0324)",
  },
];

export const WORK_RULES: readonly WorkRule[] = [
  ...ORDER_WORK_RULES,
  ...MODULE_WORK_RULES,
];

// ─── The composed work item ──────────────────────────────────────────────────

export interface WorkItem {
  ruleKey: string;
  module: WorkRule["module"];
  /** The order's SO ref — the context a row opens into. */
  soRef: string;
  orderId: string;
  action: string;
  /** WHO — the PIC's name when the roster names one, else the honest gap. */
  ownerName: string | null;
  tone: OrderOpenAction["tone"];
  locked: boolean;
  broken: boolean;
  /** The ACTUAL working day, ISO. Null = this step has no anchor yet. */
  dueIso: IsoDate | null;
  /** Working days past the ORIGINAL due (0 = not late). The due never moves. */
  workingDaysLate: number;
}

/*
 * `workDayLabel` is DELETED (THE YEAR RULE, owner ruling 2026-08-15), and with
 * it `WorkItem.dueLabel` and `WorkDayGroup.label`.
 *
 * It was a FIFTH date spelling, and every property of it was wrong once the
 * rule was written down. It reached for `toLocaleDateString`, which
 * COPY-STANDARD bans outright. It dropped the comma, so a Work row and a
 * Register cell named one day two ways. And it printed NO year, ever — which
 * looks identical to the new rule until the work is due in another year, at
 * which point the heading hides the single fact that makes it urgent.
 *
 * The fix is the one this repository already made when it deleted `dayWord()`:
 * **a business engine hands its caller DAYS and no words.** `WorkDayGroup`
 * carries `dayIso` (null = the anchorless group) and the screen spells it
 * through the one formatter. There is nothing left here for a date to be
 * spelled wrongly in.
 */

// ─── Card 10 — the surface's grouping, one rule ──────────────────────────────

export interface WorkDayGroup<T extends WorkItem = WorkItem> {
  /** ISO day, or null for the no-anchor group (always LAST). The screen
   *  spells it — `fmtDate(dayIso)`, or the ruled words `No date` when null. */
  dayIso: IsoDate | null;
  items: T[];
  late: number;
}

/**
 * Group a composed work set by ACTUAL WORKING DATE — the shape both My Work
 * and Team Work render (they are two FILTERS over one set, so the grouping
 * lives here, once). Days ascend; within a day, broken first, then locked,
 * then by SO. Anchorless items close the list under `No date` — a step with
 * no anchor can never be late, and it must not hide among dated work.
 */
export function groupWorkItemsByDay<T extends WorkItem>(
  items: readonly T[],
): WorkDayGroup<T>[] {
  const byDay = new Map<string, T[]>();
  const dateless: T[] = [];
  for (const i of items) {
    if (!i.dueIso) {
      dateless.push(i);
      continue;
    }
    const arr = byDay.get(i.dueIso) ?? byDay.set(i.dueIso, []).get(i.dueIso)!;
    arr.push(i);
  }
  const rank = (i: T) => (i.broken ? 0 : i.locked ? 1 : 2);
  const sortItems = (arr: T[]) =>
    [...arr].sort((a, b) => rank(a) - rank(b) || a.soRef.localeCompare(b.soRef));
  const groups: WorkDayGroup<T>[] = [...byDay.keys()].sort().map((day) => {
    const arr = sortItems(byDay.get(day)!);
    return {
      dayIso: day,
      items: arr,
      late: arr.filter((i) => i.workingDaysLate > 0).length,
    };
  });
  if (dateless.length > 0) {
    groups.push({
      dayIso: null,
      items: sortItems(dateless),
      late: 0,
    });
  }
  return groups;
}

export interface OrderWorkContext {
  orderId: string;
  so: number;
  /** The PIC — §2.2: the PIC owns EVERY action of the order. */
  picName: string | null;
  /** Anchors the clocks read. */
  promisedDateIso: string | null;
  confirmedDateIso: string | null;
  deliveredAtIso: string | null;
  delayDetectedAtIso: string | null;
  delayDecisionAtIso: string | null;
}

/**
 * Compose one order's OPEN actions (the engine's Layer-1 output — never
 * re-derived here) into work items with owner + actual working day.
 * `opts` carries the holiday set; `leads` the Card 3 call-window setting.
 */
export function workItemsForOrder(
  open: readonly OrderOpenAction[],
  ctx: OrderWorkContext,
  todayIso: string,
  opts: WorkingDayOptions = {},
  leads?: DeliveryQueueLeads,
): WorkItem[] {
  const officeOpts: WorkingDayOptions = { ...opts, offDays: OFFICE_OFF_DAYS };
  const dueOf = (key: OrderActionKey): IsoDate | null => {
    switch (key) {
      case "assign_logistics":
        return deliveryStepDueIso("assign", ctx.promisedDateIso, opts);
      case "confirm_delivery_date":
        return deliveryStepDueIso("chase", ctx.promisedDateIso, opts, leads);
      case "deliver_today":
        return deliveryStepDueIso("deliver_today", ctx.confirmedDateIso, opts);
      case "upload_delivery_photo":
        return deliveryStepDueIso("photo", ctx.deliveredAtIso, opts);
      case "delay_planning":
        return orderActionDueIso("delay_planning", ctx.delayDetectedAtIso, opts.holidays);
      case "arrange_new_delivery_date":
        return orderActionDueIso(
          "arrange_new_delivery_date",
          ctx.delayDecisionAtIso,
          opts.holidays,
        );
      case "collect":
      case "issue_delivery_order":
        // Both deadlines exist for the same reason: logistics ask for the DO
        // the evening before, and the DO door refuses while money holds — ONE
        // arithmetic (the Card 4 clock), two consumers.
        return collectionClock(
          {
            confirmedDateIso: ctx.confirmedDateIso,
            promisedDateIso: ctx.promisedDateIso,
          },
          todayIso,
          opts,
        ).dueIso;
      default:
        // issue_po / confirm_ready_date: the purchasing engine owns those
        // clocks on its own surfaces — a second spelling here is the defect.
        return null;
    }
  };

  return open.map((a) => {
    const dueIso = dueOf(a.key);
    const today = todayIso.slice(0, 10);
    const late =
      dueIso && today > dueIso
        ? countWorkingDays(
            dueIso,
            today,
            a.key === "delay_planning" || a.key === "arrange_new_delivery_date"
              ? officeOpts
              : opts,
          )
        : 0;
    return {
      ruleKey: a.key,
      module: "orders" as const,
      soRef: `SO-${ctx.so}`,
      orderId: ctx.orderId,
      action: orderActionQueue(a.key),
      ownerName: ctx.picName,
      tone: a.tone,
      locked: !!a.locked,
      broken: !!a.broken,
      dueIso,
      workingDaysLate: late,
    };
  });
}
