/**
 * Stock health + proposal accuracy — Ready Stock card K5
 * (`docs/ready-stock-execution-queue.md`, Jess-locked 2026-07-27).
 *
 * THE CARD: "the review layer. Stock health per SKU (🟢 healthy · 🟡 low ·
 * 🟠 over-stocked · 🔴 critical) + slow-moving alert (no sales 90/180 days) +
 * per-month proposal accuracy (requested vs sold vs remaining) so planning
 * improves instead of repeating. Done when: COO opens one tab and knows what
 * needs attention today — without reading SKU rows."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIVE FINDING THAT SHAPED THIS FILE (measured on prod 2026-07-27):
 *
 *   • 49 warehouse SKUs. **ZERO of them has a single real sale.** All nine with
 *     any sales history at all get 100% of it from the AutoCount archive, whose
 *     `placed_at` is the day the rows were imported (0265's law, and K2's
 *     header measures it in full).
 *   • Real sales records span 2026-07-21..26 — SEVEN DAYS.
 *
 * Compute the card the obvious way against that and the screen lies twice:
 *
 *   1. "No sales in 90 days" would be TRUE of all 49 SKUs — the entire
 *      warehouse flagged as dead stock on a company seven days into keeping
 *      records. A list that names everything names nothing.
 *   2. An "over-stocked" rung derived from a run rate would be just as bad: the
 *      run rate is 0 units/month for every SKU, so every SKU covers infinite
 *      months of demand and the whole floor reads 🟠.
 *
 * Three rules follow, and they are why this layer can be trusted:
 *
 *   A. THE LADDER READS THE NUMBERS A HUMAN SET, NOT A RUN RATE. K1 already
 *      asks the COO when to BUY (`ops_reorder_points`) and K4 asks how low it
 *      may GO (`ops_stock_reserve_levels`). K5 adds no third number and no
 *      second buy signal — it reads those two and adds only the two rungs
 *      neither of them has (`over`, `healthy`).
 *   B. AN ALERT MAY NOT NAME MORE DAYS THAN THE RECORDS HOLD. The 90- and
 *      180-day alerts stay silent until the records actually span 90 and 180
 *      days, and a SKU that has never sold is reported as silent for
 *      `coverage.days` — never for longer than we can see. Both windows switch
 *      themselves on as real days accumulate; there is nothing to configure.
 *   C. A MONTH IN PROGRESS DOES NOT GET AN ACCURACY FIGURE. Half a month of
 *      sales against a full month of ordering says a good plan failed
 *      (HR-P7's law, and K2's coverage gate, restated for a different number).
 *
 * D. AND `unrated` IS A FIRST-CLASS STATE. Today every one of the 49 SKUs is
 *    unrated, so a ladder that defaulted them to 🟢 would open with 49 green
 *    ticks on a warehouse nobody has configured. K1's law: a quiet screen must
 *    mean "watched and fine", never "nobody has looked".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pure and deterministic (the contract every K-card engine keeps): the API
 * decides, the browser renders the answer, so the two can never present
 * different arithmetic.
 *
 * NO MIGRATION. K5 reads `ops_stock_items`, `ops_reorder_points`,
 * `ops_stock_reserve_levels` and K2's plan tables. It writes nothing, mints no
 * duty key and adds no table — it is the review layer, and a review layer that
 * needed its own state would be a fourth number to keep in step with three.
 */

import type { IsoDate } from "./working-days";
import type { ReorderPointConfig } from "./reorder-alert";
import type { ReserveLevelConfig } from "./pool-usage";
import type {
  PlanLine,
  PlanProposal,
  PlanSalesLine,
  PlanStatus,
  PlanStockUnit,
  SalesCoverage,
} from "./ready-stock-plan";
import {
  MIN_HISTORY_DAYS_FOR_BASELINE,
  MIN_HISTORY_DAYS_FOR_SUGGESTION,
  aggregateStockUnits,
  daysBetween,
  salesCoverage,
} from "./ready-stock-plan";

// ── The ladder ──────────────────────────────────────────────────────────────

