/**
 * INTERNAL TASKS: the words and the small rules of `+ Task` (Workspace MASTER
 * "Employee-created internal tasks", Jess 2026-10-14; COPY-STANDARD "The
 * internal task words").
 *
 * A task one employee adds for another. It is internal work: it replaces no
 * task the Portal raises by itself, `Mark done` closes this task only, and
 * being given one grants no permission.
 */
import { INTERNAL_TASK_KIND, internalTaskIdOf, type InternalTask } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import type { TaskHistoryEvent } from "./task-view";

export const INTERNAL_TASK_WORDS = {
  /* The two buttons: short in the 320 panel, full on the Workspace toolbar. */
  button: "Task",
  buttonWide: "New task",
  hint: "Add a task for you or a colleague",
  title: "New task",
  name: "Task name",
  namePlaceholder: "What must be done",
  detail: "Description (optional)",
  detailPlaceholder: "What they need to know: who to call, what to check, what to send back",
  assignee: "For",
  me: "Me",
  due: "Due date",
  cancel: "Cancel",
  add: "Add task",
  nameRequired: "Task name is required.",
  dueRequired: "Choose a due date.",
  notSaved: "Not added · Try again",
  added: (who: string) => `Task added · for ${who}`,
  you: "you",
  /* The task as a card and as the one task view. */
  addedBy: "Added by",
  step: "Do this task",
  finishWhen: "Finish when: the task is done",
  markDone: "Mark done",
  done: (title: string) => `Done · ${title}`,
  notDone: "Not saved · Try again",
  historyAdded: (by: string, assignee: string) => `Added by ${by} · for ${assignee}`,
  historyDone: (by: string) => `Done by ${by}`,
} as const;

const W = INTERNAL_TASK_WORDS;

/** What the door said, in the screen's words. The door's own sentence is the
 *  fall-back, so a refusal this build does not know is still said. */
const REFUSAL: Record<string, string> = {
  title_required: W.nameRequired,
  title_too_long: "Task name is too long. Use 160 characters or fewer.",
  detail_too_long: "Description is too long. Use 2,000 characters or fewer.",
  due_required: W.dueRequired,
  due_in_past: "This date has passed. Choose today or a later day.",
  due_not_working_day: "This is not an Office working day. Choose a working day.",
  assignee_not_staff: "This person cannot be given a task. Choose another person.",
};

export function internalTaskRefusal(code: unknown, fallback: string): string {
  return (typeof code === "string" && REFUSAL[code]) || fallback;
}

/** Which field a refusal belongs to, so the sentence sits under it. */
export function internalTaskRefusalField(code: unknown): "name" | "detail" | "due" | "assignee" | null {
  if (code === "title_required" || code === "title_too_long") return "name";
  if (code === "detail_too_long") return "detail";
  if (code === "due_required" || code === "due_in_past" || code === "due_not_working_day") return "due";
  if (code === "assignee_not_staff") return "assignee";
  return null;
}

export const isInternalTask = (row: WorkRow): boolean => row.source.object.kind === INTERNAL_TASK_KIND;

/** The task behind a Work row, or null when the row is another module's. */
export const internalTaskIdOfRow = (row: WorkRow): string | null => internalTaskIdOf(row.source);

/** The people `For` offers: the signed-in person first as `Me`, then the
 *  active Operation accounts by name. */
export function internalTaskPeople(
  staff: ReadonlyArray<{ user_id: string; name: string | null; email: string }>,
  myUserId: string | null,
): Array<{ value: string; label: string }> {
  const others = staff
    .filter((person) => person.user_id !== myUserId)
    .map((person) => ({ value: person.user_id, label: person.name?.trim() || person.email }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return myUserId ? [{ value: myUserId, label: W.me }, ...others] : others;
}

/** The task's own history: who added it for whom, and who finished it. */
export function internalTaskHistory(task: InternalTask): TaskHistoryEvent[] {
  return task.events.map((event) => ({
    key: `internal-task-${event.event}`,
    at: event.at,
    text: event.event === "added" ? W.historyAdded(event.actor.name, task.assignedTo.name) : W.historyDone(event.actor.name),
  }));
}

/** `Task added · for Sara`, or `for you` when it is your own. */
export function internalTaskAddedWords(assignee: { value: string; label: string } | undefined, myUserId: string | null): string {
  return W.added(!assignee || assignee.value === myUserId ? W.you : assignee.label);
}

export const internalTaskDueWord = (iso: string): string => fmtDate(iso);
