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
import type { WorkspaceDutyResolution } from "./workspace-duty";

// ─── The rule registry — five parts, or no entry ─────────────────────────────

/**
 * The STRUCTURED Owner Rule (§0.1 Action Owner Engine · §2.2 three identities,
 * built 2026-08-27 — this closes the "registry does not yet carry separate
 * Owner Rule and Display Owner fields" approved-target gap). The `owner` prose
 * stays as documentation; THIS key is what the composition resolves:
 *
 *   po_duty        the effective PO Duty resolution from Workspace
 *   salesperson    the order's responsible salesperson (missing customer
 *                  promise — §0.1 row 1); a name, not an ops account
 *   order_pic      the order's PIC — the customer-relationship owner, and the
 *                  governed proxy where the named rule's roster does not exist
 *                  yet (ACTION-FLOW Law 4 rung 2's own reasoning: a task owned
 *                  by a party with no login is one nobody can see or close)
 *   payment_duty   the effective Payment Duty resolution from Workspace;
 *                  unresolved fails closed and never borrows the order PIC
 *   payment_approver  the effective Payment Approver resolution from Workspace
 *                  — §12 gives void, reallocation and overpayment review to
 *                  this duty and to nobody else; unresolved fails closed
 *   delivery_duty  governed Delivery ownership — no delivery-staff roster
 *                  fact exists; the duty word stands (measured-boundary rule)
 *   finance_duty   only Finance clears it — no roster fact; the word stands
 *   system         never a person's work
 */
export type WorkOwnerRule =
  | "po_duty"
  | "salesperson"
  | "order_pic"
  | "payment_duty"
  | "payment_approver_duty"
  | "delivery_duty"
  | "finance_duty"
  | "system"
  /* The cross-module rules' own precise keys — recorded now so the later
   * feed wiring cannot misresolve a month (their feeds are not composed by
   * `workItemsForOrder`; Card 9's recorded boundary): */
  | "grn_duty" // the effective GRN Duty resolution from Workspace
  | "claim_month_po_duty" // the holder of the month the claim was OPENED — forever
  | "purchasing_approver";

