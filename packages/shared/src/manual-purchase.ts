/**
 * MANUAL PURCHASE — the request, the approval, the order
 * (CARD-2026-08-18-manual-purchase; docs/purchasing/MASTER.md §3).
 *
 * The words are `docs/COPY-STANDARD.md`'s Manual Purchase block, spelt once
 * here so no screen respells them. The status is ONE arithmetic (Law D) over
 * facts the database stores — only the states a human DECIDES have columns
 * (approval, refusal, cancel); `Ordered` and `Arrived` derive from the lines'
 * `po_id` and its posted receipt, exactly as 0323 ruled and 0359 kept.
 */
import type { ProductCategory } from "./db-types";
import { PURCHASING_OFFICE_OFF_DAYS } from "./purchasing-supplier-calls";
import { DEMAND_PURPOSES, type DemandPurpose } from "./to-order";
import { SO_BATCH_RAIL, type SoBatchProductCategory } from "./so-batch-purchase";
import type { WorkItem } from "./work-engine";
import { countWorkingDays, type WorkingDayOptions } from "./working-days";

/** Every visible word on the Manual Purchase surfaces (COPY-STANDARD). */
export const MANUAL_PURCHASE_WORDS = {
  page: "Manual Purchase",
  /** COPY-STANDARD's own governed pair — built by Card 04. */
  newRequest: "+ Manual Purchase",
  createTitle: "NEW MANUAL PURCHASE",
  send: "Send for approval",
  /** The disabled Send NAMES its gap (the Receiving law: a grey button that
   *  will not say why is banned). The FIRST missing header fact wins, in the
   *  form's own top-to-bottom order — lead days first (Card 06). */
  sendNeedsLeadDays: "Send — lead days are not set",
  sendNeedsDate: "Send — pick a date",
  /** 0422 — the Purchasing Settings switch is on and the chosen date is
   *  before the plan's earliest date; the sentence under the field says so. */
  sendNeedsLaterDate: "Send — pick a later date",
  sendNeedsWhy: "Send — say what it is for",
  sendNeedsServiceCase: "Send — pick the Service Case",
  sendNeedsStaff: "Send — pick the staff member",
  sendNeedsSubsidiary: "Send — name the subsidiary",
  cancel: "Cancel",
  /** The Deliver To door on an existing request (0421): the text button that
   *  opens the choice, and the act that closes it. */
  change: "Change",
  save: "Save",
  needFor: "Need for",
  /**
   * THE TWO VISIBLE DATE MEANINGS (Card 06, owner-corrected 2026-08-29 —
   * the same pair the Sales Portal reads). `Proceed Date` is the actual
   * successful request hand-off (`created_at`'s Malaysia date), read-only:
   * a server preview before Send, immutable truth after. `Delivery Date`
   * is when the supplier's goods must reach `Deliver To`
   * (`purchase_requests.required_by`) — never a customer promise, physical
   * receipt time or a later supplier-changed promise. `Needed by` is
   * retired from every surface.
   */
  proceedDate: "Proceed Date",
  deliveryDate: "Delivery Date",
  deliverTo: "Deliver to",
  raisedBy: "Raised by",
  /** Card 04 — ONLY `Other Purchase` asks this; routine purposes stopped
   *  asking a duplicate `Why`. */
  whatIsThisFor: "What is this for?",
  /** History only — the label a pre-Card-04 routine request's stored reason
   *  still prints under on the object. The form no longer asks it. */
  why: "Why",
  /** The per-purpose structured-For fields on the create form. */
  serviceCase: "Service Case",
  staffMember: "Staff member",
  subsidiary: "Subsidiary",
  items: "ITEMS",
  addLine: "+ Add line",
  remove: "Remove",
  /** COPY-STANDARD §Manual Purchase: the per-line free-text field is `Note`.
   *  `Remark` was the retired To Order dialog's word and rode in with the
   *  port; the state, the input id and the payload always said `note`. */
  note: "Note",
  alreadyHave: "WHAT WE ALREADY HAVE",
  freeStock: "free stock",
  alreadyOnPo: "already on PO",
  stillNeeded: "still needed",
  /**
   * THE PERMANENT REGISTER'S ELEVEN COLUMNS — Card 06's owner correction
   * (2026-08-29), exactly and in this order. Purpose and Order By are NOT
   * parent columns: Purpose lives in the rail, the expansion context and
   * the object; Order By drives timing/work and the quiet second line only.
   * `Requested Date` and `Needed By` are retired words.
   */
  colProceedDate: "Proceed Date",
  colApproval: "Approval Status",
  colMprNo: "Manual Purchase No",
  colPoNo: "PO No",
  colDeliveryDate: "Delivery Date",
  colFor: "For",
  colItems: "Items",
  colQty: "Qty",
  colSupplier: "Supplier",
  colDeliverTo: "Deliver To",
  colRequestedBy: "Requested By",
  /** The PO lineage absence — the arithmetic ran and found no PO. */
  notOrderedYet: "Not ordered yet",
  /** Several destinations behind one request. */
  multiple: "Multiple",
  /** The expansion's own child columns (read-only; Card 04). */
  expSku: "SKU",
  expItem: "Item",
  expRequestedQty: "Requested Qty",
  expApprovedQty: "Approved Qty",
  expOrderedQty: "Ordered Qty",
  expStillToOrder: "Still To Order",
  expSupplier: "Supplier",
  expDeliverTo: "Deliver To",
  expPoNo: "PO No",
  emptyRegister: "No Manual Purchase yet.",
  /**
   * THE OBJECT DETAIL (Card 05) — one full-width scroll, six sections in
   * this exact order. The section names print through the Block heading's
   * own uppercase; these are the words themselves.
   */
  secRequest: "Request",
  secItemsRequested: "Items Requested",
  secAlreadyHave: "What We Already Have",
  secApproval: "Approval",
  secPurchaseOrders: "Purchase Orders",
  secHistory: "History",
  /** The object header's one back destination — the owning Register. */
  backToRegister: "Manual Purchase",
  /** Governed loading / failure states (never a raw error string). */
  objectLoading: "Opening the Manual Purchase",
  objectLoadFailed: "This Manual Purchase could not be opened",
  tryAgain: "Try again",
  /** The audit-data defect sentence — a person is never invented. */
  staffIdentityNotRecorded: "Staff identity not recorded",
  /** Items Requested — a missing Catalog relationship is a NAMED fact. */
  noSupplierYet: "No supplier yet",
  colNote: "Note",
  /** What We Already Have — the same three facts, as column heads. */
  colFreeStock: "Free Stock",
  colAlreadyOnPo: "Already On PO",
  colStillNeeded: "Still Needed",
  /** Approval — the decision facts and controls. */
  noApprovalNeeded: "No approval needed",
  approve: "Approve",
  refuse: "Refuse",
  decisionReason: "Decision reason",
  colTransactionCost: "Transaction Cost",
  colLineTotal: "Line Total",
  /** Purchase Orders — the exact lineage's date words (MASTER §9.3). */
  colPoIssued: "PO Issued",
  colPoDeliveryDate: "PO Delivery Date",
  colSupplierDeliveryDate: "Supplier Delivery Date",
  sameAsPo: "Same as PO",
  /** A historical request whose Delivery Date was never stored (Card 06 §6)
   *  — it stays in permanent history, is never backfilled, and has no
   *  invented Order By. */
  notRecorded: "Not recorded",
  /** The quiet timing fact's louder first line when today is past Order By.
   *  The second line stays `Order by {date}` (`manualPurchaseOrderByLine`). */
  orderDatePassed: "Order date passed",
} as const;

