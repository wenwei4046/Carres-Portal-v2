import { describe, it, expect } from "vitest";
import {
  OVER_STOCK_MULTIPLE,
  SLOW_MOVING_WINDOWS,
  STOCK_HEALTH_LABEL,
  computeStockHealthRows,
  stockHealthCounts,
  stockHealthHeadline,
  computeSlowMovers,
  computePlanAccuracy,
  type AccuracyPlanInput,
} from "./stock-health";
import type { PlanSalesLine, PlanStockUnit } from "./ready-stock-plan";

/**
 * Stock health + proposal accuracy — Ready Stock K5.
 *
 * The tests that matter here are the ones that stop the screen LYING. Live prod
 * on 2026-07-27 holds 49 warehouse SKUs, none with a single real sale, seven
 * days of sales records and zero configured numbers — so the naive build of
 * this card flags the whole warehouse as dead stock and shows 49 green ticks at
 * the same time. Those two failures each have their own test below.
 */

const PILLOW = "Essential Memory Pillow(L)";
const MP_K = "Microfiber Waterproof Mattress Protector-K";
const SOFA = "Roma 3 Seater-Grey";

const unit = (
  sku: string,
  status: string,
  qty = 1,
): PlanStockUnit => ({ sku, status, qty });

const sale = (
  sku: string,
  soldOn: string,
  qty = 1,
  extra: Partial<PlanSalesLine> = {},
): PlanSalesLine => ({ sku, qty, soldOn, ...extra });

describe("the health ladder", () => {
  it("reads the two numbers the COO already sets — never a third", () => {
    const rows = computeStockHealthRows(
      [unit(MP_K, "free", 15), unit(MP_K, "incoming", 4)],
      [{ sku: MP_K, reorderPoint: 200 }],
      [{ sku: MP_K, reserveLevel: 5 }],
    );
    expect(rows[0]).toMatchObject({
      sku: MP_K,
      free: 15,
      incoming: 4,
      cover: 19,
      reorderPoint: 200,
      keepLevel: 5,
      // 19 > keep 5, so not critical; 19 <= point 200, so it is the buy signal.
      state: "low",
    });
  });

  it("puts the breached keep level above the buy signal", () => {
    const rows = computeStockHealthRows(
      [unit(MP_K, "free", 4)],
      [{ sku: MP_K, reorderPoint: 200 }],
      [{ sku: MP_K, reserveLevel: 5 }],
    );
    expect(rows[0].state).toBe("critical");
  });

  it("counts INCOMING as cover for the buy signal but never for the keep level", () => {
    // A container on the water stops the reorder nagging (K1's netting law) —
    // but it is not on the shelf, so it cannot un-breach the floor.
    const rows = computeStockHealthRows(
      [unit(MP_K, "free", 4), unit(MP_K, "incoming", 900)],
      [{ sku: MP_K, reorderPoint: 200 }],
      [{ sku: MP_K, reserveLevel: 5 }],
    );
    expect(rows[0]).toMatchObject({ cover: 904, state: "critical" });
  });

  it("never counts RESERVED units as available", () => {
    const rows = computeStockHealthRows(
      [unit(MP_K, "free", 4), unit(MP_K, "reserved", 40)],
      [],
      [{ sku: MP_K, reserveLevel: 5 }],
    );
    expect(rows[0]).toMatchObject({ free: 4, reserved: 40, state: "critical" });
  });

  it("calls three times the reorder point `over`", () => {
    const rows = computeStockHealthRows(
      [unit(PILLOW, "free", 600)],
      [{ sku: PILLOW, reorderPoint: 200 }],
      [],
    );
    expect(600).toBe(200 * OVER_STOCK_MULTIPLE);
    expect(rows[0].state).toBe("over");
  });

  it("calls one unit under the over-line `healthy`", () => {
    const rows = computeStockHealthRows(
      [unit(PILLOW, "free", 599)],
      [{ sku: PILLOW, reorderPoint: 200 }],
      [],
    );
    expect(rows[0].state).toBe("healthy");
  });

  /**
   * THE LIVE CASE. All 49 prod SKUs have no number of either kind. A ladder
   * that defaulted them to `healthy` would open the review layer with 49 green
   * ticks on a warehouse nobody has configured — K1's law, restated.
   */
  it("says `unrated`, never a green tick, when nobody has set a number", () => {
    const rows = computeStockHealthRows(
      [unit(PILLOW, "free", 555), unit(MP_K, "free", 15), unit(SOFA, "free", 2)],
      [],
      [],
    );
    expect(rows.every((r) => r.state === "unrated")).toBe(true);
    expect(STOCK_HEALTH_LABEL.unrated).toBe("Set a number");
    const counts = stockHealthCounts(rows);
    expect(counts).toMatchObject({ unrated: 3, healthy: 0, critical: 0 });
    expect(stockHealthHeadline(counts)).toBe(
      "Nothing is watched yet — 3 items still need a number.",
    );
  });

  it("treats 0 as the OFF switch both K1 and K4 already document", () => {
    const rows = computeStockHealthRows(
      [unit(PILLOW, "free", 0)],
      [{ sku: PILLOW, reorderPoint: 0 }],
      [{ sku: PILLOW, reserveLevel: 0 }],
    );
    // Zero free stock against two switched-off numbers is not an alarm and is
    // not "nobody looked" either — somebody looked and turned it off.
    expect(rows[0].state).toBe("healthy");
  });

  it("keeps a SKU on the ladder after its last unit leaves the building", () => {
    const rows = computeStockHealthRows(
      [],
      [{ sku: MP_K, reorderPoint: 200 }],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sku: MP_K, free: 0, state: "low" });
  });

  it("shows a newly imported SKU asking for its number", () => {
    const rows = computeStockHealthRows([unit("New Topper-Q", "free", 8)], [], []);
    expect(rows[0]).toMatchObject({ sku: "New Topper-Q", state: "unrated" });
  });

  it("sorts worst first, then thinnest cover", () => {
    const rows = computeStockHealthRows(
      [
        unit("A", "free", 500),
        unit("B", "free", 2),
        unit("C", "free", 30),
        unit("D", "free", 9),
      ],
      [
        { sku: "A", reorderPoint: 100 },
        { sku: "B", reorderPoint: 100 },
        { sku: "C", reorderPoint: 100 },
      ],
      [{ sku: "B", reserveLevel: 5 }],
    );
    expect(rows.map((r) => r.sku)).toEqual(["B", "C", "A", "D"]);
    expect(rows.map((r) => r.state)).toEqual(["critical", "low", "over", "unrated"]);
  });

  it("headlines the worst rung that has anybody in it", () => {
    expect(
      stockHealthHeadline({ critical: 2, low: 5, over: 1, healthy: 9, unrated: 0 }),
    ).toBe("2 items are below the keep level.");
    expect(
      stockHealthHeadline({ critical: 0, low: 1, over: 1, healthy: 9, unrated: 3 }),
    ).toBe("1 item is at the reorder point.");
    expect(
      stockHealthHeadline({ critical: 0, low: 0, over: 4, healthy: 9, unrated: 0 }),
    ).toBe("4 items are far above the reorder point.");
    expect(
      stockHealthHeadline({ critical: 0, low: 0, over: 0, healthy: 9, unrated: 2 }),
    ).toBe("All 9 watched items have enough.");
    expect(
      stockHealthHeadline({ critical: 0, low: 0, over: 0, healthy: 0, unrated: 0 }),
    ).toBe("No stock on the floor to watch.");
  });
});