export interface WorkRule {
  key: string;
  module: "orders" | "purchasing" | "receiving" | "claims" | "delivery" | "payment";
  /** ① when the item exists — the owning engine's trigger, in words. */
  trigger: string;
  /** ② who — the rule in words, never a stored owner field (§2.2). */
  owner: string;
  /** ②′ who — the STRUCTURED rule the composition resolves (§0.1). */
  ownerRule: WorkOwnerRule;
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
    owner:
      "the effective PO Duty holder from Workspace; dated Buddy cover changes who acts without changing the normal owner",
    ownerRule: "po_duty",
    action: orderActionQueue("issue_po"),
    dueRule:
      "the purchasing engine's order-by date (PO days · production days · buffer) — computed on Batch Purchase, not here",
    completionFact: "a purchase order covers the demand (purchase_orders via the engine's netting)",
  },
  {
    key: "confirm_ready_date",
    module: "orders",
    trigger: "goods on order, no standing supplier ready/arrival promise",
    owner:
      "the current PO Duty — the supplier conversation is Purchasing's (§0.1: supplier date too late → current PO Duty contacts supplier). The purchasing rule below already named this owner; the order track now agrees (Law D)",
    ownerRule: "po_duty",
    action: orderActionQueue("confirm_ready_date"),
    dueRule:
      "the purchasing calls calendar (customer date − buffer on the OFFICE week − production on the FACTORY week)",
    completionFact: "a standing supplier promise on the ledger (po_supplier_promises)",
  },
  {
    key: "delay_planning",
    module: "orders",
    trigger: "the supplier's date overshoots the promised date and nobody decided about THIS date",
    owner:
      "the order's PIC — the decision is about the CUSTOMER commitment, not the supplier chase (which is PO Duty's, above)",
    ownerRule: "order_pic",
    action: orderActionQueue("delay_planning"),
    dueRule: "2 working days from delay_detected_at, OFFICE calendar",
    completionFact: "a decision recorded about this supplier date (delay_decision + delay_decision_eta, 0304)",
  },
  {
    key: "arrange_new_delivery_date",
    module: "delivery",
    trigger: "the decision is 'new_date' and no reachable booking exists",
    owner:
      "the order's PIC as governed proxy (§0.1: customer date/time confirmation → assigned Partner or governed proxy owner; ACTION-FLOW Law 4 rung 2 — the conversation is logistics', the ACTION in this portal is ours, and a partner has no login to close it)",
    ownerRule: "order_pic",
    action: orderActionQueue("arrange_new_delivery_date"),
    dueRule: "the SAME office working day as delay_decision_at",
    completionFact: "a customer-confirmed date + slot on/after the supplier's ready date (0277)",
  },
  {
    key: "assign_logistics",
    module: "delivery",
    trigger: "the order needs delivering and no company is chosen",
    owner:
      "the order's PIC as governed proxy — no delivery-staff roster fact exists (0363 records none), and choosing the company is an operations act on the order",
    ownerRule: "order_pic",
    action: orderActionQueue("assign_logistics"),
    dueRule: "3 working days before the promised date, delivery week + MY holidays",
    completionFact: "a company recorded (orders.delivery_partners / ops_assigned_logistic)",
  },
  {
    key: "confirm_delivery_date",
    module: "delivery",
    trigger: "logistics assigned, customer has not confirmed date + slot",
    owner:
      "the order's PIC as governed proxy (§0.1: assigned Partner or governed proxy owner — the partner has no login, so the closable action is ours; the action line already names the partner)",
    ownerRule: "order_pic",
    action: orderActionQueue("confirm_delivery_date"),
    dueRule:
      "logistics_call_working_days (3 — Card 3's ruling) before the promised date, delivery week + MY holidays",
    completionFact: "a customer-confirmed date AND slot with evidence (booking_stage='confirmed', 0277)",
  },
  {
    key: "issue_delivery_order",
    module: "orders",
    // SLICE 2 (owner ruling, `docs/orders/MASTER.md` §8): "money passed" left
    // this trigger with decision A, and the PIC left the owner slot with
    // automation — when every requirement holds, the SYSTEM issues the
    // document at the door that completed the gate (booking confirm · stock
    // reserve · finance clear). No Release button, no Approve button, no
    // manual bypass. The rule stays registered because the five-part
    // discipline covers every completion fact the engines read — but it is
    // never raised as a person's work (`order-actions.ts` stopped asking).
    trigger:
      "date + slot confirmed · core goods ready · no OPEN Finance exception · DO not issued",
    owner: "the SYSTEM — issued automatically the moment the last requirement lands",
    ownerRule: "system",
    action: orderActionQueue("issue_delivery_order"),
    dueRule:
      "immediate — the same act that completes the gate issues the document",
    completionFact: "the document exists (orders.do_number)",
  },
  {
    key: "deliver_today",
    module: "delivery",
    trigger: "the confirmed date is today and nothing has been delivered",
    owner:
      "the order's PIC as governed proxy — Delivery ownership has no staff roster fact yet; the PIC watches today's run reach its result",
    ownerRule: "order_pic",
    action: orderActionQueue("deliver_today"),
    dueRule: "the confirmed date itself",
    completionFact:
      "a delivery attempt with its result (delivery_attempts, 0344) — Delivered, or one Exception with its reason",
  },
  {
    key: "upload_delivery_photo",
    module: "delivery",
    trigger: "delivered with no photo on file",
    owner:
      "the order's PIC — the proof arrives on the order's own WhatsApp thread; filing it is the relationship owner's act",
    ownerRule: "order_pic",
    action: orderActionQueue("upload_delivery_photo"),
    dueRule: "1 working day after the delivery, delivery week + MY holidays",
    completionFact: "a photo in the ledger (ops_order_control.delivery_photos, 0280)",
  },
  {
    key: "collect",
    module: "orders",
    trigger: "outstanding > RM 0 with goods ready or arrival confirmed; collection survives delivery",
    owner:
      "the effective Payment Duty holder from Workspace; unresolved fails closed and never borrows the order PIC",
    ownerRule: "payment_duty",
    action: orderActionQueue("collect"),
    dueRule:
      "T−2 working days before the delivery (confirmed, else promised) — the collection clock, deadline re-ruled 2026-08-19 (logistics takes the DO at T−1); T−3 attention",
    completionFact: "outstanding = RM 0 through the one money arithmetic (orderMoney over orders.paid)",
  },
  // ── The blueprint card's two NEW acts (owner-approved 2026-08-16, §7) ──
  {
    key: "collect_loan_item",
    module: "delivery",
    trigger: "a loan item is still out (ops_sofa_loans, on_loan) and the delivery day has arrived",
    owner:
      "Delivery staff (blueprint card owner rule) — no delivery-staff roster fact exists yet, so no person resolves and the duty word stands (the canvas's measured-boundary rule)",
    ownerRule: "delivery_duty",
    action: orderActionQueue("collect_loan_item"),
    dueRule: "the delivery day itself (confirmed date, else the recorded delivery)",
    completionFact: "the loan row reads returned (ops_sofa_loans.status, 0209/0217)",
  },
  {
    key: "resolve_payment_exception",
    module: "orders",
    trigger: "an OPEN Finance exception holds the delivery (order_finance_exceptions, 0355)",
    owner:
      "the Finance owner (blueprint card owner rule) — only Finance clears it; no finance roster fact exists yet, so no person resolves and the duty word stands",
    ownerRule: "finance_duty",
    action: orderActionQueue("resolve_payment_exception"),
    dueRule: "immediately — an open exception is holding a delivery today",
    completionFact: "the exception reads cleared, with its evidence (order_finance_exceptions.status)",
  },
  // ── §0.1 Action Owner Engine row 1 (owner ruling 2026-08-20), composed
  //    2026-08-27: the missing customer promise is the SALESPERSON's work. ──
  {
    key: "ask_delivery_date",
    module: "orders",
    trigger:
      "no Requested Delivery Date and the customer was never asked — delivery_date null AND delivery_date_tbd false (the 3, never the 8; owner ruling 2026-08-15). Composed by the Work feed only; the ladder never raises it, so no register row or drawer headline changes",
    owner:
      "the responsible salesperson (§0.1 — missing customer promise). A name from the order's own Sales ownership, not an ops account; the register's hover guidance already names the same person (one arithmetic)",
    ownerRule: "salesperson",
    action: orderActionQueue("ask_delivery_date"),
    dueRule:
      "no clock — nothing anchors it (the entry gate stops new orders arriving dateless, so these are legacy rows); it lists under No date until the answer is recorded",
    completionFact:
      "a Requested Delivery Date recorded, or the customer's own 'not yet' recorded (orders.delivery_date / delivery_date_tbd through the governed date door, 0219-era ConfirmDateModal path)",
  },
];

