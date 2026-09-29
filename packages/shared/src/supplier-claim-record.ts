/**
 * ⭐ SUPPLIER CLAIM RECORD — the confirmed register cells, the supplier reply
 * state and the Claim's own Work (Purchasing MASTER §9.5, owner rulings
 * 2026-09-06 / 2026-09-18 / 2026-09-25; COPY "Supplier Claims words").
 *
 * ONE arithmetic for three readers: the register row, the claim record's
 * `Current action` + Supplier state line, and the Work feed. A reply recorded
 * against the whole claim is a claim-level fact; nothing here spreads it across
 * Units as if each had been answered separately.
 *
 * Reply timing: `Reply expected` = ask + `Reply waiting days`; after
 * `Extra days before escalation` more Office working days without a reply the
 * Purchasing Approver gets decision work while PO Duty keeps the chase. Both
 * are Purchasing Settings (0606), SNAPSHOTTED onto the claim when the ask is
 * recorded (0607) — a later Settings change never moves an asked claim's
 * dates. An ask recorded before 0607 carries no snapshot and reads the
 * governed starting values below.
 */
import { SUPPLIER_CLAIM_RESPONSES, supplierClaimResponseLabel } from "./supplier-claim";
import { PURCHASING_OFFICE_OFF_DAYS } from "./purchasing-supplier-calls";
import { myHolidaySet } from "./my-holidays";
import { addWorkingDays, countWorkingDays, type IsoDate } from "./working-days";
import type { WorkItem } from "./work-engine";
import { operationWorkItemFromProjection, type OperationWorkItem } from "./operation-work";
import type { WorkspaceDutyResolution } from "./workspace-duty";

// ── words (COPY-STANDARD, Supplier Claims) ──────────────────────────────────

export const SUPPLIER_CLAIM_ABSENT = "Not recorded";
export const SUPPLIER_CLAIM_NOT_ISSUED = "Not issued";
export const SUPPLIER_CLAIM_STATUS_WORD: Record<string, string> = {
  open: "In progress",
  closed: "Closed",
  cancelled: "Cancelled",
};
export const SUPPLIER_CLAIM_IN_PROGRESS_TOOLTIP = "Not closed yet. It does not mean the supplier has started.";
export const SUPPLIER_CLAIM_REPLY_SCOPE_WORD = { claim: "Whole claim", units: "These Units" } as const;
export type SupplierClaimReplyScope = keyof typeof SUPPLIER_CLAIM_REPLY_SCOPE_WORD;

/** The confirmed twelve-column order, 2026-09-18. `select` and `expand` are
 *  the two separate leading controls the grid draws itself. */
export const SUPPLIER_CLAIM_COLUMN_ORDER = [
  "select", "expand", "status", "claim", "reported", "supplier", "po", "grn", "items", "qty", "problem", "response",
] as const;
export const SUPPLIER_CLAIM_COLUMN_LABEL = {
  status: "Claim status",
  claim: "Supplier Claim No",
  reported: "Claim Reported",
  supplier: "Supplier",
  po: "PO No",
  grn: "GRN No",
  items: "Items",
  qty: "Qty",
  problem: "Problem",
  response: "Supplier Response",
} as const;
export const SUPPLIER_CLAIM_RAIL_GROUPS = ["Supplier", "Problem", "Claim status", "Supplier Response"] as const;

/** `In progress` · `Closed` · `Cancelled` — display only; stored words unchanged. */
export function supplierClaimStatusWord(status: string | null | undefined): string {
  return (status && SUPPLIER_CLAIM_STATUS_WORD[status]) || SUPPLIER_CLAIM_ABSENT;
}

/** `{N} Supplier Claims` · `1 Supplier Claim` · `{n} of {N} Supplier Claims`. */
export function supplierClaimFooter(shown: number, total: number): string {
  const noun = total === 1 ? "Supplier Claim" : "Supplier Claims";
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
}

// ── the goods identity on PO No line two ────────────────────────────────────

export interface SupplierClaimUnit {
  id: string;
  unit_code: string | null;
  identity_scope: "unit" | "quantity" | string;
  qty: number | null;
}

/**
 * The five-way line two under `PO No`: one Unit ID · `{n} Units` · `Counted
 * stock` · `Unit not recorded` · `Units could not be loaded`. Never a
 * fabricated Unit ID, and `{n} Units` never reads as one.
 */