/** `Order by {date}` — the quiet derived timing fact under Delivery Date
 *  (Card 06 §6). The caller formats the date through the one governed
 *  formatter; this spells the sentence once (Law D). */
export function manualPurchaseOrderByLine(dateLabel: string): string {
  return `Order by ${dateLabel}`;
}

/**
 * THE MISSING-SETTINGS FACTS (Card 06 §3.4) — the governed two lines, fact
 * then act, spelt once for the create form, the object and the rail's setup
 * lens. No production or transit number means no proposed Delivery Date and
 * no Order By; the engine never substitutes zero or a browser date.
 */
export function manualPurchaseLeadDayFacts(gap: {
  kind: "production" | "transit";
  supplierName: string | null;
  /** The Catalog category word, already capitalised by the caller's one
   *  label arithmetic (`categoryLabel`). Production only. */
  categoryLabel?: string | null;
}): { wrong: string; todo: string } {
  const supplier = (gap.supplierName ?? "").trim() || "the supplier";
  if (gap.kind === "production") {
    const category = (gap.categoryLabel ?? "").trim() || "the category";
    return {
      wrong: "Production days are not set",
      todo: `Add production days for ${supplier} · ${category} in Settings`,
    };
  }
  return {
    wrong: "Transit days are not set",
    todo: `Add transit days for ${supplier} in Settings`,
  };
}

/**
 * HISTORY — the object's final section (Card 05 §3.7). Only events the
 * database actually stores: request created · purchase approved/refused ·
 * remaining demand marked not going ahead · exact linked PO issue. The
 * titles are rank 1 of the locked three-rank record grammar; nothing here
 * infers that a supplier received a PO or that goods arrived.
 */
export const MANUAL_PURCHASE_HISTORY_WORDS = {
  created: "Purchase requested",
  approved: "Purchase approved",
  refused: "Purchase refused",
  line_not_going_ahead: "Marked not going ahead",
  po_issued: "Purchase order issued",
} as const;

export type ManualPurchaseHistoryKind = keyof typeof MANUAL_PURCHASE_HISTORY_WORDS;

/** One stored event, as the detail read returns it — facts, never words. */
export interface ManualPurchaseHistoryEvent {
  kind: ManualPurchaseHistoryKind;
  occurred_at: string;
  /** The resolved real staff name, or null when the store never recorded
   *  the individual (the reader prints `Staff identity not recorded`). */
  actor: string | null;
  actor_role: string | null;
  sku?: string | null;
  reason?: string | null;
  po_no?: string | null;
  units?: number | null;
  requested_units?: number | null;
  approved_units?: number | null;
}

const unitsWord = (n: number) => `${n} unit${n === 1 ? "" : "s"}`;

/**
 * Rank 1 + rank 3 of one History record — ONE arithmetic for the object
 * (Law D). Rank 2 (who · when) is the portal-wide `historyActorWords`.
 */
export function manualPurchaseHistoryRecord(e: ManualPurchaseHistoryEvent): {
  title: string;
  detail: string[];
} {
  const title = MANUAL_PURCHASE_HISTORY_WORDS[e.kind];
  switch (e.kind) {
    case "created":
      return { title, detail: e.units != null ? [`${unitsWord(e.units)} requested`] : [] };
    case "approved":
      return {
        title,
        detail:
          e.requested_units != null && e.approved_units != null
            ? [`${e.requested_units} requested · ${e.approved_units} approved`]
            : [],
      };
    case "refused":
      return { title, detail: e.reason ? [e.reason] : [] };
    case "line_not_going_ahead":
      return {
        title,
        detail: [[e.sku, e.reason].filter(Boolean).join(" — ")].filter((s) => s !== ""),
      };
    case "po_issued":
      return {
        title,
        detail: [
          [e.po_no, e.units != null ? unitsWord(e.units) : null]
            .filter(Boolean)
            .join(" · "),
        ].filter((s) => s !== ""),
      };
  }
}

