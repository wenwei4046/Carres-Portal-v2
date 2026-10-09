/**
 * ⭐ PURCHASE RETURN RECORD — the creation chain on the claim record, the PR's
 * record states and its Work (Purchasing MASTER §9.6 "CREATION DOOR —
 * OWNER-APPROVED (Jess, 2026-09-25)"; COPY "Purchasing Purchase Return
 * creation words"; Workspace §6.1).
 *
 *   Supplier reply → `Record what Carres does next` → `Issue Purchase Return`
 *   → send (shared send area) → Confirm tomorrow's pickup → Outbound handover
 *   (Stock) → Supplier Received Date
 *
 * ONE arithmetic for three readers — the claim record's Result section, the PR
 * record, and the Work feed — so the page and the Work card never disagree.
 *
 * `Sending not confirmed`, never `Return document not sent`: absent ledger
 * evidence means the Portal has no record of a send, not that nobody sent the
 * paper on WhatsApp (the PO/RO family word, Purchasing §9.7 conflict note,
 * resolved in this build 2026-09-29).
 *
 * Pickup facts are STOCK's (Outbound `Return to supplier`, Stock §12.8): this
 * module reads `actual_pickup_date` per Unit and never writes it. `Fully picked
 * up` never implies `Supplier Received Date`.
 */
import { carresExecutionLabel, customerResolutionLabel } from "./supplier-claim";
import { klDateOfIso } from "./supplier-claim-record";
import type { PurchaseReturnListRow } from "./purchase-return";
import { purchaseReturnCollectedQty, purchaseReturnQty } from "./purchase-return";
import { purchasingOfficeDays, type PurchasingOfficeDays } from "./purchasing-supplier-calls";
import { myHolidaySet } from "./my-holidays";
import { addWorkingDays, countWorkingDays, subtractWorkingDays, type IsoDate } from "./working-days";
import type { WorkItem } from "./work-engine";
import { operationWorkItemFromProjection, type OperationWorkItem } from "./operation-work";
import type { WorkspaceDutyResolution } from "./workspace-duty";

// ── `Record what Carres does next` — OWNER RULING (Jess, 2026-09-29) ───────
//
// The claim offers ONLY the three supplier-side decisions, and that ONE
// decision IS the Authorised Outcome. The four customer movements (`Collect
// defective item` · `Replace first` · `Collect first` · `Exchange on
// collection`) belong to the related Service Case. The decision is stored as
// the fact each downstream door already reads (0609):
//
//   Return to supplier → carres_execution = 'return_to_supplier'  (Purchase Return door)
//   Repair             → customer_resolution = 'repair'           (Repair Order door, 0602)
//   Replacement        → customer_resolution = 'replace'          (supplier-replacement arrival)
//
// `supplierClaimDecision` is the ONE arithmetic (SQL mirror:
// `supplier_claim_decision`, 0609). Legacy stored values are history.

export type SupplierClaimDecision = "return_to_supplier" | "repair" | "replacement";

export const SUPPLIER_CLAIM_DECISIONS = [
  { key: "return_to_supplier", label: "Return to supplier" },
  { key: "repair", label: "Repair" },
  { key: "replacement", label: "Replacement" },
] as const satisfies ReadonlyArray<{ key: SupplierClaimDecision; label: string }>;

export const SUPPLIER_CLAIM_DECISION_KEYS = SUPPLIER_CLAIM_DECISIONS.map((d) => d.key) as [SupplierClaimDecision, ...SupplierClaimDecision[]];

export function supplierClaimDecision(c: { carres_execution?: string | null; customer_resolution?: string | null }): SupplierClaimDecision | null {
  if (c.carres_execution === "return_to_supplier") return "return_to_supplier";
  if (c.customer_resolution === "repair") return "repair";
  if (c.customer_resolution === "replace") return "replacement";
  return null;
}

/** Legacy values recorded before the 2026-09-29 ruling, in the words they were
 *  recorded with — history, never deleted and never translated. */
