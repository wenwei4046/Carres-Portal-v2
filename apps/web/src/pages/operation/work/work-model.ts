import type { OperationWorkModule } from "@carres/shared";
import { addDaysIso, weekStartIso } from "@/lib/excel-date-filter";
import type { WorkRow } from "../use-open-work";

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