/**
 * THE APPROVAL COLUMN'S FOUR ANSWERS (Card 04 §3.2) — the approval FACT,
 * never the request's whole status: `Need approval` while the configured
 * approver has not decided; `Approved` / `Refused` once somebody did;
 * `No approval needed` when the purpose's switch never asked.
 */
export const MANUAL_PURCHASE_APPROVAL_WORDS = {
  need_approval: "Need approval",
  approved: "Approved",
  refused: "Refused",
  not_needed: "No approval needed",
} as const;

export type ManualPurchaseApprovalKind = keyof typeof MANUAL_PURCHASE_APPROVAL_WORDS;

/** ONE approval arithmetic over the stored decision facts (Law D). */
export function manualPurchaseApprovalOf(r: {
  approvalRequired: boolean;
  approvedAt: string | null;
  refusedAt: string | null;
}): { kind: ManualPurchaseApprovalKind; label: string } {
  const kind: ManualPurchaseApprovalKind =
    r.refusedAt !== null
      ? "refused"
      : r.approvedAt !== null
        ? "approved"
        : r.approvalRequired
          ? "need_approval"
          : "not_needed";
  return { kind, label: MANUAL_PURCHASE_APPROVAL_WORDS[kind] };
}

/**
 * The states (card §5). `Waiting` always names what it waits ON; `Arrived`
 * is a FACT the system observes, never a button.
 */
export type ManualPurchaseStatusKind =
  | "waiting_approval"
  | "waiting_sku"
  | "ready_to_order"
  | "ordered"
  | "arrived"
  | "not_going_ahead";

export const MANUAL_PURCHASE_STATUS_WORDS: Record<ManualPurchaseStatusKind, string> = {
  waiting_approval: "Waiting for approval",
  waiting_sku: "Waiting for the SKU",
  ready_to_order: "Ready to order",
  ordered: "Ordered",
  arrived: "Arrived",
  not_going_ahead: "Not going ahead",
};

/** What the arithmetic reads about one request. All facts, no decisions. */
export interface ManualPurchaseStatusInput {
  approvalRequired: boolean;
  approvedAt: string | null;
  refusedAt: string | null;
  refuseReason: string | null;
  lines: Array<{
    qty: number;
    issuedQty: number;
    /** ⭐ THE APPROVER'S NUMBER (YH, 2026-09-01). `null` = nobody cut it, so
     *  the ask stands. This replaces `remainingQty`, which was the database's
     *  generated `qty − issued_qty` column and does not know the cut exists —
     *  see the note on `manualPurchaseStatusOf`. */
    approvedQty?: number | null;
    cancelledAt: string | null;
    poId: string | null;
    /** Slice 3 wires this from the linked PO's posted receipt. */
    received?: boolean;
  }>;
}

export interface ManualPurchaseStatus {
  kind: ManualPurchaseStatusKind;
  label: string;
  /** The one small-line fact a register may print under the pill. */
  reasonLabel: string | null;
}

/**
 * THE one status arithmetic. Order of precedence:
 *   Not going ahead  — refused (with its required reason), or every line
 *                      cancelled (0321's door, reason required there too).
 *   Waiting for approval — the switch was ON at creation and nobody decided.
 *   Arrived          — every live line's PO has a posted receipt (slice 3
 *                      feeds `received`; until then no row reaches it).
 *   Ordered          — every live line fully issued onto a PO.
 *   Ready to order   — everything else: approved, or never needed approval.
 */
export function manualPurchaseStatusOf(r: ManualPurchaseStatusInput): ManualPurchaseStatus {
  const live = r.lines.filter((l) => l.cancelledAt === null);

  if (r.refusedAt !== null) {
    return {
      kind: "not_going_ahead",
      label: MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead,
      reasonLabel: r.refuseReason,
    };
  }
  if (r.lines.length > 0 && live.length === 0) {
    return {
      kind: "not_going_ahead",
      label: MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead,
      reasonLabel: null,
    };
  }
  if (r.approvalRequired && r.approvedAt === null) {
    return {
      kind: "waiting_approval",
      label: MANUAL_PURCHASE_STATUS_WORDS.waiting_approval,
      reasonLabel: null,
    };
  }
  /* ⭐ THE APPROVER'S CUT IS PART OF THE ARITHMETIC (YH, 2026-09-01).
     This read `remainingQty`, the database's generated `qty − issued_qty`
     column, which does not know an approval cut exists. Every OTHER number on
     the Manual Purchase page uses `manualPurchaseLineRemainingOf`, which
     honours it. So a request for 5 that the approver cut to 2, then issued in
     full, still reported 3 outstanding: the record read `Ready to order` after
     its purchase order was raised, sat in the `All not ordered` worklist for
     ever, and was untickable at the same time. The buying queue could never
     empty and finished work was indistinguishable from outstanding work.
     ONE arithmetic now, the same one the rest of the page reads (Law D).

     ⭐ AND A LINE CUT TO ZERO IS NOT WAITING FOR ANYTHING. The issue door
     filters a zero-remainder line out (`manual-purchase.ts` route), so it
     never receives a `po_id` — and `every(… poId !== null)` could therefore
     never be satisfied on a request containing one. A line the approver cut to
     nothing is a line nobody is buying; it is excluded from what the request
     is still PURSUING rather than blocking it for ever. If every live line was
     cut to zero, nothing is going ahead, and the status says so. */
  const remainingOf = (l: (typeof r.lines)[number]) =>
    manualPurchaseLineRemainingOf({
      qty: l.qty,
      approvedQty: l.approvedQty ?? null,
      issuedQty: l.issuedQty,
    });
  const cutToNothing = (l: (typeof r.lines)[number]) => (l.approvedQty ?? null) === 0;
  const pursued = live.filter((l) => !cutToNothing(l));

  if (live.length > 0 && pursued.length === 0) {
    return {
      kind: "not_going_ahead",
      label: MANUAL_PURCHASE_STATUS_WORDS.not_going_ahead,
      reasonLabel: null,
    };
  }
  if (pursued.length > 0 && pursued.every((l) => l.received === true)) {
    return {
      kind: "arrived",
      label: MANUAL_PURCHASE_STATUS_WORDS.arrived,
      reasonLabel: null,
    };
  }
  if (pursued.length > 0 && pursued.every((l) => remainingOf(l) <= 0 && l.poId !== null)) {
    return {
      kind: "ordered",
      label: MANUAL_PURCHASE_STATUS_WORDS.ordered,
      reasonLabel: null,
    };
  }
  return {
    kind: "ready_to_order",
    label: MANUAL_PURCHASE_STATUS_WORDS.ready_to_order,
    reasonLabel: null,
  };
}

