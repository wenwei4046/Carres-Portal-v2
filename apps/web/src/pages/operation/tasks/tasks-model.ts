/**
 * THE TASKS LIST — pure arithmetic over the ONE open work set.
 *
 * LOCAL PROPOSAL (owner direction 2026-10-05, storyboard
 * `tasks-complete-ux.html`, layout B). No second engine: every row is a Work
 * engine item (`useOpenWorkSet`), its timing is the engine's placement, and
 * the week is `workRailDates` with Saturday always drawn. This file only
 * groups, counts and words what the engine already decided.
 *
 *   Missed      every overdue act, earliest first, counted once
 *   Mon … Sat   the shown week; a day's number counts only that day
 *   No date     only while something has no working date
 *
 * The Module filter narrows rows and counts only — never a fact, a date or an
 * owner — and its counts (Missed + this week + No date) add up exactly to the
 * list.
 */
import { parsePoWindowKey, poWindowTimeWord, type OperationWorkModule, type PoWindowWork } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import type { IconName } from "@/components/kit/Icon";
import type { WorkRow } from "../use-open-work";
import { workRailDates, WORK_MODULES } from "../work/work-model";

/** The Tasks door's module words — the portal's own destination names
 *  (Receiving work is done in Warehouse). */
export const TASK_MODULE_WORD: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Warehouse",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

export const TASK_MODULE_ICON: Record<OperationWorkModule, IconName> = {
  orders: "order",
  purchasing: "supplier",
  receiving: "warehouse",
  delivery: "delivery",
  payment: "money",
  issue_tracker: "flag",
};

/** Words on the list. `Nothing due`, `set by {module}`, `{n} item(s) to buy`
 *  are FOR REVIEW until COPY admits them (storyboard §8); `No date` is COPY. */
export const TASKS_WORDS = {
  title: "Tasks",
  module: "Module",
  allModules: "All modules",
  missed: "Missed",
  nothingDue: "Nothing due",
  noDate: "No date",
  setBy: (module: string) => `set by ${module}`,
  nothingAssigned: "Nothing assigned to you",
  thisWeek: "this week",
  failed: "Tasks could not be refreshed",
  lastUpdated: (time: string) => `Last updated ${time}`,
  couldNotRefresh: (source: string) => `Could not refresh ${source}`,
  tryAgain: "Try again",
  back: "Tasks",
  previousWeek: "Previous week",
  nextWeek: "Next week",
  forOwner: (name: string) => `For ${name}`,
  itemsToBuy: (n: number) => `${n} ${n === 1 ? "item" : "items"} to buy`,
} as const;

export interface TaskRowWords {
  /** Line 1: the act, naming the party. */
  act: string;
  /** Line 2: the time or the document, then `For {owner}` when covering. */
  detail: string;
  /** The original due date, printed red on a missed row. */
  missedDate: string | null;
  /** `No date · set by {module}` on a row with no working date. */
  noDate: string | null;
}

/** One supplier by name, two by both names, three or more as
 *  `{first} and {k} more` (PROPOSAL). */
export function partiesWord(names: readonly string[]): string {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return "the supplier";
  if (unique.length === 1) return unique[0]!;
  if (unique.length === 2) return `${unique[0]} and ${unique[1]}`;
  return `${unique[0]} and ${unique.length - 1} more`;
}

/** What a purchase batch's row needs beyond the window: the Sales Orders
 *  of its demand still to buy (from the same SO Batch read). */
export interface PoWindowFacts {
  window: PoWindowWork;
  demandSos: readonly number[];
}

/**
 * A purchase batch row is never called "round" or "PO window": line 1 is the
 * act (`Send 2 POs to Nice Future` · `Issue PO to Nice Future`), line 2 the
 * batch time or the one document. Read from the SAME window arithmetic the
 * Work item was projected from (`poWindowWorkFromSoBatch`), so the row and
 * Work agree.
 */
export function poWindowWords(row: WorkRow, facts: PoWindowFacts | null): { act: string; detail: string } {
  const parts = parsePoWindowKey(row.source.object.id);
  const time = parts ? poWindowTimeWord(parts.time) : row.source.object.label;
  if (!facts) return { act: row.line, detail: time };
  const { window, demandSos } = facts;
  const unsent = window.pos.filter((po) => !po.sent);
  if (unsent.length > 0) {
    const parties = partiesWord(unsent.map((po) => po.supplierName));
    return unsent.length === 1
      ? { act: `Send PO to ${parties}`, detail: unsent[0]!.documentNo }
      : { act: `Send ${unsent.length} POs to ${parties}`, detail: time };
  }
  if (window.demand.items > 0) {
    const parties = partiesWord(window.demand.suppliers.map((s) => s.supplier));
    const where = demandSos.length === 1 ? `SO-${demandSos[0]}` : time;
    return { act: `Issue PO to ${parties}`, detail: `${where} · ${TASKS_WORDS.itemsToBuy(window.demand.items)}` };
  }
  return { act: row.line, detail: time };
}