describe("the slow-moving alert", () => {
  /**
   * THE LIVE CASE, and the reason this whole gate exists. Prod keeps seven days
   * of real sales records and not one of the 49 warehouse SKUs appears in them.
   * "No sales in 90 days" is technically true of every single one — and naming
   * the entire warehouse is the same as naming nothing.
   */
  it("stays silent while the records are shorter than the window", () => {
    const report = computeSlowMovers({
      units: [unit(PILLOW, "free", 555), unit(MP_K, "free", 15)],
      sales: [
        // The only real sale on file — a sofa, not a warehouse SKU.
        sale(SOFA, "2026-07-21"),
        // 37 AutoCount archive rows, all stamped the day they were imported.
        sale(PILLOW, "2026-07-23", 36, { fromArchive: true }),
      ],
      asOf: "2026-07-27",
    });
    expect(report.coverage.days).toBe(7);
    expect(report.rows).toEqual([]);
    expect(report.windows.every((w) => !w.ready && w.count === 0)).toBe(true);
    expect(report.withheldReason).toContain("go back 7 days");
  });

  it("switches itself on once the records span the window", () => {
    const report = computeSlowMovers({
      units: [unit(PILLOW, "free", 555), unit(SOFA, "free", 2)],
      sales: [sale(SOFA, "2026-01-02"), sale(SOFA, "2026-07-20")],
      asOf: "2026-07-27",
    });
    expect(report.windows.find((w) => w.days === 90)!.ready).toBe(true);
    expect(report.withheldReason).toBeNull();
    // The pillow has never sold; the sofa sold a week ago.
    expect(report.rows.map((r) => r.sku)).toEqual([PILLOW]);
    expect(report.rows[0]).toMatchObject({ quietDays: 207, window: 180, free: 555 });
  });

  it("never claims more days of silence than the records hold", () => {
    // Records go back exactly 90 days and the pillow has never sold. It is 90
    // days quiet — NOT "never sold", which would imply forever.
    const report = computeSlowMovers({
      units: [unit(PILLOW, "free", 10)],
      sales: [sale(SOFA, "2026-04-29")],
      asOf: "2026-07-27",
    });
    expect(report.coverage.days).toBe(90);
    expect(report.rows[0]).toMatchObject({ quietDays: 90, lastSoldOn: null, window: 90 });
    // 180 is not ready, so it counts nobody even though 90 days qualifies for
    // nothing about 180 either way.
    expect(report.windows.find((w) => w.days === 180)!.count).toBe(0);
  });

  it("does not let an archive row revive a dead SKU", () => {
    const report = computeSlowMovers({
      units: [unit(PILLOW, "free", 555)],
      sales: [
        sale(SOFA, "2026-01-02"),
        // Imported yesterday. It is not a sale that happened yesterday.
        sale(PILLOW, "2026-07-23", 36, { fromArchive: true }),
      ],
      asOf: "2026-07-27",
    });
    expect(report.rows.map((r) => r.sku)).toEqual([PILLOW]);
    expect(report.rows[0].lastSoldOn).toBeNull();
  });

  it("ignores a cancelled order — a cancelled sale is not a sale", () => {
    const report = computeSlowMovers({
      units: [unit(PILLOW, "free", 5)],
      sales: [
        sale(SOFA, "2026-01-02"),
        sale(PILLOW, "2026-07-20", 1, { cancelled: true }),
      ],
      asOf: "2026-07-27",
    });
    expect(report.rows.map((r) => r.sku)).toEqual([PILLOW]);
  });

  it("leaves out a SKU with nothing free — reserved stock is leaving, not sitting", () => {
    const report = computeSlowMovers({
      units: [unit(PILLOW, "reserved", 555), unit(MP_K, "incoming", 300)],
      sales: [sale(SOFA, "2026-01-02")],
      asOf: "2026-07-27",
    });
    expect(report.rows).toEqual([]);
  });

  it("names the deepest window a SKU has crossed", () => {
    expect(SLOW_MOVING_WINDOWS).toEqual([90, 180]);
    const report = computeSlowMovers({
      units: [unit(PILLOW, "free", 5), unit(MP_K, "free", 5)],
      sales: [
        sale(SOFA, "2025-12-01"),
        sale(PILLOW, "2026-03-01"), // 148 days quiet → 90 only
        sale(MP_K, "2025-12-05"), // 234 days quiet → 180
      ],
      asOf: "2026-07-27",
    });
    expect(report.rows.map((r) => [r.sku, r.window])).toEqual([
      [MP_K, 180],
      [PILLOW, 90],
    ]);
    expect(report.windows.find((w) => w.days === 90)!.count).toBe(2);
    expect(report.windows.find((w) => w.days === 180)!.count).toBe(1);
  });
});