export function supplierClaimLegacyWords(c: { carres_execution?: string | null; customer_resolution?: string | null }): string[] {
  const out: string[] = [];
  if (c.carres_execution && c.carres_execution !== "return_to_supplier") out.push(carresExecutionLabel(c.carres_execution));
  if (c.customer_resolution && c.customer_resolution !== "repair" && c.customer_resolution !== "replace") out.push(customerResolutionLabel(c.customer_resolution));
  return out;
}

export const RECORD_WHAT_CARRES_DOES_NEXT = "Record what Carres does next";
export const WHAT_CARRES_DOES_NOT_RECORDED = "What Carres does · Not recorded";
export const ISSUE_PURCHASE_RETURN = "Issue Purchase Return";
export const RETURN_DOCUMENT_SENT = "Return document sent to supplier";
export const NO_RETURN_WAS_ISSUED = "No return was issued.";

export function carresNextWord(key: string | null | undefined): string {
  if (!key) return WHAT_CARRES_DOES_NOT_RECORDED;
  return SUPPLIER_CLAIM_DECISIONS.find((c) => c.key === key)?.label ?? key;
}

// ── the PR record ───────────────────────────────────────────────────────────

export interface PurchaseReturnSend {
  id: string;
  channel: string;
  recipient: string;
  sent_at: string;
  sent_by_name: string | null;
}

export interface PurchaseReturnPickupConfirmation {
  confirmed_pickup_date: IsoDate;
  evidence: string;
  recorded_at: string;
  recorded_by_name: string | null;
}

/** The PR object read: the register row plus its ledger and confirmations. */
export interface PurchaseReturnDetail extends PurchaseReturnListRow {
  supplier_claim_id: string | null;
  sends: PurchaseReturnSend[];
  confirmations: PurchaseReturnPickupConfirmation[];
  /** 0614 — the supplier's own receipts of returned Units, oldest first. */
  receipts?: PurchaseReturnSupplierReceipt[];
}

/** One `Record supplier receipt` (0614, append-only). */
export interface PurchaseReturnSupplierReceipt {
  received_on: IsoDate;
  unit_ids: string[];
  files: number;
  confirmed_by: string | null;
  confirmed_at: string | null;
  recorded_at: string;
  recorded_by_name: string | null;
}

export const PURCHASE_RETURN_CHANNEL_WORD: Record<string, string> = { whatsapp: "WhatsApp", email: "Email", print: "Print" };

/** `Sending not confirmed` → `Return document sent · {channel}` (+ its date). */
export function purchaseReturnSendLine(
  pr: Pick<PurchaseReturnDetail, "sends">,
): { sent: false; text: "Sending not confirmed" } | { sent: true; text: string; date: string } {
  const first = [...pr.sends].sort((a, b) => a.sent_at.localeCompare(b.sent_at))[0];
  if (!first) return { sent: false, text: "Sending not confirmed" };
  return { sent: true, text: `Return document sent · ${PURCHASE_RETURN_CHANNEL_WORD[first.channel] ?? first.channel}`, date: first.sent_at };
}

export type PurchaseReturnPickupState = "Not picked up" | "Partly picked up" | "Fully picked up";

/** Stock's Outbound facts, read as three words. An empty return is not
 *  "fully picked up" — nothing was. */
export function purchaseReturnPickupState(pr: PurchaseReturnListRow): PurchaseReturnPickupState {
  const collected = purchaseReturnCollectedQty(pr);
  if (collected === 0) return "Not picked up";
  return collected < purchaseReturnQty(pr) ? "Partly picked up" : "Fully picked up";
}

// ── the Issue Purchase Return form ──────────────────────────────────────────

export interface PurchaseReturnIssueUnit {
  stock_item_id: string;
  unit_code: string;
  po_no: string | null;
  category: string | null;
  item: string | null;
  item_spec: string | null;
  /** Default: the Unit's current Stock Location. Editing it moves nothing. */
  pickup_location: string | null;
  /** The token the door compares: a Unit changed under the form is refused. */
  seen: string;
  /** The door's own refusal words, or null when the Unit may go back. */
  refusal: string | null;
}

export interface PurchaseReturnIssueSource {
  claim_id: string;
  claim_no: string | null;
  supplier_name: string | null;
  /** Return To as the door resolves it (owner ruling 2026-09-29): the
   *  recorded return address, else the recorded address; null = neither. */
  return_to: string | null;
  /** Which Supplier Master field it came from, shown under it. */
  return_to_from: PurchaseReturnToFrom | null;
  grn_no: string | null;
  units: PurchaseReturnIssueUnit[];
}

