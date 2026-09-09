import { z } from "zod";
import { operationWorkItemSchema, operationWorkStableId, type OperationWorkItem } from "./operation-work";
import { countWorkingDays } from "./working-days";
import type { WorkspaceDutyResolution } from "./workspace-duty";

export const issueObjectKinds = ["item", "delivery", "document", "payment", "customer_information", "staff_work", "other"] as const;
export const issueObservedProblems = ["wrong_item", "damaged", "missing", "wrong_quantity", "late", "no_reply", "wrong_information", "work_not_done", "not_sure"] as const;
export const issueEvidenceKinds = ["photo", "video", "whatsapp_reply", "delivery_document", "other_document"] as const;

export const issueIntakeSchema = z.object({
  problemObject: z.enum(issueObjectKinds), observedProblem: z.enum(issueObservedProblems),
  foundByKind: z.enum(["me", "customer", "warehouse", "supplier", "logistics", "system", "other"]),
  foundByName: z.string().min(1), observedOn: z.string().date(),
  linkedObjects: z.array(z.object({ kind: z.enum(["sales_order", "purchase_order", "receiving", "supplier_claim", "unit", "delivery", "payment", "service_case", "guarantee", "rental", "issue"]), id: z.string().min(1), label: z.string().min(1) })).min(1),
  affectedObject: z.string().min(1), impact: z.string().min(1),
  evidence: z.array(z.object({ kind: z.enum(issueEvidenceKinds), count: z.number().int().positive() })).min(1),
  optionalDetail: z.string().max(300).optional(),
});
export type IssueIntake = z.infer<typeof issueIntakeSchema>;

const problemText: Record<IssueIntake["observedProblem"], string> = { wrong_item: "was the wrong item", damaged: "was damaged", missing: "was missing", wrong_quantity: "had the wrong quantity", late: "was late", no_reply: "had no reply", wrong_information: "had wrong information", work_not_done: "had required work not done", not_sure: "needs an evidence check" };
const englishDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));

export function buildIssueEnglish(raw: IssueIntake): string {
  const input = issueIntakeSchema.parse(raw); const link = input.linkedObjects[0]!.label;
  const where = input.foundByKind === "warehouse" ? "Warehouse checked" : `${input.foundByName} checked`;
  const proof = input.evidence.map((e) => `${e.count} ${e.kind === "photo" ? (e.count === 1 ? "photo" : "photos") : e.kind.replaceAll("_", " ")}`).join(" and ");
  return `${input.affectedObject} ${problemText[input.observedProblem]} when ${where} ${link} on ${englishDate(input.observedOn)}. ${proof} were added by ${input.foundByName}. ${input.impact}.`;
}

export const issueActionOwnerRules = ["issue_triage_duty", "issue_review_approver"] as const;
export type IssueActionOwnerRule = (typeof issueActionOwnerRules)[number];

const governedActionSchema = z.string().trim().min(4).refine(
  (value) => !/^[^·]+\s·\s/.test(value),
  "Owner identity belongs in structured metadata, not the action sentence",
);

export const issueActionInputSchema = z.object({
  trigger: z.string().trim().min(3),
  ownerRule: z.enum(issueActionOwnerRules),
  action: governedActionSchema,
  recipient: z.string().trim().min(1),
  requiredResult: z.string().trim().min(3),
  dueOn: z.string().date(),
}).strict();

export const issueActionResultInputSchema = z.object({
  resultCode: z.enum(["accepted", "rejected", "proof_added", "correction_confirmed", "repair_confirmed", "replacement_confirmed", "answer_recorded"]),
  result: z.string().trim().min(3),
  nextAction: issueActionInputSchema.optional(),
}).strict();

export type IssueActionSource = {
  id: string; issueId: string; issueNo: string; trigger: string;
  ownerRule: IssueActionOwnerRule; action: string; recipient: string;
  requiredResult: string; dueOn: string; materiality: "routine" | "significant" | "critical";
};