/**
 * `still needed` — THE printed arithmetic (card §3: printed, never left to
 * the reader). Free stock and open-PO cover both count against the ask.
 */
export function stillNeededOf(qty: number, free: number, alreadyOnPo: number): number {
  return Math.max(0, qty - Math.max(0, free) - Math.max(0, alreadyOnPo));
}

// ─── The rail — PURCHASING CARD 06, owner correction 2026-08-29 ──────────────

/**
 * THE MANUAL PURCHASE RAIL CONTRACT (Card 06, superseding Card 03's
 * four-section shape; `docs/purchasing/MASTER.md` §9.2;
 * `docs/COPY-STANDARD.md`).
 *
 * Seven sections, in this exact order, drawn on the shared 240px
 * `FilterRail` shell (Card 02-C; `docs/ui/MASTER.md` — LOCAL FILTER RAIL):
 *
 *   WORK TO DO        the five concrete daily actions, all visible with
 *                     zero — an action LENS over the same server facts and
 *                     central Work identities, never a second Work Engine.
 *                     `Approve purchase` is submitted, undecided approval;
 *                     `Issue PO` is approved remaining demand; the other
 *                     three name their exact Catalog/Settings repair.
 *   TO ORDER          `All not ordered` — live quantity not yet fully
 *                     issued to a PO. (`Need approval` and `Ready to order`
 *                     retired into the action rows above, without
 *                     duplication.)
 *   ORDER TIMING      the request's earliest derived `Order By` against
 *                     today — a filter and fact, never an issue permission
 *                     gate; an authorised person may buy early.
 *   PURCHASE PURPOSE  the six approved purposes — `DEMAND_PURPOSES`, the one
 *                     creatable list. A retired historical value matches no
 *                     row and lives under `All purposes` only.
 *   PRODUCT           the CATALOG's categories — the same three-row authority
 *                     SO Batch Purchase draws, never SKU-text inference.
 *   SUPPLIER          actual names, dynamic and alphabetical — the demand
 *                     line's Catalog-derived supplier, never chosen by
 *                     Operation, never hardcoded, never a placeholder.
 *   SETUP TO FIX      the missing-configuration facts; the whole section
 *                     renders only while an affected request exists. The
 *                     owning action stays in `WORK TO DO`.
 *
 * The rail is NAVIGATION, not selection: no checkboxes, one filter per
 * section, sections combine with AND, each `All …` row clears only its own
 * section, and the empty filter is the permanent Register — ordered history
 * included. Banned rows stay banned (Card 06 §5): `Supplier not selected` ·
 * `No supplier` · `Not in catalog` · `Need price` · `Ordered` ·
 * `Part received` · `Received` · `Arrived` · `Cancelled` · `My drafts` ·
 * `Need correction` · `Queues` · every Safety-days row. Manual Purchase
 * never subtracts SO Safety days.
 */
export const MANUAL_PURCHASE_RAIL = {
  work: {
    heading: "WORK TO DO",
    actions: [
      { key: "approve_purchase", word: "Approve purchase" },
      { key: "issue_po", word: "Issue PO" },
      { key: "check_supplier", word: "Check the supplier" },
      { key: "add_production_days", word: "Add production days" },
      { key: "add_transit_days", word: "Add transit days" },
    ],
  },
  toOrder: { heading: "TO ORDER", all: "All not ordered" },
  timing: {
    heading: "ORDER TIMING",
    rows: [
      { state: "can_order_early", word: "Can order early" },
      { state: "order_date_reached", word: "Order date reached" },
      { state: "order_date_passed", word: "Order date passed" },
    ],
  },
  purpose: { heading: "PURCHASE PURPOSE", all: "All purposes", rows: DEMAND_PURPOSES },
  /** The Catalog category rows — SO Batch's own list, shared so the two rails
   *  cannot drift (Law D). */
  product: SO_BATCH_RAIL.product,
  supplier: { heading: "SUPPLIER", all: "All suppliers" },
  setup: {
    heading: "SETUP TO FIX",
    rows: [
      { key: "production_days_not_set", word: "Production days not set" },
      { key: "transit_days_not_set", word: "Transit days not set" },
    ],
  },
} as const;

export type ManualPurchaseWorkKey =
  (typeof MANUAL_PURCHASE_RAIL.work.actions)[number]["key"];
export type ManualPurchaseTimingState =
  (typeof MANUAL_PURCHASE_RAIL.timing.rows)[number]["state"];
export type ManualPurchaseSetupKey =
  (typeof MANUAL_PURCHASE_RAIL.setup.rows)[number]["key"];

/**
 * THE EARLIEST LINE DATE GOVERNS THE REQUEST (Card 06 §3.3) — the first item
 * that must start production decides when the whole request must be ordered.
 * Null-dated lines (missing Settings, historical `Not recorded`) contribute
 * nothing; every line null → the request has no Order By at all.
 */
