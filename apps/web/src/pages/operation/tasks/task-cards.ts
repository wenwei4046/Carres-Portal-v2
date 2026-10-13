/**
 * THE TASKS PANEL LIST — the day strip, `To do` · `Waiting` · `Done`, and one
 * card per task under the party it is about (owner 12 Oct 2026, 03 §8;
 * owner's round 3 brief of 13 Oct 2026, point 2).
 *
 * Pure. Every row is an occurrence of the ONE Work read (`useOpenWorkSet`):
 * an open item with the lifecycle the read attached, or a completed
 * occurrence from the same read. This file only places, counts and words what
 * the Work engine already decided; it never closes or creates anything.
 *
 *   To do     my open work whose day is the chosen day. Today also holds what
 *             is late and what has no working date: `To do` is due today or
 *             earlier, and nothing is hidden for want of a date.
 *   Waiting   my open work a request was recorded for and whose answer is not
 *             due yet, nearest answer first. It returns to `To do` by itself
 *             when its answer day passes (`workLifecycleOf`).
 *   Done      what I finished on the chosen day, newest first.
 *
 * The day strip counts `To do` only.
 */
import {
  malaysiaClockOf,
  parsePoWindowKey,
  poWindowTimeWord,
  workCompletionStatement,
  workLifecycleOrToDo,
  type OperationWorkCompleted,
  type OperationWorkModule,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { workRailDates } from "../work/work-model";
import { TASK_MODULE_WORD, taskRowWords, type PoWindowFacts } from "./tasks-model";

export type TaskTab = "todo" | "waiting" | "done";
export const TASK_TABS: readonly TaskTab[] = ["todo", "waiting", "done"];

/** The words. COPY-STANDARD "The Tasks panel". */
export const TASK_CARD_WORDS = {
  tab: { todo: "To do", waiting: "Waiting", done: "Done" } as Record<TaskTab, string>,
  days: "Days",
  show: "Show",
  previousWeek: "Previous week",
  nextWeek: "Next week",
  deadline: "Deadline",
  cutOff: "Cut-off",
  passed: "passed",
  daysLate: (n: number) => `${n} ${n === 1 ? "day" : "days"} late`,
  noDate: "No date",
  setBy: (module: string) => `set by ${module}`,
  forOwner: "For",
  asked: "Asked",
  nextContact: "Next contact",
  noAnswerBy: "No answer by",
  doneAt: "Done",
  record: "Record",
  nothingToDoToday: "Nothing to do today",
  nothingThisDay: "Nothing planned for this day",
  nothingWaiting: "Nothing is waiting for an answer",
  nothingDone: "Nothing done on this day",
  allTasks: "All tasks",
  position: (at: number, of: number) => `${at} of ${of}`,
  previousTask: "Previous task",
  nextTask: "Next task",
} as const;

const W = TASK_CARD_WORDS;

/** What the record of a task is called, by its kind. The Purchasing
 *  dictionary's own words; a kind with no word of its own takes its page's. */
const RECORD_WORD: Record<string, string> = {
  purchase_order: "PO No",
  sales_order: "SO No",
  manual_purchase: "MPR No",
  supplier_do: "Supplier DO",
};
export const recordWord = (kind: string, module: OperationWorkModule) => RECORD_WORD[kind] ?? TASK_MODULE_WORD[module];

export interface TaskCardRow {
  /** A Material Symbols name. */
  icon: string;
  label: string;
  value: string;
  /** Amber: the one row whose date or window has gone by. */
  warn: boolean;
}

export interface TaskCard {
  id: string;
  module: OperationWorkModule;
  title: string;
  /** The party the card sits under. */
  party: string;
  rows: TaskCardRow[];
  late: boolean;
  /** Earliest first inside a party. */
  sortKey: string;
  /** The open work the card opens; `null` on a `Done` card. */
  work: WorkRow | null;
}

export interface TaskGroup {
  key: string;
  name: string;
  cards: TaskCard[];
}

const isWaiting = (row: WorkRow) => workLifecycleOrToDo(row.source).state === "waiting";

/** `Fri, 9 Oct`, the one `fmtDate` spelling. */
const day = (iso: string) => fmtDate(iso);

/** The deadline row of an open task. */
function deadlineRow(row: WorkRow, facts: PoWindowFacts | null): TaskCardRow {
  const late = row.timingBucket === "overdue";
  if (row.source.object.kind === "po_window") {
    const parts = parsePoWindowKey(row.source.object.id);
    const time = parts ? poWindowTimeWord(parts.time) : facts?.window ? row.source.object.label : row.source.object.label;
    return { icon: "schedule", label: W.cutOff, value: late ? `${time} · ${W.passed}` : time, warn: late };
  }
  if (row.dueIso === null) {
    return { icon: "event", label: W.deadline, value: `${W.noDate} · ${W.setBy(TASK_MODULE_WORD[row.module])}`, warn: false };
  }
  if (!late) return { icon: "event", label: W.deadline, value: day(row.dueIso), warn: false };
  const age = row.source.timing.missedAge;
  const lateWord = age.state === "counted" && age.workingDays > 0 ? W.daysLate(age.workingDays) : W.passed;
  return { icon: "event", label: W.deadline, value: `${day(row.dueIso)} · ${lateWord}`, warn: true };
}

/** One open task as a card: its title, then one row per fact. */
export function taskCard(row: WorkRow, facts: PoWindowFacts | null = null): TaskCard {
  const words = taskRowWords(row, facts);
  const lifecycle = workLifecycleOrToDo(row.source);
  const isBatch = row.source.object.kind === "po_window";
  const rows: TaskCardRow[] = [];
  /* A purchase batch is named by its time, never by a key. */
  if (!isBatch) rows.push({ icon: "description", label: recordWord(row.source.object.kind, row.module), value: row.source.object.label, warn: false });
  rows.push(deadlineRow(row, facts));
  if (lifecycle.state === "waiting") {
    if (lifecycle.waitingSince) rows.push({ icon: "send", label: W.asked, value: day(lifecycle.waitingSince.slice(0, 10)), warn: false });
    if (lifecycle.replyDueOn) rows.push({ icon: "alarm", label: W.nextContact, value: day(lifecycle.replyDueOn), warn: false });
  } else if (lifecycle.replyMissed && lifecycle.replyDueOn) {
    rows.push({ icon: "alarm", label: W.noAnswerBy, value: day(lifecycle.replyDueOn), warn: true });
  }
  if (row.ownerState === "covered" && row.normalOwner?.name) rows.push({ icon: "person", label: W.forOwner, value: row.normalOwner.name, warn: false });
  return {
    id: row.id,
    module: row.module,
    title: words.act,
    party: isBatch ? "SO Batch Purchase" : row.recipient ?? TASK_MODULE_WORD[row.module],
    rows,
    late: row.timingBucket === "overdue",
    sortKey: `${lifecycle.state === "waiting" ? lifecycle.replyDueOn ?? "9999" : row.dueIso ?? "9999"}|${row.id}`,
    work: row,
  };
}

/** What was recorded, in the rule's own completion words; a rule this build
 *  does not know keeps the module's result reference. */
function doneTitle(done: OperationWorkCompleted): string {
  try { return workCompletionStatement(done.ruleKey); } catch { return done.resultReference; }
}

/** One finished occurrence as a card, in the same shape. */
export function doneCard(done: OperationWorkCompleted): TaskCard {
  const at = malaysiaClockOf(done.completedAt);
  const rows: TaskCardRow[] = [
    { icon: "description", label: W.record, value: done.objectLabel, warn: false },
    { icon: "check_circle", label: W.doneAt, value: fmtDate(done.completedAt, { timeOnly: true }), warn: false },
  ];
  return {
    id: done.occurrenceId,
    module: done.module,
    title: doneTitle(done),
    party: TASK_MODULE_WORD[done.module],
    rows,
    late: false,
    sortKey: `${at.date}T${at.time}|${done.occurrenceId}`,
    work: null,
  };
}

/** Which open rows a day's `To do` holds. */
export function todoOn(mine: readonly WorkRow[], today: string, chosen: string): WorkRow[] {
  const open = mine.filter((row) => !isWaiting(row));
  if (chosen === today) return open.filter((row) => row.timingBucket === "overdue" || row.dueIso === today || row.dueIso === null);
  return open.filter((row) => row.timingBucket !== "overdue" && row.dueIso === chosen);
}

export function waitingRows(mine: readonly WorkRow[]): WorkRow[] {
  return mine.filter(isWaiting);
}

/** What I finished on the chosen day (Malaysia's date). */
export function doneOn(completed: readonly OperationWorkCompleted[], myUserId: string | null, chosen: string): OperationWorkCompleted[] {
  if (!myUserId) return [];
  return completed
    .filter((done) => done.completedBy?.userId === myUserId && malaysiaClockOf(done.completedAt).date === chosen)
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}

export interface TaskStripDay {
  iso: string;
  /** `Tue` */
  weekday: string;
  /** `13` */
  dayNumber: string;
  holiday: string | null;
  today: boolean;
  /** `To do` on that day. */
  count: number;
  /** Something on that day is late (today only: late work is counted on today). */
  late: boolean;
}

export interface TaskStrip {
  days: TaskStripDay[];
  previousWeek: string;
  nextWeek: string;
}

/**
 * The working week of `week`, Monday to Friday; Saturday only while work is
 * dated on it (Workspace §5.4). A day's number is its `To do`.
 */
export function taskStrip(mine: readonly WorkRow[], today: string, week: string): TaskStrip {
  const open = mine.filter((row) => !isWaiting(row));
  const rail = workRailDates(open, today, week);
  return {
    previousWeek: rail.previousWeek,
    nextWeek: rail.nextWeek,
    days: rail.days.map((d) => {
      const rows = todoOn(mine, today, d.iso);
      return {
        iso: d.iso,
        weekday: d.weekday.charAt(0) + d.weekday.slice(1).toLowerCase(),
        dayNumber: d.dayNumber,
        holiday: d.holiday,
        today: d.today,
        count: rows.length,
        late: rows.some((row) => row.timingBucket === "overdue"),
      };
    }),
  };
}

/** Cards under their party: a party with late work first, then by name; inside
 *  a party, late first, then the earliest. `Done` keeps newest first. */
export function taskGroups(cards: readonly TaskCard[], keepOrder = false): TaskGroup[] {
  const byParty = new Map<string, TaskCard[]>();
  for (const card of cards) {
    const list = byParty.get(card.party);
    if (list) list.push(card); else byParty.set(card.party, [card]);
  }
  const groups = [...byParty].map(([name, list]) => ({
    key: name,
    name,
    cards: keepOrder ? list : [...list].sort((a, b) => Number(b.late) - Number(a.late) || a.sortKey.localeCompare(b.sortKey)),
  }));
  return keepOrder ? groups : groups.sort((a, b) =>
    Number(b.cards.some((c) => c.late)) - Number(a.cards.some((c) => c.late)) || a.name.localeCompare(b.name));
}

/** The list a tab shows on the chosen day, with the three counts. */
export function taskTabs(
  mine: readonly WorkRow[],
  completed: readonly OperationWorkCompleted[],
  myUserId: string | null,
  today: string,
  chosen: string,
  factsOf: (row: WorkRow) => PoWindowFacts | null = () => null,
): Record<TaskTab, { count: number; groups: TaskGroup[] }> {
  const todo = todoOn(mine, today, chosen).map((row) => taskCard(row, factsOf(row)));
  const waiting = waitingRows(mine).map((row) => taskCard(row, factsOf(row)));
  const done = doneOn(completed, myUserId, chosen).map(doneCard);
  return {
    todo: { count: todo.length, groups: taskGroups(todo) },
    waiting: { count: waiting.length, groups: taskGroups(waiting) },
    done: { count: done.length, groups: taskGroups(done, true) },
  };
}

/** What an empty tab says. */
export function emptyWord(tab: TaskTab, chosenIsToday: boolean): string {
  if (tab === "waiting") return W.nothingWaiting;
  if (tab === "done") return W.nothingDone;
  return chosenIsToday ? W.nothingToDoToday : W.nothingThisDay;
}
