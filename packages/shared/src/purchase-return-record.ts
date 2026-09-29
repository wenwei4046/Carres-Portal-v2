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
import type { CarresExecution } from "./supplier-claim";
import type { PurchaseReturnListRow } from "./purchase-return";
import { purchaseReturnCollectedQty, purchaseReturnQty } from "./purchase-return";
import { PURCHASING_OFFICE_OFF_DAYS } from "./purchasing-supplier-calls";
import { myHolidaySet } from "./my-holidays";
import { addWorkingDays, countWorkingDays, subtractWorkingDays, type IsoDate } from "./working-days";
import type { WorkItem } from "./work-engine";
import { operationWorkItemFromProjection, type OperationWorkItem } from "./operation-work";
import type { WorkspaceDutyResolution } from "./workspace-duty";

// ── `Record what Carres does next` ──────────────────────────────────────────

/** The five stored values (0409) and their 2026-09-25 display words, in the
 *  approved order. The stored keys never change; only the words on screen. */
export const CARRES_NEXT_CHOICES = [
  { key: "return_to_supplier", label: "Return to supplier" },
  { key: "collect_defective_item", label: "Collect defective item" },
  { key: "replace_first", label: "Replace first" },
  { key: "collect_first", label: "Collect first" },
  { key: "exchange_on_collection", label: "Exchange on collection" },
] as const satisfies ReadonlyArray<{ key: CarresExecution; label: string }>;

export const RECORD_WHAT_CARRES_DOES_NEXT = "Record what Carres does next";
export const WHAT_CARRES_DOES_NOT_RECORDED = "What Carres does · Not recorded";
export const ISSUE_PURCHASE_RETURN = "Issue Purchase Return";
export const RETURN_DOCUMENT_SENT = "Return document sent to supplier";
export const NO_RETURN_WAS_ISSUED = "No return was issued.";

export function carresNextWord(key: string | null | undefined): string {
  if (!key) return WHAT_CARRES_DOES_NOT_RECORDED;
  return CARRES_NEXT_CHOICES.find((c) => c.key === key)?.label ?? key;
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
  /** Supplier Master's recorded return address; null = not recorded. */
  return_address: string | null;
  grn_no: string | null;
  units: PurchaseReturnIssueUnit[];
}

/** What stops the issue, named, in the form's order. Empty = issuable. */
export function purchaseReturnIssueMissing(source: PurchaseReturnIssueSource, picked: readonly string[]): string[] {
  const out: string[] = [];
  if (!source.return_address || !source.return_address.trim()) {
    out.push(`Add the return address of ${source.supplier_name ?? "the supplier"}`);
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

const office = (holidays: ReadonlySet<string>) => ({ offDays: PURCHASING_OFFICE_OFF_DAYS, holidays });

function klDate(iso: string): IsoDate {
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function workItem(
  input: { ruleKey: PurchaseReturnWorkRule; ref: string; objectId: string; action: string; due: IsoDate | null },
  owner: WorkspaceDutyResolution | null,
  today: IsoDate,
  holidays: ReadonlySet<string>,
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
  holidays: ReadonlySet<string> = myHolidaySet(),
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
  holidays: ReadonlySet<string> = myHolidaySet(),
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
  holidays?: ReadonlySet<string>;
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