export type PurchaseReturnToFrom = "return_address" | "address";

/** Second line under Return To: which Settings field (`Return address` /
 *  `Address`, Settings → Purchasing → Supplier addresses) it came from. */
export const PURCHASE_RETURN_TO_FROM_WORD: Record<PurchaseReturnToFrom, string> = {
  return_address: "From Return address",
  address: "From Address",
};

/** OWNER RULING (Jess, 2026-09-29): Return To = the supplier's return
 *  address when filled, otherwise its address. The door (0614) computes the
 *  same `coalesce(nullif(btrim(return_address),''), nullif(btrim(address),''))`. */
export function purchaseReturnResolvedReturnTo(s: { return_address?: string | null; address?: string | null }): { return_to: string | null; return_to_from: PurchaseReturnToFrom | null } {
  const ret = s.return_address?.trim();
  if (ret) return { return_to: ret, return_to_from: "return_address" };
  const addr = s.address?.trim();
  if (addr) return { return_to: addr, return_to_from: "address" };
  return { return_to: null, return_to_from: null };
}

/** What stops the issue, named, in the form's order. Empty = issuable. */
export function purchaseReturnIssueMissing(source: PurchaseReturnIssueSource, picked: readonly string[]): string[] {
  const out: string[] = [];
  if (!source.return_to || !source.return_to.trim()) {
    out.push(`Add the address of ${source.supplier_name ?? "the supplier"}`);
  }
  const eligible = new Set(source.units.filter((u) => !u.refusal).map((u) => u.stock_item_id));
  if (!picked.some((id) => eligible.has(id))) out.push("Tick the Units to return.");
  return out;
}

// ── the paper (money-free, DOCUMENT-KIT §4) ─────────────────────────────────

export interface PurchaseReturnPrintData {
  /** null while issuing: the preview is the document it WILL be. */
  pr_no: string | null;
  pr_doc_date: string;
  supplier: { name: string; contact: string | null };
  return_to: string | null;
  claim_no: string | null;
  grn_no: string | null;
  confirmed_pickup_date: IsoDate | null;
  units: Array<{ unit_id: string; po_no: string | null; category: string | null; item: string | null; item_spec: string | null; pickup_location: string | null }>;
  issued_by: string | null;
}

// ── Work ────────────────────────────────────────────────────────────────────

export const PURCHASE_RETURN_WORK_RULE = {
  issue: "purchase_return.issue",
  send: "purchase_return.send",
  confirmTomorrowsPickup: "purchase_return.confirm_tomorrows_pickup",
  pickupMissed: "purchase_return.pickup_missed",
} as const;
export type PurchaseReturnWorkRule = (typeof PURCHASE_RETURN_WORK_RULE)[keyof typeof PURCHASE_RETURN_WORK_RULE];

/** A claim that recorded `Return to supplier` and has no Purchase Return yet. */
export interface PurchaseReturnPendingIssue {
  id: string;
  claim_no: string | null;
  supplier_name: string | null;
  carres_execution_at: string | null;
}

export interface PurchaseReturnWorkOccurrence {
  item: WorkItem;
  problem: string;
  requiredResult: string;
}

/** The stored Office calendar (weekdays + holidays) — `purchasingOfficeDays`. */
const office = (holidays: PurchasingOfficeDays) => purchasingOfficeDays(holidays);