export function manualPurchaseOrderByOf(
  lineOrderBys: readonly (string | null | undefined)[],
): string | null {
  let earliest: string | null = null;
  for (const d of lineOrderBys) {
    const iso = (d ?? "").slice(0, 10);
    if (iso.length !== 10) continue;
    if (earliest == null || iso < earliest) earliest = iso;
  }
  return earliest;
}

/** ONE timing arithmetic over the derived Order By (Card 06 §5): today
 *  before it = early; equal = reached; after = passed. No Order By, no
 *  timing row — never a guessed one. A filter and fact, not a gate. */
export function manualPurchaseTimingOf(
  orderByIso: string | null | undefined,
  todayIso: string | null | undefined,
): ManualPurchaseTimingState | null {
  const orderBy = (orderByIso ?? "").slice(0, 10);
  const today = (todayIso ?? "").slice(0, 10);
  if (orderBy.length !== 10 || today.length !== 10) return null;
  if (today < orderBy) return "can_order_early";
  if (today === orderBy) return "order_date_reached";
  return "order_date_passed";
}

/**
 * `All not ordered` — every request whose live quantity is not yet fully
 * issued (waiting states + ready), DERIVED REQUEST TRUTH
 * (`manualPurchaseStatusOf`), never a stored status. A fully Ordered/Arrived
 * request leaves the filter while staying in the Register; a refused /
 * fully-cancelled request (`Not going ahead`) is not awaiting ordering.
 */
export function manualPurchaseNotOrdered(status: ManualPurchaseStatusKind): boolean {
  return (
    status === "waiting_approval" ||
    status === "waiting_sku" ||
    status === "ready_to_order"
  );
}

/**
 * WHAT THE OPERATOR HAS PICKED — one slot per section; `null` / `false` is
 * that section's `All …`. Different sections combine with AND; clearing
 * every slot restores the complete permanent Register, Ordered records
 * included.
 */
export interface ManualPurchaseRailFilter {
  work: ManualPurchaseWorkKey | null;
  notOrderedOnly: boolean;
  timing: ManualPurchaseTimingState | null;
  purpose: DemandPurpose | null;
  product: SoBatchProductCategory | null;
  supplier: string | null;
  setup: ManualPurchaseSetupKey | null;
}

export const MANUAL_PURCHASE_RAIL_CLEAR: ManualPurchaseRailFilter = {
  work: null,
  notOrderedOnly: false,
  timing: null,
  purpose: null,
  product: null,
  supplier: null,
  setup: null,
};

/**
 * One request's rail-relevant facts, projected once from the register read:
 * the derived status, the stored purpose, the CATALOG's categories on the
 * request's live lines (the API reads `product_models.category`; SKU text
 * never decides), the actual supplier names behind those lines (the
 * Catalog-derived `supplier_id` recorded at creation — 0323/0359 — which the
 * issuance walls carry onto any PO unchanged), the SERVER-derived earliest
 * `Order By` (Card 06 §3.3 — the browser performs no working-day
 * arithmetic), and the named configuration gaps. This file combines and
 * counts; it derives nothing new.
 */
export interface ManualPurchaseRailFacts {
  requestId: string;
  status: ManualPurchaseStatusKind;
  purpose: string;
  categories: ReadonlySet<ProductCategory>;
  suppliers: ReadonlySet<string>;
  /** The request's earliest server-derived line Order By, or null. */
  orderBy: string | null;
  timing: ManualPurchaseTimingState | null;
  /** `Approve purchase` — submitted and undecided approval. */
  needsApproval: boolean;
  /** `Issue PO` — approved remaining demand (`manualPurchaseSelectable`). */
  issuableRemaining: boolean;
  /** `Check the supplier` — a live line without its Catalog supplier. */
  supplierGap: boolean;
  /** The exact missing Settings facts, from the server's own plan. */
  productionDaysMissing: boolean;
  transitDaysMissing: boolean;
}

export function manualPurchaseRailFacts(
  rows: readonly {
    requestId: string;
    status: ManualPurchaseStatusKind;
    purpose: string;
    remainingQty: number;
    lineCategories: readonly (ProductCategory | null | undefined)[];
    lineSupplierNames: readonly (string | null | undefined)[];
    /** Per live line: the server's `order_by`, null where not derivable. */
    lineOrderBys: readonly (string | null | undefined)[];
    /** A live line without a Catalog supplier relationship. */
    supplierGap: boolean;
    productionDaysMissing: boolean;
    transitDaysMissing: boolean;
  }[],
  todayIso: string | null,
): ManualPurchaseRailFacts[] {
  return rows.map((r) => {
    const orderBy = manualPurchaseOrderByOf(r.lineOrderBys);
    return {
      requestId: r.requestId,
      status: r.status,
      purpose: r.purpose,
      categories: new Set(
        r.lineCategories.filter((c): c is ProductCategory => c != null),
      ),
      suppliers: new Set(
        r.lineSupplierNames.filter((s): s is string => s != null && s !== ""),
      ),
      orderBy,
      timing: manualPurchaseTimingOf(orderBy, todayIso),
      needsApproval: r.status === "waiting_approval",
      issuableRemaining: manualPurchaseSelectable(r.status, r.remainingQty),
      supplierGap: r.supplierGap,
      productionDaysMissing: r.productionDaysMissing,
      transitDaysMissing: r.transitDaysMissing,
    };
  });
}

type ManualPurchaseRailSection =
  | "work"
  | "toOrder"
  | "timing"
  | "purpose"
  | "product"
  | "supplier"
  | "setup";

