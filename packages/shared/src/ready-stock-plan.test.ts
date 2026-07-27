import { describe, it, expect } from "vitest";
import {
  salesCoverage,
  computePlanView,
  planPoList,
  pendingConsolidation,
  planAcceptsProposals,
  planAcceptsConsolidation,
  planAwaitsDecision,
  isWeekendDate,
  daysBetween,
  MIN_HISTORY_DAYS_FOR_SUGGESTION,
  MIN_HISTORY_DAYS_FOR_BASELINE,
  OVER_SUGGESTION_MULTIPLE,
  PLAN_STATUS_LABEL,
  type PlanSalesLine,
  type PlanStockUnit,
  type PlanProposal,
} from "./ready-stock-plan";

/**
 * K2 engine tests. The first block is the one that matters most: it pins the
 * behaviour against the SHAPE OF LIVE DATA on 2026-07-27, where 100% of the
 * sales history for stock SKUs is AutoCount archive stamped to one day.
 */

const ASOF = "2026-07-27";

function sale(
  sku: string,
  qty: number,
  soldOn: string,
  extra: Partial<PlanSalesLine> = {},
): PlanSalesLine {
  return { sku, qty, soldOn, ...extra };
}

function unit(sku: string, status: string, qty = 1): PlanStockUnit {
  return { sku, status, qty };
}

function ask(sku: string, qty: number, who: string, name?: string): PlanProposal {
  return { sku, qty, proposedBy: who, proposedByName: name ?? who };
}

