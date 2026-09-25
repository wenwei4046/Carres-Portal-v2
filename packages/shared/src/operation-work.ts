import { z } from "zod";
import { operationWorkCompletedSchema, operationWorkLifecycleSchema } from "./work-lifecycle";
import { WORK_RULES, type WorkItem } from "./work-engine";

export const operationWorkModuleSchema = z.enum([
  "orders",
  "purchasing",
  "receiving",
  "delivery",
  "payment",
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
  coverEvidence: z.object({
    id: z.string().min(1),
    startsOn: z.string().date(),
    endsOn: z.string().date(),
  }).strict().nullable(),
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

export const operationWorkInteractionSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("embedded"),
    actionKey: z.string().min(1),
    componentKey: z.string().min(1),
    capability: z.string().min(1),
    inputContract: z.string().min(1),
    evidenceContract: z.string().min(1),
    idempotencyKey: z.string().min(1),
    staleVersion: z.string().min(1),
    staleRefusal: z.string().min(1),
    successReceipt: z.string().min(1),
    fallbackDestination: z.string().startsWith("/"),
  }).strict(),
  z.object({
    mode: z.literal("open_module"),
    fallbackDestination: z.string().startsWith("/"),
  }).strict(),
  z.object({
    mode: z.literal("read_only"),
    reason: z.string().min(1),
    fallbackDestination: z.string().startsWith("/"),
  }).strict(),
]);

export const operationWorkClosureReceiptSchema = z.object({
  occurrenceId: z.string().min(5),
  result: z.string().min(1).nullable(),
  actor: operationWorkPersonSchema.nullable(),
  reason: z.string().min(1).nullable(),
  closedAt: z.string().datetime(),
  sourceVersion: z.string().min(1),
}).strict();

export const operationWorkItemSchema = z.object({
  contractVersion: z.literal(2),
  id: z.string().min(5),
  module: operationWorkModuleSchema,
  ruleKey: z.string().min(1),
  ruleVersion: z.number().int().positive(),
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
    placement: z.enum(["missed", "on_day", "no_working_date"]),
    missedAge: z.discriminatedUnion("state", [
      z.object({
        state: z.literal("counted"),
        workingDays: z.number().int().nonnegative(),
        basis: z.object({
          calendarKey: z.string().min(1),
          from: z.string().date(),
          to: z.string().date(),
        }).strict(),
      }).strict(),
      z.object({
        state: z.literal("not_calculable"),
        workingDays: z.null(),
        basis: z.null(),
      }).strict(),
    ]),
    eligibility: z.enum(["eligible", "no_eligible_actor", "unknown"]),
    noDateReason: z.string().min(1).nullable(),
    calendar: operationWorkCalendarSchema,
  }).strict().superRefine((timing, ctx) => {
    const calendarReady = timing.calendar.module.state === "ready" && timing.calendar.actor.state === "ready";
    if (!calendarReady && timing.missedAge.state !== "not_calculable") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["missedAge"], message: "Missed age needs both calendars" });
    }
    if ((timing.actionOn === null) !== (timing.placement === "no_working_date")) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["placement"], message: "No working date must match a null action date" });
    }
    if ((timing.actionOn === null) !== (timing.noDateReason !== null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["noDateReason"], message: "A no-date reason is required only when the action date is absent" });
    }
    if (timing.missedAge.state === "counted" && timing.missedAge.workingDays > 0 && timing.placement !== "missed") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["placement"], message: "Positive missed age belongs in Missed" });
    }
  }),
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
  interaction: operationWorkInteractionSchema,
  destination: z.string().startsWith("/"),
  observedAt: z.string().datetime(),
  sourceVersion: z.string().min(1),
  tone: z.enum(["danger", "warning", "info", "success", "neutral"]),
  locked: z.boolean(),
  broken: z.boolean(),
  /** To do · Waiting, derived from the 0584 ledger (work-lifecycle.ts). A
   *  projector never sets it; the Work read attaches it. Absent reads as To do
   *  (`workLifecycleOrToDo`). */
  lifecycle: operationWorkLifecycleSchema.optional(),
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
  closureReceipt: operationWorkClosureReceiptSchema.nullable(),
  sources: operationWorkSourcesSchema,
  /** Completed occurrences from the 0584 ledger (recent window), written only
   *  by the owning modules' completion facts. Absent on a read without it. */
  completed: z.array(operationWorkCompletedSchema).optional(),
}).strict().superRefine((response, ctx) => {
  if (response.complete && response.sources.some((source) => source.state !== "healthy")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["complete"], message: "A response with a non-current source cannot be complete" });
  }
});

export type OperationWorkModule = z.infer<typeof operationWorkModuleSchema>;
export type OperationWorkPerson = z.infer<typeof operationWorkPersonSchema>;
export type OperationWorkOwner = z.infer<typeof operationWorkOwnerSchema>;
export type OperationWorkSourceHealth = z.infer<typeof operationWorkSourceHealthSchema>;
export type OperationWorkInteraction = z.infer<typeof operationWorkInteractionSchema>;
export type OperationWorkClosureReceipt = z.infer<typeof operationWorkClosureReceiptSchema>;
export type OperationWorkItem = z.infer<typeof operationWorkItemSchema>;
export type OperationWorkResponse = z.infer<typeof operationWorkResponseSchema>;

function identityPart(value: string): string {
  return value.trim().replaceAll(":", "%3A");
}

