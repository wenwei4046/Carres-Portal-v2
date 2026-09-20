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
import type { WorkspaceDutyResolution } from "./workspace-duty";
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
  /** 0422 — the chosen date is before the earliest Delivery Date a Manual
   *  Purchase may ask for (Proceed Date + the Purchasing Settings number);
   *  the sentence under the field says so. */
  sendNeedsLaterDate: "Send — pick a later date",
  sendNeedsWhy: "Send — say what it is for",
  sendNeedsServiceCase: "Send — pick the Service Case",
  sendNeedsStaff: "Send — pick the staff member",
  sendNeedsSubsidiary: "Send — name the subsidiary",
  /**
   * ⭐ THE RECORDED INTENT, ASKED AT CREATION (0549) — and the reason it is a
   * QUESTION rather than a derivation.
   *
   * The owner ruling of 2026-09-18 requires the intent to be STORED and
   * forbids inferring it from the SKU, the shelf count or the purpose. 0546
   * built the column, the door and every guard that reads it — and nothing
   * ever wrote it, so every request stored NULL and not one Unit could be
   * allocated. This is the question that feeds them.
   *
   * ⛔ NO DEFAULT. A pre-selected answer is a guess wearing the operator's
   * name, which is the exact thing the ruling bans; the field starts empty and
   * `Send` names the gap like every other missing header fact.
   *
   * The words reuse the vocabulary the read-only reasons already carry —
   * `This purchase buys extra stock` and `whether stock can answer it` — so
   * the question and its later consequence read as one sentence rather than
   * two dialects.
   */
  canStockAnswer: "Can stock answer this?",
  canStockAnswerYes: "Yes — existing stock can answer this",
  canStockAnswerNo: "No — this buys extra stock",
  sendNeedsStockAnswer: "Send — say whether stock can answer this",
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
   * THE PERMANENT REGISTER'S NINE COLUMNS — the settled design, owner
   * ruling 2026-09-11, exactly and in this order:
   *
   * ```
   * Approval · Requested By · Proceed Date · PO No · Purpose · Items ·
   * Supplier · Deliver To · Delivery Date
   * ```
   *
   * A Manual Purchase has NO visible document number: before `Issue PO`
   * there is nothing to show, after it the only purchasing document
   * identity is the actual `PO No`. `Manual Purchase No` / `MPR` are
   * retired words.
   *
   * ⛔ THREE THINGS THAT LEFT THIS ROW AND MUST NOT RETURN.
   *   · `Qty` — a request's total ask is not a buying decision on the
   *     parent row; the exact quantities are the goods table's and the
   *     object's, at the grain they were actually allocated.
   *   · `For` — replaced by `Purpose`, the SIX governed purchase purposes
   *     and the row's single-click entrance. The structured `For` fact
   *     keeps its home on the object (`colFor` below).
   *   · `Status` · `Partial` · `PO Sent` · `PO Created` · `Reason` · `MPR`
   *     and any request-number column.
   *
   * Order By drives timing/work and the quiet second line only.
   * `Requested Date` and `Needed By` stay retired.
   */
  colApproval: "Approval Status",
  /** Round 2 (owner ruling R2, 2026-09-16) — the engine-derived Order By
   *  column; missing setup reads `Not planned`. */
  colOrderBy: "Order By",
  notPlanned: "Not planned",
  /**
   * THE THREE REGISTER GROUPS (owner ruling R2, 2026-09-16) — table group
   * headings, never rail rows or stored statuses. Membership is ONE
   * arithmetic: `manualPurchaseGroupOf`.
   */
  groupNeedApproval: "Need approval",
  /**
   * ⭐ `To buy` AND `No purchase needed` ARE RETIRED ON THIS PAGE (owner
   * ruling 2026-09-18). The heading now says the same thing the row's own
   * `Status` cell says, in the same two words, so a group and the rows inside
   * it cannot read as two different answers. SO Batch Purchase keeps its own
   * register groups — this renames Manual Purchase only.
   */
  groupNeedPo: "Need PO",
  groupNoPoNeeded: "No PO needed",
  groupNeedApprovalEmpty: "Nothing waiting for approval",
  noMatch: "No Manual Purchases match these filters",
  footerOne: "1 Manual Purchase",
  footerMany: "Manual Purchases",
  search: "Search Manual Purchases",
  /**
   * An APPROVED request whose remaining quantity could not be read. It stays
   * in `To buy`, says so, and cannot be ticked — unknown is never zero and
   * never complete (MASTER §9.2).
   */
  remainderNotChecked: "Remaining quantity not checked",
  remainderNotCheckedWhy:
    "The quantity still to buy could not be read, so it is not offered for buying. Reopen the page to check again.",
  /** R3 / R4 — the requester's and approver's round controls. */
  withdraw: "Withdraw request",
  sendBack: "Send back",
  editAndSendAgain: "Edit and send again",
  sendAgain: "Send again for approval",
  /** Who acts next on a sent-back request — the real requester. */
  nextActorRequester: "Edit and send again",
  colRequestedBy: "Requested By",
  colProceedDate: "Proceed Date",
  colPoNo: "PO No",
  colPurpose: "Purpose",
  colItems: "Items",
  colSupplier: "Supplier",
  /** The OBJECT still reads `Deliver To`; the four reviewed LISTINGS read
   *  `Supplier Deliver To` (Purchasing UI dictionary, 2026-09-18) — the
   *  destination instructed to the supplier, which is not the customer's
   *  address and not the site the goods actually reach. */
  colDeliverTo: "Deliver To",
  colSupplierDeliverTo: "Supplier Deliver To",
  colDeliveryDate: "Delivery Date",
  /**
   * ── THE COLUMNS THE 2026-09-18 RULING ADDED ──────────────────────────────
   *
   * `Status` is the purchase NEED and is independent of `Approval Status`:
   * `Need PO` may stand beside `Need approval`, because the goods are needed
   * and the decision is separate. Never print one in the other's column.
   */
  colStatus: "Status",
  colMprNo: "MPR No",
  /** A request minted between 0424 and 0546 stored no number. The absence is
   *  a FACT and is never an invented `MPR-…`; the row still opens. */
  mprNotRecorded: "Not recorded",
  colPoSafetyDays: "PO Safety Days",
  colCustomerRequestedDeliveryDate: "Customer Requested Delivery Date",
  colCustomerDeliveryLocation: "Customer Delivery Location",
  colCustomer: "Customer",
  colPoDefaultDeliveryDate: "PO Default Delivery Date",
  colCategory: "Category",
  colQty: "Qty",
  colItem: "Item",
  colReadyStock: "Ready Stock",
  /**
   * THE STOCK SELECTION JOURNEY (owner ruling 2026-09-18). Four controls and
   * no fifth: there is no per-Unit Undo, because a Unit is not a document and
   * an act that releases one of five choices is the same act that saves them.
   */
  chooseReadyUnit: "Choose Ready Unit",
  changeSelection: "Change selection",
  saveChanges: "Save changes",
  cancelChanges: "Cancel",
  stockNotSaved: "Not saved",
  stockSaved: "Stock selection saved.",
  stockSaveOrCancelFirst: "Save or cancel your stock selection before issuing a PO.",
  stockReadFailed: "Ready Stock could not be read.",
  stockReading: "Reading the stock register…",
  stockNoneMatches: "No stock on the shelf matches this item.",
  /** The OBJECT's structured `For` fact — never a Register column again. */
  colFor: "For",
  /** The PO lineage absence — the arithmetic ran and found no PO. The
   *  Register cell states the bare fact (Card 08 §3.2: `—` is a fact, not
   *  a button); the object's Purchase Orders section keeps the sentence. */
  poNone: "—",
  notOrderedYet: "Not ordered yet",
  /** THE TWO WORK ACTION SENTENCES (Card 08 §3.4) — no number, no person's
   *  name, no UUID. The Work row's context line distinguishes the purchase
   *  through its business facts (`manualPurchaseWorkContext`). */
  workApprove: "Approve purchase",
  workIssuePo: "Issue PO",
  /** Several destinations behind one request. */
  multiple: "Multiple",
  /**
   * THE ROW EXPANSION IS THE SHARED GOODS TABLE — settled design, owner
   * ruling 2026-09-11. Manual Purchase and SO Batch Purchase draw ONE
   * `GoodsMiniTable`; Manual Purchase asks for
   * `SKU · Qty · Supplier · Deliver To · PO No · PO Delivery Date · Item`
   * and omits `Unit ID` (a Manual Purchase line has no per-line Unit read)
   * and `Covered by` (its PO lineage has its own column here).
   *
   * ⛔ `Still To Order` LEFT THE EXPANSION. Every goods row is now at the
   * grain the quantity was ACTUALLY allocated at — one row per purchase
   * order the line went onto, carrying that document's own quantity, plus
   * one row for what is still to buy. A remainder column beside a repeated
   * whole-request quantity was the thing that made the two disagree.
   * The original ask and the approver's number keep their authoritative
   * home in the object's `Items Requested` and `Approval` sections.
   */
  expSku: "SKU",
  expItem: "Item",
  expRequestedQty: "Requested Qty",
  expApprovedQty: "Approved Qty",
  expOrderedQty: "Ordered Qty",
  expStillToOrder: "Still To Order",
  expSupplier: "Supplier",
  expDeliverTo: "Deliver To",
  expPoNo: "PO No",
  /** The goods row that is not on any purchase order yet. */
  goodsToPurchase: "To purchase",
  /**
   * A quantity the store says was ISSUED, on a line whose purchase order it
   * cannot name. Measured 2026-09-11: zero such rows exist, and the issue
   * door always writes the document — but the arithmetic can produce the
   * case, and `Not ordered yet` would be a lie about goods that were bought.
   * An absence states what is missing; it never borrows the opposite fact.
   */
  poNotRecorded: "Purchase order not recorded",
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
  /**
   * ⭐ D3 · A SKU REFERENCE IS NOT THIS REQUEST'S LINEAGE (Round 2). The free
   * stock and open-PO figures describe the SKU across the whole business;
   * this request's own POs are the `Purchase Orders` section. The sentence
   * says so once, so `Still Needed 0` beside `Not ordered yet` stops reading
   * as a contradiction. Reference stock never reduces the request.
   */
  skuReferenceNote:
    "For each SKU across Carres — free stock and open purchase orders. This request's own purchase orders are listed below. Stock shown here does not reduce what this request asks for.",
  /** Approval — the decision facts and controls. */
  approve: "Approve",
  refuse: "Refuse",
  decisionReason: "Decision reason",
  colTransactionCost: "Transaction Cost",
  colLineTotal: "Line Total",
  /** Purchase Orders — the exact lineage's date words (MASTER §9.3). */
  colPoIssued: "PO Issued",
  /**
   * ⭐ D5 · ONE MEANING PER WORD (Round 2, 2026-09-17). `PO Issued` on the
   * Purchase Orders page is the CURRENT version's marked-sent date. This
   * object used to print `purchase_orders.placed_at` under the same head — the
   * date the document was CREATED, which is a different fact. It now prints
   * the marked-sent date too, and a document nobody marked reads the governed
   * `Sending not confirmed` (§5.6) instead of a creation date wearing the word.
   */
  notMarkedAsSent: "Sending not confirmed",
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
  /** Round 2 — every return round is kept (R4) and a withdrawal (R3). */
  sent_back: "Sent back for changes",
  resubmitted: "Sent again for approval",
  withdrawn: "Withdrawn",
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
  /** `resubmitted` — the round number and what changed, in plain words. */
  round?: number | null;
  changes?: string[] | null;
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
    case "sent_back":
      return { title, detail: e.reason ? [e.reason] : [] };
    case "resubmitted":
      return {
        title,
        detail: [
          ...(e.round != null ? [`Round ${e.round}`] : []),
          ...(e.changes ?? []),
        ],
      };
    case "withdrawn":
      return { title, detail: [] };
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
 * THE APPROVAL COLUMN'S FIVE ANSWERS (owner rulings 2026-09-16) — the approval
 * FACT, never the request's whole status. `No approval needed` is retired:
 * every Manual Purchase requires approval (R1). A historical row stored with
 * `approval_required = false` and no decision reads `Need approval` — the safe
 * side, and no row is backfilled.
 */