export function projectIssueActionWork(input: {
  actions: readonly IssueActionSource[];
  dutyResolutions: Partial<Record<IssueActionOwnerRule, WorkspaceDutyResolution>>;
  today: string;
}): OperationWorkItem[] {
  return input.actions.map((source) => {
    const duty = input.dutyResolutions[source.ownerRule] ?? null;
    const late = source.dueOn < input.today
      ? Math.max(1, countWorkingDays(source.dueOn, input.today))
      : 0;
    return operationWorkItemSchema.parse({
      id: operationWorkStableId("issue_tracker", source.id, "current_action"),
      module: "issue_tracker",
      ruleKey: "current_action",
      object: { kind: "issue", id: source.issueId, label: source.issueNo },
      problem: source.trigger,
      action: source.action,
      recipient: source.recipient,
      requiredResult: source.requiredResult,
      completionFact: "Current Issue action has a governed result",
      owner: {
        rule: source.ownerRule,
        dutyKey: source.ownerRule,
        normal: duty?.normalOwner ?? null,
        activeCover: duty?.activeCover ?? null,
        acting: duty?.actingPerson ?? null,
        state: duty?.state ?? "not_assigned",
      },
      timing: { dueOn: source.dueOn, workingDaysLate: late, bucket: late > 0 ? "overdue" : source.dueOn === input.today ? "today" : "later" },
      destination: `/operation/issues?issue=${encodeURIComponent(source.issueId)}`,
      tone: source.materiality === "critical" ? "danger" : source.materiality === "significant" ? "warning" : "info",
      locked: false,
      broken: duty === null || duty.state === "not_assigned",
    });
  });
}

export const createIssueInputSchema = z.object({
  intake: issueIntakeSchema,
  sourceModule: z.string().min(1),
  materiality: z.enum(["routine", "significant", "critical"]).default("routine"),
  currentAction: issueActionInputSchema,
});
export const addFaultOwnerInputSchema = z.object({
  ownerKind: z.enum(["related_party", "internal_staff", "internal_team", "other"]), relatedPartyId: z.string().uuid().optional(), staffId: z.string().uuid().optional(), ownerName: z.string().min(1),
  finding: z.enum(["confirmed_fault", "contributing_fault", "not_yet_confirmed", "not_at_fault", "not_enough_evidence"]), actOrOmission: z.string().min(3), response: z.enum(["admit", "disagree", "no_response", "explanation_given"]).default("no_response"), responseDetail: z.string().max(500).optional(),
});
export const addIssueMoneyInputSchema = z.object({ track: z.enum(["incurred", "recoverable", "recovered"]), amount: z.number().nonnegative(), currency: z.string().length(3).default("MYR"), eventDate: z.string().date(), counterpartyName: z.string().min(1), costBearerId: z.string().uuid().optional(), reason: z.string().min(3), financeRecordKind: z.string().min(1), financeRecordId: z.string().min(1) });
export const issueReviewInputSchema = z.object({ finding: z.string().min(3), trainingNeeded: z.boolean(), sopChangeNeeded: z.boolean(), discussedOn: z.string().date().optional(), trainingResult: z.string().min(3).optional(), sopResult: z.string().min(3).optional() });

export type IssueMoney = { track: "incurred" | "recoverable" | "recovered"; amount: number; currency: string; costBearerId?: string };
export function reconcileIssueMoney(money: IssueMoney[]) { const currencies = new Set(money.map((m) => m.currency)); if (currencies.size !== 1) throw new Error("One summary can use only one currency"); const total = (track: IssueMoney["track"]) => money.filter((m) => m.track === track).reduce((sum, m) => sum + m.amount, 0); const recoverable = total("recoverable"), recovered = total("recovered"); return { currency: money[0]?.currency ?? "MYR", incurred: total("incurred"), recoverable, recovered, outstanding: recoverable - recovered }; }

export function relatedPartyReportRows(input: { issueId: string; issueNo: string; observedOn: string; officialEnglish: string; incurred: number; faultOwners: Array<{ partyId: string; partyName: string; actOrOmission: string; finding: "confirmed_fault" | "contributing_fault" | "not_yet_confirmed" }>; money: IssueMoney[] }) {
  return input.faultOwners.map((owner) => ({ issueId: input.issueId, issueNo: input.issueNo, observedOn: input.observedOn, officialEnglish: input.officialEnglish, partyId: owner.partyId, partyName: owner.partyName, actOrOmission: owner.actOrOmission, finding: owner.finding, commonIncidentCost: input.incurred, recoverable: input.money.filter((m) => m.track === "recoverable" && m.costBearerId === owner.partyId).reduce((s, m) => s + m.amount, 0), recovered: input.money.filter((m) => m.track === "recovered" && m.costBearerId === owner.partyId).reduce((s, m) => s + m.amount, 0) }));
}
