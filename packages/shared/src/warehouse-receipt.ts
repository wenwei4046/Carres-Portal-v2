/**
 * R6 · The warehouse files its own receiving
 * (docs/receiving-claim-execution-queue.md, locked with Jess 2026-07-27).
 *
 * The third-party warehouse stops reporting by WhatsApp: it logs in, counts the
 * pallet on R1's own form and files what it found. Nothing moves when it does —
 * the submission is a QUEUED CALL to the receive engine, and ops check-in is
 * what replays it through `operation_receive_po_with_do` (0302). So this module
 * describes a receipt, never a second way of receiving.
 *
 * ── The number is a DELTA, and that is load-bearing ─────────────────────────
 * The receive RPC takes `received_qty` as a NEW TOTAL. A receipt can sit for
 * hours before ops opens it, and another DO can land in between — so a stored
 * total would be true when it was typed and wrong when it was replayed. What
 * the warehouse observed is `receivedNow`: how many good units came off THIS
 * truck. The check-in adds it to whatever the line has received by then.
 *
 * ── One gate, three readers ─────────────────────────────────────────────────
 * `warehouseReceiptProblems` is what the warehouse's Send button asks, what the
 * ops queue reads to explain a receipt, and — mirrored statement for statement
 * inside `warehouse_submit_receipt` — what the server refuses. The button and
 * the 422 therefore cannot disagree about what "complete" means (the same law
 * S1's `caseIntakeComplete` and R2's `receiveLineClaimProblems` follow).
 *
 * The claim rules are NOT re-implemented here: a damaged/wrong line is checked
 * by R2's own `receiveLineClaimProblems`, so the evidence law has exactly one
 * copy in TypeScript no matter which door reports the problem.
 *
 * PURE — no I/O, no clock.
 */
import { docNumber } from "./doc-number";
import { goodsCategoryWordOf } from "./line-category";
import {
  receiveLineClaimProblems,
  RECEIVE_LINE_CLAIM_PROBLEM_TEXT,
  type ReceiveLineClaimProblem,
} from "./supplier-claim";
import type { CaseProductCategory } from "./service-case-intake";

// ── Where a receipt is ───────────────────────────────────────────────────────

/**
 * FIVE states — the Receiving Session's lifecycle
 * (`docs/RECEIVING-INFORMATION-MODEL.md` §4, frozen by Jess 2026-08-02).
 *
 * `draft`     — being counted. The OFFICE's draft lives in the browser and is
 *               discarded if the operator walks away, so this value is the
 *               column default and no door persists it today.
 * `submitted` — the warehouse has counted; goods have NOT moved.
 * `returned`  — ops sent it back with a reason; the warehouse counts again.
 *               A REAL business state, never "draft again": it means *was
 *               submitted, was reviewed, was sent back*.
 * `posted`    — it hit the books; stock moved then.
 * `voided`    — reversed after posting. Nothing writes it yet (Void is its own
 *               later slice) and history never deletes, so a voided record must
 *               still appear wherever a posted one does.
 *
 * This block said "Three states, and no fourth" until 2026-08-03 (Card C2). It
 * was wrong twice over: 0314 made the lifecycle five, and renamed `checked_in`
 * to `posted` — because `checked_in` named the ACT (`Check in`) while the
 * status has to name the STATE, and COPY-STANDARD lets one word do only one of
 * those. The data was migrated by 0314; this file was the lag.
 */
export type WarehouseReceiptStatus =
  | "draft"
  | "submitted"
  | "returned"
  | "posted"
  | "voided";

/** The words on screen. `Waiting Carres check` names WHO the receipt is waiting
 *  for — "Pending" would leave a warehouse clerk wondering whether they still
 *  have something to do (they do not).
 *
 *  DOCUMENT STATUS WORDS (owner correction 2026-09-06): a GRN on the Register
 *  is `Valid` or `Cancelled` — clear document words, the same pair every
 *  formal document speaks. `Posted` / `Voided` remain internal database
 *  statuses and never reach a normal user's screen; `Void Receiving` stays
 *  the ACT's name (a door, not a status). */