/**
 * How much cover, as a multiple of the COO's own reorder point, counts as
 * "more than we need".
 *
 * Derived from the number a human already set rather than from a demand
 * forecast — see rule A. A reorder point is the level at which you buy more, so
 * holding three times it means roughly two whole re-buys are sitting on the
 * floor. Deliberately generous: a false 🟠 on a warehouse this size costs more
 * trust than a missed one costs money.
 */
export const OVER_STOCK_MULTIPLE = 3;

/** The windows the card names for the slow-moving alert. */
export const SLOW_MOVING_WINDOWS = [90, 180] as const;
export type SlowMovingWindow = (typeof SLOW_MOVING_WINDOWS)[number];

/**
 * - `critical` — free stock is at or below the keep level (K4). The floor the
 *   COO set has been breached; this is the loudest thing on the page.
 * - `low`      — cover is at or below the reorder point (K1). Same judgement
 *   K1's own alert makes; K5 reads it rather than making a second one.
 * - `over`     — cover is `OVER_STOCK_MULTIPLE` times the reorder point.
 * - `healthy`  — at least one number is set and none of the above is true.
 * - `unrated`  — no number set at all. Reads "Set a number" (rule D).
 */
export const STOCK_HEALTH_STATES = [
  "critical",
  "low",
  "over",
  "healthy",
  "unrated",
] as const;
export type StockHealthState = (typeof STOCK_HEALTH_STATES)[number];

/**
 * The words on screen — one place, so the pill, the digest sentence and any
 * later consumer cannot drift.
 *
 * Every noun here is already shipped elsewhere: "reorder point" and "Enough"
 * are K1's, "keep level" is K4's "Keep {n}", "Set a number" is both of theirs.
 * Facts, never verbs — COPY-STANDARD: a badge states a fact, the action line
 * says what to do.
 */
export const STOCK_HEALTH_LABEL: Record<StockHealthState, string> = {
  critical: "Below the keep level",
  low: "At the reorder point",
  over: "Far above the reorder point",
  healthy: "Enough",
  unrated: "Set a number",
};

export interface StockHealthRow {
  sku: string;
  /** Free units on the floor — K1's law: summed from `qty`, never counted. */
  free: number;
  /** Spoken for by an order. Context only, never counted as available. */
  reserved: number;
  /** Ordered and not yet arrived. */
  incoming: number;
  /** free + incoming — what the reorder point is compared against (K1). */
  cover: number;
  /** K1's number, when the COO has set one. */
  reorderPoint: number | null;
  /** K4's number, when the COO has set one. */
  keepLevel: number | null;
  state: StockHealthState;
}

/** Rank for sorting and for reading the digest worst-first. */
const HEALTH_RANK: Record<StockHealthState, number> = {
  critical: 0,
  low: 1,
  over: 2,
  unrated: 3,
  healthy: 4,
};

export type StockHealthCounts = Record<StockHealthState, number>;

/**
 * The ladder, per SKU.
 *
 * The row set is the union of every SKU carrying either number (so a level
 * survives the last unit leaving the building — exactly when it matters most)
 * and every SKU currently holding stock (so a newly imported item shows up
 * asking for its number instead of hiding until somebody notices it is gone).
 * Same union rule as `computeReorderRows` and `computeReserveLevelRows`; it is
 * repeated because it is the rule, not because it is convenient.
 */
