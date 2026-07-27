import { describe, it, expect } from "vitest";
import {
  CASE_SUPPLIER_UNKNOWN_LABEL,
  CASE_UNCLASSIFIED,
  CASE_UNCLASSIFIED_LABEL,
  caseCategoryBucketLabel,
  caseFinishedOn,
  caseIssueBucketLabel,
  caseNumbersHeadline,
  caseNumbersMonths,
  computeCaseNumbers,
  type CaseNumbersCase,
} from "./service-case-numbers";
import type { CaseProgressEntry } from "./service-case-plan";
import type { CaseSlaEvent } from "./service-case-sla";

/**
 * S5 — the numbers tab.
 *
 * The tests that matter here are not the arithmetic; they are the REFUSALS. A
 * review layer that prints a confident average off one unmeasurable case is
 * worse than one that prints nothing, and the live database holds exactly that
 * case.
 */

const TODAY = "2026-07-27"; // a Monday

function progress(step: string, on: string): CaseProgressEntry {
  return { step, on, at: `${on}T02:00:00Z`, by: "u1", byRole: "operation" };
}

function slaEvent(reason: string): CaseSlaEvent {
  return {
    kind: "customer_told",
    on: "2026-07-20",
    reason,
    at: "2026-07-20T02:00:00Z",
    by: "u1",
    byRole: "operation",
  };
}

function aCase(over: Partial<CaseNumbersCase> = {}): CaseNumbersCase {
  return {
    id: over.id ?? "c1",
    caseNo: over.caseNo ?? "SC2607-01",
    openedAt: over.openedAt ?? "2026-07-01",
    closed: over.closed ?? false,
    productCategory: over.productCategory,
    issueType: over.issueType,
    supplierName: over.supplierName,
    progress: over.progress,
    slaEvents: over.slaEvents,
  };
}

function run(cases: CaseNumbersCase[], period: string | null = null) {
  return computeCaseNumbers({ cases, todayIso: TODAY, period });
}

// ── The window ───────────────────────────────────────────────────────────────