export const WAREHOUSE_RECEIPT_STATUS_LABEL: Record<
  WarehouseReceiptStatus,
  string
> = {
  draft: "Not sent yet",
  submitted: "Waiting Carres check",
  returned: "Sent back to recount",
  posted: "Valid",
  voided: "Cancelled",
};

export function warehouseReceiptStatusLabel(
  key: string | null | undefined,
): string {
  if (!key) return "—";
  return (
    WAREHOUSE_RECEIPT_STATUS_LABEL[key as WarehouseReceiptStatus] ?? key
  );
}

// ── What the form holds ──────────────────────────────────────────────────────

/** One PO line as the warehouse form holds it, mid-count. */
export interface WarehouseReceiptLineDraft {
  /** `purchase_order_lines.id`. */
  id: string;
  sku: string;
  /** What the line still owes: qty − received_qty. The three numbers below
   *  share this one budget (R1's per-delivery cap). */
  pendingDelivery: number;
  /** Good units off THIS truck. A DELTA, never a running total. */
  receivedNow: number;
  damagedQty: number;
  damagedPhotos: readonly string[];
  wrongItemQty: number;
  wrongItemClaimType: string | null;
  wrongItemPhotos: readonly string[];
  /** The line's product family — narrows the wrong-item picker. */
  category: CaseProductCategory;
}

export interface WarehouseReceiptDraft {
  doNumber: string;
  /** Storage key of the signed DO photo, once the upload has finished. */
  doFilePath: string | null;
  lines: readonly WarehouseReceiptLineDraft[];
}

/** A whole-submission problem. Per-LINE claim problems keep R2's own keys. */
export type WarehouseReceiptProblem =
  | "do_number_required"
  | "do_file_required"
  | "nothing_counted"
  | "line_over_reported";

export const WAREHOUSE_RECEIPT_PROBLEM_TEXT: Record<
  WarehouseReceiptProblem,
  string
> = {
  do_number_required: "Type the DO number from the supplier's paper",
  do_file_required: "Take a photo of the signed DO",
  nothing_counted: "Count at least one unit before sending this",
  line_over_reported: "One line counts more units than the PO still owes",
};

/** Plain words for any problem this form can raise, whichever half it came
 *  from — so a screen never has to know which module owns which key. */
export function warehouseReceiptProblemText(
  key: WarehouseReceiptProblem | ReceiveLineClaimProblem,
): string {
  return (
    (WAREHOUSE_RECEIPT_PROBLEM_TEXT as Record<string, string>)[key] ??
    (RECEIVE_LINE_CLAIM_PROBLEM_TEXT as Record<string, string>)[key] ??
    key
  );
}

/** The DO number the supplier's own paper carries. Three characters is the
 *  floor the receive RPC, the storage route and 0302's CHECK all use. */
export const WAREHOUSE_DO_NUMBER_MIN = 3;

/**
 * What is still missing before this count may be sent.
 *
 * Returns an EMPTY array when the receipt is ready. Order matters only for
 * reading: the whole-submission problems come first, then each line's own.
 *
 * The over-report rule is asked HERE, at the door, rather than being left to
 * ops's check-in an hour later — the person holding the pallet is the only one
 * who can fix a miscount, and by check-in time they have gone home.
 */