export const MANUAL_PURCHASE_APPROVAL_WORDS = {
  need_approval: "Need approval",
  approved: "Approved",
  refused: "Refused",
  withdrawn: "Withdrawn",
  sent_back: "Sent back for changes",
} as const;

export type ManualPurchaseApprovalKind = keyof typeof MANUAL_PURCHASE_APPROVAL_WORDS;

/** The stored decision facts one request carries. */
export interface ManualPurchaseDecisionFacts {
  approvedAt: string | null;
  refusedAt: string | null;
  /** R3 — absent on an older API: read as not withdrawn. */
  withdrawnAt?: string | null;
  /** R4 — set while the request is back with its requester. */
  sentBackAt?: string | null;
}

/** ONE approval arithmetic over the stored decision facts (Law D). */
export function manualPurchaseApprovalOf(
  r: ManualPurchaseDecisionFacts,
): { kind: ManualPurchaseApprovalKind; label: string } {
  const kind: ManualPurchaseApprovalKind =
    r.withdrawnAt != null
      ? "withdrawn"
      : r.refusedAt !== null
        ? "refused"
        : r.approvedAt !== null
          ? "approved"
          : r.sentBackAt != null
            ? "sent_back"
            : "need_approval";
  return { kind, label: MANUAL_PURCHASE_APPROVAL_WORDS[kind] };
}

