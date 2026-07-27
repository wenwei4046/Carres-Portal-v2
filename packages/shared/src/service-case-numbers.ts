/**
 * Service Case numbers (S5, service-case execution queue — Jess 2026-07-27).
 * **Monthly numbers that answer WHY.**
 *
 * THE CARD: "the counts Jess keeps by hand (per category per month), now
 * derived — plus the breakdown Excel can't do: issues by type per category, by
 * supplier, avg days to close, SLA hit rate. A small `Numbers` tab on the
 * module; no new tables — read the cases. Done when: 'which supplier / which
 * issue type causes the most cases' is one glance."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FINDING THAT SHAPED THIS FILE — and why S5 needs no column
 *
 * The carry-forward `case-sla-no-closed-at` says S5 must add a `closed_at`
 * column in its own migration, because `service_cases` has none and neither
 * "avg days to close" nor the on-time rate can be computed without one.
 *
 * That is true of the STATUS flip and false of the case. S3 (0293) made the
 * transition into a closed status impossible without a `customer_confirmed`
 * entry in `service_cases.progress` — and that entry carries `on`, the BUSINESS
 * date the customer said the problem was solved, stamped server-side. So the
 * day a case ended is already on file for every case closed since S3, and it is
 * the better of the two dates by the module's own law:
 *
 *   "A case is not finished when we are finished. It is finished when the
 *    customer is."  — `service-case-plan.ts`
 *
 * A `closed_at` column would record the afternoon somebody changed a dropdown.
 * The confirm date records the day the problem stopped. S5 therefore adds NO
 * migration, exactly as the card asked ("no new tables — read the cases"), and
 * the same S3/S4 law holds one rung further out: derived, never stored.
 *
 * What that costs is named rather than hidden: a case closed BEFORE 0293 has no
 * such entry. It is counted in `finish.unmeasured` and says so on screen — it
 * is never averaged, and never assumed on time.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIVE STATE THIS IS BUILT AGAINST (recorded at S4's ship, same day)
 *
 *   • ONE case on file. It is closed, and it was opened 2026-06-16 — before S1,
 *     so it carries no category, no issue type, no supplier and no progress.
 *
 * Compute the card the obvious way against that and every panel lies:
 *
 *   1. A null issue type folded into `Other` would report that a human chose
 *      "Other" when nobody was ever asked the question. `other` is a real
 *      answer somebody picks; "nobody was asked" is a different fact and gets
 *      its own rung (`unclassified`) — K5's rule D, restated for words instead
 *      of numbers.
 *   2. An average finish time taken off `updated_at` would print a number
 *      derived from the last time any field was touched.
 *   3. An on-time rate counting an unmeasurable case would read 0% or 100% off
 *      a single case that cannot be judged either way.
 *
 * So: **a figure may not claim more than the records hold** (K5's rule B). Every
 * average and every rate carries its own coverage, and withholds itself with a
 * stated reason rather than printing a confident number.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PURE — no I/O, no clock. `todayIso` and the holiday set are injected, exactly
 * as `service-case-sla.ts` takes them, so the API decides and the browser
 * renders the same answer.
 *
 * NO MIGRATION. S5 reads `service_cases` and nothing else. It writes nothing,
 * mints no table and adds no number of its own — it is the review layer, and a
 * review layer with its own state is a second set of books.
 */

import {
  CASE_PRODUCT_CATEGORIES,
  CASE_PRODUCT_CATEGORY_KEYS,
  caseIssueLabel,
  type CaseProductCategory,
} from "./service-case-intake";
import type { CaseProgressEntry } from "./service-case-plan";
import {
  CASE_DELAY_REASON_RESPONSIBILITY,
  CASE_SLA_WORKING_DAYS,
  caseSlaClock,
  type CaseDelayReason,
  type CaseDelayResponsibility,
  type CaseSlaEvent,
} from "./service-case-sla";
import { countWorkingDays, type IsoDate, type WorkingDayOptions } from "./working-days";