/** A history long enough to unlock suggestions, spread daily. */
function longHistory(sku: string, perDay: number, days: number): PlanSalesLine[] {
  const out: PlanSalesLine[] = [];
  const end = Date.UTC(2026, 6, 27);
  for (let i = 0; i < days; i++) {
    const d = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push(sale(sku, perDay, d));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The live-data trap
// ---------------------------------------------------------------------------

describe("the AutoCount archive is not demand", () => {
  // Live 2026-07-27: 37 archive orders, ALL placed_at 2026-07-23 (import day),
  // carrying every single line that matches a stock SKU.
  const archive = [
    sale("Essential Memory Pillow(L)", 36, "2026-07-23", { fromArchive: true }),
    sale("Microfiber Waterproof Mattress Protector-K", 2, "2026-07-23", {
      fromArchive: true,
    }),
  ];

  it("excludes archive lines from coverage entirely", () => {
    const cov = salesCoverage(archive, ASOF);
    expect(cov.days).toBe(0);
    expect(cov.firstSale).toBeNull();
    expect(cov.canSuggest).toBe(false);
  });

  it("reports how many it dropped instead of silently filtering", () => {
    expect(salesCoverage(archive, ASOF).archiveLinesExcluded).toBe(2);
  });

  it("does not let one import day become 36 units of recent demand", () => {
    const view = computePlanView({
      proposals: [ask("Essential Memory Pillow(L)", 100, "u1")],
      sales: archive,
      asOf: ASOF,
    });
    const row = view.rows[0];
    expect(row.sold30).toBe(0);
    expect(row.sold90).toBe(0);
  });

  it("withholds the weekend share rather than printing a confident 0%", () => {
    // 2026-07-23 is a Thursday, so a naive computation prints 0% for every SKU.
    expect(isWeekendDate("2026-07-23")).toBe(false);
    const view = computePlanView({
      proposals: [ask("Essential Memory Pillow(L)", 100, "u1")],
      sales: archive,
      asOf: ASOF,
    });
    expect(view.rows[0].weekendShare).toBeNull();
  });
});

describe("six days of real history (live shape 2026-07-21..26)", () => {
  const native = [
    sale("PILLOW-X", 3, "2026-07-21"),
    sale("PILLOW-X", 2, "2026-07-25"), // Saturday
    sale("PILLOW-X", 1, "2026-07-26"), // Sunday
  ];

  it("counts 7 days of coverage inclusive of both ends", () => {
    expect(salesCoverage(native, ASOF).days).toBe(7);
  });

  it("refuses to suggest a quantity off a baseline that thin", () => {
    const cov = salesCoverage(native, ASOF);
    expect(cov.days).toBeLessThan(MIN_HISTORY_DAYS_FOR_SUGGESTION);
    expect(cov.canSuggest).toBe(false);

    const view = computePlanView({
      proposals: [ask("PILLOW-X", 500, "u1")],
      sales: native,
      asOf: ASOF,
    });
    expect(view.rows[0].suggestedQty).toBeNull();
    expect(view.rows[0].monthlyRunRate).toBeNull();
  });

  it("still reports the raw windows, which ARE facts about the window", () => {
    const view = computePlanView({
      proposals: [ask("PILLOW-X", 10, "u1")],
      sales: native,
      asOf: ASOF,
    });
    expect(view.rows[0].sold30).toBe(6);
    expect(view.rows[0].sold90).toBe(6);
  });

  it("never fires the over-suggestion warning on a thin baseline", () => {
    // 500 asked against ~6 units of history would look 'well above average'
    // by any arithmetic — and saying so would be noise, not a warning.
    const view = computePlanView({
      proposals: [ask("PILLOW-X", 500, "u1")],
      sales: native,
      asOf: ASOF,
    });
    expect(view.rows[0].overSuggestion).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Coverage rules
// ---------------------------------------------------------------------------

describe("salesCoverage", () => {
  it("is zero with no sales at all", () => {
    const cov = salesCoverage([], ASOF);
    expect(cov).toMatchObject({ days: 0, firstSale: null, canSuggest: false });
  });

  it("unlocks suggestions at exactly the threshold", () => {
    const lines = longHistory("A", 1, MIN_HISTORY_DAYS_FOR_SUGGESTION);
    expect(salesCoverage(lines, ASOF).days).toBe(MIN_HISTORY_DAYS_FOR_SUGGESTION);
    expect(salesCoverage(lines, ASOF).canSuggest).toBe(true);
  });

  it("keeps the over-suggestion warning locked until the baseline threshold", () => {
    const short = longHistory("A", 1, MIN_HISTORY_DAYS_FOR_BASELINE - 1);
    expect(salesCoverage(short, ASOF).canWarnOverSuggestion).toBe(false);
    const long = longHistory("A", 1, MIN_HISTORY_DAYS_FOR_BASELINE);
    expect(salesCoverage(long, ASOF).canWarnOverSuggestion).toBe(true);
  });

  it("ignores cancelled orders", () => {
    const cov = salesCoverage(
      [sale("A", 5, "2026-01-01", { cancelled: true })],
      ASOF,
    );
    expect(cov.days).toBe(0);
  });

  it("daysBetween is inclusive-exclusive and signed", () => {
    expect(daysBetween("2026-07-21", "2026-07-27")).toBe(6);
    expect(daysBetween("2026-07-27", "2026-07-21")).toBe(-6);
  });
});

// ---------------------------------------------------------------------------
// The suggestion, once history exists
// ---------------------------------------------------------------------------

describe("suggestion with real history", () => {
  const sales = longHistory("A", 2, 90); // 2/day for 90 days

  it("scales the window to a 30-day run rate", () => {
    const view = computePlanView({ proposals: [ask("A", 10, "u1")], sales, asOf: ASOF });
    expect(view.rows[0].monthlyRunRate).toBeCloseTo(60, 0);
  });

  it("nets what is on the floor and on the water", () => {
    const view = computePlanView({
      proposals: [ask("A", 10, "u1")],
      units: [unit("A", "free", 20), unit("A", "incoming", 15)],
      sales,
      asOf: ASOF,
    });
    // 60 needed − 20 free − 15 incoming = 25
    expect(view.rows[0].suggestedQty).toBe(25);
    expect(view.rows[0].onHand).toBe(20);
    expect(view.rows[0].incoming).toBe(15);
  });

  it("never suggests a negative quantity", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1")],
      units: [unit("A", "free", 999)],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].suggestedQty).toBe(0);
  });

  it("does not count reserved units as cover", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1")],
      units: [unit("A", "reserved", 500)],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].reserved).toBe(500);
    expect(view.rows[0].suggestedQty).toBe(60);
  });

  it("sums bulk qty rather than counting rows (the 0218 register)", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1")],
      units: [unit("A", "free", 555)],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].onHand).toBe(555);
  });

  it("treats a missing qty as one unit", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1")],
      units: [{ sku: "A", status: "free" }],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].onHand).toBe(1);
  });

  it("ignores sold / transferred / voided units", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1")],
      units: [unit("A", "sold", 10), unit("A", "voided", 10), unit("A", "transferred", 10)],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].onHand + view.rows[0].incoming + view.rows[0].reserved).toBe(0);
  });

  it("ignores future-dated sales rather than inflating a window", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1")],
      sales: [...sales, sale("A", 9999, "2027-01-01")],
      asOf: ASOF,
    });
    expect(view.rows[0].sold30).toBeLessThan(100);
  });

  it("computes weekend share from real history", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1")],
      sales,
      asOf: ASOF,
    });
    // 2 of every 7 days are weekend, at a flat 2/day.
    expect(view.rows[0].weekendShare).toBeGreaterThan(0.2);
    expect(view.rows[0].weekendShare).toBeLessThan(0.35);
  });
});