/**
 * The states (card §5). `Waiting` always names what it waits ON; `Arrived`
 * is a FACT the system observes, never a button.
 */
export type ManualPurchaseStatusKind =
  | "waiting_approval"
  | "sent_back"
  | "withdrawn"
  | "waiting_sku"
  | "ready_to_order"
  | "ordered"
  | "arrived"
  | "not_going_ahead";

export const MANUAL_PURCHASE_STATUS_WORDS: Record<ManualPurchaseStatusKind, string> = {
  waiting_approval: "Waiting for approval",
  sent_back: "Sent back for changes",
  withdrawn: "Withdrawn",
  waiting_sku: "Waiting for the SKU",
  ready_to_order: "Ready to order",
  ordered: "Ordered",
  arrived: "Arrived",
  not_going_ahead: "Not going ahead",
};

/** What the arithmetic reads about one request. All facts, no decisions. */
export interface ManualPurchaseStatusInput extends ManualPurchaseDecisionFacts {
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
 *   Withdrawn        — the requester took it back before a decision (R3).
 *   Sent back for changes — the approver returned it; the requester acts (R4).
 *   Waiting for approval — nobody has decided. Every request asks (R1).
 *   Arrived          — every live line's PO has a posted receipt (slice 3
 *                      feeds `received`; until then no row reaches it).
 *   Ordered          — every live line fully issued onto a PO.
 *   Ready to order   — everything else: approved with something left to buy.
 */