export function computeStockHealthRows(
  units: readonly PlanStockUnit[],
  points: readonly ReorderPointConfig[],
  levels: readonly ReserveLevelConfig[],
): StockHealthRow[] {
  const pointBySku = new Map<string, number>();
  for (const p of points) {
    const key = p.sku?.trim();
    if (key) pointBySku.set(key, Math.max(0, Math.floor(p.reorderPoint)));
  }
  const levelBySku = new Map<string, number>();
  for (const l of levels) {
    const key = l.sku?.trim();
    if (key) levelBySku.set(key, Math.max(0, Math.floor(l.reserveLevel)));
  }

  const stock = aggregateStockUnits(units);
  const skus = new Set<string>([...pointBySku.keys(), ...levelBySku.keys()]);
  for (const [sku, counts] of stock) {
    if (counts.free > 0 || counts.reserved > 0 || counts.incoming > 0) skus.add(sku);
  }

  const rows: StockHealthRow[] = [];
  for (const sku of skus) {
    const counts = stock.get(sku) ?? { free: 0, reserved: 0, incoming: 0 };
    const point = pointBySku.get(sku) ?? null;
    const keep = levelBySku.get(sku) ?? null;
    const cover = counts.free + counts.incoming;

    rows.push({
      sku,
      free: counts.free,
      reserved: counts.reserved,
      incoming: counts.incoming,
      cover,
      reorderPoint: point,
      keepLevel: keep,
      state: healthStateOf({ free: counts.free, cover, point, keep }),
    });
  }

  rows.sort((a, b) => {
    if (HEALTH_RANK[a.state] !== HEALTH_RANK[b.state])
      return HEALTH_RANK[a.state] - HEALTH_RANK[b.state];
    if (a.cover !== b.cover) return a.cover - b.cover;
    return a.sku.localeCompare(b.sku);
  });
  return rows;
}

/**
 * The ladder itself, in one place.
 *
 * Order matters and is the business order: the floor being breached outranks
 * the buy signal, which outranks holding too much. A `0` in either number is
 * the documented OFF switch both K1 and K4 already use — it silences that
 * number's rung without deleting the row (which would just re-appear as
 * `unrated`), so a SKU switched off on both reads `healthy`, not `unrated`:
 * somebody HAS looked at it.
 */
function healthStateOf(input: {
  free: number;
  cover: number;
  point: number | null;
  keep: number | null;
}): StockHealthState {
  const { free, cover, point, keep } = input;
  if (point == null && keep == null) return "unrated";
  if (keep != null && keep > 0 && free <= keep) return "critical";
  if (point != null && point > 0 && cover <= point) return "low";
  if (point != null && point > 0 && cover >= point * OVER_STOCK_MULTIPLE)
    return "over";
  return "healthy";
}

export function stockHealthCounts(
  rows: readonly StockHealthRow[],
): StockHealthCounts {
  const counts: StockHealthCounts = {
    critical: 0,
    low: 0,
    over: 0,
    healthy: 0,
    unrated: 0,
  };
  for (const r of rows) counts[r.state] += 1;
  return counts;
}

/**
 * The one line the COO reads instead of the rows — the card's own Done-when
 * ("knows what needs attention today — without reading SKU rows").
 *
 * It names the worst rung that has anybody in it, and when nothing is rated it
 * says THAT rather than reporting a healthy warehouse. Today, live, that is the
 * true answer for all 49 SKUs.
 */
export function stockHealthHeadline(counts: StockHealthCounts): string {
  const rated =
    counts.critical + counts.low + counts.over + counts.healthy;
  if (rated === 0)
    return counts.unrated === 0
      ? "No stock on the floor to watch."
      : `Nothing is watched yet — ${counts.unrated} ${items(counts.unrated)} still need a number.`;
  if (counts.critical > 0)
    return `${counts.critical} ${items(counts.critical)} ${isAre(counts.critical)} below the keep level.`;
  if (counts.low > 0)
    return `${counts.low} ${items(counts.low)} ${isAre(counts.low)} at the reorder point.`;
  if (counts.over > 0)
    return `${counts.over} ${items(counts.over)} ${isAre(counts.over)} far above the reorder point.`;
  return `All ${rated} watched ${items(rated)} have enough.`;
}

function items(n: number): string {
  return n === 1 ? "item" : "items";
}
function isAre(n: number): string {
  return n === 1 ? "is" : "are";
}

// ── Coverage, when the caller only has a WINDOW of the records ──────────────

