import type { OperationWorkModule } from "@carres/shared";
import { myHolidayName, myHolidaySet } from "@carres/shared/my-holidays";
import { isWorkingDay } from "@carres/shared/working-days";
import { addDaysIso, weekStartIso } from "@/lib/excel-date-filter";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
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

/**
 * The Date choice (Work left rail, owner ruling 2026-09-24). Exactly one of
 * `missed` · one calendar date (`YYYY-MM-DD`) · `no_date` is chosen. `focus` is
 * the MASTER §5.1 opening list (Missed plus the focus day) and `all` is the
 * whole open set, which the toolbar's timing filter still opens.
 */
export type WorkDayKey = "focus" | "missed" | "no_date" | "all" | string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isWorkDate(key: string): boolean {
  return ISO_DATE.test(key);
}

/** Whether a row belongs to the chosen Date. Pure: `today` is the feed's own
 *  Malaysia date and `focusDay` its §5.1 focus day. */
export function inWorkDay(item: WorkRow, day: WorkDayKey, today: string, focusDay: string): boolean {
  if (day === "all") return true;
  if (item.timingBucket === "overdue") return day === "missed" || day === "focus";
  if (day === "missed") return false;
  if (day === "no_date") return item.dueIso === null;
  // The focus list also holds anything due between today and the focus day
  // (work dated on today's holiday or Sunday), so opening on the next
  // working day never hides it.
  if (day === "focus") return item.dueIso !== null && item.dueIso >= today && item.dueIso <= focusDay;
  return item.dueIso === day;
}

/** The Monday a `week` URL value names, or null when it names no date. */
export function parseWorkWeek(value: string | null): string | null {
  return value && ISO_DATE.test(value) ? weekStartIso(value) : null;
}

export interface WorkRailDay {
  iso: string;
  /** `Wed, 16 Sep` — the one `fmtDate` spelling. */
  label: string;
  /** The badge's two lines, cut from that same spelling: `16` and `WED`. */
  dayNumber: string;
  weekday: string;
  holiday: string | null;
  count: number;
  today: boolean;
}

export interface WorkRailDates {
  /** `Sep 2026` — the month holding the week's Thursday (ISO 8601). */
  month: string;
  previousWeek: string;
  nextWeek: string;
  missed: number;
  days: WorkRailDay[];
  noDate: number;
}

/**
 * The Date section of one visible work week. Every date is a `YYYY-MM-DD`
 * string moved by whole days, so no device clock or time zone can shift it;
 * `today` is the feed's Malaysia date, never the browser's. A missed action
 * counts once, under `Missed`, never again under its past weekday.
 */
export function workRailDates(items: readonly WorkRow[], today: string, week: string): WorkRailDates {
  const monday = weekStartIso(week);
  const dates = workWeek(monday, items.map((item) => item.dueIso));
  return {
    month: fmtMonth(addDaysIso(monday, 3)),
    previousWeek: addDaysIso(monday, -7),
    nextWeek: addDaysIso(monday, 7),
    missed: items.filter((item) => item.timingBucket === "overdue").length,
    days: dates.map((iso) => {
      const label = fmtDate(iso);
      const [weekday = "", rest = ""] = label.split(", ");
      return {
        iso,
        label,
        dayNumber: rest.split(" ")[0] ?? "",
        weekday: weekday.toUpperCase(),
        holiday: workHoliday(iso),
        count: items.filter((item) => item.dueIso === iso && item.timingBucket !== "overdue").length,
        today: iso === today,
      };
    }),
    noDate: items.filter((item) => item.timingBucket === "no_date").length,
  };
}

/** Module counts over the rows of the chosen Date — before the module choice,
 *  so choosing one module never hides the others' real counts. */
export function workModuleCounts(items: readonly WorkRow[]): Record<OperationWorkModule, number> {
  const counts = Object.fromEntries(
    WORK_MODULES.map((module) => [module, 0]),
  ) as Record<OperationWorkModule, number>;
  for (const item of items) counts[item.module] += 1;
  return counts;
}

/** The admitted Work modules, in their governed order (MASTER §5.3). */
export const WORK_MODULES: readonly OperationWorkModule[] = [
  "orders",
  "purchasing",
  "receiving",
  "delivery",
  "payment",
  "issue_tracker",
];

/** Panels follow the Work area's own width, never the window's. */
export function workLayoutFor(width: number): WorkLayout {
  return width >= 1280 ? "three" : width >= 768 ? "two" : "one";
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

/**
 * WHICH MIDDLE TAB A ROW BELONGS TO (Workspace §5.10). `Waiting` only when the
 * owning module RECORDED that we are waiting on the party (the feed's
 * `communication.replyState`, from Delivery's contact record) — silence is
 * never waiting. A missed row is always `To do`: Waiting never hides a
 * deadline. `Completed` needs source-owned closure receipts (§5.2.1).
 */
export function workListTabOf(row: WorkRow): "todo" | "waiting" {
  return row.source.communication?.replyState === "waiting" && row.timingBucket !== "overdue" ? "waiting" : "todo";
}