export function manualPurchaseStatusOf(r: ManualPurchaseStatusInput): ManualPurchaseStatus {
  const live = r.lines.filter((l) => l.cancelledAt === null);

  if (r.withdrawnAt != null) {
    return {
      kind: "withdrawn",
      label: MANUAL_PURCHASE_STATUS_WORDS.withdrawn,
      reasonLabel: null,
    };
  }

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
  if (r.approvedAt === null && r.sentBackAt != null) {
    return {
      kind: "sent_back",
      label: MANUAL_PURCHASE_STATUS_WORDS.sent_back,
      reasonLabel: null,
    };
  }
  /* R1 — every request waits for its approval; there is no exemption. */
  if (r.approvedAt === null) {
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

// ─── The rail and the groups — MANUAL PURCHASE ROUND 2 (owner rulings R2,
//     2026-09-16; `docs/purchasing/MASTER.md` §9.2) ─────────────────────────

/**
 * THE MANUAL PURCHASE RAIL CONTRACT — five sections, in this exact order, on
 * the shared 240px `FilterRail`:
 *
 *   ORDER TIMING   earliest engine-derived Order By against the server date,
 *                  counting ONLY requests that still have quantity to buy.
 *   PURPOSE        the six governed purposes (compact dropdown).
 *   PRODUCT        the Catalog categories (compact dropdown).
 *   SUPPLIER       actual names, alphabetical (compact dropdown).
 *   SETUP TO FIX   `Supplier not set` · `Production days not set` ·
 *                  `Transit days not set` — only while an affected request
 *                  exists.
 *
 * ⛔ `WORK TO DO` and `TO ORDER / All not ordered` are RETIRED from this page.
 * Central Work keeps its action identities; the Register's three groups say
 * what is waiting, what is to buy and what needs nothing. A filter never
 * grants action authority.
 */
export const MANUAL_PURCHASE_RAIL = {
  timing: {
    heading: "Order timing",
    rows: [
      { state: "can_order_early", word: "Can order early" },
      { state: "order_date_reached", word: "Order date reached" },
      { state: "order_date_passed", word: "Order date passed" },
    ],
  },
  purpose: { heading: "Purpose", all: "All purposes", rows: DEMAND_PURPOSES },
  /** The Catalog category rows — SO Batch's own list, shared (Law D). */
  product: SO_BATCH_RAIL.product,
  supplier: { heading: "Supplier", all: "All suppliers" },
  setup: {
    heading: "Setup to fix",
    rows: [
      { key: "supplier_not_set", word: "Supplier not set" },
      { key: "production_days_not_set", word: "Production days not set" },
      { key: "transit_days_not_set", word: "Transit days not set" },
    ],
  },
} as const;

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

/** The three governed Register groups (R2). Never a stored status. */
export type ManualPurchaseGroup = "need-approval" | "to-buy" | "no-purchase-needed";

/**
 * ⭐ ONE REQUEST, EXACTLY ONE GROUP — owner ruling R2, 2026-09-16.
 *
 * ```
 * Need approval       waiting for a decision, or sent back for changes
 * To buy              APPROVED and quantity remains (incl. `Not planned`),
 *                     or APPROVED and the remainder could not be read
 * No purchase needed  refused · withdrawn · fully ordered/arrived ·
 *                     approved with a confirmed remainder of 0
 * ```
 *
 * The approval checks run FIRST, so a pending request never reaches `To buy`
 * however much it asks for, and a refused one never stays in `Need approval`.
 * `remainderKnown: false` is NOT zero: an approved request whose lines failed
 * to load stays in `To buy`, says so, and refuses the tick.
 */
export function manualPurchaseGroupOf(r: {
  approval: ManualPurchaseApprovalKind;
  status: ManualPurchaseStatusKind;
  remainingQty: number;
  remainderKnown: boolean;
}): ManualPurchaseGroup {
  if (r.approval === "need_approval" || r.approval === "sent_back") return "need-approval";
  if (r.approval === "refused" || r.approval === "withdrawn") return "no-purchase-needed";
  // Approved.
  if (!r.remainderKnown) return "to-buy";
  if (r.status === "not_going_ahead" || r.status === "ordered" || r.status === "arrived") {
    return "no-purchase-needed";
  }
  return r.remainingQty > 0 ? "to-buy" : "no-purchase-needed";
}

/**
 * THE ORDER BY CELL (R2): the date when the engine derived one; `Not planned`
 * when the request still waits or is still to buy and no date can be derived
 * (missing Supplier/Settings, or a historical row with no Delivery Date);
 * blank when nothing is left to buy.
 */
export function manualPurchaseOrderByCell(
  group: ManualPurchaseGroup,
  orderBy: string | null,
): { date: string | null; notPlanned: boolean } {
  if (group === "no-purchase-needed") return { date: null, notPlanned: false };
  return { date: orderBy, notPlanned: orderBy == null };
}

/**
 * THE DEFAULT READING ORDER (R2). Inside `Need approval` and `To buy`:
 * Order By ascending → `Not planned` → newest Proceed Date. Inside
 * `No purchase needed`: newest Proceed Date. The DataGrid draws the groups;
 * this orders the rows each group receives.
 */
export function compareManualPurchaseRows(
  a: { group: ManualPurchaseGroup; orderBy: string | null; proceedDate: string },
  b: { group: ManualPurchaseGroup; orderBy: string | null; proceedDate: string },
): number {
  const rank: Record<ManualPurchaseGroup, number> = {
    "need-approval": 0,
    "to-buy": 1,
    "no-purchase-needed": 2,
  };
  if (a.group !== b.group) return rank[a.group] - rank[b.group];
  if (a.group !== "no-purchase-needed") {
    const ao = a.orderBy ?? "9999-12-31";
    const bo = b.orderBy ?? "9999-12-31";
    if (ao !== bo) return ao.localeCompare(bo);
  }
  return b.proceedDate.localeCompare(a.proceedDate);
}

/**
 * WHAT THE OPERATOR HAS PICKED — one slot per section; `null` is that
 * section's `All …`. Sections combine with AND; clearing every slot restores
 * the complete permanent Register in its three groups.
 */
export interface ManualPurchaseRailFilter {
  timing: ManualPurchaseTimingState | null;
  purpose: DemandPurpose | null;
  product: SoBatchProductCategory | null;
  supplier: string | null;
  setup: ManualPurchaseSetupKey | null;
}

export const MANUAL_PURCHASE_RAIL_CLEAR: ManualPurchaseRailFilter = {
  timing: null,
  purpose: null,
  product: null,
  supplier: null,
  setup: null,
};

/** One request's rail-relevant facts, projected once from the register read. */
export interface ManualPurchaseRailFacts {
  requestId: string;
  group: ManualPurchaseGroup;
  purpose: string;
  categories: ReadonlySet<ProductCategory>;
  suppliers: ReadonlySet<string>;
  orderBy: string | null;
  /** Null when there is no Order By OR nothing is left to buy — ORDER TIMING
   *  counts only requests with remaining quantity. */
  timing: ManualPurchaseTimingState | null;
  supplierGap: boolean;
  productionDaysMissing: boolean;
  transitDaysMissing: boolean;
}

export function manualPurchaseRailFacts(
  rows: readonly {
    requestId: string;
    group: ManualPurchaseGroup;
    purpose: string;
    remainingQty: number;
    remainderKnown: boolean;
    lineCategories: readonly (ProductCategory | null | undefined)[];
    lineSupplierNames: readonly (string | null | undefined)[];
    lineOrderBys: readonly (string | null | undefined)[];
    supplierGap: boolean;
    productionDaysMissing: boolean;
    transitDaysMissing: boolean;
  }[],
  todayIso: string | null,
): ManualPurchaseRailFacts[] {
  return rows.map((r) => {
    const orderBy = manualPurchaseOrderByOf(r.lineOrderBys);
    /* ⭐ ORDER TIMING COUNTS ONLY WHAT IS STILL TO BUY (R2). A request with
       nothing left, or one whose remainder could not be read, is not a buying
       deadline — it is history or an unknown, and neither is "order today". */
    const buying = r.group !== "no-purchase-needed" && r.remainderKnown && r.remainingQty > 0;
    return {
      requestId: r.requestId,
      group: r.group,
      purpose: r.purpose,
      categories: new Set(
        r.lineCategories.filter((c): c is ProductCategory => c != null),
      ),
      suppliers: new Set(
        r.lineSupplierNames.filter((s): s is string => s != null && s !== ""),
      ),
      orderBy,
      timing: buying ? manualPurchaseTimingOf(orderBy, todayIso) : null,
      supplierGap: r.supplierGap,
      productionDaysMissing: r.productionDaysMissing,
      transitDaysMissing: r.transitDaysMissing,
    };
  });
}

type ManualPurchaseRailSection = keyof ManualPurchaseRailFilter;

function hasSetup(f: ManualPurchaseRailFacts, key: ManualPurchaseSetupKey): boolean {
  switch (key) {
    case "supplier_not_set":
      return f.supplierGap;
    case "production_days_not_set":
      return f.productionDaysMissing;
    case "transit_days_not_set":
      return f.transitDaysMissing;
  }
}

function railMatches(
  f: ManualPurchaseRailFacts,
  filter: ManualPurchaseRailFilter,
  except?: ManualPurchaseRailSection,
): boolean {
  if (except !== "timing" && filter.timing != null && f.timing !== filter.timing) return false;
  if (except !== "purpose" && filter.purpose != null && f.purpose !== filter.purpose) return false;
  if (except !== "product" && filter.product != null && !f.categories.has(filter.product)) {
    return false;
  }
  if (except !== "supplier" && filter.supplier != null && !f.suppliers.has(filter.supplier)) {
    return false;
  }
  if (except !== "setup" && filter.setup != null && !hasSetup(f, filter.setup)) return false;
  return true;
}

/**
 * WHAT THE RAIL PRINTS. Every count is UNIQUE Manual Purchase requests,
 * computed under the OTHER sections' selections, so the printed number
 * predicts exactly the rows a click would show. The selected supplier stays
 * visible with `0`. `SETUP TO FIX` renders only while an affected request
 * exists.
 */
export interface ManualPurchaseRailModel {
  visibleRequestIds: ReadonlySet<string>;
  timingCounts: Record<ManualPurchaseTimingState, number>;
  purposeCounts: Record<DemandPurpose, number>;
  productCounts: Record<SoBatchProductCategory, number>;
  suppliers: Array<{ name: string; count: number }>;
  setupCounts: Record<ManualPurchaseSetupKey, number>;
  /** Which setup rows exist at all — a row with nothing behind it is not drawn. */
  setupRows: ManualPurchaseSetupKey[];
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
  const setupRows = MANUAL_PURCHASE_RAIL.setup.rows
    .map((row) => row.key)
    .filter((key) => facts.some((f) => hasSetup(f, key)) || filter.setup === key);

  const supplierCounts = new Map<string, number>();
  for (const f of facts) {
    if (!railMatches(f, filter, "supplier")) continue;
    for (const name of f.suppliers) {
      supplierCounts.set(name, (supplierCounts.get(name) ?? 0) + 1);
    }
  }
  if (filter.supplier != null && !supplierCounts.has(filter.supplier)) {
    supplierCounts.set(filter.supplier, 0);
  }

  return {
    visibleRequestIds: new Set(
      facts.filter((f) => railMatches(f, filter)).map((f) => f.requestId),
    ),
    timingCounts,
    purposeCounts,
    productCounts,
    suppliers: [...supplierCounts]
      .map(([name, n]) => ({ name, count: n }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    setupCounts,
    setupRows,
    setupExists: setupRows.length > 0,
  };
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
  /* 0533 (owner ruling 2026-09-18): unheld is said, never hidden — and never
     filled from the operations manager or an email list. A resolved approver
     whose name could not be read prints nothing rather than a false "nobody". */
  if (names.length === 0) return "Nobody holds Purchasing Approver.";
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
 * `PO No` — ONLY real lineage (Card 04 §3.4, cell facts corrected by Card
 * 08 §3.2): the distinct actual `purchase_orders.po_no` values behind the
 * request's lines. None: `—` (a fact, not a button — before `Issue PO` a
 * Manual Purchase has no document identity). One: the number itself (the
 * caller renders it as the clickable door). Several: `{n} POs` (the caller
 * opens the object's exact linked PO list). Never a UUID, never an
 * inference, never an `MPR`.
 */
export function manualPurchasePoSummary(poNos: readonly string[]): string {
  const distinct = [...new Set(poNos.filter((n) => n && n.trim() !== ""))];
  if (distinct.length === 0) return MANUAL_PURCHASE_WORDS.poNone;
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
 * A PURCHASE ORDER'S VISIBLE MANUAL PURCHASE SOURCE WORDING (Card 08 §3.5):
 * one source prints `Manual Purchase`, several print `{n} Manual Purchases`.
 * The count is DISTINCT source request UUIDs — never a count of labels, and
 * never an MPR number. Zero sources print nothing (null).
 */
export function manualPurchaseSourceSummary(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return MANUAL_PURCHASE_WORDS.page;
  return `${count} Manual Purchases`;
}

/**
 * ONE detailed source line's words (Card 08 §3.5) — when a surface lists
 * manual sources individually and the label alone cannot tell two apart,
 * the business facts distinguish them: `Manual Purchase · {purpose} ·
 * {Proceed Date}`. Empty facts drop out; the label never becomes a number.
 */
export function manualPurchaseSourceLine(f: {
  purposeLabel: string | null;
  proceedDateLabel: string | null;
}): string {
  return [MANUAL_PURCHASE_WORDS.page, f.purposeLabel, f.proceedDateLabel]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(" · ");
}

/**
 * WHO MAY BE TICKED: ONLY an APPROVED request whose derived status is
 * `Ready to order` with a CONFIRMED live remainder. A pending, sent-back,
 * refused or withdrawn request refuses the tick, and so does an approved one
 * whose remainder could not be read (unknown is never "go ahead").
 */
export function manualPurchaseSelectable(
  status: ManualPurchaseStatusKind,
  remainingQty: number,
  remainderKnown = true,
): boolean {
  return status === "ready_to_order" && remainderKnown && remainingQty > 0;
}

/**
 * WHY THE TICK IS DEAD — the sentence beside a `To buy` row the tick refuses;
 * `null` when it may be ticked, and `null` for rows whose group already says
 * why (a pending request under `Need approval` does not repeat itself).
 */
export function manualPurchaseNotSelectableReason(
  status: ManualPurchaseStatusKind,
  remainingQty: number,
  approvalKind?: ManualPurchaseApprovalKind,
  remainderKnown = true,
): string | null {
  if (manualPurchaseSelectable(status, remainingQty, remainderKnown)) return null;
  if (approvalKind === "approved" && !remainderKnown) {
    return MANUAL_PURCHASE_WORDS.remainderNotChecked;
  }
  const approvedAtZero =
    status === "ready_to_order" ||
    (status === "not_going_ahead" && approvalKind === "approved");
  if (approvedAtZero) return "Approved at 0. Nothing to order.";
  return `${MANUAL_PURCHASE_STATUS_WORDS[status]}.`;
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

// ─── The two Work Engine action contracts — PURCHASING CARD 06 §7,
//     wording corrected by CARD 08 §3.4 (no MPR, no name, no UUID) ─────────────

/**
 * THE WORK ROW'S BUSINESS CONTEXT (Card 08 §3.4) — the words that
 * distinguish one Manual Purchase from another now that no visible number
 * exists: `Manual Purchase · {Need for} · {For} · {supplier summary}`,
 * empty facts dropped. ONE composition (Law D) for My Work, Team Work and
 * the Quick Rail; the record stays distinct through its structured
 * `orderId` (the request UUID), which is never printed.
 */
export function manualPurchaseWorkContext(f: {
  purposeLabel: string | null;
  forText: string | null;
  supplierSummary: string | null;
}): string {
  return [MANUAL_PURCHASE_WORDS.page, f.purposeLabel, f.forText, f.supplierSummary]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(" · ");
}

/**
 * THE OBJECT HEADER'S IDENTITY (Card 08 §3.3) — `{Need for} · {For}`; the
 * quieter context line is `{Proceed Date} · {supplier summary}`. No MPR,
 * no UUID, composed once for the Register hand-off and the loaded object.
 */
export function manualPurchaseObjectHeading(f: {
  purposeLabel: string | null;
  forText: string | null;
}): string {
  const parts = [f.purposeLabel, f.forText]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "");
  return parts.length > 0 ? parts.join(" · ") : MANUAL_PURCHASE_WORDS.page;
}

/** One request's Work-relevant facts, projected from the register read. */
export interface ManualPurchaseWorkInput {
  requestId: string;
  /** The composed business context (`manualPurchaseWorkContext`) — the
   *  visible reference the Work row prints instead of a document number. */
  context: string;
  status: ManualPurchaseStatusKind;
  /** Live remainder still issuable (`manualPurchaseLineRemainingOf` summed). */
  remainingQty: number;
  /** The request's earliest server-derived Order By, or null. */
  orderBy: string | null;
  /**
   * Any linked PO at all (real lineage, Card 04 §3.4).
   *
   * ⚠️ READ, BUT NO LONGER A REASON TO RAISE WORK — see `posAllSent`.
   */
  hasPos: boolean;
  /**
   * Every linked PO's CURRENT version has confirmed-sent evidence
   * (`po_sends.kind = 'confirmed_sent'` at `coalesce(version, 1)`).
   *
   * ⛔ THIS NO LONGER OPENS `Issue PO` — owner ruling 2026-09-11.
   *
   * Card 06 §7 kept the issue action open on a FULLY ORDERED request whose
   * purchase orders carried no confirmed-sent row. Measured on production
   * 2026-09-11: 62 purchase orders exist and 3 carry that evidence, so the
   * rule raised a `Issue PO` task against 59 documents that had already been
   * issued — and whose only fault was that nobody ticked a confirmation.
   *
   * An existing numbered PO IS an existing commitment, evidence or not.
   * Copying a PO into WhatsApp is not proof of sending, and the absence of
   * proof is not a reason to issue a second purchase order or to invent a
   * confirmation chore. The field stays because the evidence itself is real,
   * is preserved, and is worth showing on the document; it simply may not
   * manufacture work.
   */
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
 *   Approve purchase                           the configured real approver
 *   Issue PO                                   normal PO Duty / dated cover
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
    /** Shared resolver answer; when present, acting cover and normal owner
     * remain separate. `poDuty` is the one-release compatibility input. */
    poDutyResolution?: WorkspaceDutyResolution | null;
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
    const approver = ctx.approver
      ? { userId: ctx.approver.userId, name: ctx.approver.name }
      : null;
    items.push({
      ruleKey: "manual_purchase.approve",
      module: "purchasing",
      soRef: input.context,
      orderId: input.requestId,
      action: MANUAL_PURCHASE_WORDS.workApprove,
      ownerRule: "purchasing_approver",
      ownerDutyKey: "purchasing_approver",
      normalOwner: approver,
      activeCover: null,
      actingPerson: approver,
      ownerState: approver ? "primary" : "not_assigned",
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
  /* ⭐ APPROVED REMAINING DEMAND, AND NOTHING ELSE (owner ruling 2026-09-11).
     Refused / fully-cancelled / ordered / arrived requests carry no issuance
     work: there is nothing left to buy, and an absent send confirmation is
     not a reason to say there is. */
  const issueOpen = input.status === "ready_to_order" && input.remainingQty > 0;
  if (issueOpen) {
    const resolution = ctx.poDutyResolution;
    const legacy = ctx.poDuty
      ? { userId: ctx.poDuty.userId, name: ctx.poDuty.name }
      : null;
    const normalOwner = resolution?.normalOwner ?? legacy;
    const activeCover = resolution?.activeCover ?? null;
    const actingPerson = resolution?.actingPerson ?? legacy;
    items.push({
      ruleKey: "manual_purchase.issue_po",
      module: "purchasing",
      soRef: input.context,
      orderId: input.requestId,
      action: MANUAL_PURCHASE_WORDS.workIssuePo,
      ownerRule: "po_duty",
      ownerDutyKey: "po_duty",
      normalOwner,
      activeCover,
      actingPerson,
      ownerState: resolution?.state ?? (legacy ? "primary" : "not_assigned"),
      ownerName: actingPerson?.name ?? null,
      ownerUserId: actingPerson?.userId ?? null,
      ...(actingPerson ? {} : { ownerDuty: "Purchasing" }),
      tone: "info",
      locked: false,
      broken: false,
      dueIso: input.orderBy,
      workingDaysLate: late(input.orderBy),
    });
  }
  return items;
}