/**
 * How far back the caller actually LOOKED.
 *
 * `salesCoverage` measures from the earliest line it is handed, which is the
 * right answer only when it is handed everything. The API hands these two
 * functions a bounded window of `order_lines`, so on its own the coverage would
 * be wrong in BOTH directions, and both are lies a screen would state
 * confidently:
 *
 *   • too SHORT — a SKU that genuinely sold 200 days ago sits outside a
 *     120-day window, so it looks like it has never sold at all; and
 *   • too LONG — the window's own oldest line becomes "when our records
 *     start", so the 90-day alert would switch on the day the window does.
 *
 * `salesKnownFrom` is the caller's honest answer: the earliest date for which
 * the handed lines are COMPLETE — the later of "when the first real order was
 * placed" and "where the window starts". When it is given it is authoritative,
 * because the caller is the only party that knows what it did not fetch.
 */
function withSalesKnownFrom(
  coverage: SalesCoverage,
  salesKnownFrom: IsoDate | null | undefined,
  asOf: IsoDate,
): SalesCoverage {
  const from = salesKnownFrom?.slice(0, 10);
  if (!from) return coverage;
  const days = Math.max(0, daysBetween(from, asOf) + 1);
  return {
    ...coverage,
    firstSale: from,
    days,
    canSuggest: days >= MIN_HISTORY_DAYS_FOR_SUGGESTION,
    canWarnOverSuggestion: days >= MIN_HISTORY_DAYS_FOR_BASELINE,
  };
}

// ── The slow-moving alert ───────────────────────────────────────────────────

export interface SlowMover {
  sku: string;
  /** Free units sitting there. Only stock still on the floor can be slow. */
  free: number;
  /** The last real (non-archive) sale, or null when there has never been one. */
  lastSoldOn: IsoDate | null;
  /**
   * Days of silence. When a SKU has never sold, this is how far the RECORDS go
   * back — never further (rule B). So it is a floor on the truth, never a claim
   * beyond it.
   */
  quietDays: number;
  /** The deepest window it has crossed: 180 outranks 90. */
  window: SlowMovingWindow;
}

export interface SlowMovingWindowResult {
  days: SlowMovingWindow;
  /** Do the records span this window? Until they do, the alert stays silent. */
  ready: boolean;
  /** How many SKUs it names. 0 while `ready` is false, by construction. */
  count: number;
}

export interface SlowMovingReport {
  coverage: SalesCoverage;
  windows: SlowMovingWindowResult[];
  /** Every named SKU, worst (longest quiet) first. */
  rows: SlowMover[];
  /**
   * Why the alert is silent, when it is silent for a reason other than "nothing
   * is slow". Null when at least one window is live. The screen prints this
   * instead of an empty tick, so a quiet alert never reads as an all-clear.
   */
  withheldReason: string | null;
}

/**
 * "Nothing has sold for 90 / 180 days" — but only once the records can say so.
 *
 * A SKU qualifies when it holds free stock AND has been quiet for at least the
 * window. Reserved units are excluded: they are leaving, which is the opposite
 * of slow.
 */