function klDate(iso: string): IsoDate {
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function workItem(
  input: { ruleKey: PurchaseReturnWorkRule; ref: string; objectId: string; action: string; due: IsoDate | null },
  owner: WorkspaceDutyResolution | null,
  today: IsoDate,
  holidays: PurchasingOfficeDays,
): WorkItem {
  const late = input.due && input.due < today ? countWorkingDays(input.due, today, office(holidays)) : 0;
  return {
    ruleKey: input.ruleKey,
    module: "purchasing",
    soRef: input.ref,
    orderId: input.objectId,
    action: input.action,
    ownerRule: "po_duty",
    ownerDutyKey: "po_duty",
    normalOwner: owner?.normalOwner ?? null,
    activeCover: owner?.activeCover ?? null,
    actingPerson: owner?.actingPerson ?? null,
    ownerState: owner?.state ?? "not_assigned",
    ownerName: owner?.actingPerson?.name ?? null,
    ownerUserId: owner?.actingPerson?.userId ?? null,
    ...(owner?.actingPerson ? {} : { ownerDuty: "PO Duty" }),
    tone: late > 0 ? "warning" : "info",
    locked: false,
    broken: false,
    dueIso: input.due,
    workingDaysLate: late,
  };
}

/** `Issue the purchase return to {Supplier}` — due the next Office working
 *  day after the decision (Workspace §6.1). */
export function purchaseReturnIssueWork(
  claim: PurchaseReturnPendingIssue,
  owner: WorkspaceDutyResolution | null,
  today: IsoDate,
  holidays: PurchasingOfficeDays = myHolidaySet(),
): PurchaseReturnWorkOccurrence {
  const supplier = claim.supplier_name ?? "the supplier";
  const decided = claim.carres_execution_at ? klDate(claim.carres_execution_at) : null;
  return {
    item: workItem({
      ruleKey: PURCHASE_RETURN_WORK_RULE.issue,
      ref: claim.claim_no ?? "Not issued",
      objectId: claim.id,
      action: `Issue the purchase return to ${supplier}`,
      due: decided ? addWorkingDays(decided, 1, office(holidays)) : null,
    }, owner, today, holidays),
    problem: "Not issued",
    requiredResult: "The purchase return is issued",
  };
}

/** One PR's occurrences: the send, the day-before pickup check and the missed
 *  pickup. The owning fact removes each one; there is no Done button. */
export function purchaseReturnWorkItems(
  pr: PurchaseReturnDetail,
  owner: WorkspaceDutyResolution | null,
  today: IsoDate,
  holidays: PurchasingOfficeDays = myHolidaySet(),
): PurchaseReturnWorkOccurrence[] {
  const supplier = pr.supplier_name ?? "the supplier";
  const ref = pr.pr_no ?? "Not issued";
  const make = (ruleKey: PurchaseReturnWorkRule, action: string, due: IsoDate | null) =>
    workItem({ ruleKey, ref, objectId: pr.id, action, due }, owner, today, holidays);
  const out: PurchaseReturnWorkOccurrence[] = [];
  const pickup = purchaseReturnPickupState(pr);
  if (pickup === "Fully picked up") return out;

  if (!purchaseReturnSendLine(pr).sent) {
    const docDate = pr.pr_doc_date ? klDate(pr.pr_doc_date) : null;
    out.push({
      item: make(PURCHASE_RETURN_WORK_RULE.send, `Send the return document to ${supplier}`, docDate ? addWorkingDays(docDate, 1, office(holidays)) : null),
      problem: "Sending not confirmed",
      requiredResult: "The return document is recorded as sent to the supplier",
    });
  }

  const date = pr.confirmed_pickup_date;
  if (date) {
    const dayBefore = subtractWorkingDays(date, 1, office(holidays));
    if (today >= dayBefore && today <= date) {
      // Closed by a confirmation FOR THIS DATE recorded on or after the day
      // before — a confirmation taken at issue does not replace the check.
      const confirmed = pr.confirmations.some((c) => c.confirmed_pickup_date === date && klDate(c.recorded_at) >= dayBefore);
      if (!confirmed) {
        out.push({
          item: make(PURCHASE_RETURN_WORK_RULE.confirmTomorrowsPickup, "Confirm tomorrow's pickup", dayBefore),
          problem: "Confirm tomorrow's pickup",
          requiredResult: "The supplier's confirmation of the pickup date is recorded",
        });
      }
    }
    if (today > date && pickup === "Not picked up") {
      out.push({
        item: make(PURCHASE_RETURN_WORK_RULE.pickupMissed, "Follow up supplier", date),
        problem: "Pickup missed",
        requiredResult: "The goods are picked up, or a new pickup date is confirmed",
      });
    }
  }
  return out;
}

export const purchaseReturnDestination = (id: string) => `/operation?tab=purchase-returns&pr=${encodeURIComponent(id)}`;
export const purchaseReturnClaimDestination = (claimId: string) => `/operation?tab=claims&claim=${encodeURIComponent(claimId)}`;

/** Every occurrence on the Work feed's transport contract — the one mapping
 *  the API feed, the completion probe and the dev preview run. */
export function projectPurchaseReturnWork(input: {
  pendingIssue: readonly PurchaseReturnPendingIssue[];
  returns: readonly PurchaseReturnDetail[];
  poDuty: WorkspaceDutyResolution | null;
  today: IsoDate;
  observedAt?: string;
  /** The stored Office calendar (`officeWorkingDayOptions`) or a holiday set. */
  holidays?: PurchasingOfficeDays;
}): OperationWorkItem[] {
  const holidays = input.holidays ?? myHolidaySet();
  const observed = input.observedAt ? { observedAt: input.observedAt } : {};
  const issues = input.pendingIssue.map((claim) => {
    const { item, problem, requiredResult } = purchaseReturnIssueWork(claim, input.poDuty, input.today, holidays);
    return operationWorkItemFromProjection(item, {
      object: { kind: "supplier_claim", id: claim.id, label: claim.claim_no ?? "Not issued" },
      problem,
      recipient: claim.supplier_name,
      requiredResult,
      destination: purchaseReturnClaimDestination(claim.id),
      today: input.today,
      ...observed,
    });
  });
  const returns = input.returns.flatMap((pr) =>
    purchaseReturnWorkItems(pr, input.poDuty, input.today, holidays).map(({ item, problem, requiredResult }) =>
      operationWorkItemFromProjection(item, {
        object: { kind: "purchase_return", id: pr.id, label: pr.pr_no ?? "Not issued" },
        problem,
        recipient: pr.supplier_name,
        requiredResult,
        destination: purchaseReturnDestination(pr.id),
        today: input.today,
        ...observed,
      })),
  );
  return [...issues, ...returns];
}

// ── `Record supplier receipt` (§9.6, 0614) ─────────────────────────────────
//
// §9.6: "`Supplier Received Date` is recorded from supplier evidence; fully
// picked up never implies it." Only a Unit Stock has picked up may be
// received, and each Unit is received once. The door (0614) refuses in the same
// words; this is the form's reading of the same facts.

export const RECORD_SUPPLIER_RECEIPT = "Record supplier receipt";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** `7 Sep 2026` — the door's own `FMDD Mon YYYY`. */
export function purchaseReturnReceiptDateWords(iso: IsoDate): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

export interface PurchaseReturnReceiptUnit {
  stock_item_id: string;
  unit_id: string;
  /** Why this Unit cannot be ticked: `Not picked up` · `Already received {date}`. */
  refusal: string | null;
  /** The Malaysia date Stock recorded the pickup; the received date may not be earlier. */
  pickedUpOn: IsoDate | null;
}

export function purchaseReturnReceiptUnits(pr: Pick<PurchaseReturnListRow, "units">): PurchaseReturnReceiptUnit[] {
  return pr.units.filter((u) => u.stock_item_id).map((u) => {
    const pickedUpOn = u.actual_pickup_date ? klDateOfIso(u.actual_pickup_date) : null;
    const refusal = !pickedUpOn ? "Not picked up"
      : u.supplier_received_date ? `Already received ${purchaseReturnReceiptDateWords(u.supplier_received_date)}`
      : null;
    return { stock_item_id: u.stock_item_id!, unit_id: u.unit_id, refusal, pickedUpOn };
  });
}

export function purchaseReturnReceiptMissing(d: { date: string | null; unitIds: readonly string[]; files: number; confirmedBy: string; confirmedAt: string | null }): string[] {
  const out: string[] = [];
  if (!d.date) out.push("Choose the Supplier Received Date.");
  if (d.unitIds.length === 0) out.push("Tick the Units the supplier received.");
  const by = d.confirmedBy.trim().length > 0;
  if (by !== Boolean(d.confirmedAt)) out.push("A confirmation needs who confirmed and when.");
  else if (d.files === 0 && !by) out.push("Add the evidence: a file, or who confirmed and when.");
  return out;
}