describe("the window", () => {
  it("runs six months back, newest first, and crosses the year boundary", () => {
    expect(caseNumbersMonths(TODAY)).toEqual([
      "2026-07",
      "2026-06",
      "2026-05",
      "2026-04",
      "2026-03",
      "2026-02",
    ]);
    expect(caseNumbersMonths("2026-01-15", 3)).toEqual([
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
  });

  it("keeps the month strip whole while narrowed to one month", () => {
    const r = run(
      [
        aCase({ id: "a", openedAt: "2026-07-02" }),
        aCase({ id: "b", openedAt: "2026-06-02" }),
      ],
      "2026-07",
    );
    // The control used to narrow must not empty itself.
    expect(r.byMonth.find((m) => m.period === "2026-06")?.total).toBe(1);
    expect(r.totals.opened).toBe(1);
  });

  it("drops a case older than the window from every figure", () => {
    const r = run([aCase({ openedAt: "2025-01-01" })]);
    expect(r.totals.opened).toBe(0);
    expect(r.byIssue).toEqual([]);
  });
});

// ── The finish date: why S5 needs no closed_at column ────────────────────────

describe("the finish date", () => {
  it("is the day the customer confirmed, not a row timestamp", () => {
    expect(
      caseFinishedOn([progress("collect", "2026-07-05"), progress("customer_confirmed", "2026-07-14")]),
    ).toBe("2026-07-14");
  });

  it("is null when nobody confirmed, and null on a malformed date", () => {
    expect(caseFinishedOn([progress("collect", "2026-07-05")])).toBeNull();
    expect(caseFinishedOn(null)).toBeNull();
    expect(caseFinishedOn([progress("customer_confirmed", "not-a-date")])).toBeNull();
  });

  it("counts working days, so the average reads against the 14-working-day promise", () => {
    // 1 Jul (Wed) → 14 Jul (Tue): 13 calendar days, two Sundays excluded = 11.
    const r = run([
      aCase({ progress: [progress("customer_confirmed", "2026-07-14")], closed: true }),
    ]);
    expect(r.finish.measured).toBe(1);
    expect(r.finish.avgWorkingDays).toBe(11);
    expect(r.finish.withheldReason).toBeNull();
  });
});

// ── The refusals ─────────────────────────────────────────────────────────────

describe("what it refuses to print", () => {
  it("withholds the average when the only closed case predates the confirm ledger", () => {
    // THE LIVE ROW: one case, closed, filed before S1/S3 — no progress at all.
    const r = run([aCase({ openedAt: "2026-06-16", closed: true })]);

    expect(r.totals.closedWithoutFinishDate).toBe(1);
    expect(r.totals.finished).toBe(0);
    expect(r.finish.avgWorkingDays).toBeNull();
    expect(r.finish.unmeasured).toBe(1);
    expect(r.finish.withheldReason).toContain("closed before the portal recorded");
  });

  it("withholds the on-time rate rather than scoring an unmeasurable case", () => {
    const r = run([aCase({ openedAt: "2026-06-16", closed: true })]);
    expect(r.onTime.pct).toBeNull();
    expect(r.onTime.measured).toBe(0);
    expect(r.onTime.withheldReason).toContain("14 working days");
  });

  it("never counts a still-running case in the on-time rate", () => {
    const r = run([
      // Opened 1 Jul, deadline is 14 working days later — long past by 27 Jul.
      aCase({ id: "open-late", openedAt: "2026-06-01" }),
      aCase({
        id: "done",
        openedAt: "2026-07-01",
        closed: true,
        progress: [progress("customer_confirmed", "2026-07-10")],
      }),
    ]);
    expect(r.onTime.measured).toBe(1);
    expect(r.onTime.onTime).toBe(1);
    expect(r.totals.stillOpen).toBe(1);
    expect(r.totals.stillOpenLate).toBe(1);
  });

  it("marks a finished case late only when it passed its own deadline", () => {
    const late = run([
      aCase({
        openedAt: "2026-06-01",
        closed: true,
        progress: [progress("customer_confirmed", "2026-07-20")],
      }),
    ]);
    expect(late.onTime.late).toBe(1);
    expect(late.onTime.pct).toBe(0);
  });

  it("judges a finished case against the deadline it was MOVED to", () => {
    const events: CaseSlaEvent[] = [
      {
        kind: "extension",
        on: "2026-06-15",
        reason: "supplier_special_order",
        until: "2026-07-31",
        due: "2026-06-17",
        at: "2026-06-15T02:00:00Z",
        by: "u1",
        byRole: "operation",
      },
    ];
    const r = run([
      aCase({
        openedAt: "2026-06-01",
        closed: true,
        slaEvents: events,
        progress: [progress("customer_confirmed", "2026-07-20")],
      }),
    ]);
    // Late against the base deadline, on time against the extension.
    expect(r.onTime.onTime).toBe(1);
    expect(r.onTime.late).toBe(0);
  });
});

// ── Unclassified is not "Other" ──────────────────────────────────────────────

describe("a case filed before the questions", () => {
  it("gets its own bucket rather than being reported as a chosen Other", () => {
    const r = run([
      aCase({ id: "old" }),
      aCase({ id: "new", issueType: "other", productCategory: "sofa" }),
    ]);
    const keys = r.byIssue.map((i) => i.key);
    expect(keys).toContain(CASE_UNCLASSIFIED);
    expect(keys).toContain("other");
    expect(r.byIssue.find((i) => i.key === "other")?.count).toBe(1);
    expect(r.byIssue.find((i) => i.key === CASE_UNCLASSIFIED)?.count).toBe(1);
  });

  it("labels both buckets in plain words", () => {
    expect(caseIssueBucketLabel(CASE_UNCLASSIFIED)).toBe(CASE_UNCLASSIFIED_LABEL);
    expect(caseIssueBucketLabel("damaged")).toBe("Damaged");
    expect(caseCategoryBucketLabel(CASE_UNCLASSIFIED)).toBe(CASE_UNCLASSIFIED_LABEL);
    expect(caseCategoryBucketLabel("bedframe")).toBe("Bed frame");
  });
});

// ── The card's Done-when ─────────────────────────────────────────────────────

describe("which issue type and which factory cause the most cases", () => {
  const many = [
    aCase({ id: "1", issueType: "damaged", productCategory: "sofa", supplierName: "Ohana" }),
    aCase({ id: "2", issueType: "damaged", productCategory: "mattress", supplierName: "Ohana" }),
    aCase({ id: "3", issueType: "damaged", productCategory: "sofa", supplierName: "Nice Future" }),
    aCase({ id: "4", issueType: "missing_parts", productCategory: "bedframe", supplierName: "Ohana" }),
  ];

  it("ranks both, worst first, in one glance", () => {
    const r = run(many);
    expect(r.byIssue[0].key).toBe("damaged");
    expect(r.byIssue[0].count).toBe(3);
    expect(r.bySupplier[0].name).toBe("Ohana");
    expect(r.bySupplier[0].count).toBe(3);
  });

  it("splits each issue by category — the breakdown Excel cannot do", () => {
    const r = run(many);
    const damaged = r.byIssue.find((i) => i.key === "damaged") as (typeof r.byIssue)[number];
    expect(damaged.byCategory.sofa).toBe(2);
    expect(damaged.byCategory.mattress).toBe(1);
    expect(damaged.byCategory.bedframe).toBe(0);
  });

  it("keeps Jess's hand count — per category, per month", () => {
    const r = run([
      aCase({ id: "a", openedAt: "2026-07-02", productCategory: "sofa" }),
      aCase({ id: "b", openedAt: "2026-07-20", productCategory: "sofa" }),
      aCase({ id: "c", openedAt: "2026-06-02", productCategory: "mattress" }),
    ]);
    const jul = r.byMonth.find((m) => m.period === "2026-07") as CaseMonthRowLike;
    expect(jul.total).toBe(2);
    expect(jul.byCategory.sofa).toBe(2);
    expect(r.byMonth.find((m) => m.period === "2026-06")?.byCategory.mattress).toBe(1);
  });

  it("never answers 'which factory' with the no-factory bucket at an equal count", () => {
    const r = run([
      aCase({ id: "1", supplierName: "Ohana" }),
      aCase({ id: "2" }),
    ]);
    expect(r.bySupplier[0].name).toBe("Ohana");
    expect(r.bySupplier[1].name).toBe(CASE_SUPPLIER_UNKNOWN_LABEL);
  });

  it("counts a factory's late cases beside its total", () => {
    const r = run([
      aCase({ id: "1", supplierName: "Ohana", openedAt: "2026-06-01" }), // running, past due
      aCase({ id: "2", supplierName: "Ohana", openedAt: "2026-07-25" }), // running, fine
    ]);
    expect(r.bySupplier[0]).toMatchObject({ name: "Ohana", count: 2, lateCount: 1 });
  });
});

type CaseMonthRowLike = { total: number; byCategory: Record<string, number> };

// ── S4's hidden responsibility field, used ───────────────────────────────────

describe("where the delays sat", () => {
  it("files every recorded reason without a second tagging pass", () => {
    const r = run([
      aCase({ id: "1", slaEvents: [slaEvent("supplier_no_date"), slaEvent("no_stock")] }),
      aCase({ id: "2", slaEvents: [slaEvent("customer_hold")] }),
    ]);
    expect(r.byResponsibility).toEqual({ supplier: 1, carres: 1, customer: 1 });
    expect(r.delayReasonsRecorded).toBe(3);
  });

  it("passes a retired reason key over rather than mis-filing it", () => {
    const r = run([aCase({ slaEvents: [slaEvent("retired_key")] })]);
    expect(r.delayReasonsRecorded).toBe(0);
    expect(r.byResponsibility).toEqual({ supplier: 0, carres: 0, customer: 0 });
  });
});

// ── The headline ─────────────────────────────────────────────────────────────

describe("the headline", () => {
  it("says nothing can be counted rather than reporting a clean month", () => {
    const r = run([aCase({ openedAt: "2026-06-16", closed: true })]);
    expect(r.headline).toContain("None of them was filed with the questions");
  });

  it("names the leading problem and the leading factory", () => {
    const r = run([
      aCase({ id: "1", issueType: "damaged", supplierName: "Ohana" }),
      aCase({ id: "2", issueType: "damaged", supplierName: "Ohana" }),
    ]);
    expect(r.headline).toContain("Damaged is the most common problem — 2 of 2.");
    expect(r.headline).toContain("Ohana carries the most: 2.");
  });

  it("states an empty period as an empty period", () => {
    expect(run([]).headline).toBe("No case was reported in this period.");
  });

  it("adds the live overdue count when there is one", () => {
    const r = run([aCase({ openedAt: "2026-06-01", issueType: "damaged" })]);
    expect(r.headline).toContain("1 case is past the deadline right now.");
  });
});

// ── The word law ─────────────────────────────────────────────────────────────

describe("COPY-STANDARD", () => {
  it("uses no banned word in any visible string", () => {
    const banned = [
      "chase",
      "pod",
      "unscheduled",
      "pending",
      "processing",
      "in progress",
      "waiting",
      "at risk",
      "attention",
      "sla",
      "inventory",
      "movements",
    ];
    const r = run([
      aCase({ id: "1", issueType: "damaged", supplierName: "Ohana", openedAt: "2026-06-01" }),
      aCase({ id: "2", openedAt: "2026-06-16", closed: true }),
    ]);
    const strings = [
      r.headline,
      r.finish.withheldReason ?? "",
      r.onTime.withheldReason ?? "",
      CASE_UNCLASSIFIED_LABEL,
      CASE_SUPPLIER_UNKNOWN_LABEL,
      ...r.byIssue.map((i) => i.label),
      caseNumbersHeadline({
        totals: { opened: 0, stillOpenLate: 0 },
        byIssue: [],
        bySupplier: [],
      }),
    ];
    for (const s of strings) {
      for (const b of banned) expect(s.toLowerCase()).not.toContain(b);
    }
  });
});
