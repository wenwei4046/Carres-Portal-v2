/**
 * Ready stock plan — Ready Stock card K2
 * (`docs/ready-stock-execution-queue.md`, Jess-locked 2026-07-27).
 *
 * THE LANE: salesperson proposes → sales manager consolidates → COO approves →
 * operations creates the PO. The system SUGGESTS numbers; humans decide. This
 * file is the SUGGESTING half — pure, deterministic, no I/O, so the API, the
 * screen and any later consumer can never disagree about what a number means
 * (the HR-P5 one-engine lesson).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE LIVE FINDING THAT SHAPED THIS FILE (measured on prod 2026-07-27, not
 * assumed) — read before touching the coverage rules:
 *
 * The card asks for `30/90-day sales · weekend share · suggestion`. Computing
 * those the obvious way against today's database produces confident numbers
 * that are WRONG:
 *
 *   • All 37 `source_system='autocount'` orders carry `placed_at = 2026-07-23`
 *     — the day they were IMPORTED, not the day anything was sold. Every one of
 *     the 9 stock SKUs with any sales history gets 100% of it from those rows.
 *   • So a plain 30-day column prints "36 pillows" and the 90-day column prints
 *     "36 pillows" — identical, looking exactly like a demand trend, actually
 *     one import event.
 *   • And 2026-07-23 is a THURSDAY, so weekend share would read 0% for every
 *     SKU in the building. Precise, confident, meaningless.
 *   • Native (real) orders: 19 of them, spanning 2026-07-21..26. SIX DAYS.
 *
 * Two rules follow, and they are the reason this engine can be trusted:
 *
 *   1. ARCHIVE ROWS ARE NOT DEMAND. They are excluded at the source (0265's
 *      law — `source_system` already encodes the fact, so no new flag column)
 *      and the excluded count is RETURNED so the screen says so out loud
 *      instead of silently filtering.
 *   2. COVERAGE GATES THE MATH. A run rate scaled from 6 days of history is a
 *      fabrication. So the suggestion is WITHHELD below
 *      `MIN_HISTORY_DAYS_FOR_SUGGESTION`, and the `⚠ well above 3-month
 *      average` warning cannot fire below `MIN_HISTORY_DAYS_FOR_BASELINE` —
 *      because a warning that fires off a made-up average is how you train an
 *      operator to ignore warnings. (HR-P7's law: the ratio refuses to print on
 *      a partial month.)
 *
 * Both thresholds heal by themselves as real days accumulate. Nothing to
 * switch on, no migration, no backfill.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * DELIBERATELY NOT HERE: the emergency lane (K3), pool usage reasons + reserve
 * levels (K4), the 🟢🟡🟠🔴 health ladder and slow-moving alerts (K5).
 */

import type { IsoDate } from "./working-days";

// ── Coverage thresholds ─────────────────────────────────────────────────────

/**
 * Real days of sales history needed before a monthly run rate — and therefore
 * a suggested quantity — may be printed at all. Two weeks is the shortest
 * window that can be scaled to a month without the answer being mostly noise.
 */
export const MIN_HISTORY_DAYS_FOR_SUGGESTION = 14;

/**
 * Real days needed before the `well above 3-month average` warning may fire.
 * The card's phrase names three months; 60 days is the point where the average
 * stops being a guess. Below this the warning stays silent — silence is the
 * honest answer when there is no baseline to be above.
 */
export const MIN_HISTORY_DAYS_FOR_BASELINE = 60;

/** How far above the monthly baseline counts as "well above". */
export const OVER_SUGGESTION_MULTIPLE = 1.5;

/** Windows the screen reports as facts about a period (never scaled). */
export const SALES_WINDOW_DAYS = [30, 90] as const;

// ── Inputs ──────────────────────────────────────────────────────────────────

/** One sold order line, reduced to what the plan needs. */
export interface PlanSalesLine {
  sku: string;
  qty: number;
  /** The order's `placed_at`, date part only. */
  soldOn: IsoDate;
  /**
   * True for `source_system='autocount'` rows. NOT demand: their `placed_at` is
   * the import timestamp, so counting them would date a year of history to one
   * afternoon. Excluded here, and counted in `archiveLinesExcluded` so the
   * screen can say why its history looks short.
   */
  fromArchive?: boolean;
  /** Cancelled orders are not demand. */
  cancelled?: boolean;
}

