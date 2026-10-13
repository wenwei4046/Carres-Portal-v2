/**
 * THE WORKSPACE TABLE — the same tasks the Tasks panel lists, as one table
 * (owner's round 3 brief of 13 Oct 2026, points 3 and 4: one task record).
 *
 * Pure. It asks `task-cards.ts` WHICH occurrences a tab holds on the chosen
 * day (`todoOn` · `waitingRows` · `doneOn`) and only says each one as a table
 * row, so the Workspace's three numbers and the Tasks panel's three numbers
 * are the same arithmetic, never two that happen to agree (Law D).
 *
 *   Due            the date · `No date`; a purchase batch adds its cut-off
 *                  time. On `Done` the column is `Done`: when it was finished
 *   Task           the task, in its list card's own words, over page · record
 *   Contact        who is asked (a purchase batch: its suppliers), and how
 *                  once a request is recorded
 *   Last contact   the request or its answer day, from the Work record
 *   Status         `Broken commitment` · `{n} days late` · `Cut-off passed`
 *                  (amber) · `To do` · `Waiting` · `Done`
 *
 * The Module rail counts the rows of the chosen tab: its rows sum to the tab.
 */
import {
  parsePoWindowKey,
  poWindowTimeWord,
  workLifecycleOrToDo,
  type OperationWorkCompleted,
  type OperationWorkModule,
  type WorkChannel,
} from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { TASK_CARD_WORDS, doneCard, doneOn, doneOnDay, taskCard, todoOn, waitingRows, type TaskTab } from "./task-cards";
import { TASK_MODULE_WORD, type PoWindowFacts } from "./tasks-model";

/** The words. COPY-STANDARD "The Workspace page words". */
export const WORKSPACE_WORDS = {
  /* `Assigned to` is the Portal's word for who is responsible now (Workspace
     MASTER §3); on `Done` the first column is when the work was finished and
     the person column is who recorded it. */
  col: { due: "Due", done: "Done", task: "Task", contact: "Contact", lastContact: "Last contact", owner: "Assigned to", doneBy: "Completed by", status: "Status" },
  noDate: "No date",
  noMatch: "No work matches these filters",
  notRecorded: "Not recorded",
  notAssigned: "Not assigned",
  broken: "Broken commitment",
  asked: (date: string) => `Asked ${date}`,
  noAnswerBy: (date: string) => `No answer by ${date}`,
  answered: (date: string) => `Answer recorded ${date}`,
  allModules: "All modules",
  moduleRail: "Module",
  scope: { mine: "My Task", team: "Team Work" },
  footer: (n: number) => `${n} ${n === 1 ? "task" : "tasks"}`,
  closeTask: "Back to all tasks",
} as const;

const W = WORKSPACE_WORDS;
const CHANNEL_WORD: Record<WorkChannel, string> = { whatsapp: "WhatsApp", email: "Email", phone: "Phone", in_person: "In person" };

export type WorkspaceTone = "warn" | "neutral" | "ok";

export interface WorkspaceRow {
  id: string;
  module: OperationWorkModule;
  /** The open work the row opens; `null` on a `Done` row. */
  work: WorkRow | null;
  due: string;
  /** A purchase batch's cut-off time, under the day. */
  dueSub: string | null;
  title: string;
  /** `Purchasing · PO-261001-9001` */
  record: string;
  contact: string | null;
  contactSub: string | null;
  lastContact: string | null;
  owner: string | null;
  status: string;
  tone: WorkspaceTone;
  late: boolean;
  /** Late first, then the earliest; `Done` newest first. */
  sortKey: string;
}

function openRow(row: WorkRow, facts: PoWindowFacts | null): WorkspaceRow {
  const card = taskCard(row, facts);
  const lifecycle = workLifecycleOrToDo(row.source);
  const isBatch = row.source.object.kind === "po_window";
  const late = row.timingBucket === "overdue";
  const window = isBatch ? parsePoWindowKey(row.source.object.id) : null;
  const age = row.source.timing.missedAge;
  const lateWord = isBatch ? `${TASK_CARD_WORDS.cutOff} ${TASK_CARD_WORDS.passed}`
    : age.state === "counted" && age.workingDays > 0 ? TASK_CARD_WORDS.daysLate(age.workingDays) : TASK_CARD_WORDS.passed;
  const lastContact = lifecycle.replyMissed && lifecycle.replyDueOn ? W.noAnswerBy(fmtDate(lifecycle.replyDueOn))
    : lifecycle.waitingSince ? W.asked(fmtDate(lifecycle.waitingSince.slice(0, 10)))
      : lifecycle.lastReplyAt ? W.answered(fmtDate(lifecycle.lastReplyAt.slice(0, 10)))
        : null;
  return {
    id: row.id,
    module: row.module,
    work: row,
    /* A date, never a relative word (COPY "NO RELATIVE DATE WORDS"). */
    due: row.dueIso === null ? W.noDate : fmtDate(row.dueIso),
    dueSub: window ? poWindowTimeWord(window.time) : null,
    title: card.title,
    record: isBatch ? "SO Batch Purchase" : `${TASK_MODULE_WORD[row.module]} · ${row.source.object.label}`,
    /* The Work item's own party; for a purchase batch that is its suppliers. */
    contact: row.recipient,
    contactSub: row.recipient && lifecycle.channel ? CHANNEL_WORD[lifecycle.channel] : null,
    lastContact,
    owner: row.source.owner.acting?.name ?? null,
    /* A broken commitment is said before lateness: it is the reason to act. */
    status: row.source.broken ? W.broken : late ? lateWord : lifecycle.state === "waiting" ? TASK_CARD_WORDS.tab.waiting : TASK_CARD_WORDS.tab.todo,
    tone: row.source.broken || late ? "warn" : "neutral",
    late,
    sortKey: card.sortKey,
  };
}