export function warehouseReceiptProblems(
  d: WarehouseReceiptDraft,
): Array<WarehouseReceiptProblem | ReceiveLineClaimProblem> {
  const out: Array<WarehouseReceiptProblem | ReceiveLineClaimProblem> = [];

  if (d.doNumber.trim().length < WAREHOUSE_DO_NUMBER_MIN)
    out.push("do_number_required");
  if (!d.doFilePath || d.doFilePath.trim().length === 0)
    out.push("do_file_required");

  let counted = 0;
  let over = false;
  for (const l of d.lines) {
    const line = countedOnLine(l);
    counted += line;
    if (line > Math.max(0, l.pendingDelivery)) over = true;
  }
  if (counted === 0) out.push("nothing_counted");
  if (over) out.push("line_over_reported");

  for (const l of d.lines) {
    // R2's evidence law, unmodified. A clean line returns nothing.
    for (const p of receiveLineClaimProblems({
      damagedQty: l.damagedQty,
      damagedPhotos: l.damagedPhotos,
      wrongItemQty: l.wrongItemQty,
      wrongItemClaimType: l.wrongItemClaimType,
      wrongItemPhotos: l.wrongItemPhotos,
      category: l.category,
    })) {
      if (!out.includes(p)) out.push(p);
    }
  }

  return out;
}

/** How many units this line accounts for on this delivery — good, broken and
 *  wrong together. The three share one budget. */
export function countedOnLine(l: {
  receivedNow: number;
  damagedQty: number;
  wrongItemQty: number;
}): number {
  return (
    Math.max(0, l.receivedNow) +
    Math.max(0, l.damagedQty) +
    Math.max(0, l.wrongItemQty)
  );
}

// ── What was filed ───────────────────────────────────────────────────────────

/** One line of a receipt, as it is STORED (and replayed). */
export interface WarehouseReceiptLine {
  id: string;
  sku: string;
  received_now: number;
  damaged_qty: number;
  wrong_item_qty: number;
  wrong_item_claim_type: string | null;
  damaged_photos?: unknown[];
  wrong_item_photos?: unknown[];
}

export interface WarehouseReceiptTotals {
  /** Good units this receipt claims. */
  received: number;
  damaged: number;
  wrongItem: number;
  /** damaged + wrongItem. */
  issue: number;
  lines: number;
}

export function warehouseReceiptTotals(
  lines: readonly WarehouseReceiptLine[] | null | undefined,
): WarehouseReceiptTotals {
  let received = 0;
  let damaged = 0;
  let wrongItem = 0;
  const rows = lines ?? [];
  for (const l of rows) {
    received += Math.max(0, num(l.received_now));
    damaged += Math.max(0, num(l.damaged_qty));
    wrongItem += Math.max(0, num(l.wrong_item_qty));
  }
  return {
    received,
    damaged,
    wrongItem,
    issue: damaged + wrongItem,
    lines: rows.length,
  };
}

