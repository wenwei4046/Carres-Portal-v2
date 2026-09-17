import type { OperationWorkModule } from "@carres/shared";
import { myHolidayName, myHolidaySet } from "@carres/shared/my-holidays";
import { isWorkingDay } from "@carres/shared/working-days";
import { addDaysIso, weekStartIso } from "@/lib/excel-date-filter";
import type { WorkRow } from "../use-open-work";
import type { WorkLayout } from "./WorkSplitShell";

export type WorkWhen = "all" | "broken" | "overdue" | "today" | "later" | "no_date";

export interface WorkFilters {
  search: string;
  when: WorkWhen;
  module: OperationWorkModule | "all";
  covered: boolean;
}

export interface WorkSection {
  key: "broken" | "overdue" | "today" | "later" | "no_date";
  label: "Broken commitments" | "Missed" | "Today" | "Later" | "No working date";
  items: WorkRow[];
}

const SECTION_ORDER: readonly WorkSection["key"][] = [
  "broken",
  "overdue",
  "today",
  "later",
  "no_date",
];

const SECTION_LABEL: Record<WorkSection["key"], WorkSection["label"]> = {
  broken: "Broken commitments",
  overdue: "Missed",
  today: "Today",
  later: "Later",
  no_date: "No working date",
};

function searchText(item: WorkRow): string {
  return [
    item.soRef,
    item.customer,
    item.recipient,
    item.problem,
    item.action,
    item.requiredResult,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function filterWork(items: readonly WorkRow[], filters: WorkFilters): WorkRow[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (filters.module !== "all" && item.module !== filters.module) return false;
    if (filters.covered && item.ownerState !== "covered") return false;
    if (filters.when === "broken" && !item.broken) return false;
    if (filters.when !== "all" && filters.when !== "broken" && item.timingBucket !== filters.when) return false;
    return !query || searchText(item).includes(query);
  });
}

export function workSections(items: readonly WorkRow[]): WorkSection[] {
  const buckets = new Map<WorkSection["key"], WorkRow[]>();
  for (const item of items) {
    const key: WorkSection["key"] = item.broken ? "broken" : item.timingBucket;
    const bucket = buckets.get(key) ?? [];
    bucket.push(item);
    buckets.set(key, bucket);
  }
  return SECTION_ORDER.flatMap((key) => {
    const sectionItems = buckets.get(key);
    if (!sectionItems?.length) return [];
    return [{ key, label: SECTION_LABEL[key], items: sectionItems }];
  });
}

/** The day strip: Monday to Friday of the week holding `today`, plus Saturday
 *  when something is due that day. Counted in UTC, so the browser's time zone
 *  cannot move a date. */
export function workWeek(today: string, dueIsos: readonly (string | null)[]): string[] {
  const monday = weekStartIso(today);
  const dates = [0, 1, 2, 3, 4].map((offset) => addDaysIso(monday, offset));
  const saturday = addDaysIso(monday, 5);
  if (dueIsos.includes(saturday)) dates.push(saturday);
  return dates;
}

/** The shared Malaysia holiday calendar — the same one Payment reads. */
const WORK_HOLIDAYS = myHolidaySet();

/** `Malaysia Day` for 2026-09-16, else null. */
export function workHoliday(iso: string): string | null {
  return myHolidayName(iso);
}

/** A day the focus list may open on: not Sunday, not a public holiday, and a
 *  Saturday only when something is due that Saturday (Work MASTER §5.4). */
function isWorkDay(iso: string, dueIsos: readonly (string | null)[]): boolean {
  if (!isWorkingDay(iso, { holidays: WORK_HOLIDAYS })) return false;
  if (new Date(`${iso}T00:00:00Z`).getUTCDay() === 6) return dueIsos.includes(iso);
  return true;
}

/** The focus day (MASTER §5.1): today when today is a working day, otherwise
 *  the next working day. Counted in UTC, like `workWeek`. */
export function workFocusDay(today: string, dueIsos: readonly (string | null)[]): string {
  let day = today;
  for (let step = 0; step < 31; step += 1) {
    if (isWorkDay(day, dueIsos)) return day;
    day = addDaysIso(day, 1);
  }
  return today;
}

/** Panels follow the Work area's own width, never the window's. */
export function workLayoutFor(width: number): WorkLayout {
  return width >= 1104 ? "three" : width >= 768 ? "two" : "one";
}

/** Source words for Work source health — never the raw feed key. */
export const WORK_SOURCE_LABEL: Record<OperationWorkModule, string> = {
  orders: "Sales Orders",
  purchasing: "Purchasing",
  receiving: "Receiving",
  delivery: "Delivery",
  payment: "Payment",
  issue_tracker: "Issue Tracker",
};

/** The focus window: from `generatedOn` through the focus day (`workFocusDay`). */
export interface WorkFocus {
  from: string;
  to: string;
}

/** The focus list (MASTER §5.1): Missed, plus anything due from today through
 *  the focus day — the same rule as My Work's `day=focus` list. */
export function inWorkFocus(item: WorkRow, focus: WorkFocus | null): boolean {
  if (item.timingBucket === "overdue") return true;
  return focus !== null && item.dueIso !== null && item.dueIso >= focus.from && item.dueIso <= focus.to;
}

/**
 * THE ONE RIGHT RAIL COUNT (Workspace MASTER §7.1, HF-3 2026-09-17). The badge
 * and the panel both read this; My Work's focus list is the same predicate
 * over the same person. Later days and `No working date` never count.
 */
export function myMissedAndToday(
  items: readonly WorkRow[],
  myUserId: string | null,
  focus: WorkFocus | null,
): { missed: number; today: number } {
  let missed = 0;
  let today = 0;
  if (!myUserId) return { missed, today };
  for (const item of items) {
    if (item.ownerId !== myUserId || !inWorkFocus(item, focus)) continue;
    if (item.timingBucket === "overdue") missed += 1;
    else today += 1;
  }
  return { missed, today };
}