/** Rules whose row names what is still owed after the document (the PO Duty
 *  balance follow-up: `{PO No} · 1 item still due`). */
const DETAIL_CARRIES_PROBLEM = new Set(["purchasing.balance_date", "confirm_delivery_date", "assign_logistics"]);

export function taskRowWords(row: WorkRow, facts: PoWindowFacts | null = null): TaskRowWords {
  const base = row.source.object.kind === "po_window"
    ? poWindowWords(row, facts)
    : {
        act: row.line,
        detail: DETAIL_CARRIES_PROBLEM.has(row.ruleKey) ? `${row.source.object.label} · ${row.problem}` : row.source.object.label,
      };
  const covered = row.ownerState === "covered" && row.normalOwner?.name ? TASKS_WORDS.forOwner(row.normalOwner.name) : null;
  return {
    act: base.act,
    detail: [base.detail, covered].filter(Boolean).join(" · "),
    missedDate: row.timingBucket === "overdue" && row.dueIso ? fmtDate(row.dueIso) : null,
    noDate: row.dueIso === null ? `${TASKS_WORDS.noDate} · ${TASKS_WORDS.setBy(TASK_MODULE_WORD[row.module])}` : null,
  };
}

export interface TaskDay {
  iso: string;
  /** `MON` */
  weekday: string;
  /** `5` */
  dayNumber: string;
  /** `Oct` */
  month: string;
  holiday: string | null;
  today: boolean;
  rows: WorkRow[];
}

export interface TaskList {
  missed: WorkRow[];
  days: TaskDay[];
  noDate: WorkRow[];
  /** Per module, before the module choice: Missed + this week + No date. */
  moduleCounts: Record<OperationWorkModule, number>;
  total: number;
  previousWeek: string;
  nextWeek: string;
}

const byDue = (a: WorkRow, b: WorkRow) =>
  (a.dueIso ?? "9999-12-31").localeCompare(b.dueIso ?? "9999-12-31") || a.id.localeCompare(b.id);

/** Acts routed to the signed-in acting person (today's cover included). */
export function myTasks(items: readonly WorkRow[], myUserId: string | null): WorkRow[] {
  if (!myUserId) return [];
  return items.filter((item) => item.ownerId === myUserId);
}

export function taskList(
  mine: readonly WorkRow[],
  today: string,
  week: string,
  module: OperationWorkModule | null,
): TaskList {
  const rail = workRailDates(mine, today, week, { saturday: "always" });
  const weekIsos = new Set(rail.days.map((d) => d.iso));
  const inScope = (item: WorkRow) =>
    item.timingBucket === "overdue" || item.dueIso === null || weekIsos.has(item.dueIso);
  const moduleCounts = Object.fromEntries(WORK_MODULES.map((m) => [m, 0])) as Record<OperationWorkModule, number>;
  for (const item of mine) if (inScope(item)) moduleCounts[item.module] += 1;
  const shown = module ? mine.filter((item) => item.module === module) : [...mine];
  const missed = shown.filter((item) => item.timingBucket === "overdue").sort(byDue);
  const noDate = shown.filter((item) => item.dueIso === null && item.timingBucket !== "overdue").sort(byDue);
  const days = rail.days.map((day): TaskDay => ({
    iso: day.iso,
    weekday: day.weekday,
    dayNumber: day.dayNumber,
    month: day.label.split(" ").at(-1) ?? "",
    holiday: day.holiday,
    today: day.today,
    rows: shown.filter((item) => item.dueIso === day.iso && item.timingBucket !== "overdue").sort(byDue),
  }));
  return {
    missed,
    days,
    noDate,
    moduleCounts,
    total: Object.values(moduleCounts).reduce((sum, n) => sum + n, 0),
    previousWeek: rail.previousWeek,
    nextWeek: rail.nextWeek,
  };
}

/** A closed section's one-line preview: as many acts as fit (~44
 *  characters), then `+{k}`. */
export function previewLine(acts: readonly string[], room = 44): string {
  if (acts.length === 0) return "";
  const shown: string[] = [acts[0]!];
  for (const act of acts.slice(1)) {
    if ([...shown, act].join(" · ").length > room) break;
    shown.push(act);
  }
  const rest = acts.length - shown.length;
  return rest > 0 ? `${shown.join(" · ")} · +${rest}` : shown.join(" · ");
}

/** The modules present in a section, in governed order, for its icons. */
export function sectionModules(rows: readonly WorkRow[]): OperationWorkModule[] {
  const present = new Set(rows.map((r) => r.module));
  return WORK_MODULES.filter((m) => present.has(m));
}