/**
 * The API hands the engine a WINDOW of order lines, not every row ever written.
 * Both of these would be confident lies without `salesKnownFrom`.
 */
describe("how far back the caller actually looked", () => {
  it("does not let the window's own oldest line pass for `our records start here`", () => {
    const withoutIt = computeSlowMovers({
      units: [unit(PILLOW, "free", 555)],
      sales: [sale(SOFA, "2026-01-02")], // the oldest row IN THE WINDOW
      asOf: "2026-07-27",
    });
    expect(withoutIt.windows.find((w) => w.days === 90)!.ready).toBe(true);

    // The window reaches back to January, but the company only started keeping
    // records a week ago. Nothing may be called slow.
    const truthful = computeSlowMovers({
      units: [unit(PILLOW, "free", 555)],
      sales: [sale(SOFA, "2026-01-02")],
      asOf: "2026-07-27",
      salesKnownFrom: "2026-07-21",
    });
    expect(truthful.coverage.days).toBe(7);
    expect(truthful.rows).toEqual([]);
    expect(truthful.withheldReason).toContain("go back 7 days");
  });

  it("withholds a month the fetched window never covered", () => {
    const out = computePlanAccuracy({
      plans: [
        {
          period: "2025-03",
          status: "approved",
          proposals: [{ sku: PILLOW, qty: 10, proposedBy: "u-1" }],
          lines: [{ sku: PILLOW, consolidatedQty: 10, approvedQty: 10 }],
        },
      ],
      units: [],
      sales: [sale(PILLOW, "2026-01-02")],
      asOf: "2026-07-27",
      salesKnownFrom: "2025-06-23",
    });
    // Sold would otherwise read 0 and print "nothing we ordered ever moved".
    expect(out[0]).toMatchObject({
      reported: false,
      withheld: "records_start_later",
    });
  });
});