/** One `ops_stock_items` row — same reduction K1 uses. */
export interface PlanStockUnit {
  sku: string;
  /** free / reserved / incoming / sold / transferred / voided. */
  status: string;
  /** Units this record represents (0218 bulk rows). Absent/null = 1. */
  qty?: number | null;
}

/** One row of `ops_stock_plan_proposals` — a person's ask. */
export interface PlanProposal {
  sku: string;
  qty: number;
  proposedBy: string;
  proposedByName?: string | null;
  note?: string | null;
}

/** One row of `ops_stock_plan_lines` — the cut and the decision, per SKU. */
export interface PlanLine {
  sku: string;
  consolidatedQty: number | null;
  approvedQty: number | null;
}

// ── Outputs ─────────────────────────────────────────────────────────────────

/**
 * How much real history the whole data set carries. A property of the DATA,
 * not of any one SKU — a SKU that has never sold still lives in a company with
 * six days of records, and pretending otherwise per-row is how a thin baseline
 * gets laundered into a confident number.
 */
export interface SalesCoverage {
  /** Calendar days from the earliest real sale to `asOf`, inclusive. 0 = none. */
  days: number;
  /** Earliest real (non-archive) sale seen, or null. */
  firstSale: IsoDate | null;
  /** Archive lines dropped — surfaced so the screen explains the short window. */
  archiveLinesExcluded: number;
  /** May a run rate / suggestion be printed? */
  canSuggest: boolean;
  /** May the `well above average` warning fire? */
  canWarnOverSuggestion: boolean;
}

export interface PlanSkuStats {
  sku: string;
  /** Free units on the floor — what "current" means (K1's law). */
  onHand: number;
  /** Spoken for by an order. Context only, never counted as cover. */
  reserved: number;
  /** Ordered and not yet arrived. */
  incoming: number;
  /** Units sold in the last 30 / 90 days. A fact about the window. */
  sold30: number;
  sold90: number;
  /**
   * Share of units sold on a Sat/Sun, 0..1 — or `null` when coverage is too
   * thin to mean anything. Jess asked for it because weekend demand is what
   * empties the ready pool.
   */
  weekendShare: number | null;
  /** Units/30 days implied by the real history, or null when withheld. */
  monthlyRunRate: number | null;
  /**
   * What the system SUGGESTS ordering: a month of demand, minus what is
   * already on the floor and already on the water. `null` = not enough history
   * to suggest anything, which the screen must say rather than showing 0.
   */
  suggestedQty: number | null;
  /** Total asked for by all proposers. */
  proposedQty: number;
  /** Number of people who asked. */
  proposerCount: number;
  /** The manager's cut, once made. */
  consolidatedQty: number | null;
  /** The COO's final number, once approved. */
  approvedQty: number | null;
  /**
   * `⚠ well above 3-month average` — warns, NEVER blocks (Jess's locked word).
   * Always false while coverage is thin; see the header.
   */
  overSuggestion: boolean;
  /** Who asked for what, for the manager's consolidate view. */
  proposals: PlanProposal[];
}

export interface PlanView {
  coverage: SalesCoverage;
  rows: PlanSkuStats[];
}

// ── Date helpers (no clock reads — `asOf` is always passed in) ───────────────

function toUtcMs(iso: IsoDate): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

/** Whole days between two ISO dates (b − a). Negative when b precedes a. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000);
}

/** Sat or Sun, read in UTC so the answer never depends on the viewer's zone. */
export function isWeekendDate(iso: IsoDate): boolean {
  const dow = new Date(toUtcMs(iso)).getUTCDay();
  return dow === 0 || dow === 6;
}

function usableLines(lines: readonly PlanSalesLine[]): PlanSalesLine[] {
  return lines.filter(
    (l) => !l.fromArchive && !l.cancelled && !!l.sku?.trim() && (l.qty ?? 0) > 0,
  );
}

// ── Coverage ────────────────────────────────────────────────────────────────

/**
 * How much real history exists, and therefore which numbers may be printed.
 *
 * Deliberately measured from the FIRST real sale rather than from a configured
 * "go-live" date: the register cannot see further back than its own oldest
 * row, and a configured date would let someone claim 90 days of coverage over
 * six days of data.
 */