export function supplierClaimUnitLine(units: readonly SupplierClaimUnit[] | null): string {
  if (units == null) return "Units could not be loaded";
  const tracked = units.filter((u) => u.identity_scope === "unit" && u.unit_code);
  if (tracked.length > 1) return `${tracked.length} Units`;
  if (tracked.length === 1) return tracked[0]!.unit_code!;
  if (units.some((u) => u.identity_scope === "quantity")) return "Counted stock";
  return "Unit not recorded";
}

/** `{first} + {n} more` when a claim covers more than one model. */
export function supplierClaimItemsLine(models: readonly string[]): string | null {
  const names = [...new Set(models.filter(Boolean))];
  if (names.length === 0) return null;
  return names.length === 1 ? names[0]! : `${names[0]} + ${names.length - 1} more`;
}

// ── the reply draft ─────────────────────────────────────────────────────────

export interface SupplierClaimReplyDraft {
  response: string | null;
  scope: SupplierClaimReplyScope | null;
  unitIds: readonly string[];
  supplierDate: string | null;
  note: string;
  evidenceCount: number;
  spokeWith: string;
  spokenAt: string | null;
}

/** What is missing, named, in the order the form shows them. Empty = saveable. */
export function supplierClaimReplyMissing(d: SupplierClaimReplyDraft): string[] {
  const out: string[] = [];
  if (!d.response || !SUPPLIER_CLAIM_RESPONSES.some((r) => r.key === d.response)) out.push("Supplier's answer");
  if (!d.scope) out.push("Applies to");
  else if (d.scope === "units" && d.unitIds.length === 0) out.push("These Units");
  const phone = d.spokeWith.trim().length > 0;
  if (d.evidenceCount === 0 && !(phone && d.spokenAt)) out.push("Evidence");
  if ((d.response === "reject" || d.response === "other_agreement") && d.note.trim().length === 0) out.push("Note");
  return out;
}

// ── reply timing and state ──────────────────────────────────────────────────

/** The governed starting values (owner-approved 2026-09-06): 2 and 2 Office
 *  working days — used only for an ask recorded before its snapshot existed. */
export const SUPPLIER_CLAIM_REPLY_DEFAULTS = { replyWaitingDays: 2, extraDaysBeforeEscalation: 2 } as const;
export interface SupplierClaimReplyTiming {
  replyWaitingDays: number;
  extraDaysBeforeEscalation: number;
}