describe("over-suggestion warning", () => {
  const sales = longHistory("A", 2, 90); // run rate 60/month

  it("fires when the ask is well above the baseline", () => {
    const view = computePlanView({
      proposals: [ask("A", Math.ceil(60 * OVER_SUGGESTION_MULTIPLE) + 10, "u1")],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].overSuggestion).toBe(true);
  });

  it("stays quiet at the baseline multiple", () => {
    const view = computePlanView({
      proposals: [ask("A", 60, "u1")],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].overSuggestion).toBe(false);
  });

  it("warns but never blocks — the ask is preserved verbatim", () => {
    const view = computePlanView({
      proposals: [ask("A", 5000, "u1")],
      sales,
      asOf: ASOF,
    });
    expect(view.rows[0].overSuggestion).toBe(true);
    expect(view.rows[0].proposedQty).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// The lane
// ---------------------------------------------------------------------------

describe("consolidating many asks into one line", () => {
  const proposals = [
    ask("A", 10, "u1", "Alvin"),
    ask("A", 15, "u2", "Mayson"),
    ask("B", 4, "u1", "Alvin"),
  ];

  it("totals every person's ask per SKU", () => {
    const view = computePlanView({ proposals, asOf: ASOF });
    const a = view.rows.find((r) => r.sku === "A")!;
    expect(a.proposedQty).toBe(25);
    expect(a.proposerCount).toBe(2);
  });

  it("keeps who asked for what, for the manager's view", () => {
    const view = computePlanView({ proposals, asOf: ASOF });
    const a = view.rows.find((r) => r.sku === "A")!;
    expect(a.proposals.map((p) => p.proposedByName)).toEqual(["Alvin", "Mayson"]);
  });

  it("counts one person twice on a SKU as ONE proposer", () => {
    const view = computePlanView({
      proposals: [ask("A", 5, "u1"), ask("A", 6, "u1")],
      asOf: ASOF,
    });
    expect(view.rows[0].proposerCount).toBe(1);
    expect(view.rows[0].proposedQty).toBe(11);
  });

  it("drops zero-quantity asks", () => {
    const view = computePlanView({ proposals: [ask("A", 0, "u1")], asOf: ASOF });
    expect(view.rows).toHaveLength(0);
  });

  it("keeps a manager-added line nobody proposed", () => {
    const view = computePlanView({
      proposals: [],
      lines: [{ sku: "Z", consolidatedQty: 12, approvedQty: null }],
      asOf: ASOF,
    });
    expect(view.rows.map((r) => r.sku)).toEqual(["Z"]);
    expect(view.rows[0].proposedQty).toBe(0);
    expect(view.rows[0].consolidatedQty).toBe(12);
  });

  it("counts what the manager has not cut yet", () => {
    const view = computePlanView({
      proposals: [ask("A", 1, "u1"), ask("B", 1, "u1")],
      lines: [{ sku: "A", consolidatedQty: 1, approvedQty: null }],
      asOf: ASOF,
    });
    expect(pendingConsolidation(view.rows)).toBe(1);
  });
});

describe("the PO list handed to Operations", () => {
  const view = () =>
    computePlanView({
      proposals: [ask("A", 10, "u1"), ask("B", 10, "u1"), ask("C", 10, "u1")],
      lines: [
        { sku: "A", consolidatedQty: 10, approvedQty: 8 },
        { sku: "B", consolidatedQty: 10, approvedQty: 0 }, // cut by the COO
        { sku: "C", consolidatedQty: 10, approvedQty: null }, // never decided
      ],
      asOf: ASOF,
    });

  it("reads the APPROVED number and nothing else", () => {
    expect(planPoList(view().rows)).toEqual([{ sku: "A", qty: 8 }]);
  });

  it("drops a line the COO cut to zero", () => {
    expect(planPoList(view().rows).some((l) => l.sku === "B")).toBe(false);
  });

  it("never falls back to the consolidated or proposed number", () => {
    expect(planPoList(view().rows).some((l) => l.sku === "C")).toBe(false);
  });

  it("is empty for a plan nobody approved", () => {
    const v = computePlanView({
      proposals: [ask("A", 99, "u1")],
      lines: [{ sku: "A", consolidatedQty: 99, approvedQty: null }],
      asOf: ASOF,
    });
    expect(planPoList(v.rows)).toEqual([]);
  });
});

describe("the cycle", () => {
  it("accepts proposals only while collecting", () => {
    expect(planAcceptsProposals("collecting")).toBe(true);
    expect(planAcceptsProposals("review")).toBe(false);
    expect(planAcceptsProposals("approved")).toBe(false);
    expect(planAcceptsProposals("rejected")).toBe(false);
  });

  it("lets the manager cut before and during review", () => {
    expect(planAcceptsConsolidation("collecting")).toBe(true);
    expect(planAcceptsConsolidation("review")).toBe(true);
    expect(planAcceptsConsolidation("approved")).toBe(false);
  });

  it("puts the decision only on a plan in review", () => {
    expect(planAwaitsDecision("review")).toBe(true);
    expect(planAwaitsDecision("collecting")).toBe(false);
    expect(planAwaitsDecision("approved")).toBe(false);
  });

  it("has a plain-English word for every state", () => {
    expect(Object.values(PLAN_STATUS_LABEL).every((v) => v.length > 0)).toBe(true);
    expect(PLAN_STATUS_LABEL.rejected).toBe("Sent back");
  });
});