export function salesCoverage(
  lines: readonly PlanSalesLine[],
  asOf: IsoDate,
): SalesCoverage {
  const real = usableLines(lines);
  const archiveLinesExcluded = lines.filter((l) => l.fromArchive).length;

  let firstSale: IsoDate | null = null;
  for (const l of real) {
    const d = l.soldOn.slice(0, 10);
    if (firstSale === null || d < firstSale) firstSale = d;
  }

  // Inclusive: a single day of records is one day of coverage, not zero.
  const days = firstSale === null ? 0 : Math.max(0, daysBetween(firstSale, asOf) + 1);

  return {
    days,
    firstSale,
    archiveLinesExcluded,
    canSuggest: days >= MIN_HISTORY_DAYS_FOR_SUGGESTION,
    canWarnOverSuggestion: days >= MIN_HISTORY_DAYS_FOR_BASELINE,
  };
}

// ── The view ────────────────────────────────────────────────────────────────

interface Counts {
  free: number;
  reserved: number;
  incoming: number;
}

function unitQty(u: PlanStockUnit): number {
  const n = u.qty ?? 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Build the plan table: one row per SKU that anyone asked for, plus every SKU
 * already carrying a consolidated or approved number (so a line the manager
 * ADDED — an item no salesperson thought of — never disappears from the plan
 * it belongs to).
 */
export function computePlanView(input: {
  proposals: readonly PlanProposal[];
  lines?: readonly PlanLine[];
  units?: readonly PlanStockUnit[];
  sales?: readonly PlanSalesLine[];
  asOf: IsoDate;
}): PlanView {
  const { proposals, lines = [], units = [], sales = [], asOf } = input;
  const coverage = salesCoverage(sales, asOf);

  // Stock, aggregated exactly as K1 does it (sum `qty`, never count rows).
  const stock = new Map<string, Counts>();
  for (const u of units) {
    const sku = u.sku?.trim();
    if (!sku) continue;
    const c =
      stock.get(sku) ?? stock.set(sku, { free: 0, reserved: 0, incoming: 0 }).get(sku)!;
    const q = unitQty(u);
    if (u.status === "free") c.free += q;
    else if (u.status === "reserved") c.reserved += q;
    else if (u.status === "incoming") c.incoming += q;
    // sold / transferred / voided have left the building.
  }

  // Sales, windowed. `real` already excludes archive + cancelled.
  const real = usableLines(sales);
  const sold = new Map<
    string,
    { d30: number; d90: number; all: number; weekend: number }
  >();
  for (const l of real) {
    const sku = l.sku.trim();
    const bucket =
      sold.get(sku) ?? sold.set(sku, { d30: 0, d90: 0, all: 0, weekend: 0 }).get(sku)!;
    const age = daysBetween(l.soldOn.slice(0, 10), asOf);
    // Future-dated rows are data errors, not forecasts — ignore rather than
    // let one bad row inflate a window.
    if (age < 0) continue;
    const q = Math.max(0, Math.floor(l.qty));
    if (age < 30) bucket.d30 += q;
    if (age < 90) bucket.d90 += q;
    bucket.all += q;
    if (isWeekendDate(l.soldOn.slice(0, 10))) bucket.weekend += q;
  }

  const lineBySku = new Map<string, PlanLine>();
  for (const l of lines) {
    const key = l.sku?.trim();
    if (key) lineBySku.set(key, l);
  }

  const bySku = new Map<string, PlanProposal[]>();
  for (const p of proposals) {
    const sku = p.sku?.trim();
    if (!sku || (p.qty ?? 0) <= 0) continue;
    const arr = bySku.get(sku) ?? bySku.set(sku, []).get(sku)!;
    arr.push(p);
  }

  const skus = new Set<string>([...bySku.keys()]);
  for (const [sku, l] of lineBySku) {
    if (l.consolidatedQty != null || l.approvedQty != null) skus.add(sku);
  }

  // The scaling window: never claim to average over more days than exist.
  const window = Math.min(90, Math.max(1, coverage.days));

  const rows: PlanSkuStats[] = [];
  for (const sku of skus) {
    const s = stock.get(sku) ?? { free: 0, reserved: 0, incoming: 0 };
    const sale = sold.get(sku) ?? { d30: 0, d90: 0, all: 0, weekend: 0 };
    const mine = bySku.get(sku) ?? [];
    const line = lineBySku.get(sku);

    const proposedQty = mine.reduce((n, p) => n + Math.max(0, Math.floor(p.qty)), 0);

    let monthlyRunRate: number | null = null;
    let suggestedQty: number | null = null;
    let weekendShare: number | null = null;
    if (coverage.canSuggest) {
      // Units sold inside the coverage window, scaled to 30 days.
      const inWindow = window <= 30 ? sale.d30 : sale.d90;
      monthlyRunRate = round1((inWindow / window) * 30);
      suggestedQty = Math.max(
        0,
        Math.ceil(monthlyRunRate) - s.free - s.incoming,
      );
      weekendShare = sale.all > 0 ? round2(sale.weekend / sale.all) : null;
    }

    const baseline = monthlyRunRate;
    const overSuggestion =
      coverage.canWarnOverSuggestion &&
      baseline != null &&
      baseline > 0 &&
      proposedQty > baseline * OVER_SUGGESTION_MULTIPLE;

    rows.push({
      sku,
      onHand: s.free,
      reserved: s.reserved,
      incoming: s.incoming,
      sold30: sale.d30,
      sold90: sale.d90,
      weekendShare,
      monthlyRunRate,
      suggestedQty,
      proposedQty,
      proposerCount: new Set(mine.map((p) => p.proposedBy)).size,
      consolidatedQty: line?.consolidatedQty ?? null,
      approvedQty: line?.approvedQty ?? null,
      overSuggestion,
      proposals: [...mine].sort((a, b) =>
        (a.proposedByName ?? a.proposedBy).localeCompare(
          b.proposedByName ?? b.proposedBy,
        ),
      ),
    });
  }

  // Loudest first: the ⚠ rows, then the biggest asks, then alphabetical.
  rows.sort((a, b) => {
    if (a.overSuggestion !== b.overSuggestion) return a.overSuggestion ? -1 : 1;
    if (a.proposedQty !== b.proposedQty) return b.proposedQty - a.proposedQty;
    return a.sku.localeCompare(b.sku);
  });

  return { coverage, rows };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── The handover to Operations ──────────────────────────────────────────────

export interface PlanPoLine {
  sku: string;
  qty: number;
}

/**
 * The ready-to-create PO list an approved plan hands Operations.
 *
 * Reads `approvedQty` and NOTHING else — never falling back to the
 * consolidated or proposed number. A plan that was never approved must hand
 * over an empty list, because "what was ordered" has to trace to a decision
 * somebody made, which is the card's own Done-when. Approving a line at 0 is
 * how the COO cuts it, so 0 rows are dropped rather than ordered.
 *
 * LATER (queue doc): auto-creating the PO. Today it hands over a LIST — the
 * flow proves itself live first.
 */
export function planPoList(rows: readonly PlanSkuStats[]): PlanPoLine[] {
  return rows
    .filter((r) => (r.approvedQty ?? 0) > 0)
    .map((r) => ({ sku: r.sku, qty: r.approvedQty as number }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
}

/** Units still waiting for the manager to cut them. Drives the review badge. */
export function pendingConsolidation(rows: readonly PlanSkuStats[]): number {
  return rows.filter((r) => r.consolidatedQty == null).length;
}

// ── The cycle ───────────────────────────────────────────────────────────────

/**
 * `collecting` → people are still asking.
 * `review`     → the manager is cutting; proposals are closed.
 * `approved`   → the COO signed it; the PO list is live.
 * `rejected`   → the COO sent it back, with a remark. Terminal: a new cycle is
 *                opened rather than a rejected one being quietly re-approved,
 *                so the audit trail never shows two answers for one plan.
 */
export const PLAN_STATUSES = [
  "collecting",
  "review",
  "approved",
  "rejected",
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** May a proposal still be filed against a plan in this state? */
export function planAcceptsProposals(status: PlanStatus): boolean {
  return status === "collecting";
}

/** May the manager still cut quantities? */
export function planAcceptsConsolidation(status: PlanStatus): boolean {
  return status === "collecting" || status === "review";
}

/** Is the COO's decision still outstanding? */
export function planAwaitsDecision(status: PlanStatus): boolean {
  return status === "review";
}

/** The word the screen shows for each state — one place, so it can't drift. */
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  collecting: "Collecting",
  review: "In review",
  approved: "Approved",
  rejected: "Sent back",
};