export function computeSlowMovers(input: {
  units: readonly PlanStockUnit[];
  sales: readonly PlanSalesLine[];
  asOf: IsoDate;
  /** The earliest date the handed `sales` are COMPLETE from. See the helper. */
  salesKnownFrom?: IsoDate | null;
}): SlowMovingReport {
  const coverage = withSalesKnownFrom(
    salesCoverage(input.sales, input.asOf),
    input.salesKnownFrom,
    input.asOf,
  );
  const stock = aggregateStockUnits(input.units);

  // Last REAL sale per SKU. Archive rows carry their import date, so counting
  // them would date a year of history to one afternoon (0265 / K2's header) —
  // and here it would do the opposite harm to everywhere else: it would make a
  // genuinely dead SKU look like it sold last week.
  const lastSale = new Map<string, IsoDate>();
  for (const l of input.sales) {
    if (l.fromArchive || l.cancelled) continue;
    const sku = l.sku?.trim();
    if (!sku || (l.qty ?? 0) <= 0) continue;
    const day = l.soldOn.slice(0, 10);
    if (daysBetween(day, input.asOf) < 0) continue; // future-dated = data error
    const seen = lastSale.get(sku);
    if (!seen || day > seen) lastSale.set(sku, day);
  }

  const windows: SlowMovingWindowResult[] = SLOW_MOVING_WINDOWS.map((days) => ({
    days,
    ready: coverage.days >= days,
    count: 0,
  }));
  const live = windows.filter((w) => w.ready).map((w) => w.days);

  const rows: SlowMover[] = [];
  if (live.length > 0) {
    for (const [sku, counts] of stock) {
      if (counts.free <= 0) continue;
      const last = lastSale.get(sku) ?? null;
      // Never sold inside the records → quiet for as long as the records run.
      const quietDays = last ? daysBetween(last, input.asOf) : coverage.days;
      const crossed = live.filter((w) => quietDays >= w);
      if (crossed.length === 0) continue;
      rows.push({
        sku,
        free: counts.free,
        lastSoldOn: last,
        quietDays,
        window: Math.max(...crossed) as SlowMovingWindow,
      });
    }
  }

  rows.sort(
    (a, b) => b.quietDays - a.quietDays || b.free - a.free || a.sku.localeCompare(b.sku),
  );
  // A window that is not ready counts NOTHING, even when a row in the list has
  // been quiet long enough to qualify for it: the records cannot yet tell 180
  // days of silence from 100, and a count is a claim.
  for (const w of windows)
    w.count = w.ready ? rows.filter((r) => r.quietDays >= w.days).length : 0;

  return {
    coverage,
    windows,
    rows,
    withheldReason:
      live.length > 0
        ? null
        : `Sales records go back ${coverage.days} ${coverage.days === 1 ? "day" : "days"}. The 90-day alert appears by itself once they go back 90.`,
  };
}

// ── Proposal accuracy ───────────────────────────────────────────────────────

/** One K2 cycle, reduced to what the review layer needs. */
export interface AccuracyPlanInput {
  /** `YYYY-MM`. */
  period: string;
  status: PlanStatus;
  lines: readonly PlanLine[];
  proposals: readonly PlanProposal[];
}

export interface AccuracyRow {
  sku: string;
  /** What people asked for, before anybody cut it. */
  askedQty: number;
  /** What the COO approved — what was actually ordered (K2's PO list law). */
  orderedQty: number;
  /** Units sold that month. Real sales only; archive rows are not demand. */
  soldQty: number;
  /** Free units of it still on the floor — a fact about NOW, not month-end. */
  leftOnFloor: number;
  /** `soldQty` as a percent of `orderedQty`. Null when nothing was ordered. */
  movedPct: number | null;
}

/** Why a month's figures are withheld. Null when they are printed. */
export type AccuracyWithheld = "month_not_over" | "records_start_later";

export interface MonthAccuracy {
  period: string;
  /** May the figures be printed at all? */
  reported: boolean;
  withheld: AccuracyWithheld | null;
  askedQty: number;
  orderedQty: number;
  soldQty: number;
  leftOnFloor: number;
  /** Whole percent of the approved quantity that moved. Null when nothing was. */
  movedPct: number | null;
  rows: AccuracyRow[];
}

function monthEnd(period: string): IsoDate {
  const [y, m] = period.split("-").map(Number);
  // Day 0 of the next month = the last day of this one.
  return new Date(Date.UTC(y, m ?? 1, 0)).toISOString().slice(0, 10);
}

function monthStart(period: string): IsoDate {
  return `${period}-01`;
}

/**
 * Did the plan work? — per month, `requested vs sold vs remaining`.
 *
 * Only APPROVED cycles are measured: a plan nobody approved ordered nothing, so
 * there is nothing to have been right or wrong about. And a month still running
 * is withheld rather than printed (rule C) — half a month of sales against a
 * full month of ordering makes a good plan look like a bad one, which is the
 * exact failure HR-P7's people-cost ratio refuses.
 *
 * `leftOnFloor` is deliberately TODAY's free stock, not a month-end snapshot:
 * the register keeps no history, and inventing one from movements would be a
 * second source of truth for a number the shelf already answers. The screen
 * says "still on the floor" so nobody reads it as a month-end figure.
 */
