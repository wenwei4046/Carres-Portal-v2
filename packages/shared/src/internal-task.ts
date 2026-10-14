import { z } from "zod";
import {
  operationWorkItemSchema,
  operationWorkStableId,
  type OperationWorkItem,
} from "./operation-work";

/**
 * INTERNAL TASKS (Workspace MASTER "Employee-created internal tasks", Jess
 * 2026-10-14): a task one employee adds for another with `+ Task`.
 *
 * It is internal work. It replaces no system-generated action, its `Mark done`
 * closes this task only, and being given one grants no permission. So the Work
 * item it becomes names no party to ask, links to no other module and carries
 * its own completion fact: the task was marked done.
 */
export const INTERNAL_TASK_RULE = "internal_task";
export const INTERNAL_TASK_KIND = "internal_task";
export const INTERNAL_TASK_TITLE_MAX = 160;
export const INTERNAL_TASK_DETAIL_MAX = 2000;

const person = z.object({ userId: z.string().uuid(), name: z.string().min(1) }).strict();

/** One open task as the Work feed reads it (0694 `internal_tasks_open`). */
export const internalTaskOpenSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  dueOn: z.string().date(),
  createdAt: z.string().min(10),
  createdBy: person,
  assignedTo: person,
}).strict();

export const internalTaskEventSchema = z.object({
  event: z.enum(["added", "done"]),
  at: z.string().min(10),
  actor: person,
}).strict();

/** One task with its history (0694 `internal_task_read`). */
export const internalTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  detail: z.string().min(1).nullable(),
  dueOn: z.string().date(),
  createdAt: z.string().min(10),
  createdBy: person,
  assignedTo: person,
  doneAt: z.string().min(10).nullable(),
  doneBy: person.nullable(),
  events: z.array(internalTaskEventSchema),
}).strict();

/** What `New task` sends. One key per attempt, so a retry is the same task. */
export const internalTaskAddSchema = z.object({
  title: z.string().trim().min(1, "Task name is required").max(INTERNAL_TASK_TITLE_MAX),
  detail: z.string().trim().max(INTERNAL_TASK_DETAIL_MAX).nullable(),
  assignedTo: z.string().uuid(),
  dueOn: z.string().date(),
  idempotencyKey: z.string().min(8).max(120),
}).strict();

export type InternalTaskOpen = z.infer<typeof internalTaskOpenSchema>;
export type InternalTask = z.infer<typeof internalTaskSchema>;
export type InternalTaskAdd = z.infer<typeof internalTaskAddSchema>;

/** `workspace:{task}:internal_task`, the one identity of this task in Work. */
export function internalTaskOccurrenceId(taskId: string): string {
  return operationWorkStableId("workspace", taskId, INTERNAL_TASK_RULE);
}

/** The task a Work occurrence stands for, or null when it is not one. */
export function internalTaskIdOf(item: Pick<OperationWorkItem, "module" | "ruleKey" | "object">): string | null {
  return item.module === "workspace" && item.ruleKey === INTERNAL_TASK_RULE && item.object.kind === INTERNAL_TASK_KIND
    ? item.object.id
    : null;
}

/** What the Work ledger keeps as the result of a finished task. */
export function internalTaskResultReference(taskId: string): string {
  return `internal_task_done=${taskId}`;
}

/** Where a task opens: the Workspace page, with it chosen. */
export function internalTaskDestination(taskId: string): string {
  return `/operation?tab=work&task=${encodeURIComponent(internalTaskOccurrenceId(taskId))}`;
}

/**
 * Open tasks as Work items. The owner is the assignee, a stored person and not
 * a Duty: the creator chose them. `problem` says who added it; the title is
 * the object's label, so a title is never squeezed into the action sentence.
 */
export function projectInternalTaskWork(input: {
  tasks: readonly InternalTaskOpen[];
  today: string;
  observedAt: string;
}): OperationWorkItem[] {
  return input.tasks.map((task) => {
    const late = task.dueOn < input.today;
    const destination = internalTaskDestination(task.id);
    return operationWorkItemSchema.parse({
      contractVersion: 2,
      id: internalTaskOccurrenceId(task.id),
      module: "workspace",
      ruleKey: INTERNAL_TASK_RULE,
      ruleVersion: 1,
      object: { kind: INTERNAL_TASK_KIND, id: task.id, label: task.title },
      problem: `Added by ${task.createdBy.name}`,
      action: "Do this task",
      recipient: null,
      requiredResult: "Task marked done",
      completionPredicate: "The internal task is marked done",
      completionStatement: "Task done",
      owner: {
        rule: "internal_task_assignee",
        dutyKey: null,
        normal: task.assignedTo,
        activeCover: null,
        coverEvidence: null,
        acting: task.assignedTo,
        state: "primary",
      },
      timing: {
        businessDueOn: task.dueOn,
        actionOn: task.dueOn,
        placement: late ? "missed" : "on_day",
        missedAge: { state: "not_calculable", workingDays: null, basis: null },
        eligibility: "eligible",
        noDateReason: null,
        calendar: {
          module: { key: INTERNAL_TASK_RULE, source: "internal_tasks.due_on", state: "ready" },
          actor: { key: `person:${task.assignedTo.userId}`, source: "people", state: "not_configured" },
          holidayName: null,
        },
      },
      communication: null,
      blocker: null,
      nextConsequence: null,
      interaction: { mode: "open_module", fallbackDestination: destination },
      destination,
      observedAt: input.observedAt,
      /* A task changes once, when it is done, and then it leaves the open set. */
      sourceVersion: `internal_task:${task.id}:open`,
      tone: late ? "warning" : "info",
      locked: false,
      broken: false,
    });
  });
}
