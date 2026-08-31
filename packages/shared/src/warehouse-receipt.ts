/**
 * One governed Receiving Session contract shared by Office and Warehouse.
 *
 * The third-party warehouse stops reporting by WhatsApp: it logs in, counts the
 * pallet and files what it found. Saving or sending the count moves nothing;
 * GRN authority later posts the same persistent session through one engine.
 *
 * Quantities belong to this physical session. Only `receivedQty` reduces PO
 * pending quantity; damaged, wrong and extra stay separate custody facts.
 *
 * ── One gate, three readers ─────────────────────────────────────────────────
 * New writes use `ReceivingSessionInput`. Historical readers retain a narrow
 * compatibility mapper for pre-0407 `received_now` payloads.
 *
 * The claim rules are NOT re-implemented here: a damaged/wrong line is checked
 * by R2's own `receiveLineClaimProblems`, so the evidence law has exactly one
 * copy in TypeScript no matter which door reports the problem.
 *
 * PURE — no I/O, no clock.
 */
import { docNumber } from "./doc-number";
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
  | "amended"
  | "voided";

export type ReceivingSourceKind = "purchase_order" | "consignment_order";

export interface ReceivingLineInput {
  poLineId: string;
  sku: string;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  extraQty: number;
  unitIds: readonly string[];
  damagedPhotos: readonly string[];
  wrongItemPhotos: readonly string[];
  extraEvidence: readonly string[];
  wrongItemReason: string | null;
}

export interface ReceivingSessionInput {
  sourceKind: ReceivingSourceKind;
  sourceId: string;
  expectedVersion: number;
  supplierDoNo: string;
  signedDoPath: string;
  goodsReceivedAt: string;
  note: string | null;
  lines: readonly ReceivingLineInput[];
}

export interface ReceivingQuantities {
  orderQty: number;
  receivedQty: number;
  damagedQty: number;
  wrongItemQty: number;
  extraQty: number;
  pendingDeliveryQty: number;
}

export function receivingQuantities(input: Omit<ReceivingQuantities, "pendingDeliveryQty">): ReceivingQuantities {
  return {
    ...input,
    pendingDeliveryQty: Math.max(0, input.orderQty - input.receivedQty),
  };
}

export type ReceivingUnitIdProblem =
  | "duplicate_unit_id"
  | "unit_id_missing"
  | "unit_id_wrong_source"
  | "unit_id_unexpected";

export type ReceivingUnitOutcome = "received" | "damaged" | "wrong_item" | "extra";

export function receivingUnitOutcomes(
  line: Pick<
    ReceivingLineInput,
    "receivedQty" | "damagedQty" | "wrongItemQty" | "extraQty" | "unitIds"
  >,
): Array<{ unitId: string; outcome: ReceivingUnitOutcome }> {
  const outcomes: ReceivingUnitOutcome[] = [
    ...Array(Math.max(0, line.receivedQty)).fill("received" as const),
    ...Array(Math.max(0, line.damagedQty)).fill("damaged" as const),
    ...Array(Math.max(0, line.wrongItemQty)).fill("wrong_item" as const),
    ...Array(Math.max(0, line.extraQty)).fill("extra" as const),
  ];
  return line.unitIds.map((unitId, index) => ({
    unitId,
    outcome: outcomes[index] ?? "extra",
  }));
}

export function receivingUnitIdProblems(
  line: Pick<
    ReceivingLineInput,
    "receivedQty" | "damagedQty" | "wrongItemQty" | "extraQty" | "unitIds"
  >,
  source: {
    expectedUnitIds: readonly string[];
    wrongSourceUnitIds: readonly string[];
  },
): ReceivingUnitIdProblem[] {
  const problems: ReceivingUnitIdProblem[] = [];
  const ids = line.unitIds.map((id) => id.trim()).filter(Boolean);
  const physicalQty =
    line.receivedQty + line.damagedQty + line.wrongItemQty + line.extraQty;
  if (new Set(ids).size !== ids.length) problems.push("duplicate_unit_id");
  if (ids.length < physicalQty) problems.push("unit_id_missing");
  const expected = new Set(source.expectedUnitIds);
  const wrongSource = new Set(source.wrongSourceUnitIds);
  if (ids.some((id) => wrongSource.has(id))) problems.push("unit_id_wrong_source");
  const orderedQty = Math.max(0, physicalQty - line.extraQty);
  const orderedIds = ids.slice(0, orderedQty);
  const extraIds = ids.slice(orderedQty, physicalQty);
  if (
    orderedIds.some((id) => !expected.has(id) && !wrongSource.has(id))
    || extraIds.some((id) => expected.has(id))
  ) {
    problems.push("unit_id_unexpected");
  }
  return problems;
}