/** One request against one `WORK TO DO` action — the lens's own mapping. */
function hasWork(f: ManualPurchaseRailFacts, key: ManualPurchaseWorkKey): boolean {
  switch (key) {
    case "approve_purchase":
      return f.needsApproval;
    case "issue_po":
      return f.issuableRemaining;
    case "check_supplier":
      return f.supplierGap;
    case "add_production_days":
      return f.productionDaysMissing;
    case "add_transit_days":
      return f.transitDaysMissing;
  }
}

function hasSetup(f: ManualPurchaseRailFacts, key: ManualPurchaseSetupKey): boolean {
  return key === "production_days_not_set"
    ? f.productionDaysMissing
    : f.transitDaysMissing;
}

/** Does this request pass every selected section — except, optionally, one? */
function railMatches(
  f: ManualPurchaseRailFacts,
  filter: ManualPurchaseRailFilter,
  except?: ManualPurchaseRailSection,
): boolean {
  if (except !== "work" && filter.work != null && !hasWork(f, filter.work)) {
    return false;
  }
  if (
    except !== "toOrder" &&
    filter.notOrderedOnly &&
    !manualPurchaseNotOrdered(f.status)
  ) {
    return false;
  }
  if (except !== "timing" && filter.timing != null && f.timing !== filter.timing) {
    return false;
  }
  if (except !== "purpose" && filter.purpose != null && f.purpose !== filter.purpose) {
    return false;
  }
  if (except !== "product" && filter.product != null && !f.categories.has(filter.product)) {
    return false;
  }
  if (except !== "supplier" && filter.supplier != null && !f.suppliers.has(filter.supplier)) {
    return false;
  }
  if (except !== "setup" && filter.setup != null && !hasSetup(f, filter.setup)) {
    return false;
  }
  return true;
}

/**
 * WHAT THE RAIL PRINTS (Card 06 §5). Every count is UNIQUE Manual Purchase
 * requests — never lines, SKU quantities, POs or notifications — and every
 * section's counts are computed under the OTHER sections' selections, so the
 * printed number predicts exactly the rows a click would show. The fixed rows
 * print their live count, zero included; a supplier row exists only while it
 * matches, except the selected supplier, which stays visible with `0`.
 * `SETUP TO FIX` renders only while an affected request exists.
 */
export interface ManualPurchaseRailModel {
  /** Requests passing every selected filter — what the Register shows. */
  visibleRequestIds: ReadonlySet<string>;
  workCounts: Record<ManualPurchaseWorkKey, number>;
  notOrderedCount: number;
  timingCounts: Record<ManualPurchaseTimingState, number>;
  purposeCounts: Record<DemandPurpose, number>;
  productCounts: Record<SoBatchProductCategory, number>;
  /** Actual names, alphabetical. Never hardcoded, never a placeholder. */
  suppliers: Array<{ name: string; count: number }>;
  setupCounts: Record<ManualPurchaseSetupKey, number>;
  setupExists: boolean;
}

export function manualPurchaseRailModel(
  facts: readonly ManualPurchaseRailFacts[],
  filter: ManualPurchaseRailFilter,
): ManualPurchaseRailModel {
  const count = (
    section: ManualPurchaseRailSection,
    has: (f: ManualPurchaseRailFacts) => boolean,
  ) => facts.filter((f) => railMatches(f, filter, section) && has(f)).length;

  const workCounts = {} as Record<ManualPurchaseWorkKey, number>;
  for (const action of MANUAL_PURCHASE_RAIL.work.actions) {
    workCounts[action.key] = count("work", (f) => hasWork(f, action.key));
  }
  const notOrderedCount = count("toOrder", (f) => manualPurchaseNotOrdered(f.status));
  const timingCounts = {} as Record<ManualPurchaseTimingState, number>;
  for (const row of MANUAL_PURCHASE_RAIL.timing.rows) {
    timingCounts[row.state] = count("timing", (f) => f.timing === row.state);
  }
  const purposeCounts = {} as Record<DemandPurpose, number>;
  for (const p of MANUAL_PURCHASE_RAIL.purpose.rows) {
    purposeCounts[p.value] = count("purpose", (f) => f.purpose === p.value);
  }
  const productCounts = {} as Record<SoBatchProductCategory, number>;
  for (const c of MANUAL_PURCHASE_RAIL.product.categories) {
    productCounts[c.category] = count("product", (f) => f.categories.has(c.category));
  }
  const setupCounts = {} as Record<ManualPurchaseSetupKey, number>;
  for (const row of MANUAL_PURCHASE_RAIL.setup.rows) {
    setupCounts[row.key] = count("setup", (f) => hasSetup(f, row.key));
  }

  const supplierCounts = new Map<string, number>();
  for (const f of facts) {
    if (!railMatches(f, filter, "supplier")) continue;
    for (const name of f.suppliers) {
      supplierCounts.set(name, (supplierCounts.get(name) ?? 0) + 1);
    }
  }
  /* The selected supplier stays visible with 0 while another section
     temporarily removes its matches — a filter the operator cannot see is a
     narrowing they cannot clear. */
  if (filter.supplier != null && !supplierCounts.has(filter.supplier)) {
    supplierCounts.set(filter.supplier, 0);
  }

  return {
    visibleRequestIds: new Set(
      facts.filter((f) => railMatches(f, filter)).map((f) => f.requestId),
    ),
    workCounts,
    notOrderedCount,
    timingCounts,
    purposeCounts,
    productCounts,
    suppliers: [...supplierCounts]
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    setupCounts,
    /* Renders only while an affected request EXISTS AT ALL — the section's
       existence is a page fact, not a filtered count. */
    setupExists: facts.some(
      (f) => f.productionDaysMissing || f.transitDaysMissing,
    ),
  };
}

/**
 * THE WORK/TIMING LENS ORDER (Card 06 §6) — while a work or timing filter is
 * active the Register sorts earliest `Order By` first (null-dated rows last),
 * then newest Proceed Date, so the most urgent visible request is first. The
 * no-filter default stays newest Proceed Date first.
 */