/** Cross-module rules — registered so the five-part discipline covers every
 *  engine; their items render on their own surfaces (the CALLS calendar, the
 *  Receiving rail, the Claims queue) and join the composed feed when their
 *  server feeds are wired (Card 9's recorded boundary). */
export const MODULE_WORK_RULES: readonly WorkRule[] = [
  {
    key: "manual_purchase.approve",
    module: "purchasing",
    trigger: "a Manual Purchase request requires a decision and has none",
    owner: "the configured Purchasing approver duty holder",
    ownerRule: "purchasing_approver",
    action: "Approve purchase",
    dueRule: "no later than the request's Order By date on the OFFICE calendar",
    completionFact: "a stored approval or refusal decision on the purchase request",
  },
  {
    key: "manual_purchase.issue_po",
    module: "purchasing",
    trigger: "approved Manual Purchase demand remains uncovered or its current PO version has not reached the supplier",
    owner: "the effective PO Duty holder from Workspace; Buddy cover may act without replacing normal ownership",
    ownerRule: "po_duty",
    action: "Issue PO",
    dueRule: "no later than the request's Order By date on the OFFICE calendar",
    completionFact: "confirmed-sent evidence for every linked current PO version (po_sends)",
  },
  {
    key: "purchasing.confirm_ready_date",
    module: "purchasing",
    trigger: "an open PO owing goods with no standing ready/arrival promise",
    owner: "the effective PO Duty holder from Workspace; Buddy cover may act without replacing normal ownership",
    ownerRule: "po_duty",
    action: "Confirm ready date",
    dueRule: "customer date − buffer (OFFICE week) − production (FACTORY week)",
    completionFact: "a standing promise row (po_supplier_promises)",
  },
  {
    key: "payment.collect_customer_balance",
    module: "payment",
    trigger: "an issued invoice has an outstanding balance, goods are ready or arrival is known, and the collection window is due or late",
    owner: "the effective Payment Duty holder from Workspace; Buddy cover may act without replacing normal ownership",
    ownerRule: "payment_duty",
    action: "Ask the customer to pay",
    dueRule: "the shared collection clock: two working days before confirmed delivery, else requested delivery",
    completionFact: "the invoice/order outstanding balance is RM 0 after an atomic recorded payment allocation",
  },
  {
    /* §10 row: `Overpaid/unallocated money | Payment Approver | Review RM
     * {amount} | allocated/classified`. Both endings are authority's own and
     * neither invents a word: ALLOCATED is §5's "allocate valid obligation"
     * (the 0450 correction door), CLASSIFIED is the exceptional refund §13
     * already allows — "never AUTO-create Customer Credit or Refund" forbids
     * the automatic kind, not the decided one. No Customer Credit exists
     * anywhere, so none is implied here. */
    key: "payment.review_overpayment",
    module: "payment",
    trigger: "an order holds more money than its live obligations ask for, and no approved refund covers the excess",
    owner: "the effective Payment Approver duty holder from Workspace (§12: void, reallocation, overpayment review)",
    ownerRule: "payment_approver_duty",
    action: "Review RM {amount}",
    dueRule: "opens with the overpayment; §10 gives this row no clock",
    completionFact: "the order's overpaid figure is RM 0 after allocation, or an approved refund covers it (order_refunds)",
  },
  {
    /* §10 row 2 — the SAME act with a should-have-been-done state. It is its
     * own registry entry because its TRIGGER and its CLOCK are different: the
     * customer named a day, that day passed, and the money is still owed. The
     * due date is the promise, not the delivery window, so "late" counts from
     * the day the customer chose. One invoice raises this OR the window item,
     * never both — the promise replaces the window once it is broken. */
    key: "payment.missed_promise",
    module: "payment",
    trigger: "the customer promised to pay on a named day, that day has passed and the balance is still outstanding",
    owner: "the effective Payment Duty holder from Workspace; Buddy cover may act without replacing normal ownership",
    ownerRule: "payment_duty",
    action: "Ask the customer to pay",
    dueRule: "the day the customer promised, on the OFFICE calendar",
    completionFact: "the invoice/order outstanding balance is RM 0 after an atomic recorded payment allocation",
  },
  {
    key: "purchasing.supplier_reply",
    module: "purchasing",
    trigger: "the current PO version was sent and the supplier has not confirmed its delivery date",
    owner: "the effective PO Duty holder from Workspace; Buddy cover may act without replacing normal ownership",
    ownerRule: "po_duty",
    action: "Ask the supplier to confirm the PO delivery date",
    dueRule: "the Malaysia calendar day the current PO version was first confirmed sent, moved only to the next OFFICE working day",
    completionFact: "an evidenced supplier answer for the exact current PO version, including channel, recipient, reporter, recorder and times",
  },
  {
    key: "purchasing.supplier_date_passed",
    module: "purchasing",
    trigger: "the evidenced supplier delivery date passed while the PO still has goods owing",
    owner: "the effective PO Duty holder from Workspace; Buddy cover may act without replacing normal ownership",
    ownerRule: "po_duty",
    action: "Ask the supplier when the goods will arrive",
    dueRule: "the supplier delivery date, moved only to the next OFFICE working day when it falls on an office closure",
    completionFact: "a new evidenced supplier answer and governed delivery date for the exact current PO version",
  },
  {
    key: "purchasing.confirm_tomorrows_delivery",
    module: "purchasing",
    trigger: "the expected arrival is tomorrow",
    owner: "the month's PO-duty holder",
    ownerRule: "po_duty",
    action: "Confirm tomorrow's delivery",
    dueRule: "the office working day before the arrival",
    completionFact: "a tomorrow_delivery promise about that day (po_supplier_promises)",
  },
  {
    key: "purchasing.confirm_balance_delivery_date",
    module: "purchasing",
    trigger: "a short delivery left a PO line owing goods",
    owner: "the month's PO-duty holder",
    ownerRule: "po_duty",
    action: "Confirm balance delivery date",
    dueRule: "opens with the short receipt; the calls calendar files it",
    completionFact: "a balance promise for the line (po_supplier_promises)",
  },
  {
    key: "receiving.check_in",
    module: "receiving",
    trigger: "goods have an arrival promise and no posted Receiving Session covers them",
    owner: "the effective GRN Duty holder from Workspace; never inferred from PO Duty",
    ownerRule: "grn_duty",
    action: "Check in",
    dueRule: "the promised arrival day",
    completionFact: "a posted Receiving Session (warehouse_receipts + receiving_events 'posted')",
  },
  {
    key: "claims.confirm_what_happens_next",
    module: "claims",
    trigger: "a claim has the supplier's answer and no Carres resolution",
    owner: "the PO-duty holder of the month the claim was OPENED — forever",
    ownerRule: "claim_month_po_duty",
    action: "Confirm what happens next",
    dueRule: "no clock yet — the claims queue lists it until resolved",
    completionFact: "customer_resolution recorded (supplier_claims, 0324)",
  },
];