function num(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

/**
 * The one sentence the ops queue row shows: what this warehouse says arrived.
 *
 * Composed, never typed — and it says `pending delivery` nowhere, because a
 * receipt reports THIS truck, not the PO's outstanding balance. The PO row
 * already carries that (R1), and repeating it here from a different arithmetic
 * is how two numbers start disagreeing.
 */
export function warehouseReceiptSummary(
  lines: readonly WarehouseReceiptLine[] | null | undefined,
): string {
  const t = warehouseReceiptTotals(lines);
  const bits: string[] = [`${t.received} good`];
  if (t.damaged > 0) bits.push(`${t.damaged} damaged`);
  if (t.wrongItem > 0)
    bits.push(`${t.wrongItem} wrong item${t.wrongItem === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

/** Does checking this receipt in open supplier claims? The ops reviewer must be
 *  told BEFORE they press it — a check-in files cases against a supplier. */
export function warehouseReceiptOpensClaims(
  lines: readonly WarehouseReceiptLine[] | null | undefined,
): boolean {
  return warehouseReceiptTotals(lines).issue > 0;
}

/** A receipt row as both sides read it (ops queue + the warehouse's own list).
 *  `claims` is present only once ops has checked it in. */
export interface WarehouseReceiptRow {
  id: string;
  po_id: string;
  supplier_name: string | null;
  do_number: string;
  status: WarehouseReceiptStatus;
  lines: WarehouseReceiptLine[];
  note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  return_reason: string | null;
  /** C2 — what the `Goods Received` register reads. OPTIONAL, so a browser on
   *  this build against an older Worker degrades to a quieter row instead of
   *  crashing (the same discipline P3's `short_since` follows). */
  submitted_from?: "office" | "warehouse";
  /** The BUSINESS date: when the goods physically arrived. Friday's truck keyed
   *  in on Monday reads Received Friday, Submitted Monday — both true. */
  goods_received_at?: string;
  posted_at?: string | null;
  posted_by_name?: string | null;
  do_file_path?: string | null;
  /** A short-lived signed URL for the signed DO, batch-signed by the list route
   *  the same way `supplier-claims` signs its claim photos. Null when there is
   *  no file, or when storage refused to sign it — the record says which
   *  rather than printing a dead link. */
  do_file_url?: string | null;
  warehouse_name?: string | null;
  claims?: Array<{
    claim_no: string;
    claim_type: string;
    sku: string;
    qty: number;
    status: string;
  }>;
  /** 0426 — the formal GRN number stamped at posting. Null before posting and
   *  on legacy sessions (those keep the derived display). */
  grn_no?: string | null;
  /** Where the goods PHYSICALLY arrived; null = the PO's booked warehouse.
   *  Never overwrites Deliver To. */
  actual_site_id?: string | null;
  actual_site_name?: string | null;
  arrival_evidence?: ReceivingArrivalEvidence[];
  extra_lines?: ReceivingExtraLine[];
  /** Evidence trio at posting: normal GRN Duty · dated cover · actual actor
   *  (posted_by). Never collapsed into one name. */
  posted_duty_holder_name?: string | null;
  posted_duty_cover_name?: string | null;
  posted_authority?: "grn_duty" | "cover" | "superuser" | null;
  void_at?: string | null;
  void_by_name?: string | null;
  void_reason?: string | null;
  unit_results?: ReceivingUnitResult[];
}

/** One open PO bound for this warehouse, as `warehouse_incoming_pos` returns
 *  it. Notice what is NOT here: price, cost, the customer order, the supplier's
 *  contact. A warehouse sees what it must count and nothing else. */
export interface WarehouseIncomingLine {
  id: string;
  sku: string;
  qty: number;
  received_qty: number;
  damaged_qty: number;
  wrong_item_qty: number;
  category: CaseProductCategory;
}

export interface WarehouseIncomingPo {
  po_id: string;
  supplier_name: string | null;
  eta_date: string | null;
  sup_status: string;
  lines: WarehouseIncomingLine[];
  /** 0426 — the governed expected Units still incoming: the exact IDs the
   *  supplier was told to write on the packages. One physical result each. */
  expected_units?: Array<{
    id: string;
    unit_code: string;
    sku: string;
    status: string;
  }>;
  /** Non-null when a count is already waiting for Carres — the PO must not
   *  offer a second form. */
  open_receipt_id: string | null;
}

export interface WarehouseIncomingResponse {
  warehouse: { id: string; name: string } | null;
  pos: WarehouseIncomingPo[];
}

/**
 * The Receiving Record's document number — `GRN-020826-4417`.
 *
 * DERIVED, never stored, so it needs no migration and no counter: the tail is
 * hashed from the session id, which keeps our monthly volume private (a
 * counter tells a supplier how many deliveries we take) and makes a reprint
 * match the original. Card C2 (Jess, 2026-08-03).
 *
 * ONE function, so the register's column and the open record can never print
 * two different numbers for one delivery. `revision` is here for Amend's `-B`
 * suffix in its own later slice; nothing passes it today.
 *
 * `GRN` is the DOCUMENT's noun and is allowed by COPY-STANDARD — "a word may
 * name the piece of paper, the act, or neither — never both". The act stays
 * `Check in`; the queue that lists these is `Goods Received`.
 */
export function receivingRecordNo(
  r: { id: string; goods_received_at?: string; submitted_at?: string },
  revision = 0,
): string {
  const date = r.goods_received_at ?? (r.submitted_at ?? "").slice(0, 10);
  if (!date) return "—";
  return docNumber({ prefix: "GRN", date, seed: r.id, revision });
}

// ── The 2026-09-04 owner instruction — stored GRN, Actual Site, unit
//    outcomes, extra goods, amend/void ───────────────────────────────────────

/**
 * The number a Receiving Record shows.
 *
 * 0426 stamps the FORMAL `GRN-YYYYMMDD-RRRR` from the daily document pool at
 * posting; sessions posted before it keep the derived legacy display. One
 * function, so no surface can print two numbers for one delivery.
 */
export function receivingDisplayNo(r: {
  id: string;
  grn_no?: string | null;
  goods_received_at?: string;
  submitted_at?: string;
}): string {
  const stored = (r.grn_no ?? "").trim();
  if (stored) return stored;
  return receivingRecordNo(r);
}

/**
 * One physical result per governed Unit (ERP-ARCHITECTURE §3.4, owner ruling
 * 2026-09-01): `Expected Units = Received Units + Not received Units`, and
 * `Received with issue` is a SUBSET of received — never counted twice.
 */
export type ReceivingUnitOutcome =
  | "received"
  | "received_with_issue"
  | "not_received";

export const RECEIVING_UNIT_OUTCOME_LABEL: Record<ReceivingUnitOutcome, string> =
  {
    received: "Received",
    received_with_issue: "Received with issue",
    not_received: "Not received",
  };

export interface ReceivingUnitResult {
  stock_item_id: string;
  unit_code: string;
  outcome: ReceivingUnitOutcome;
  issue_kind?: "damaged" | "wrong_item" | null;
  note?: string | null;
}

/** Arrival evidence supports both photo and video (owner instruction §5C). */
export interface ReceivingArrivalEvidence {
  path: string;
  kind: "photo" | "video";
}

/** Extra goods are recorded separately: they never enter Inventory and never
 *  alter ordered/pending arithmetic (owner instruction §6). */
export interface ReceivingExtraLine {
  sku: string;
  qty: number;
  note?: string | null;
}

export function receivingExtraQty(
  lines: readonly ReceivingExtraLine[] | null | undefined,
): number {
  return (lines ?? []).reduce((n, l) => n + Math.max(0, num(l.qty)), 0);
}

/**
 * RECEIVING SUMMARY — the five governed quantity words for a source's lines
 * (`purchasing/MASTER.md` §5.7 / COPY-STANDARD): each fact prints its own
 * number; the operator never subtracts. Damaged/wrong never reduce
 * `Pending Delivery Qty`.
 */
export interface ReceivingSummary {
  orderQty: number;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  pendingDeliveryQty: number;
}

export function receivingSummaryOf(
  poLines: readonly {
    qty: number;
    received_qty: number;
    damaged_qty?: number | null;
    wrong_item_qty?: number | null;
  }[],
): ReceivingSummary {
  let orderQty = 0;
  let receivedQty = 0;
  let damagedQty = 0;
  let wrongItemQty = 0;
  for (const l of poLines) {
    orderQty += Math.max(0, num(l.qty));
    receivedQty += Math.max(0, num(l.received_qty));
    damagedQty += Math.max(0, num(l.damaged_qty));
    wrongItemQty += Math.max(0, num(l.wrong_item_qty));
  }
  return {
    orderQty,
    receivedQty,
    damagedQty,
    wrongItemQty,
    pendingDeliveryQty: Math.max(0, orderQty - receivedQty),
  };
}

/** `Pending Delivery Qty after save: {n}` — the quiet line beside Save. */
export function pendingDeliveryAfterSave(
  lines: readonly {
    pendingDelivery: number;
    receivedNow: number;
  }[],
): number {
  return lines.reduce(
    (n, l) => n + Math.max(0, l.pendingDelivery - Math.max(0, l.receivedNow)),
    0,
  );
}

/**
 * THE RECEIVING BUTTON LAW (COPY-STANDARD): the Save button names the FIRST
 * missing fact, top to bottom — `Save — add a DO number` · `Save — upload
 * signed DO` · `Save — count at least one unit` — or reads `Save Receiving`
 * when nothing is missing. ONE copy, shared by the button, the tests and the
 * server's twin refusals.
 */
export function receivingSaveBlocker(d: {
  doNumber: string;
  doFilePath: string | null;
  counted: number;
  overCounted: boolean;
  claimProblems: readonly ReceiveLineClaimProblem[];
}): string | null {
  if (d.doNumber.trim().length < WAREHOUSE_DO_NUMBER_MIN)
    return "Save — add a DO number";
  if (!d.doFilePath) return "Save — upload signed DO";
  if (d.counted === 0) return "Save — count at least one unit";
  if (d.overCounted)
    return "Save — lower Receive now, the line counts more than is owed";
  if (d.claimProblems.length > 0)
    return `Save — ${RECEIVE_LINE_CLAIM_PROBLEM_TEXT[d.claimProblems[0]].toLowerCase()}`;
  return null;
}

/**
 * THE RECEIVING RAIL'S CATEGORY VOCABULARY (owner correction 2026-09-06).
 *
 * Exactly these five rows, in exactly this order — the shared display order
 * every Operation page speaks (mattress → bedframe → sofa → pillow →
 * protector; `lineSortRank`'s own sequence). No `Any`, no `All …`, no
 * `Accessory`, no `Topper`/`Footrest`/`Service`, no invented category. A
 * receiving whose goods answer none of these five simply lights no row.
 */
export const RECEIVING_CATEGORY_ROWS = [
  "Mattress",
  "Bedframe",
  "Sofa",
  "Pillow",
  "Mattress protector",
] as const;

export type ReceivingCategoryRow = (typeof RECEIVING_CATEGORY_ROWS)[number];

/**
 * The category words ONE receiving record answers to — derived through the
 * governed shared ladder (`goodsCategoryWordOf`: recorded → catalog →
 * classifier), never a receiving-local SKU rule. Only lines the delivery
 * actually counted (good, damaged or wrong) speak; a zero line is the PO's
 * fact, not this arrival's. Returned in the rail's own order, unique.
 *
 * `categoryBySku` is the catalog's answer (`product_models.category` via the
 * one shared reader); an absent SKU falls to the ladder's measured-gap branch
 * exactly as the Sales Orders register does.
 */
export function receiptCategoryWords(
  lines: readonly WarehouseReceiptLine[] | null | undefined,
  categoryBySku: ReadonlyMap<string, string>,
): ReceivingCategoryRow[] {
  const seen = new Set<string>();
  for (const l of lines ?? []) {
    if (
      countedOnLine({
        receivedNow: num(l.received_now),
        damagedQty: num(l.damaged_qty),
        wrongItemQty: num(l.wrong_item_qty),
      }) <= 0
    )
      continue;
    seen.add(
      goodsCategoryWordOf({
        sku: l.sku,
        category: categoryBySku.get(l.sku) ?? null,
      }),
    );
  }
  return RECEIVING_CATEGORY_ROWS.filter((w) => seen.has(w));
}

/** The governed labels for who saved a posting (never a rewritten owner). */
export const RECEIVING_AUTHORITY_LABEL: Record<string, string> = {
  grn_duty: "GRN Duty",
  cover: "GRN Duty cover",
  superuser: "Operations Superuser",
};

// ── The Work Engine feed (owner-approved 2026-08-29 slice) ──────────────────

/** The five governed strings for the receiving queue (COPY-STANDARD's
 *  Purchasing action table — the canonical home; never respelled). */
export const RECEIVING_WORK_WORDS = {
  queue: "Goods to receive",
  /** Row line — composed as `Check in {document} from {supplier}`. */
  rowLine: (document: string, supplier: string) =>
    `Check in ${document} from ${supplier}`,
  button: "Start receiving",
  done: (received: number, pending: number) =>
    `GRN posted · ${received} received · ${pending} pending delivery`,
  empty: "No supplier delivery is ready to receive.",
} as const;

export interface ReceivingWorkSource {
  /** Warehouse counts waiting for the Carres check — always executable. */
  submitted: readonly {
    id: string;
    po_id: string;
    supplier_name: string | null;
    goods_received_at?: string;
    submitted_at: string;
  }[];
  /** Open POs whose supplier date has arrived and which still owe goods —
   *  the arrival/physical trigger (the anti-spam rule: outstanding quantity
   *  alone never makes a row). */
  arrivalsDue: readonly {
    po_id: string;
    supplier_name: string | null;
    eta_date: string | null;
    pending_qty: number;
  }[];
}

/**
 * The Receiving projection into My Work / Team Work. Pure; the caller
 * resolves GRN Duty through the shared resolver and passes it in — a page
 * never resolves duty itself (Law F.1).
 */
export function receivingWorkItems(
  src: ReceivingWorkSource,
  ctx: { grnDuty: { userId: string; name: string | null } | null },
  todayIso: string,
  workingDaysLate: (dueIso: string) => number,
): Array<{
  ruleKey: "receiving.check_in";
  module: "receiving";
  soRef: string;
  orderId: string;
  action: string;
  ownerName: string | null;
  ownerUserId: string | null;
  ownerDuty?: string;
  tone: "warning" | "info";
  locked: boolean;
  broken: boolean;
  dueIso: string | null;
  workingDaysLate: number;
  /** The exact deep link — the session when one exists, else the source PO. */
  receiptId: string | null;
  poId: string;
}> {
  const today = todayIso.slice(0, 10);
  const owner = ctx.grnDuty
    ? { ownerName: ctx.grnDuty.name, ownerUserId: ctx.grnDuty.userId }
    : { ownerName: null, ownerUserId: null, ownerDuty: "GRN Duty" };
  const out: ReturnType<typeof receivingWorkItems> = [];
  const covered = new Set<string>();
  for (const r of src.submitted) {
    covered.add(r.po_id);
    const due = r.goods_received_at ?? r.submitted_at.slice(0, 10);
    out.push({
      ruleKey: "receiving.check_in",
      module: "receiving",
      soRef: `Receiving · ${r.supplier_name ?? r.po_id}`,
      orderId: r.id,
      action: RECEIVING_WORK_WORDS.rowLine(r.po_id, r.supplier_name ?? "the supplier"),
      ...owner,
      tone: "warning",
      locked: false,
      broken: false,
      dueIso: due,
      workingDaysLate: due && today > due ? workingDaysLate(due) : 0,
      receiptId: r.id,
      poId: r.po_id,
    });
  }
  for (const p of src.arrivalsDue) {
    if (covered.has(p.po_id)) continue;
    if (!p.eta_date || p.eta_date > today || p.pending_qty <= 0) continue;
    out.push({
      ruleKey: "receiving.check_in",
      module: "receiving",
      soRef: `Receiving · ${p.supplier_name ?? p.po_id}`,
      orderId: p.po_id,
      action: RECEIVING_WORK_WORDS.rowLine(p.po_id, p.supplier_name ?? "the supplier"),
      ...owner,
      tone: "info",
      locked: false,
      broken: false,
      dueIso: p.eta_date,
      workingDaysLate: today > p.eta_date ? workingDaysLate(p.eta_date) : 0,
      receiptId: null,
      poId: p.po_id,
    });
  }
  return out;
}