export function manualPurchaseWorkOrder<
  T extends { orderBy: string | null; proceedDate: string },
>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const ao = a.orderBy ?? "9999-12-31";
    const bo = b.orderBy ?? "9999-12-31";
    if (ao !== bo) return ao.localeCompare(bo);
    return b.proceedDate.localeCompare(a.proceedDate);
  });
}

/**
 * Card 03 §3 — the rail says `Need approval`; the Register and object print
 * the REAL action owner's name. One sentence, spelt once: `Jess approves`,
 * `Jess or YJ approves` when several hold the duty. No approver resolved
 * prints nothing — an absent name is honest; a guessed one is not.
 */
export function manualPurchaseApproverLine(
  names: ReadonlyArray<string | null | undefined>,
): string | null {
  const real = names.filter((n): n is string => n != null && n.trim() !== "");
  if (real.length === 0) return null;
  return `${real.join(" or ")} approves`;
}

// ─── The permanent Register — PURCHASING CARD 04, 2026-08-29 ─────────────────

/**
 * THE ONE REMAINDER ARITHMETIC — what a line still has to buy: the
 * approver's number (falling back to the ask while undecided) less what
 * already went out to a PO, floored at zero. The issue door, the
 * issue-costs read and the Register expansion all call THIS (Law D); a
 * second browser formula is the defect the Card bans by name.
 */
export function manualPurchaseLineRemainingOf(l: {
  qty: number;
  approvedQty: number | null;
  issuedQty: number;
}): number {
  return Math.max(0, Number(l.approvedQty ?? l.qty) - Number(l.issuedQty ?? 0));
}

/**
 * `PO No` — ONLY real lineage (Card 04 §3.4): the distinct actual
 * `purchase_orders.po_no` values behind the request's lines. None:
 * `Not ordered yet`. One: the number itself (the caller renders it as the
 * clickable door). Several: `{n} POs`. Never a UUID, never an inference.
 */
export function manualPurchasePoSummary(poNos: readonly string[]): string {
  const distinct = [...new Set(poNos.filter((n) => n && n.trim() !== ""))];
  if (distinct.length === 0) return MANUAL_PURCHASE_WORDS.notOrderedYet;
  if (distinct.length === 1) return distinct[0];
  return `${distinct.length} POs`;
}

/**
 * `Items` — human Catalog words (Card 04 §3.7): the ONE item-label
 * arithmetic's output per live line. One item prints its name; several
 * print `{first item} + {n} more`. SKU stays searchable and shows in the
 * expansion, never here.
 */
export function manualPurchaseItemsSummary(labels: readonly string[]): string {
  const real = labels.filter((l) => l && l.trim() !== "");
  if (real.length === 0) return "";
  if (real.length === 1) return real[0];
  return `${real[0]} + ${real.length - 1} more`;
}

/** `Supplier` — Card 03's own projection summarised: one actual name, or
 *  `{n} suppliers`. Never `Supplier not selected`, never a placeholder. */
export function manualPurchaseSupplierSummary(names: readonly string[]): string {
  const distinct = [...new Set(names.filter((n) => n && n.trim() !== ""))];
  if (distinct.length === 0) return "";
  if (distinct.length === 1) return distinct[0];
  return `${distinct.length} suppliers`;
}

/** `Deliver To` — the governed destination; several print `Multiple`. */
export function manualPurchaseDeliverToSummary(names: readonly string[]): string {
  const distinct = [...new Set(names.filter((n) => n && n.trim() !== ""))];
  if (distinct.length === 0) return "";
  if (distinct.length === 1) return distinct[0];
  return MANUAL_PURCHASE_WORDS.multiple;
}

/**
 * `For` — the STRUCTURED object the purchase serves (Card 04 §3.6), one
 * arithmetic for the Register and the object. Ready Stock and Showroom
 * Display are served by the governed destination; Service Case by its
 * linked Case number; Internal Staff Purchase by the real person;
 * Subsidiary Purchase by the actual company; Other Purchase by its
 * required `What is this for?` answer. A historical row without the
 * structured fact prints nothing rather than a guess — and a retired
 * purpose has no structured For at all, so it prints its stored reason
 * only when that IS the row's own truth (`other_purchase`), never
 * borrowed.
 */
export function manualPurchaseForOf(f: {
  purpose: string;
  destinationName: string | null;
  serviceCaseNo: string | null;
  staffName: string | null;
  subsidiaryName: string | null;
  why: string | null;
}): string {
  switch (f.purpose) {
    case "ready_stock":
    case "showroom_display":
      return f.destinationName ?? "";
    case "service_case":
      return f.serviceCaseNo ?? "";
    case "internal_staff_purchase":
      return f.staffName ?? "";
    case "subsidiary_purchase":
      return f.subsidiaryName ?? "";
    case "other_purchase":
      return f.why ?? "";
    default:
      // A retired historical purpose has no structured For — honest blank.
      return "";
  }
}

/**
 * WHO MAY BE TICKED (Card 04 §3, Selection): ONLY a request whose derived
 * status is `Ready to order` with live remaining quantity. Need approval,
 * refused/withdrawn, fully ordered and arrived rows refuse the tick — the
 * same truth `manualPurchaseStatusOf` already derives, asked once.
 */
export function manualPurchaseSelectable(
  status: ManualPurchaseStatusKind,
  remainingQty: number,
): boolean {
  return status === "ready_to_order" && remainingQty > 0;
}