export const WORK_RULES: readonly WorkRule[] = [
  ...ORDER_WORK_RULES,
  ...MODULE_WORK_RULES,
];

/** The order-track rules by key — how the composition finds each `ownerRule`. */
const ORDER_RULE_BY_KEY = new Map<string, WorkRule>(
  ORDER_WORK_RULES.map((r) => [r.key, r]),
);

// ─── The composed work item ──────────────────────────────────────────────────

/** A Work owner may be a rostered account or a named business person (for
 * example the responsible salesperson). A name-only owner must never be
 * encoded as a synthetic account id: My Work and permissions consume real
 * account ids only. */
export interface WorkOwnerPerson {
  userId: string | null;
  name: string | null;
}

export interface WorkItem {
  ruleKey: string;
  module: WorkRule["module"];
  /** The order's SO ref — the context a row opens into. */
  soRef: string;
  orderId: string;
  action: string;
  /** Structured ownership. My Work reads actingPerson; Team Work groups by
   * normalOwner. Cover never overwrites either fact. */
  ownerRule: WorkOwnerRule;
  ownerDutyKey: string | null;
  normalOwner: WorkOwnerPerson | null;
  activeCover: WorkOwnerPerson | null;
  actingPerson: WorkOwnerPerson | null;
  ownerState: WorkspaceDutyResolution["state"];
  /** WHO — resolved from the rule's `ownerRule` (§0.1 Action Owner Engine):
   *  the PO-duty holder, the salesperson, or the PIC — else the honest gap. */
  ownerName: string | null;
  /** The resolved person's account id, when the owner HAS an ops account
   *  (PO-duty holder · PIC). Null for a named non-account owner (a
   *  salesperson) and for a duty word. My Work filters on this. */
  ownerUserId: string | null;
  /** The OWNER RULE's duty word when no person resolves (blueprint card §7 —
   *  Delivery staff · Finance have no roster fact yet, so the duty stands
   *  where a name cannot; the canvas's measured-boundary rule). */
  ownerDuty?: string;
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
  /** The PIC — §2.2: the customer-relationship owner, and the governed
   *  proxy/cover where a rule's roster does not exist yet. Since 2026-08-27
   *  the PIC no longer owns EVERY action: `ownerRule` decides per rule. */
  picName: string | null;
  /** The PIC's account id — My Work filters on the resolved id. */
  picUserId?: string | null;
  /** One-release legacy PO-duty input. New callers supply `dutyResolutions`.
   *  Absent/null = the duty word stands; it never falls back to PIC. */
  poDuty?: { userId: string; name: string | null } | null;
  /** Shared resolver answers keyed by the action's Owner Rule. */
  dutyResolutions?: Partial<Record<WorkOwnerRule, WorkspaceDutyResolution>>;
  /** The order's responsible salesperson — resolves `salesperson` rules.
   *  A name from Sales ownership, not an ops account. */
  salespersonName?: string | null;
  /** §0.1 row 1 — compose `Ask for the delivery date` (the 3 nobody asked,
   *  never the 8 who answered "not yet"; owner ruling 2026-08-15). The
   *  caller answers it from delivery_date + delivery_date_tbd + not
   *  delivered/cancelled; the engine composes, it does not re-derive. */
  askDeliveryDate?: boolean;
  /** Anchors the clocks read. */
  promisedDateIso: string | null;
  confirmedDateIso: string | null;
  deliveredAtIso: string | null;
  delayDetectedAtIso: string | null;
  delayDecisionAtIso: string | null;
  /** Owner re-ruling 2026-08-16 (blueprint card §7, supersedes the
   *  3-working-days law): `Assign logistics` is due WITHIN THE DAY the PO is
   *  issued — the EARLIEST PO's issue day (Card 3: logistics is assigned
   *  early, the moment purchase starts). */
  poIssuedAtIso?: string | null;
  /** Stock-source orders with no PO: due within the ORDER day. */
  placedAtIso?: string | null;
  /** Blueprint card §7 — the two composed facts the ladder does not carry
   *  (one action per track is the ladder's own law; the Work feed lists every
   *  governed item). */
  loanOutstanding?: boolean;
  financeExceptionHolds?: boolean;
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
      case "assign_logistics": {
        // Owner re-ruling 2026-08-16 (blueprint card §7): due WITHIN THE DAY
        // the PO is issued; a stock-source order with no PO — within the
        // order day. The old 3-working-days-before-the-customer-date law is
        // SUPERSEDED.
        const anchor = ctx.poIssuedAtIso ?? ctx.placedAtIso ?? null;
        return anchor ? (anchor.slice(0, 10) as IsoDate) : null;
      }
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
      case "collect_loan_item":
        // The delivery day itself (blueprint card §7): the loan comes back on
        // the trip. Confirmed day, else the day it was actually delivered.
        return (ctx.confirmedDateIso ?? ctx.deliveredAtIso)?.slice(0, 10) as
          | IsoDate
          | undefined ?? null;
      case "resolve_payment_exception":
        // Immediately — an OPEN exception is holding a delivery today.
        return todayIso.slice(0, 10) as IsoDate;
      default:
        // issue_po / confirm_ready_date: the purchasing engine owns those
        // clocks on its own surfaces — a second spelling here is the defect.
        return null;
    }
  };

  const composeExtra = (): OrderOpenAction[] => {
    // Blueprint card §7 — the ladder holds one action per track by ITS law;
    // the Work feed additionally lists these governed items, composed
    // from the module facts the rules above name (Card 9: Work reads module
    // facts and produces governed action).
    const extra: OrderOpenAction[] = [];
    if (ctx.askDeliveryDate) {
      // §0.1 row 1 — the missing customer promise is the salesperson's work.
      // Warning, matching the register's amber fact on the same rows.
      extra.push({
        key: "ask_delivery_date",
        track: "delivery",
        tone: "warning",
      });
    }
    if (ctx.financeExceptionHolds) {
      extra.push({
        key: "resolve_payment_exception",
        track: "money",
        tone: "warning",
      });
    }
    if (
      ctx.loanOutstanding &&
      (ctx.deliveredAtIso ||
        (ctx.confirmedDateIso && ctx.confirmedDateIso.slice(0, 10) <= todayIso.slice(0, 10)))
    ) {
      extra.push({
        key: "collect_loan_item",
        track: "delivery",
        tone: "info",
      });
    }
    return extra;
  };

  /** WHO — the rule's `ownerRule`, resolved (§0.1 Action Owner Engine).
   *  A person where a roster or the order's own fact names one; the PIC as
   *  governed cover where the rule's roster does not exist yet; the duty
   *  word where no person truthfully performs the act. Never hand-picked. */
  type ResolvedOwner = {
    ownerRule: WorkOwnerRule;
    ownerDutyKey: string | null;
    normalOwner: WorkOwnerPerson | null;
    activeCover: WorkOwnerPerson | null;
    actingPerson: WorkOwnerPerson | null;
    ownerState: WorkspaceDutyResolution["state"];
    ownerName: string | null;
    ownerUserId: string | null;
    ownerDuty?: string;
  };
  const directOwner = (
    ownerRule: WorkOwnerRule,
    person: WorkOwnerPerson | null,
    ownerDuty?: string,
  ): ResolvedOwner => ({
    ownerRule,
    ownerDutyKey: null,
    normalOwner: person,
    activeCover: null,
    actingPerson: person,
    ownerState: person ? "primary" : "not_assigned",
    ownerName: person?.name ?? null,
    ownerUserId: person?.userId ?? null,
    ...(ownerDuty ? { ownerDuty } : {}),
  });
  const dutyOwner = (
    ownerRule: WorkOwnerRule,
    dutyKey: string,
    unresolvedWord: string,
  ): ResolvedOwner => {
    const resolution = ctx.dutyResolutions?.[ownerRule];
    if (resolution) {
      return {
        ownerRule,
        ownerDutyKey: resolution.dutyKey,
        normalOwner: resolution.normalOwner,
        activeCover: resolution.activeCover,
        actingPerson: resolution.actingPerson,
        ownerState: resolution.state,
        ownerName: resolution.actingPerson?.name ?? null,
        ownerUserId: resolution.actingPerson?.userId ?? null,
        ...(resolution.state === "not_assigned" ? { ownerDuty: unresolvedWord } : {}),
      };
    }
    // One-release compatibility for callers not yet supplying the shared
    // resolution. It never applies to another Duty and never falls back to PIC.
    if (ownerRule === "po_duty" && ctx.poDuty) {
      const person = { userId: ctx.poDuty.userId, name: ctx.poDuty.name };
      return {
        ...directOwner(ownerRule, person),
        ownerDutyKey: dutyKey,
      };
    }
    return {
      ...directOwner(ownerRule, null, unresolvedWord),
      ownerDutyKey: dutyKey,
    };
  };
  const resolveOwner = (
    key: OrderActionKey,
  ): ResolvedOwner => {
    const rule = ORDER_RULE_BY_KEY.get(key);
    const pic = ctx.picName || ctx.picUserId
      ? { userId: ctx.picUserId ?? null, name: ctx.picName }
      : null;
    switch (rule?.ownerRule) {
      case "po_duty":
        return dutyOwner("po_duty", "po_duty", "Purchasing");
      case "salesperson": {
        const name = ctx.salespersonName?.trim();
        return directOwner(
          "salesperson",
          name ? { userId: null, name } : null,
          name ? undefined : "Sales",
        );
      }
      case "delivery_duty":
        return directOwner("delivery_duty", null, "Delivery staff");
      case "finance_duty":
        return directOwner("finance_duty", null, "Finance");
      case "payment_duty":
        return dutyOwner("payment_duty", "payment_duty", "Payment");
      case "system":
        return directOwner("system", null, "System");
      default:
        // order_pic — and any unregistered key fails safe to the same.
        return directOwner("order_pic", pic, pic ? undefined : "Operations");
    }
  };

  return [...open, ...composeExtra()].map((a) => {
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
    const owner = resolveOwner(a.key);
    const module = ORDER_RULE_BY_KEY.get(a.key)?.module ?? "orders";
    return {
      ruleKey: a.key,
      module,
      soRef: `SO-${ctx.so}`,
      orderId: ctx.orderId,
      action: orderActionQueue(a.key),
      ownerRule: owner.ownerRule,
      ownerDutyKey: owner.ownerDutyKey,
      normalOwner: owner.normalOwner,
      activeCover: owner.activeCover,
      actingPerson: owner.actingPerson,
      ownerState: owner.ownerState,
      ownerName: owner.ownerName,
      ownerUserId: owner.ownerUserId,
      ...(owner.ownerDuty ? { ownerDuty: owner.ownerDuty } : {}),
      tone: a.tone,
      locked: !!a.locked,
      broken: !!a.broken,
      dueIso,
      workingDaysLate: late,
    };
  });
}