/** `orders:{object}:{rule}`, a date-specific `…:@{key}` and/or a later
 *  generation `…:g2` → its parts. The object part keeps its escaping; module
 *  and rule never contain `:`. */
export function parseWorkOccurrenceId(id: string): {
  module: OperationWorkModule;
  objectId: string;
  ruleKey: string;
  occurrenceKey: string | null;
  generation: number;
} | null {
  const parts = id.split(":");
  if (parts.length < 3 || parts.length > 5) return null;
  const module = operationWorkModuleSchema.safeParse(parts[0]);
  if (!module.success || !parts[1] || !parts[2]) return null;
  let occurrenceKey: string | null = null;
  let generation = 1;
  for (const [index, part] of parts.slice(3).entries()) {
    const gen = /^g(\d+)$/.exec(part);
    if (part.startsWith("@") && part.length > 1 && index === 0) {
      occurrenceKey = part.slice(1).replaceAll("%3A", ":");
    } else if (gen && Number(gen[1]) >= 2 && index === parts.length - 4) {
      generation = Number(gen[1]);
    } else {
      return null;
    }
  }
  return { module: module.data, objectId: parts[1].replaceAll("%3A", ":"), ruleKey: parts[2], occurrenceKey, generation };
}

/**
 * The stable occurrence identity (Workspace MASTER §2: module + rule + source
 * object + occurrence). `occurrenceKey` names WHICH time a date-specific rule
 * fires — `purchasing.confirm_tomorrows_delivery` for Tue 20 Oct is a different
 * obligation from the same check for Fri 23 Oct after a delay.
 */
export function operationWorkStableId(
  module: OperationWorkModule,
  objectId: string,
  ruleKey: string,
  occurrenceKey?: string | null,
): string {
  const base = [module, objectId, ruleKey].map(identityPart).join(":");
  return occurrenceKey ? `${base}:@${identityPart(occurrenceKey)}` : base;
}

export interface OperationWorkPresentation {
  object: OperationWorkItem["object"];
  problem: string;
  recipient: string | null;
  requiredResult: string;
  completionStatement?: string;
  destination: string;
  today: string;
  calendar?: z.infer<typeof operationWorkCalendarSchema>;
  observedAt?: string;
  sourceVersion?: string;
  coverEvidence?: OperationWorkItem["owner"]["coverEvidence"];
  businessDueOn?: string | null;
  actionOn?: string | null;
  noDateReason?: string | null;
  interaction?: OperationWorkInteraction;
  /** A date-specific rule's occurrence (see `operationWorkStableId`). */
  occurrenceKey?: string | null;
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
  const module = operationWorkModuleSchema.parse(item.module);
  const businessDueOn = presentation.businessDueOn === undefined ? item.dueIso : presentation.businessDueOn;
  const actionOn = presentation.actionOn === undefined ? item.dueIso : presentation.actionOn;
  const calendar = presentation.calendar ?? {
    module: { key: item.ruleKey, source: "work_engine", state: "ready" as const },
    actor: {
      key: item.actingPerson?.userId ? `person:${item.actingPerson.userId}` : `duty:${item.ownerDutyKey ?? item.ownerRule}`,
      source: "people",
      state: "not_configured" as const,
    },
    holidayName: null,
  };
  const calendarReady = calendar.module.state === "ready" && calendar.actor.state === "ready";
  const placement = actionOn === null
    ? "no_working_date"
    : actionOn < presentation.today ? "missed" : "on_day";
  return operationWorkItemSchema.parse({
    contractVersion: 2,
    id: operationWorkStableId(module, presentation.object.id, item.ruleKey, presentation.occurrenceKey),
    module,
    ruleKey: item.ruleKey,
    ruleVersion: rule.version,
    object: presentation.object,
    problem: presentation.problem,
    action: item.action,
    recipient: presentation.recipient,
    requiredResult: presentation.requiredResult,
    completionPredicate: rule.completionFact,
    completionStatement: presentation.completionStatement ?? rule.completionStatement,
    owner: {
      rule: item.ownerRule,
      dutyKey: item.ownerDutyKey,
      normal: item.normalOwner,
      activeCover: item.activeCover,
      coverEvidence: presentation.coverEvidence ?? null,
      acting: item.actingPerson,
      state: item.ownerState,
    },
    timing: {
      businessDueOn,
      actionOn,
      placement,
      missedAge: calendarReady ? {
        state: "counted",
        workingDays: item.workingDaysLate,
        basis: {
          calendarKey: `${calendar.module.key}+${calendar.actor.key}`,
          from: actionOn ?? presentation.today,
          to: presentation.today,
        },
      } : { state: "not_calculable", workingDays: null, basis: null },
      eligibility: item.ownerState === "not_assigned" ? "unknown" : "eligible",
      noDateReason: actionOn === null ? (presentation.noDateReason ?? "The owning rule has no working date") : null,
      calendar,
    },
    communication: null,
    blocker: null,
    nextConsequence: null,
    interaction: presentation.interaction ?? {
      mode: "open_module",
      fallbackDestination: presentation.destination,
    },
    destination: presentation.destination,
    observedAt: presentation.observedAt ?? new Date().toISOString(),
    sourceVersion: presentation.sourceVersion ?? presentation.observedAt ?? new Date().toISOString(),
    tone: item.tone,
    locked: item.locked,
    broken: item.broken,
  });
}