function doneRow(done: OperationWorkCompleted): WorkspaceRow {
  const card = doneCard(done);
  return {
    id: done.occurrenceId,
    module: done.module,
    work: null,
    due: fmtDate(done.completedAt, { timeOnly: true }),
    dueSub: null,
    title: card.title,
    record: `${TASK_MODULE_WORD[done.module]} · ${done.objectLabel}`,
    contact: null, contactSub: null, lastContact: null,
    owner: done.completedBy?.name ?? null,
    status: TASK_CARD_WORDS.tab.done,
    tone: "ok",
    late: false,
    sortKey: card.sortKey,
  };
}

export interface WorkspaceTable {
  /** The three tab numbers, before the module choice. */
  counts: Record<TaskTab, number>;
  /** The chosen tab's rows, before the module choice: what the rail counts. */
  tabRows: WorkspaceRow[];
  /** The rows on screen: the chosen tab, then the chosen module. */
  rows: WorkspaceRow[];
  /** One number per module for the chosen tab; they sum to that tab's number. */
  modules: Array<{ module: OperationWorkModule; count: number }>;
}

/**
 * The table for one scope, day, tab and module. `scoped` is the work already
 * narrowed to the scope (mine, or everyone's for Team Work); `doneBy` is whose
 * finished work `Done` lists (`null` = everyone's).
 */
export function workspaceTable(input: {
  scoped: readonly WorkRow[];
  completed: readonly OperationWorkCompleted[];
  doneBy: string | null;
  team: boolean;
  today: string;
  chosen: string;
  tab: TaskTab;
  module: OperationWorkModule | null;
  factsOf?: (row: WorkRow) => PoWindowFacts | null;
}): WorkspaceTable {
  const { scoped, completed, today, chosen, tab, module } = input;
  const factsOf = input.factsOf ?? (() => null);
  const todo = todoOn(scoped, today, chosen);
  const waiting = waitingRows(scoped);
  const done = input.team ? doneOnDay(completed, chosen) : doneOn(completed, input.doneBy, chosen);
  const open = (rows: readonly WorkRow[]) => rows.map((row) => openRow(row, factsOf(row)))
    .sort((a, b) => Number(b.late) - Number(a.late) || a.sortKey.localeCompare(b.sortKey));
  const tabRows = tab === "todo" ? open(todo) : tab === "waiting" ? open(waiting) : done.map(doneRow);
  const byModule = new Map<OperationWorkModule, number>();
  for (const row of tabRows) byModule.set(row.module, (byModule.get(row.module) ?? 0) + 1);
  return {
    counts: { todo: todo.length, waiting: waiting.length, done: done.length },
    tabRows,
    rows: module ? tabRows.filter((row) => row.module === module) : tabRows,
    modules: (Object.keys(TASK_MODULE_WORD) as OperationWorkModule[]).map((m) => ({ module: m, count: byModule.get(m) ?? 0 })),
  };
}

/**
 * THE TABLE FITS ITS ROOM. `Task` is the instruction, so it takes everything
 * the fixed columns leave; short of `taskMin`, the fixed columns give way
 * together, each in proportion to what it can spare and never under its
 * floor. Only when every column is at its floor does `Task` go under
 * `taskMin`. The caller leaves a column out before this point is reached.
 */
export function workspaceWidths(room: number, base: readonly number[], floors: readonly number[], taskMin: number, gutter = 18): { task: number; fixed: number[]; tight: boolean } {
  const sum = (widths: readonly number[]) => widths.reduce((total, width) => total + width, 0);
  if (room <= 0) return { task: Math.max(taskMin, 320), fixed: [...base], tight: false };
  const spare = room - gutter;
  const short = taskMin - (spare - sum(base));
  if (short <= 0) return { task: Math.floor(spare - sum(base)), fixed: [...base], tight: false };
  const canGive = sum(base) - sum(floors);
  const give = Math.min(short, canGive);
  const fixed = base.map((width, index) => (canGive > 0 ? Math.round(width - give * ((width - floors[index]!) / canGive)) : width));
  return { task: Math.max(100, Math.floor(spare - sum(fixed))), fixed, tight: true };
}