/**
 * HOW MANY PURCHASE ORDERS THE SELECTION ISSUES — the document-partition
 * arithmetic the issue door groups by (0380/0399, widened by Card 06: a
 * document never mixes suppliers, categories, destinations, purposes or
 * DELIVERY DATES — one PO has one official supplier-facing delivery date, so
 * different approved Manual Delivery Dates create different POs; the
 * register issues `together`, so the wall alone is the key). The printed
 * `Issue {n} PO{s}` must predict what the server creates; the server still
 * recomputes from its own read, which is agreement rather than trust.
 */
export function manualPurchaseIssueGroupCount(
  lines: ReadonlyArray<{
    supplierId: string | null;
    category: string | null;
    destinationId: string;
    purpose: string;
    /** The line's approved Delivery Date (`required_by`, header fallback);
     *  null on a historical `Not recorded` request. */
    deliveryDate: string | null;
    remainingQty: number;
  }>,
): number {
  const walls = new Set<string>();
  for (const l of lines) {
    if (l.remainingQty <= 0) continue;
    walls.add(
      `${l.supplierId ?? ""}|${l.category ?? ""}|${l.destinationId}|${l.purpose}|${l.deliveryDate ?? ""}`,
    );
  }
  return walls.size;
}

/** `1 selected · 1 unit · Issue 1 PO` — pluralised from facts, never guessed. */
export function manualPurchaseIssueSentence(
  requests: number,
  units: number,
  pos: number,
): string {
  return `${requests} selected · ${units} unit${units === 1 ? "" : "s"} · Issue ${pos} PO${pos === 1 ? "" : "s"}`;
}

// ─── The two Work Engine action contracts — PURCHASING CARD 06 §7 ────────────

/** One request's Work-relevant facts, projected from the register read. */
export interface ManualPurchaseWorkInput {
  requestId: string;
  reqNo: string;
  status: ManualPurchaseStatusKind;
  /** Live remainder still issuable (`manualPurchaseLineRemainingOf` summed). */
  remainingQty: number;
  /** The request's earliest server-derived Order By, or null. */
  orderBy: string | null;
  /** Any linked PO at all (real lineage, Card 04 §3.4). */
  hasPos: boolean;
  /** Every linked PO's CURRENT version has confirmed-sent evidence
   *  (`po_sends.kind = 'confirmed_sent'` at `coalesce(version, 1)`). A
   *  numbered PO or an opened WhatsApp/email completes nothing. */
  posAllSent: boolean;
}

/**
 * THE TWO MANUAL PURCHASE ACTIONS (Card 06 §7; MASTER §9.2 / §10) —
 * composed as the same `WorkItem` shape the order track feeds My Work /
 * Team Work, so the central surfaces group, filter and date them with the
 * one existing grammar. This is a LENS over stored facts; it stores
 * nothing, exposes no manual `Done`, and the local rail filters these same
 * identities.
 *
 *   Approve {MPR}                              the configured real approver
 *   Issue the purchase order for {MPR}         normal PO Duty / dated cover
 *
 * Both are due no later than the request's Order By (the Office calendar
 * counts lateness — Purchasing/Operation work runs Mon–Fri, MASTER §10).
 * Approval completes ONLY when the stored decision exists; issuance ONLY
 * when the current PO version's confirmed-sent evidence exists — never by
 * opening a page, numbering a PO or opening WhatsApp/email. Owners resolve
 * from their real rosters; nobody resolved → the honest duty word stands
 * (`work-engine.ts`'s own law). An Operations Superuser may ACT through the
 * governed doors without appearing as the owner here.
 */
export function manualPurchaseWorkItems(
  input: ManualPurchaseWorkInput,
  ctx: {
    /** The resolved `ops_manager` approver (Jess today) — a real person. */
    approver: { userId: string; name: string | null } | null;
    /** The month's NORMAL PO Duty holder — Team Work groups by them; a
     *  dated cover changes who acts, never the normal owner group. */
    poDuty: { userId: string; name: string | null } | null;
  },
  todayIso: string,
  opts: WorkingDayOptions = {},
): WorkItem[] {
  const officeOpts: WorkingDayOptions = {
    ...opts,
    offDays: PURCHASING_OFFICE_OFF_DAYS,
  };
  const today = todayIso.slice(0, 10);
  const late = (dueIso: string | null): number =>
    dueIso && today > dueIso ? countWorkingDays(dueIso, today, officeOpts) : 0;

  const items: WorkItem[] = [];
  if (input.status === "waiting_approval") {
    items.push({
      ruleKey: "manual_purchase.approve",
      module: "purchasing",
      soRef: input.reqNo,
      orderId: input.requestId,
      action: `Approve ${input.reqNo}`,
      ownerName: ctx.approver?.name ?? null,
      ownerUserId: ctx.approver?.userId ?? null,
      ...(ctx.approver ? {} : { ownerDuty: "Purchasing" }),
      tone: "warning",
      locked: false,
      broken: false,
      dueIso: input.orderBy,
      workingDaysLate: late(input.orderBy),
    });
  }
  /* Approved remaining demand — or an issued document whose CURRENT version
     the supplier has not provably received — keeps the issue action open.
     Refused / fully-cancelled / arrived requests carry no issuance work. */
  const issueOpen =
    (input.status === "ready_to_order" && input.remainingQty > 0) ||
    (input.status === "ordered" && input.hasPos && !input.posAllSent);
  if (issueOpen) {
    items.push({
      ruleKey: "manual_purchase.issue_po",
      module: "purchasing",
      soRef: input.reqNo,
      orderId: input.requestId,
      action: `Issue the purchase order for ${input.reqNo}`,
      ownerName: ctx.poDuty?.name ?? null,
      ownerUserId: ctx.poDuty?.userId ?? null,
      ...(ctx.poDuty ? {} : { ownerDuty: "Purchasing" }),
      tone: "info",
      locked: false,
      broken: false,
      dueIso: input.orderBy,
      workingDaysLate: late(input.orderBy),
    });
  }
  return items;
}