describe("proposal accuracy", () => {
  const plan = (over: Partial<AccuracyPlanInput> = {}): AccuracyPlanInput => ({
    period: "2026-06",
    status: "approved",
    proposals: [{ sku: PILLOW, qty: 300, proposedBy: "u-1" }],
    lines: [{ sku: PILLOW, consolidatedQty: 250, approvedQty: 200 }],
    ...over,
  });

  it("reports asked · ordered · sold · still on the floor for a finished month", () => {
    const out = computePlanAccuracy({
      plans: [plan()],
      units: [unit(PILLOW, "free", 60)],
      sales: [sale(PILLOW, "2026-05-02"), sale(PILLOW, "2026-06-15", 140)],
      asOf: "2026-07-27",
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      period: "2026-06",
      reported: true,
      withheld: null,
      askedQty: 300,
      orderedQty: 200,
      soldQty: 140,
      leftOnFloor: 60,
      movedPct: 70,
    });
    expect(out[0].rows[0]).toMatchObject({ sku: PILLOW, movedPct: 70 });
  });

  /** Rule C — HR-P7's law, restated for a different number. */
  it("withholds a month that is still running", () => {
    const out = computePlanAccuracy({
      plans: [plan({ period: "2026-07" })],
      units: [unit(PILLOW, "free", 60)],
      sales: [sale(PILLOW, "2026-05-02"), sale(PILLOW, "2026-07-15", 10)],
      asOf: "2026-07-27",
    });
    expect(out[0]).toMatchObject({
      reported: false,
      withheld: "month_not_over",
      soldQty: 0,
      movedPct: null,
    });
    expect(out[0].rows).toEqual([]);
    // The ask and the order are facts already on file — those still print.
    expect(out[0]).toMatchObject({ askedQty: 300, orderedQty: 200 });
  });

  it("withholds a month that began before we kept records", () => {
    const out = computePlanAccuracy({
      plans: [plan()],
      units: [unit(PILLOW, "free", 60)],
      // Records start 2026-07-21 — nothing can be said about June's demand.
      sales: [sale(SOFA, "2026-07-21")],
      asOf: "2026-07-27",
    });
    expect(out[0]).toMatchObject({
      reported: false,
      withheld: "records_start_later",
      movedPct: null,
    });
  });

  it("measures only APPROVED cycles — an unapproved plan ordered nothing", () => {
    const out = computePlanAccuracy({
      plans: [
        plan({ period: "2026-06", status: "review" }),
        plan({ period: "2026-05", status: "rejected" }),
        plan({ period: "2026-04", status: "collecting" }),
      ],
      units: [],
      sales: [sale(PILLOW, "2026-01-02")],
      asOf: "2026-07-27",
    });
    expect(out).toEqual([]);
  });

  it("reads the APPROVED number, never the manager's cut", () => {
    const out = computePlanAccuracy({
      plans: [
        plan({ lines: [{ sku: PILLOW, consolidatedQty: 250, approvedQty: 0 }] }),
      ],
      units: [],
      sales: [sale(PILLOW, "2026-01-02"), sale(PILLOW, "2026-06-15", 40)],
      asOf: "2026-07-27",
    });
    // Cut to zero = ordered nothing. The ask stays visible; the percent cannot
    // be computed against zero and says so rather than printing 0%.
    expect(out[0]).toMatchObject({ orderedQty: 0, movedPct: null, askedQty: 300 });
  });

  it("shows under-ordering as over 100%, not as a capped success", () => {
    const out = computePlanAccuracy({
      plans: [plan()],
      units: [unit(PILLOW, "free", 0)],
      sales: [sale(PILLOW, "2026-01-02"), sale(PILLOW, "2026-06-15", 260)],
      asOf: "2026-07-27",
    });
    expect(out[0].movedPct).toBe(130);
  });

  it("counts only that month's sales, and no archive rows", () => {
    const out = computePlanAccuracy({
      plans: [plan()],
      units: [],
      sales: [
        sale(PILLOW, "2026-01-02"),
        sale(PILLOW, "2026-06-15", 100),
        sale(PILLOW, "2026-07-02", 500), // a different month
        sale(PILLOW, "2026-06-20", 999, { fromArchive: true }),
        sale(PILLOW, "2026-06-21", 50, { cancelled: true }),
      ],
      asOf: "2026-07-27",
    });
    expect(out[0].soldQty).toBe(100);
  });

  it("returns newest month first", () => {
    const out = computePlanAccuracy({
      plans: [plan({ period: "2026-04" }), plan({ period: "2026-06" })],
      units: [],
      sales: [sale(PILLOW, "2026-01-02")],
      asOf: "2026-07-27",
    });
    expect(out.map((m) => m.period)).toEqual(["2026-06", "2026-04"]);
  });

  it("has nothing to say when no cycle was ever opened — today's live answer", () => {
    expect(
      computePlanAccuracy({ plans: [], units: [], sales: [], asOf: "2026-07-27" }),
    ).toEqual([]);
  });
});