export function klDateOfIso(iso: string): IsoDate {
  return new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const office = (holidays: ReadonlySet<string>) => ({ offDays: PURCHASING_OFFICE_OFF_DAYS, holidays });

export function supplierClaimReplyDates(
  requestedAt: string,
  timing: SupplierClaimReplyTiming = SUPPLIER_CLAIM_REPLY_DEFAULTS,
  holidays: ReadonlySet<string> = myHolidaySet(),
): { askedOn: IsoDate; replyExpected: IsoDate; escalateOn: IsoDate } {
  const askedOn = klDateOfIso(requestedAt);
  const replyExpected = addWorkingDays(askedOn, timing.replyWaitingDays, office(holidays));
  return { askedOn, replyExpected, escalateOn: addWorkingDays(replyExpected, timing.extraDaysBeforeEscalation, office(holidays)) };
}

/** The claim facts the record, the register and Work read. */
export interface SupplierClaimFacts {
  /** 0607 — the timing snapshotted with the ask; null = asked before 0607. */
  reply_waiting_days?: number | null;
  escalation_extra_days?: number | null;
  id: string;
  claim_no: string | null;
  status: string;
  supplier_name: string | null;
  requested_action: string | null;
  requested_at: string | null;
  supplier_response: string | null;
  /** A confirmed `Claim sent to supplier` exists (document_sends). */
  sent: boolean;
}

/** The timing THIS claim's ask carries — its snapshot, never the live setting. */
export function supplierClaimTimingOf(c: Pick<SupplierClaimFacts, "reply_waiting_days" | "escalation_extra_days">): SupplierClaimReplyTiming {
  return {
    replyWaitingDays: c.reply_waiting_days ?? SUPPLIER_CLAIM_REPLY_DEFAULTS.replyWaitingDays,
    extraDaysBeforeEscalation: c.escalation_extra_days ?? SUPPLIER_CLAIM_REPLY_DEFAULTS.extraDaysBeforeEscalation,
  };
}

export type SupplierClaimReplyState =
  | { kind: "not_recorded" }
  | { kind: "expected"; date: IsoDate }
  | { kind: "overdue"; date: IsoDate }
  | { kind: "escalated"; date: IsoDate }
  | { kind: "answered" };

/** `Not recorded` → `Reply expected {date}` → `Reply overdue · {date}` →
 *  `Escalated to {name}` → the recorded answer. The clock runs from the ask. */
export function supplierClaimReplyState(
  c: Pick<SupplierClaimFacts, "requested_at" | "supplier_response" | "reply_waiting_days" | "escalation_extra_days">,
  today: IsoDate,
  holidays?: ReadonlySet<string>,
): SupplierClaimReplyState {
  if (c.supplier_response) return { kind: "answered" };
  if (!c.requested_at) return { kind: "not_recorded" };
  const d = supplierClaimReplyDates(c.requested_at, supplierClaimTimingOf(c), holidays);
  if (today >= d.escalateOn) return { kind: "escalated", date: d.escalateOn };
  if (today > d.replyExpected) return { kind: "overdue", date: d.replyExpected };
  return { kind: "expected", date: d.replyExpected };
}

// ── Work ────────────────────────────────────────────────────────────────────

export const SUPPLIER_CLAIM_WORK_RULE = {
  issueClaim: "claims.issue_claim",
  obtainReply: "claims.obtain_reply",
  noReplyDecision: "claims.no_reply_decision",
} as const;
export type SupplierClaimWorkRule = (typeof SUPPLIER_CLAIM_WORK_RULE)[keyof typeof SUPPLIER_CLAIM_WORK_RULE];

/** The §9.5 Work template words, with the actual supplier in place of Hooka. */
export const supplierClaimWorkWords = (supplier: string) => ({
  notIssued: "The supplier claim is not issued",
  share: `Share the claim with ${supplier} and record the actual message sent`,
  notReplied: `${supplier} has not replied`,
  askReply: `Ask ${supplier} to reply to the supplier claim`,
  refused: "The supplier refused the claim",
  decide: "Decide how Carres will resolve the item problem",
});

export interface SupplierClaimAction {
  rule: SupplierClaimWorkRule | null;
  fact: string;
  instruction: string;
  /** The working date (Office calendar), or null when none is governed. */
  date: IsoDate | null;
  button: "Record what we asked" | "Claim sent to supplier" | "Record supplier reply" | null;
}

/**
 * The record's ONE current action — the same facts Work projects, so the
 * page and the Work card never disagree about what is next.
 */
export function supplierClaimCurrentAction(
  c: SupplierClaimFacts,
  holidays: ReadonlySet<string> = myHolidaySet(),
): SupplierClaimAction | null {
  if (c.status !== "open") return null;
  const w = supplierClaimWorkWords(c.supplier_name ?? "the supplier");
  if (c.supplier_response === "reject") return { rule: null, fact: w.refused, instruction: w.decide, date: null, button: null };
  if (c.supplier_response) return null;
  if (!c.requested_at) return { rule: null, fact: w.notIssued, instruction: w.share, date: null, button: "Record what we asked" };
  const d = supplierClaimReplyDates(c.requested_at, supplierClaimTimingOf(c), holidays);
  if (!c.sent) {
    return { rule: SUPPLIER_CLAIM_WORK_RULE.issueClaim, fact: w.notIssued, instruction: w.share, date: addWorkingDays(d.askedOn, 1, office(holidays)), button: "Claim sent to supplier" };
  }
  return { rule: SUPPLIER_CLAIM_WORK_RULE.obtainReply, fact: w.notReplied, instruction: w.askReply, date: d.replyExpected, button: "Record supplier reply" };
}

interface Occurrence {
  item: WorkItem;
  problem: string;
  requiredResult: string;
}

function occurrences(
  c: SupplierClaimFacts,
  owners: { poDuty: WorkspaceDutyResolution | null; approver: WorkspaceDutyResolution | null },
  today: IsoDate,
  holidays: ReadonlySet<string>,
): Occurrence[] {
  if (c.status !== "open" || c.supplier_response || !c.requested_at) return [];
  const w = supplierClaimWorkWords(c.supplier_name ?? "the supplier");
  const late = (due: IsoDate) => (due < today ? countWorkingDays(due, today, office(holidays)) : 0);
  const make = (ruleKey: SupplierClaimWorkRule, action: string, due: IsoDate, approver: boolean): WorkItem => {
    const owner = approver ? owners.approver : owners.poDuty;
    const duty = approver ? "purchasing_approver" : "po_duty";
    return {
      ruleKey,
      module: "purchasing",
      soRef: c.claim_no ?? SUPPLIER_CLAIM_NOT_ISSUED,
      orderId: c.id,
      action,
      ownerRule: duty,
      ownerDutyKey: duty,
      normalOwner: owner?.normalOwner ?? null,
      activeCover: owner?.activeCover ?? null,
      actingPerson: owner?.actingPerson ?? null,
      ownerState: owner?.state ?? "not_assigned",
      ownerName: owner?.actingPerson?.name ?? null,
      ownerUserId: owner?.actingPerson?.userId ?? null,
      ...(owner?.actingPerson ? {} : { ownerDuty: approver ? "Purchasing Approver" : "PO Duty" }),
      tone: late(due) > 0 ? "warning" : "info",
      locked: false,
      broken: false,
      dueIso: due,
      workingDaysLate: late(due),
    };
  };
  const d = supplierClaimReplyDates(c.requested_at, supplierClaimTimingOf(c), holidays);
  if (!c.sent) {
    return [{
      item: make(SUPPLIER_CLAIM_WORK_RULE.issueClaim, w.share, addWorkingDays(d.askedOn, 1, office(holidays)), false),
      problem: w.notIssued,
      requiredResult: "The actual message sent to the supplier is recorded",
    }];
  }
  const out: Occurrence[] = [{
    item: make(SUPPLIER_CLAIM_WORK_RULE.obtainReply, w.askReply, d.replyExpected, false),
    problem: w.notReplied,
    requiredResult: "The supplier's reply is recorded with its scope, date and evidence",
  }];
  if (today >= d.escalateOn) {
    out.push({
      item: make(SUPPLIER_CLAIM_WORK_RULE.noReplyDecision, w.decide, d.escalateOn, true),
      problem: w.notReplied,
      requiredResult: "The supplier's reply is recorded with its scope, date and evidence",
    });
  }
  return out;
}

export const supplierClaimDestination = (id: string) => `/operation?tab=claims&claim=${encodeURIComponent(id)}`;

/** Every open claim's occurrences on the Work feed's transport contract — the
 *  one mapping the API feed and the completion probe run. */
export function projectSupplierClaimWork(input: {
  claims: readonly SupplierClaimFacts[];
  poDuty: WorkspaceDutyResolution | null;
  approver: WorkspaceDutyResolution | null;
  today: IsoDate;
  observedAt?: string;
  holidays?: ReadonlySet<string>;
}): OperationWorkItem[] {
  const holidays = input.holidays ?? myHolidaySet();
  return input.claims.flatMap((c) =>
    occurrences(c, { poDuty: input.poDuty, approver: input.approver }, input.today, holidays).map(({ item, problem, requiredResult }) =>
      operationWorkItemFromProjection(item, {
        object: { kind: "supplier_claim", id: c.id, label: c.claim_no ?? SUPPLIER_CLAIM_NOT_ISSUED },
        problem,
        recipient: c.supplier_name,
        requiredResult,
        destination: supplierClaimDestination(c.id),
        today: input.today,
        ...(input.observedAt ? { observedAt: input.observedAt } : {}),
      })),
  );
}

/** The recorded answer line: `{answer} · {scope} · by {date} · recorded {date} · {recorder}`
 *  — the caller formats the dates; a missing supplier date prints no `by`. */
export function supplierClaimAnswerParts(input: {
  response: string;
  scope: SupplierClaimReplyScope | null;
  unitCodes: readonly string[];
}): { answer: string; scope: string } {
  const scope = input.scope === "units"
    ? (input.unitCodes.length === 1 ? input.unitCodes[0]! : input.unitCodes.length > 1 ? `${input.unitCodes[0]} + ${input.unitCodes.length - 1} more` : SUPPLIER_CLAIM_REPLY_SCOPE_WORD.units)
    : input.scope === "claim" ? SUPPLIER_CLAIM_REPLY_SCOPE_WORD.claim : SUPPLIER_CLAIM_ABSENT;
  return { answer: supplierClaimResponseLabel(input.response), scope };
}
