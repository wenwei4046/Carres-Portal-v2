/**
 * THE ONE TASK VIEW — what an opened task says, in every module (owner's
 * round 3 brief of 13 Oct 2026, point 2; 03 §8 "An open task").
 *
 * Pure. The opened task is the SAME occurrence its list card stands for, so
 * the title and the fact rows are the card's own (`taskCard`): nothing is
 * worded twice. The record leaves the fact rows because the head already
 * names it (`Purchasing / PO-2609-0042`).
 *
 * The owning module supplies what only it knows: its steps, the Sales Orders
 * the task serves, what was recorded (History) and its documents (Files).
 * This file only places them.
 */
import { INTERNAL_TASK_KIND, workLifecycleOrToDo, type WorkChannel } from "@carres/shared";
import type { TaskViewFact } from "@/components/kit/TaskView";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";
import { TASK_CARD_WORDS, recordWord, type TaskCard } from "./task-cards";
import { TASK_MODULE_SYMBOL, TASK_MODULE_WORD } from "./tasks-model";

export type TaskViewTabKey = "steps" | "route" | "history" | "files";

/** The words. COPY-STANDARD "The Tasks panel words". */
export const TASK_VIEW_WORDS = {
  sections: "Task sections",
  tab: { steps: "Steps", route: "Route", history: "History", files: "Files" } as Record<TaskViewTabKey, string>,
  filesTab: (files: number) => (files > 0 ? `Files ${files}` : "Files"),
  open: (record: string) => `Open ${record}`,
  contact: "Contact",
  salesOrder: "Sales Order",
  salesOrders: (orders: number) => `${orders} Sales Orders`,
  purchaseOrders: (pos: number) => `${pos} Purchase Orders`,
  why: "Why",
  finishWhen: "Finish when",
  then: "Then",
  noHistory: "No history yet",
  noRoute: "No Sales Order is linked to this task",
  routeLoading: "Loading the Order Route",
  routeFailed: "The Order Route could not be read",
  routeOf: "Order Route of",
  noFile: "No file yet",
  noFiles: "No file is recorded for this task",
  view: (name: string) => `View ${name}`,
  download: (name: string) => `Download ${name}`,
  fileLoading: "Loading PDF",
  fileFailed: "This file could not be opened. Try again.",
  asked: (party: string | null) => (party ? `Asked ${party}` : "Asked"),
  noAnswer: "No answer",
  answered: "Answer recorded",
  stage: { salesOrder: "Sales Order", purchaseOrder: "Purchase Order", supplier: "Supplier" },
  purchaseOrderFile: "Purchase Order",
  salesOrderFile: "Sales Order",
  supplierDo: "Supplier DO",
} as const;

const W = TASK_VIEW_WORDS;

const CHANNEL_WORD: Record<WorkChannel, string> = { whatsapp: "WhatsApp", email: "Email", phone: "Phone", in_person: "In person" };

export interface TaskHead {
  title: string;
  /** A Material Symbols name. */
  moduleIcon: string;
  page: string;
  /** `null` for a purchase batch: it is named by its time, never by a key. */
  record: string | null;
  /** Who does the task now. */
  owner: string | null;
  /** Where the record lives. */
  destination: string;
}

export function taskHead(row: WorkRow, card: TaskCard): TaskHead {
  const isBatch = row.source.object.kind === "po_window";
  return {
    title: card.title,
    moduleIcon: TASK_MODULE_SYMBOL[row.module],
    page: isBatch ? "SO Batch Purchase" : TASK_MODULE_WORD[row.module],
    /* An internal task's name is its title: there is no record to repeat. */
    record: isBatch || row.source.object.kind === INTERNAL_TASK_KIND ? null : row.source.object.label,
    owner: row.source.owner.acting?.name ?? null,
    destination: row.destination,
  };
}

/**
 * The fact rows of the opened task: the card's rows without the record, then
 * who is asked and how, then what the owning module adds.
 */
export function taskFacts(row: WorkRow, card: TaskCard, extra: readonly TaskViewFact[] = []): TaskViewFact[] {
  const recordLabel = recordWord(row.source.object.kind, row.module);
  const isBatch = row.source.object.kind === "po_window";
  const facts: TaskViewFact[] = card.rows
    .filter((fact) => isBatch || fact.label !== recordLabel)
    .map((fact) => ({ key: fact.label, icon: fact.icon, label: fact.label, value: fact.value, warn: fact.warn }));
  const channel = workLifecycleOrToDo(row.source).channel;
  /* A purchase batch names its suppliers in its title; `2 suppliers` adds nothing. */
  if (row.recipient && !isBatch && !extra.some((fact) => fact.key === "contact")) {
    const contact: TaskViewFact = {
      key: "contact", icon: "forum", label: W.contact,
      value: channel ? `${row.recipient} · ${CHANNEL_WORD[channel]}` : row.recipient,
    };
    /* After the deadline, before the waiting facts. */
    facts.splice(1, 0, contact);
  }
  return [...facts, ...extra];
}

/** One thing that was recorded, as History prints it. */
export interface TaskHistoryEvent {
  key: string;
  /** The recorded instant (ISO 8601), or a date (`YYYY-MM-DD`). */
  at: string;
  text: string;
  /** Who recorded it, when the source says. */
  by?: string | null;
  /** What was recorded with it (a document number, a new date). */
  detail?: string | null;
}

/** What the Work record itself knows about the task: the request and its answer day. */
export function lifecycleHistory(row: WorkRow): TaskHistoryEvent[] {
  const lifecycle = workLifecycleOrToDo(row.source);
  const events: TaskHistoryEvent[] = [];
  if (lifecycle.waitingSince) {
    events.push({
      key: "asked", at: lifecycle.waitingSince, text: W.asked(row.recipient),
      detail: [lifecycle.channel ? CHANNEL_WORD[lifecycle.channel] : null,
        lifecycle.replyDueOn && !lifecycle.replyMissed ? `${TASK_CARD_WORDS.nextContact} ${fmtDate(lifecycle.replyDueOn)}` : null].filter(Boolean).join(" · ") || null,
    });
  }
  if (lifecycle.replyMissed && lifecycle.replyDueOn) {
    events.push({ key: "no-answer", at: lifecycle.replyDueOn, text: W.noAnswer, detail: `${TASK_CARD_WORDS.noAnswerBy} ${fmtDate(lifecycle.replyDueOn)}` });
  }
  if (lifecycle.lastReplyAt) events.push({ key: "answered", at: lifecycle.lastReplyAt, text: W.answered });
  return events;
}

/** Newest first; a date-only fact sorts at the start of its day. */
export function sortHistory(events: readonly TaskHistoryEvent[]): TaskHistoryEvent[] {
  return [...events].sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
}

/** `Fri, 9 Oct 16:08` for an instant, `Fri, 9 Oct` for a date: the one date
 *  home's own two spellings (`fmtDate`). */
export function historyWhen(at: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(at) ? fmtDate(at) : fmtDate(at, { time: true });
}

/** One document of a task. `load` renders it on demand; nothing is read
 *  until the person asks to see or keep it. */
export interface TaskFile {
  key: string;
  /** `SO-1256.pdf` */
  name: string;
  /** What it is, in the document's own word. */
  detail: string;
  load: () => Promise<Blob>;
}

/** The files of one step of the order's route, in the route's order. */
export interface TaskFileStage {
  key: string;
  title: string;
  /** One grey line under the title (`3 Sales Orders`, the PO number). */
  sub?: string | null;
  files: readonly TaskFile[];
}

export const fileCount = (stages: readonly TaskFileStage[]) => stages.reduce((sum, stage) => sum + stage.files.length, 0);