export type ReceivingProblemKey =
  | "supplier_do_missing"
  | "signed_do_missing"
  | "goods_received_at_missing"
  | "unit_id_missing"
  | "unit_id_wrong_source"
  | "count_needs_changes"
  | "damage_evidence_missing"
  | "wrong_item_details_missing"
  | "extra_goods_found";

export function receivingProblemCopy(
  key: ReceivingProblemKey,
  context: { item?: string; document?: string; unitId?: string } = {},
): { fact: string; action: string } {
  const document = context.document ?? "Purchase Order";
  const copies: Record<ReceivingProblemKey, { fact: string; action: string }> = {
    supplier_do_missing: {
      fact: "Supplier DO is missing",
      action: "Add the Supplier DO before you finish receiving",
    },
    signed_do_missing: {
      fact: "Signed DO photo is missing",
      action: "Upload the signed DO photo",
    },
    goods_received_at_missing: {
      fact: "Goods Received At is missing",
      action: "Enter when the goods arrived",
    },
    unit_id_missing: {
      fact: `Unit ID is missing for ${context.item ?? "this item"}`,
      action: `Scan the Unit ID shown on the ${document}`,
    },
    unit_id_wrong_source: {
      fact: `Unit ID ${context.unitId ?? "—"} is not on the ${document}`,
      action: "Check the label and scan the correct Unit ID",
    },
    count_needs_changes: {
      fact: "The count needs changes",
      action: "Fix the named items and return the count to Carres",
    },
    damage_evidence_missing: {
      fact: "Damage evidence is missing",
      action: "Take photos and say what is damaged",
    },
    wrong_item_details_missing: {
      fact: "Wrong item details are missing",
      action: "Choose what is wrong and take photos",
    },
    extra_goods_found: {
      fact: "Extra goods were found",
      action: "Record the Unit IDs and keep them out of available stock",
    },
  };
  return copies[key];
}

export type ReceivingSessionIdentityProblem =
  | "grn_number_required"
  | "grn_number_before_posting"
  | "grn_number_invalid";

export function formalGrnNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^GRN-(\d{4})(\d{2})(\d{2})-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return value;
}

export function receivingSessionIdentityProblems(input: {
  status: WarehouseReceiptStatus;
  grnNumber: string | null;
}): ReceivingSessionIdentityProblem[] {
  const hasNumber = input.grnNumber !== null;
  const isFormal = formalGrnNumber(input.grnNumber) !== null;
  const isPostedHistory =
    input.status === "posted" || input.status === "amended" || input.status === "voided";
  if (!isPostedHistory && hasNumber) return ["grn_number_before_posting"];
  if (isPostedHistory && !hasNumber) return ["grn_number_required"];
  if (hasNumber && !isFormal) return ["grn_number_invalid"];
  return [];
}

/** The words on screen. `Waiting Carres check` names WHO the receipt is waiting
 *  for — "Pending" would leave a warehouse clerk wondering whether they still
 *  have something to do (they do not). */
export const WAREHOUSE_RECEIPT_STATUS_LABEL: Record<
  WarehouseReceiptStatus,
  string
