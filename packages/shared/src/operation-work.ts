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

export const operationWorkItemSchema = z.object({
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
  completionFact: z.string().min(1),
  owner: operationWorkOwnerSchema,
  timing: z.object({
    dueOn: z.string().date().nullable(),
    workingDaysLate: z.number().int().nonnegative(),
    bucket: z.enum(["overdue", "today", "later", "no_date"]),
  }).strict(),
  destination: z.string().startsWith("/"),
  tone: z.enum(["danger", "warning", "info", "success", "neutral"]),
  locked: z.boolean(),
  broken: z.boolean(),
}).strict();

export const operationWorkResponseSchema = z.object({
  items: z.array(operationWorkItemSchema),
  staff: z.array(z.object({
    userId: z.string().min(1),
    name: z.string().nullable(),
    email: z.string().email(),
  }).strict()),
  generatedOn: z.string().date(),
}).strict();

export type OperationWorkModule = z.infer<typeof operationWorkModuleSchema>;
export type OperationWorkPerson = z.infer<typeof operationWorkPersonSchema>;
export type OperationWorkOwner = z.infer<typeof operationWorkOwnerSchema>;
export type OperationWorkItem = z.infer<typeof operationWorkItemSchema>;
export type OperationWorkResponse = z.infer<typeof operationWorkResponseSchema>;

function identityPart(value: string): string {
  return value.trim().replaceAll(":", "%3A");
}

export function operationWorkStableId(
  module: OperationWorkModule,
  objectLabel: string,
  ruleKey: string,
): string {
  return [module, objectLabel, ruleKey].map(identityPart).join(":");
}

export interface OperationWorkPresentation {
  object: OperationWorkItem["object"];
  problem: string;
  recipient: string | null;
  requiredResult: string;
  destination: string;
  today: string;
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
  const bucket =
    item.workingDaysLate > 0
      ? "overdue"
      : dueOn === null
        ? "no_date"
        : dueOn === presentation.today
          ? "today"
          : "later";
  return operationWorkItemSchema.parse({
    id: operationWorkStableId(item.module, presentation.object.label, item.ruleKey),
    module: item.module,
    ruleKey: item.ruleKey,
    object: presentation.object,
    problem: presentation.problem,
    action: item.action,
    recipient: presentation.recipient,
    requiredResult: presentation.requiredResult,
    completionFact: rule.completionFact,
    owner: {
      rule: item.ownerRule,
      dutyKey: item.ownerDutyKey,
      normal: item.normalOwner,
      activeCover: item.activeCover,
      acting: item.actingPerson,
      state: item.ownerState,
    },
    timing: { dueOn, workingDaysLate: item.workingDaysLate, bucket },
    destination: presentation.destination,
    tone: item.tone,
    locked: item.locked,
    broken: item.broken,
  });
}