// ── The window ───────────────────────────────────────────────────────────────

/** How many months the tab reports on. Six is two quarters — long enough for a
 *  shape to appear, short enough that every month is one a person remembers. */
export const CASE_NUMBERS_MONTHS = 6;

/** The months in the window, NEWEST first — the order they are read in. */
export function caseNumbersMonths(
  todayIso: string,
  count: number = CASE_NUMBERS_MONTHS,
): string[] {
  const [y, m] = todayIso.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(y, (m ?? 1) - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

// ── The buckets ──────────────────────────────────────────────────────────────

/**
 * A case that was filed before the questions existed has no category and no
 * issue type. It is NOT `other` — `other` is an answer a human picked from the
 * list, and reporting the two as one thing would tell Jess her staff keep
 * choosing "Other" when they were never asked.
 */
export const CASE_UNCLASSIFIED = "unclassified";
export const CASE_UNCLASSIFIED_LABEL = "Filed before the questions";

export type CaseCategoryBucket = CaseProductCategory | typeof CASE_UNCLASSIFIED;

export const CASE_NUMBERS_CATEGORIES: readonly CaseCategoryBucket[] = [
  ...CASE_PRODUCT_CATEGORY_KEYS,
  CASE_UNCLASSIFIED,
];

export function caseCategoryBucketLabel(bucket: string): string {
  if (bucket === CASE_UNCLASSIFIED) return CASE_UNCLASSIFIED_LABEL;
  return (
    CASE_PRODUCT_CATEGORIES.find((c) => c.key === bucket)?.label ?? bucket
  );
}

export function caseIssueBucketLabel(bucket: string): string {
  if (bucket === CASE_UNCLASSIFIED) return CASE_UNCLASSIFIED_LABEL;
  return caseIssueLabel(bucket);
}

function bucketOf(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v === "" ? CASE_UNCLASSIFIED : v;
}

/** The factory, where the case names one. `supplier_id` is snapshotted at
 *  intake (S3), so this is the name the follow-up itself used. */
export const CASE_SUPPLIER_UNKNOWN_LABEL = "No factory on the case";

// ── What one case looks like to this module ──────────────────────────────────

/**
 * Everything S5 reads off a case, and nothing else. Every structured field is
 * optional because a case filed before S1/S3/S4 genuinely has none — and
 * because a browser on this build can reach a Worker that predates them.
 */
export interface CaseNumbersCase {
  id: string;
  caseNo: string;
  /** Day 0 — the day it was reported. */
  openedAt: string;
  /** The status's own `is_closed` flag. */
  closed: boolean;
  productCategory?: string | null;
  issueType?: string | null;
  supplierName?: string | null;
  progress?: readonly CaseProgressEntry[] | null;
  slaEvents?: readonly CaseSlaEvent[] | null;
}

/**
 * THE finish date: the day the customer said it was solved.
 *
 * This is the whole reason S5 needs no `closed_at`. S3's close gate (and 0293's
 * trigger) make this entry a precondition of closing, so every case closed
 * since then carries it — and it is the business date, not the day a dropdown
 * was changed.
 *
 * Null for a case closed before S3, and for one still running. The two are
 * different facts and the report keeps them apart.
 */
export function caseFinishedOn(
  progress: readonly CaseProgressEntry[] | null | undefined,
): IsoDate | null {
  const entry = (progress ?? []).find((e) => e.step === "customer_confirmed");
  const on = entry?.on?.slice(0, 10);
  return on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : null;
}

// ── The report ───────────────────────────────────────────────────────────────

export interface CaseMonthRow {
  period: string;
  total: number;
  /** One count per category bucket, `unclassified` included. */
  byCategory: Record<string, number>;
}

export interface CaseIssueRow {
  key: string;
  label: string;
  count: number;
  /** The card's "issues by type PER CATEGORY" — the split behind the row. */
  byCategory: Record<string, number>;
}

export interface CaseSupplierRow {
  /** The snapshotted factory name, or the honest absence. */
  name: string;
  count: number;
  /**
   * Cases of theirs that missed the deadline, or are running past it now.
   * The card's own "which supplier causes the most cases", with the half that
   * matters more attached.
   */
  lateCount: number;
}

/** Why a figure is not printed. Null when it is. */
export interface CaseCoverage {
  /** Cases the figure could be computed from. */
  measured: number;
  /** Cases it could not, and why not. */
  unmeasured: number;
  withheldReason: string | null;
}

export interface CaseFinishReport extends CaseCoverage {
  /** Average WORKING days from report to the customer's confirmation.
   *  Working days, not calendar days, so it reads directly against the
   *  14-working-day promise it is being judged by. Null when withheld. */
  avgWorkingDays: number | null;
}

export interface CaseOnTimeReport extends CaseCoverage {
  onTime: number;
  late: number;
  /** Whole percent of measurable finished cases that met their deadline. */
  pct: number | null;
}

export type CaseResponsibilityCounts = Record<CaseDelayResponsibility, number>;

export interface CaseNumbers {
  /** The months reported on, newest first. */
  months: string[];
  /** The one month narrowed to, or null for the whole window. */
  period: string | null;
  totals: {
    /** Cases reported inside the scope. */
    opened: number;
    /** …of which the customer has confirmed solved. */
    finished: number;
    /** …closed with no confirmation on file (all of them pre-date S3). */
    closedWithoutFinishDate: number;
    /** …still running. */
    stillOpen: number;
    /** …still running with the deadline already passed. */
    stillOpenLate: number;
  };
  byMonth: CaseMonthRow[];
  byIssue: CaseIssueRow[];
  bySupplier: CaseSupplierRow[];
  /** Where the recorded delays sat. S4 files a hidden `responsibility` on every
   *  delay reason precisely so this needs no second tagging pass. */
  byResponsibility: CaseResponsibilityCounts;
  /** How many delay reasons were recorded at all — the denominator above. */
  delayReasonsRecorded: number;
  finish: CaseFinishReport;
  onTime: CaseOnTimeReport;
  /** The one line that answers the card's Done-when without reading a row. */
  headline: string;
}

export interface CaseNumbersInput {
  cases: readonly CaseNumbersCase[];
  todayIso: string;
  /** Narrow to one month (`YYYY-MM`), or null for the whole window. */
  period?: string | null;
  months?: number;
}

/**
 * THE report — one function, so the tab and any later consumer cannot reach
 * different arithmetic about the same cases.
 *
 * Cases are counted by the month they were REPORTED, not the month they
 * finished: that is the cohort Jess counts by hand, and it is the only framing
 * in which "how long did they take" is a question about the same set of cases
 * as "how many were there".
 */
export function computeCaseNumbers(
  input: CaseNumbersInput,
  opts: WorkingDayOptions = {},
): CaseNumbers {
  const months = caseNumbersMonths(input.todayIso, input.months);
  const period = input.period?.slice(0, 7) ?? null;
  const inWindow = new Set(months);

  // The month strip always spans the whole window — narrowing to one month
  // must not empty the very control used to narrow.
  const windowCases = input.cases.filter((c) =>
    inWindow.has(monthOf(c.openedAt)),
  );
  const scoped = period
    ? windowCases.filter((c) => monthOf(c.openedAt) === period)
    : windowCases;

  // ── Jess's hand count: per category, per month ────────────────────────────
  const byMonth: CaseMonthRow[] = months.map((m) => ({
    period: m,
    total: 0,
    byCategory: emptyCategoryCounts(),
  }));
  const monthIndex = new Map(byMonth.map((r, i) => [r.period, i]));
  for (const c of windowCases) {
    const row = byMonth[monthIndex.get(monthOf(c.openedAt)) as number];
    if (!row) continue;
    row.total += 1;
    const cat = bucketOf(c.productCategory);
    row.byCategory[cat] = (row.byCategory[cat] ?? 0) + 1;
  }

  // ── The clock, once per case ──────────────────────────────────────────────
  const judged = scoped.map((c) => {
    const finishedOn = caseFinishedOn(c.progress);
    const clock = caseSlaClock(
      {
        openedAt: c.openedAt,
        todayIso: input.todayIso,
        events: c.slaEvents ?? [],
        closed: c.closed,
      },
      opts,
    );
    return {
      c,
      finishedOn,
      due: clock.dueIso,
      // A finished case is judged against the deadline in force when it ended;
      // a running one is judged by S4's own clock, so "late" means the same
      // thing on this tab as it does on the list.
      late: finishedOn
        ? clock.dueIso != null && finishedOn > clock.dueIso
        : !c.closed && clock.state === "late",
      stillOpen: !finishedOn && !c.closed,
      closedWithoutFinishDate: !finishedOn && c.closed,
    };
  });

  // ── Issues by type, and per category behind each ──────────────────────────
  const issueMap = new Map<string, CaseIssueRow>();
  for (const { c } of judged) {
    const key = bucketOf(c.issueType);
    const row =
      issueMap.get(key) ??
      { key, label: caseIssueBucketLabel(key), count: 0, byCategory: emptyCategoryCounts() };
    row.count += 1;
    const cat = bucketOf(c.productCategory);
    row.byCategory[cat] = (row.byCategory[cat] ?? 0) + 1;
    issueMap.set(key, row);
  }
  const byIssue = [...issueMap.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );

  // ── By factory ────────────────────────────────────────────────────────────
  const supplierMap = new Map<string, CaseSupplierRow>();
  for (const { c, late } of judged) {
    const name = (c.supplierName ?? "").trim() || CASE_SUPPLIER_UNKNOWN_LABEL;
    const row = supplierMap.get(name) ?? { name, count: 0, lateCount: 0 };
    row.count += 1;
    if (late) row.lateCount += 1;
    supplierMap.set(name, row);
  }
  // A named factory always outranks the no-factory bucket at an equal count:
  // the answer to "which factory" is never "none of them".
  const bySupplier = [...supplierMap.values()].sort(
    (a, b) =>
      b.count - a.count ||
      Number(a.name === CASE_SUPPLIER_UNKNOWN_LABEL) -
        Number(b.name === CASE_SUPPLIER_UNKNOWN_LABEL) ||
      a.name.localeCompare(b.name),
  );

  // ── Where the delays sat ──────────────────────────────────────────────────
  const byResponsibility: CaseResponsibilityCounts = {
    supplier: 0,
    carres: 0,
    customer: 0,
  };
  let delayReasonsRecorded = 0;
  for (const { c } of judged) {
    for (const e of c.slaEvents ?? []) {
      const who = CASE_DELAY_REASON_RESPONSIBILITY[e.reason as CaseDelayReason];
      if (!who) continue; // a retired reason key stays readable, uncounted
      byResponsibility[who] += 1;
      delayReasonsRecorded += 1;
    }
  }

  // ── How long it takes ─────────────────────────────────────────────────────
  const finishedCases = judged.filter((j) => j.finishedOn !== null);
  const unmeasuredFinish = judged.filter((j) => j.closedWithoutFinishDate).length;
  const spans = finishedCases.map((j) =>
    countWorkingDays(j.c.openedAt.slice(0, 10), j.finishedOn as IsoDate, opts),
  );
  const finish: CaseFinishReport = {
    measured: spans.length,
    unmeasured: unmeasuredFinish,
    avgWorkingDays:
      spans.length > 0
        ? Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10
        : null,
    withheldReason:
      spans.length > 0
        ? null
        : unmeasuredFinish > 0
          ? `${unmeasuredFinish} ${cases(unmeasuredFinish)} ${wasWere(unmeasuredFinish)} closed before the portal recorded the day the customer confirmed, so how long they took cannot be counted.`
          : "No case has been confirmed solved yet, so there is nothing to average.",
  };

  // ── Finished on time ──────────────────────────────────────────────────────
  // Only a case that has FINISHED can have met its deadline. A running case is
  // reported separately (`stillOpenLate`) — folding it in would score a case
  // that is still fixable.
  const judgeable = finishedCases.filter((j) => j.due !== null);
  const late = judgeable.filter((j) => j.late).length;
  const onTimeCount = judgeable.length - late;
  const onTime: CaseOnTimeReport = {
    measured: judgeable.length,
    unmeasured: unmeasuredFinish + (finishedCases.length - judgeable.length),
    onTime: onTimeCount,
    late,
    pct:
      judgeable.length > 0
        ? Math.round((onTimeCount * 100) / judgeable.length)
        : null,
    withheldReason:
      judgeable.length > 0
        ? null
        : `No case has both a report date and a confirmed finish date yet, so none can be measured against the ${CASE_SLA_WORKING_DAYS} working days.`,
  };

  const totals = {
    opened: scoped.length,
    finished: finishedCases.length,
    closedWithoutFinishDate: unmeasuredFinish,
    stillOpen: judged.filter((j) => j.stillOpen).length,
    stillOpenLate: judged.filter((j) => j.stillOpen && j.late).length,
  };

  return {
    months,
    period,
    totals,
    byMonth,
    byIssue,
    bySupplier,
    byResponsibility,
    delayReasonsRecorded,
    finish,
    onTime,
    headline: caseNumbersHeadline({ totals, byIssue, bySupplier }),
  };
}

// ── The headline ─────────────────────────────────────────────────────────────

/**
 * The card's Done-when in one sentence: **which issue type and which factory
 * cause the most cases**, without reading a row.
 *
 * It refuses to name a leader it cannot see. When every case was filed before
 * the questions, it says THAT — the same law K5's "Nothing is watched yet"
 * headline follows: a quiet screen must never read as a clean one.
 */
export function caseNumbersHeadline(input: {
  totals: { opened: number; stillOpenLate: number };
  byIssue: readonly CaseIssueRow[];
  bySupplier: readonly CaseSupplierRow[];
}): string {
  const { opened, stillOpenLate } = input.totals;
  if (opened === 0) return "No case was reported in this period.";

  const topIssue = input.byIssue.find((r) => r.key !== CASE_UNCLASSIFIED) ?? null;
  const topSupplier =
    input.bySupplier.find((r) => r.name !== CASE_SUPPLIER_UNKNOWN_LABEL) ?? null;

  const parts: string[] = [`${opened} ${cases(opened)} reported.`];

  if (!topIssue && !topSupplier) {
    parts.push(
      `None of them was filed with the questions, so nothing can be counted by problem or factory yet.`,
    );
  } else {
    if (topIssue) {
      parts.push(
        `${topIssue.label} is the most common problem — ${topIssue.count} of ${opened}.`,
      );
    }
    if (topSupplier) {
      parts.push(`${topSupplier.name} carries the most: ${topSupplier.count}.`);
    }
  }

  if (stillOpenLate > 0) {
    parts.push(
      `${stillOpenLate} ${cases(stillOpenLate)} ${isAre(stillOpenLate)} past the deadline right now.`,
    );
  }
  return parts.join(" ");
}

// ── Small words ──────────────────────────────────────────────────────────────

function emptyCategoryCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of CASE_NUMBERS_CATEGORIES) out[k] = 0;
  return out;
}

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function cases(n: number): string {
  return n === 1 ? "case" : "cases";
}
function isAre(n: number): string {
  return n === 1 ? "is" : "are";
}
function wasWere(n: number): string {
  return n === 1 ? "was" : "were";
}