> = {
  draft: "Not sent yet",
  submitted: "Waiting Carres check",
  returned: "Sent back to recount",
  posted: "Checked in by Carres",
  amended: "Amended",
  voided: "Reversed",
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

/** Read-only bridge for receipts stored before the governed session contract. */
export function historicalReceivingLineInput(line: WarehouseReceiptLine): ReceivingLineInput {
  return {
    poLineId: line.id,
    sku: line.sku,
    receivedQty: Math.max(0, num(line.received_now)),
    damagedQty: Math.max(0, num(line.damaged_qty)),
    wrongItemQty: Math.max(0, num(line.wrong_item_qty)),
    extraQty: 0,
    unitIds: [],
    damagedPhotos: (line.damaged_photos ?? []).filter(
      (value): value is string => typeof value === "string",
    ),
    wrongItemPhotos: (line.wrong_item_photos ?? []).filter(
      (value): value is string => typeof value === "string",
    ),
    extraEvidence: [],
    wrongItemReason: line.wrong_item_claim_type,
  };
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
  lines: readonly (WarehouseReceiptLine | ReceivingLineInput)[] | null | undefined,
): WarehouseReceiptTotals {
  let received = 0;
  let damaged = 0;
  let wrongItem = 0;
  const rows = lines ?? [];
  for (const l of rows) {
    received += Math.max(0, num("receivedQty" in l ? l.receivedQty : l.received_now));
    damaged += Math.max(0, num("damagedQty" in l ? l.damagedQty : l.damaged_qty));
    wrongItem += Math.max(0, num("wrongItemQty" in l ? l.wrongItemQty : l.wrong_item_qty));
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
  lines: readonly (WarehouseReceiptLine | ReceivingLineInput)[] | null | undefined,
): string {
  const t = warehouseReceiptTotals(lines);
  const bits: string[] = [`${t.received} good`];
  if (t.damaged > 0) bits.push(`${t.damaged} damaged`);
  if (t.wrongItem > 0)
    bits.push(`${t.wrongItem} wrong item${t.wrongItem === 1 ? "" : "s"}`);
  return bits.join(" · ");
}

/** Whether the physical count contains damaged or wrong-item exceptions.
 * Receiving records this evidence; it never claims that a Supplier Claim or
 * Purchase Return already exists. */
export function warehouseReceiptHasExceptions(
  lines: readonly (WarehouseReceiptLine | ReceivingLineInput)[] | null | undefined,
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
  lines: Array<WarehouseReceiptLine | ReceivingLineInput>;
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
  /** Stored formal document identity. Missing only on an unmigrated legacy row. */
  grn_number?: string | null;
  posted_at?: string | null;
  posted_by_name?: string | null;
  do_file_path?: string | null;
  /** A short-lived signed URL for the signed DO, batch-signed by the list route
   *  the same way `supplier-claims` signs its claim photos. Null when there is
   *  no file, or when storage refused to sign it — the record says which
   *  rather than printing a dead link. */
  do_file_url?: string | null;
  warehouse_name?: string | null;
  source_version?: number;
  lock_version?: number;
  deliver_to?: { id?: string; name?: string; address?: string | null } | null;
  claims?: Array<{
    claim_no: string;
    claim_type: string;
    sku: string;
    qty: number;
    status: string;
  }>;
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
  destination_id: string;
  unit_ids: string[];
}

export interface WarehouseOpenReceivingSession {
  id: string;
  status: "draft" | "submitted" | "returned";
  lock_version: number;
  do_number: string | null;
  do_file_path: string | null;
  goods_received_timestamp: string | null;
  note: string | null;
  lines: Array<WarehouseReceiptLine | ReceivingLineInput>;
  return_reason: string | null;
}

export interface WarehouseIncomingPo {
  po_id: string;
  scope_id: string;
  source_version: number;
  supplier_name: string | null;
  po_delivery_date: string | null;
  supplier_delivery_date: string | null;
  deliver_to: { id: string; name: string; address: string | null };
  sup_status: string;
  lines: WarehouseIncomingLine[];
  open_receipt: WarehouseOpenReceivingSession | null;
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
export function historicalReceivingRecordNo(
  r: { id: string; goods_received_at?: string; submitted_at?: string },
  revision = 0,
): string {
  const date = r.goods_received_at ?? (r.submitted_at ?? "").slice(0, 10);
  if (!date) return "—";
  return docNumber({ prefix: "GRN", date, seed: r.id, revision });
}

/** @deprecated Historical pre-migration display only. New receiving code reads grn_number. */
export const receivingRecordNo = historicalReceivingRecordNo;
