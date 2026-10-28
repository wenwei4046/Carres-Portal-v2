/**
 * THE TASKS WORDS — what a task's row says, from the ONE open work set.
 *
 * No second engine: every row is a Work engine item (`useOpenWorkSet`). This
 * file only words what the engine already decided; the list itself (day
 * strip, `To do` · `Waiting` · `Done`, the cards) is `task-cards.ts`.
 */
import { INTERNAL_TASK_KIND, parsePoWindowKey, poWindowTimeWord, type OperationWorkModule, type PoWindowWork } from "@carres/shared";
import { fmtDate } from "@/lib/fmt-date";
import type { WorkRow } from "../use-open-work";

/** The Tasks door's module words — the portal's own destination names
 *  (Receiving work is done in Warehouse). */
export const TASK_MODULE_WORD: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Warehouse",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
  /* Tasks one employee adds for another (COPY "The internal task words"). */
  workspace: "Staff tasks",
};

/** The module's icon, as the side menu draws it (Material Symbols). */
export const TASK_MODULE_SYMBOL: Record<OperationWorkModule, string> = {
  orders: "receipt_long",
  purchasing: "shopping_cart",
  receiving: "warehouse",
  payment: "payments",
  delivery: "local_shipping",
  issue_tracker: "assignment_late",
  workspace: "task_alt",
};

/** Words of the panel's frame and its rows. */
export const TASKS_WORDS = {
  title: "Tasks",
  noDate: "No date",
  setBy: (module: string) => `set by ${module}`,
  failed: "Tasks could not be refreshed",
  lastUpdated: (time: string) => `Last updated ${time}`,
  couldNotRefresh: (source: string) => `Could not refresh ${source}`,
  tryAgain: "Try again",
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
      ? { act: `Send PO to ${parties}`, detail: unsent[0]!.documentNo.replace(/ V(\d+)$/, "-V$1") }
      : { act: `Send ${unsent.length} POs to ${parties}`, detail: time };
  }
  if (window.demand.items > 0) {
    const parties = partiesWord(window.demand.suppliers.map((s) => s.supplier));
    const where = demandSos.length === 1 ? `SO-${demandSos[0]}` : time;
    return { act: `Issue PO to ${parties}`, detail: `${where} · ${TASKS_WORDS.itemsToBuy(window.demand.items)}` };
  }
  return { act: row.line, detail: time };
}

/** Delivery rules whose row names what is still owed after the document. */
const DETAIL_CARRIES_PROBLEM = new Set(["confirm_delivery_date", "assign_logistics"]);

export function taskRowWords(row: WorkRow, facts: PoWindowFacts | null = null): TaskRowWords {
  const base = row.source.object.kind === "po_window"
    ? poWindowWords(row, facts)
    /* An internal task is named by what its creator typed; its line under
       the name says who added it. */
    : row.source.object.kind === INTERNAL_TASK_KIND
    ? { act: row.source.object.label, detail: row.problem }
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

/** Acts routed to the signed-in acting person (today's cover included). */
export function myTasks(items: readonly WorkRow[], myUserId: string | null): WorkRow[] {
  if (!myUserId) return [];
  return items.filter((item) => item.ownerId === myUserId);
}
