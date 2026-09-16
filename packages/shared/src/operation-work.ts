import { z } from "zod";
import { WORK_RULES, type WorkItem } from "./work-engine";

export const operationWorkModuleSchema = z.enum([
  "orders",
  "purchasing",
  "receiving",
  "claims",
  "stock",
  "delivery",
  "payment",
  "service_case",
  "issue_tracker",
]);

export const operationWorkPersonSchema = z.object({
  userId: z.string().min(1).nullable(),
  name: z.string().min(1).nullable(),
}).strict();

export const operationWorkOwnerSchema = z.object({
  rule: z.string().min(1),
  dutyKey: z.string().min(1).nullable(),
  normal: operationWorkPersonSchema.nullable(),
  activeCover: operationWorkPersonSchema.nullable(),
  acting: operationWorkPersonSchema.nullable(),
  state: z.enum(["primary", "covered", "not_assigned"]),
}).strict();

export const operationWorkSourceKeySchema = z.enum([
  "orders",
  "purchasing",
  "receiving",
  "delivery",
  "payment",
  "issue_tracker",
]);

export const operationWorkCalendarStateSchema = z.enum([
  "ready",
  "not_configured",
  "read_failed",
]);

const operationWorkCalendarIdentitySchema = z.object({
  key: z.string().min(1),
  source: z.string().min(1),
  state: operationWorkCalendarStateSchema,
}).strict();

const operationWorkCalendarSchema = z.object({
  module: operationWorkCalendarIdentitySchema,
  actor: operationWorkCalendarIdentitySchema,
  holidayName: z.string().min(1).nullable(),
}).strict();

export const operationWorkItemSchema = z.object({
  contractVersion: z.literal(2),
  id: z.string().min(5),
  module: operationWorkModuleSchema,
  ruleKey: z.string().min(1),
  object: z.object({
    kind: z.string().min(1),
    id: z.string().min(1),
    label: z.string().min(1),
  }).strict(),
  problem: z.string().min(1),
  action: z.string().min(4).refine(
    (value) => !/^[^·]+\s·\s/.test(value.trim()),
    "Owner identity belongs in structured metadata, not the action sentence",
  ),
  recipient: z.string().min(1).nullable(),
  requiredResult: z.string().min(1),
  completionPredicate: z.string().min(1),
  completionStatement: z.string().min(1),
  owner: operationWorkOwnerSchema,
  timing: z.object({
    businessDueOn: z.string().date().nullable(),
    actionOn: z.string().date().nullable(),
    workingDaysMissed: z.number().int().nonnegative(),
    state: z.enum(["missed", "scheduled", "no_working_date", "calendar_gap", "no_eligible_actor"]),
    noDateReason: z.string().min(1).nullable(),
    calendar: operationWorkCalendarSchema,
  }).strict(),
  communication: z.object({
    channel: z.string().min(1),
    recipient: z.string().min(1),
    sentAt: z.string().datetime().nullable(),
    replyState: z.enum(["not_sent", "waiting", "replied"]).nullable(),
  }).strict().nullable(),
  blocker: z.object({
    reason: z.string().min(1),
    destination: z.string().startsWith("/"),
  }).strict().nullable(),
  nextConsequence: z.string().min(1).nullable(),
  destination: z.string().startsWith("/"),
  observedAt: z.string().datetime(),
  tone: z.enum(["danger", "warning", "info", "success", "neutral"]),
  locked: z.boolean(),
  broken: z.boolean(),
}).strict();

export const operationWorkSourceHealthSchema = z.object({
  key: operationWorkSourceKeySchema,
  state: z.enum(["healthy", "delayed", "failed"]),
  observedAt: z.string().datetime().nullable(),
  lastSuccessfulAt: z.string().datetime().nullable(),
  errorLabel: z.string().min(1).nullable(),
}).strict();