export function computePlanAccuracy(input: {
  plans: readonly AccuracyPlanInput[];
  units: readonly PlanStockUnit[];
  sales: readonly PlanSalesLine[];
  asOf: IsoDate;
  /** The earliest date the handed `sales` are COMPLETE from. See the helper. */
  salesKnownFrom?: IsoDate | null;
}): MonthAccuracy[] {
  const coverage = withSalesKnownFrom(
    salesCoverage(input.sales, input.asOf),
    input.salesKnownFrom,
    input.asOf,
  );
  const stock = aggregateStockUnits(input.units);

  // Real sales per SKU per month. Archive excluded at the source (0265's law).
  const soldByMonth = new Map<string, Map<string, number>>();
  for (const l of input.sales) {
    if (l.fromArchive || l.cancelled) continue;
    const sku = l.sku?.trim();
    if (!sku || (l.qty ?? 0) <= 0) continue;
    const day = l.soldOn.slice(0, 10);
    if (daysBetween(day, input.asOf) < 0) continue;
    const month = day.slice(0, 7);
    const bucket = soldByMonth.get(month) ?? new Map<string, number>();
    bucket.set(sku, (bucket.get(sku) ?? 0) + Math.floor(l.qty));
    soldByMonth.set(month, bucket);
  }

  const out: MonthAccuracy[] = [];
  for (const plan of input.plans) {
    if (plan.status !== "approved") continue;
    const period = plan.period.slice(0, 7);

    const asked = new Map<string, number>();
    for (const p of plan.proposals) {
      const sku = p.sku?.trim();
      if (!sku || (p.qty ?? 0) <= 0) continue;
      asked.set(sku, (asked.get(sku) ?? 0) + Math.floor(p.qty));
    }
    const ordered = new Map<string, number>();
    for (const l of plan.lines) {
      const sku = l.sku?.trim();
      if (!sku) continue;
      const qty = l.approvedQty ?? 0;
      if (qty > 0) ordered.set(sku, qty);
    }

    const sold = soldByMonth.get(period) ?? new Map<string, number>();
    const rows: AccuracyRow[] = [];
    for (const sku of new Set([...asked.keys(), ...ordered.keys()])) {
      const orderedQty = ordered.get(sku) ?? 0;
      const soldQty = sold.get(sku) ?? 0;
      rows.push({
        sku,
        askedQty: asked.get(sku) ?? 0,
        orderedQty,
        soldQty,
        leftOnFloor: stock.get(sku)?.free ?? 0,
        movedPct: orderedQty > 0 ? Math.round((soldQty * 100) / orderedQty) : null,
      });
    }
    rows.sort((a, b) => b.orderedQty - a.orderedQty || a.sku.localeCompare(b.sku));

    const totals = rows.reduce(
      (t, r) => ({
        asked: t.asked + r.askedQty,
        ordered: t.ordered + r.orderedQty,
        sold: t.sold + r.soldQty,
        left: t.left + r.leftOnFloor,
      }),
      { asked: 0, ordered: 0, sold: 0, left: 0 },
    );

    // Rule C, and the records-coverage twin of it: a month that began before
    // we kept records would report a shortfall in book-keeping as a shortfall
    // in demand.
    const withheld: AccuracyWithheld | null =
      monthEnd(period) >= input.asOf
        ? "month_not_over"
        : coverage.firstSale == null || coverage.firstSale > monthStart(period)
          ? "records_start_later"
          : null;

    out.push({
      period,
      reported: withheld === null,
      withheld,
      askedQty: totals.asked,
      orderedQty: totals.ordered,
      soldQty: withheld === null ? totals.sold : 0,
      leftOnFloor: totals.left,
      movedPct:
        withheld === null && totals.ordered > 0
          ? Math.round((totals.sold * 100) / totals.ordered)
          : null,
      rows: withheld === null ? rows : [],
    });
  }

  return out.sort((a, b) => b.period.localeCompare(a.period));
}

/** The words for a withheld month — one place, shared with the screen. */
export const ACCURACY_WITHHELD_LABEL: Record<AccuracyWithheld, string> = {
  month_not_over:
    "This month is still running. The figures appear once it ends — part of a month of sales against a whole month of ordering reads as a failed plan.",
  records_start_later:
    "Sales records do not go back that far, so what sold cannot be counted for that month.",
};