const operationWorkSourcesSchema = z.array(operationWorkSourceHealthSchema)
  .length(operationWorkSourceKeySchema.options.length)
  .superRefine((sources, ctx) => {
    const seen = new Set(sources.map((source) => source.key));
    for (const key of operationWorkSourceKeySchema.options) {
      if (!seen.has(key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing Work source health: ${key}` });
      }
    }
  });

export const operationWorkResponseSchema = z.object({
  contractVersion: z.literal(2),
  complete: z.boolean(),
  items: z.array(operationWorkItemSchema),
  staff: z.array(z.object({
    userId: z.string().min(1),
    name: z.string().nullable(),
    email: z.string().email(),
  }).strict()),
  generatedOn: z.string().date(),
  sources: operationWorkSourcesSchema,
  counts: z.object({
    all: z.number().int().nonnegative(),
    byDay: z.record(z.number().int().nonnegative()),
    byModule: z.record(z.number().int().nonnegative()),
    byOwner: z.record(z.number().int().nonnegative()),
  }).strict(),
}).strict();

export type OperationWorkModule = z.infer<typeof operationWorkModuleSchema>;
export type OperationWorkPerson = z.infer<typeof operationWorkPersonSchema>;
export type OperationWorkOwner = z.infer<typeof operationWorkOwnerSchema>;
export type OperationWorkSourceHealth = z.infer<typeof operationWorkSourceHealthSchema>;
export type OperationWorkItem = z.infer<typeof operationWorkItemSchema>;
export type OperationWorkResponse = z.infer<typeof operationWorkResponseSchema>;

function identityPart(value: string): string {
  return value.trim().replaceAll(":", "%3A");
}

export function operationWorkStableId(
  module: OperationWorkModule,
  objectId: string,
  ruleKey: string,
): string {
  return [module, objectId, ruleKey].map(identityPart).join(":");
}

export interface OperationWorkPresentation {
  object: OperationWorkItem["object"];
  problem: string;
  recipient: string | null;
  requiredResult: string;
  completionStatement: string;
  destination: string;
  today: string;
  calendar: z.infer<typeof operationWorkCalendarSchema>;
  observedAt: string;
}

/** Translate a module engine's open projection into the transport contract.
 * The module supplies presentation facts and the registry supplies closure;
 * neither the API nor Workspace invents either one. */
export function operationWorkItemFromProjection(
  item: WorkItem,
  presentation: OperationWorkPresentation,
): OperationWorkItem {
  const rule = WORK_RULES.find((candidate) => candidate.key === item.ruleKey);
  if (!rule) throw new Error(`Work rule is not registered: ${item.ruleKey}`);
  const dueOn = item.dueIso;
  const state =
    item.workingDaysLate > 0
      ? "missed"
      : dueOn === null
        ? "no_working_date"
        : "scheduled";
  return operationWorkItemSchema.parse({
    contractVersion: 2,
    id: operationWorkStableId(item.module, presentation.object.id, item.ruleKey),
    module: item.module,
    ruleKey: item.ruleKey,
    object: presentation.object,
    problem: presentation.problem,
    action: item.action,
    recipient: presentation.recipient,
    requiredResult: presentation.requiredResult,
    completionPredicate: rule.completionFact,
    completionStatement: presentation.completionStatement,
    owner: {
      rule: item.ownerRule,
      dutyKey: item.ownerDutyKey,
      normal: item.normalOwner,
      activeCover: item.activeCover,
      acting: item.actingPerson,
      state: item.ownerState,
    },
    timing: {
      businessDueOn: dueOn,
      actionOn: dueOn,
      workingDaysMissed: item.workingDaysLate,
      state,
      noDateReason: dueOn === null ? "The owning rule has no working date" : null,
      calendar: presentation.calendar,
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    destination: presentation.destination,
    observedAt: presentation.observedAt,
    tone: item.tone,
    locked: item.locked,
    broken: item.broken,
  });
}
