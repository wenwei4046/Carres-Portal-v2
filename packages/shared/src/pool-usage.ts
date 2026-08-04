/**
 * Ready-stock pool usage + reserve levels — card K4
 * (`docs/ready-stock-execution-queue.md`, Jess-locked 2026-07-27).
 *
 * THE CARD: "taking a ready-stock unit records WHY (the locked reason list);
 * each SKU carries a COO-set `reserve level` — at/below it, further use warns
 * but never blocks (COO decides, system reminds). Usage split (Sales 60% /
 * supplier-delay 25% / …) readable per month. Done when: 为什么一直缺货 is
 * answerable from data."
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * FOUR DECISIONS THIS FILE ENCODES, AND WHY
 *
 * 1. THE REASON LIVES IN A DATED LEDGER, NOT ON THE UNIT. `ops_stock_items`
 *    has carried a `reserve_reason` column since 0213 ('urgent' | 'exchange'),
 *    and it cannot answer the card's question: it is overwritten when a
 *    released unit is drawn again, it carries no date, and it disappears from
 *    the question the moment the unit is sold. "Per month" needs an EVENT, so
 *    `ops_stock_pool_usage` records one row per draw — sku, qty, reason, who,
 *    when — and survives the unit being deleted. Measured before choosing:
 *    that column holds 0 non-null values on live prod, so nothing is lost.
 *
 * 2. THE SPLIT COUNTS WHY, NOT NET UNITS. A draw that is later released is
 *    still a draw that happened for a reason; the ledger is not a stock
 *    balance and never pretends to be one (the register is the balance). This
 *    is why nothing here subtracts.
 *
 * 3. A RESERVE LEVEL WARNS AND NEVER BLOCKS — Jess's own word, and the same
 *    restraint K2's over-suggestion warning and K3's "already has enough free"
 *    already keep. The register can be behind what the person on the floor
 *    knows; a system that refuses the last unit teaches people to work around
 *    the system.
 *
 * 4. THE PERCENTAGES SUM TO 100. Rounding each share independently produces
 *    99% or 101% on the screen, and the first question anybody asks is where
 *    the missing percent went. Largest-remainder apportionment removes the
 *    question.
 *
 * Pure and deterministic (same contract as `reorder-alert.ts` and
 * `ready-stock-plan.ts`): the API decides, the browser renders the answer, so
 * the two can never present different arithmetic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { PlanStockUnit } from "./ready-stock-plan";
import { aggregateStockUnits } from "./ready-stock-plan";

// ── The reason list (Jess-locked) ───────────────────────────────────────────

/**
 * K4's five, plus P13's sixth (Loo, 2026-08-04).
 *
 * THE SIXTH IS APPENDED, NEVER INSERTED. P13's Must-NOT forbids re-ordering
 * the existing five, and this array IS the display order of the monthly split
 * and of every reason picker — inserting `used_instead_of_ordering` before
 * `other` would move `other` and change a screen nobody asked to change. So
 * the catch-all is not last any more, and that is the price of not moving a
 * locked list.
 *
 * WHY A SIXTH AT ALL. K4 exists to answer 为什么一直缺货. P10's To Order take
 * — *"we had it on the shelf, so we did not raise a purchase order"* — is not
 * any of the five, so it was recorded as `other` with a note; a monthly split
 * where the biggest slice reads `Other` cannot answer the question the ledger
 * was built for.
 */
export const POOL_USE_REASONS = [
  "sales_urgent",
  "supplier_delay",
  "warranty_exchange",
  "vip",
  "other",
  "used_instead_of_ordering",
] as const;
export type PoolUseReason = (typeof POOL_USE_REASONS)[number];

/** The words on screen — the card's own, no shortening. */
export const POOL_USE_REASON_LABEL: Record<PoolUseReason, string> = {
  sales_urgent: "Sales urgent",
  supplier_delay: "Supplier delay",
  warranty_exchange: "Warranty exchange",
  vip: "VIP",
  other: "Other",
  // P13's own word, from the card: it names the act from the POOL's side,
  // which is what `warranty_exchange` and `vip` already do.
  used_instead_of_ordering: "Used instead of ordering",
};

export const POOL_USE_NOTE_MAX = 300;
export const RESERVE_LEVEL_MAX = 100000;

/**
 * `Other` explains nothing by itself, and the whole point of a locked list is
 * that the monthly split can be read as an answer. K3 settled this rule; K4
 * inherits it rather than inventing a second one.
 */
export function poolUseNeedsNote(reason: PoolUseReason): boolean {
  return reason === "other";
}

export interface PoolDraw {
  reason: PoolUseReason | "";
  note?: string | null;
}

/**
 * Why a draw cannot be recorded yet, or `null` when it can.
 *
 * ONE function, three consumers: the disabled button, the Hono route and (in
 * the same shape) the SQL. A button that goes dark for a different reason than
 * the server refuses for is how an operator learns to distrust the screen.
 */
export function poolDrawProblem(draw: PoolDraw): string | null {
  if (!draw.reason) return "Why is this unit being taken?";
  if (!(POOL_USE_REASONS as readonly string[]).includes(draw.reason))
    return "Why is this unit being taken?";
  if (poolUseNeedsNote(draw.reason as PoolUseReason) && !(draw.note ?? "").trim())
    return "Say what the reason is";
  if ((draw.note ?? "").length > POOL_USE_NOTE_MAX) return "That note is too long";
  return null;
}

// ── Reserve levels ──────────────────────────────────────────────────────────

/**
 * - `low`   — free stock is AT or BELOW the level. Warn, never block.
 * - `ok`    — above the level (or the level is 0 = the reminder is off).
 * - `unset` — nobody has chosen a number. K1's law: a quiet screen must mean
 *             "watched and fine", never "nobody has looked", so this is a
 *             first-class state and reads "Set a number".
 */
export type ReserveLevelState = "low" | "ok" | "unset";

export interface ReserveLevelConfig {
  sku: string;
  reserveLevel: number;
  note?: string | null;
}

export interface ReserveLevelRow {
  sku: string;
  /** Free units on the floor — K1's law, summed from `qty`, not counted. */
  free: number;
  /** Spoken for by an order. Context only; never counted as available. */
  reserved: number;
  reserveLevel: number | null;
  state: ReserveLevelState;
  /** How far below the level free stock sits. 0 when exactly at it. */
  shortfall: number;
}

const RESERVE_STATE_RANK: Record<ReserveLevelState, number> = {
  low: 0,
  unset: 1,
  ok: 2,
};

/**
 * One row per SKU that has a level set, plus every SKU that currently holds
 * free stock (so a newly imported item shows up asking for its number instead
 * of hiding until somebody notices it is gone).
 */
export function computeReserveLevelRows(
  units: readonly PlanStockUnit[],
  levels: readonly ReserveLevelConfig[],
): ReserveLevelRow[] {
  const bySku = new Map<string, ReserveLevelConfig>();
  for (const l of levels) {
    const key = l.sku?.trim();
    if (key) bySku.set(key, l);
  }

  const stock = aggregateStockUnits(units);
  const skus = new Set<string>(bySku.keys());
  for (const [sku, counts] of stock) {
    if (counts.free > 0 || counts.reserved > 0) skus.add(sku);
  }

  const rows: ReserveLevelRow[] = [];
  for (const sku of skus) {
    const counts = stock.get(sku) ?? { free: 0, reserved: 0, incoming: 0 };
    const cfg = bySku.get(sku);
    const level = cfg ? Math.max(0, Math.floor(cfg.reserveLevel)) : null;

    let state: ReserveLevelState;
    if (level == null) state = "unset";
    // 0 is the documented OFF switch — the only way to stop the reminder
    // without deleting the row (which would just re-appear as `unset`).
    else if (level === 0) state = "ok";
    else state = counts.free <= level ? "low" : "ok";

    rows.push({
      sku,
      free: counts.free,
      reserved: counts.reserved,
      reserveLevel: level,
      state,
      shortfall: state === "low" && level != null ? Math.max(0, level - counts.free) : 0,
    });
  }

  rows.sort((a, b) => {
    if (RESERVE_STATE_RANK[a.state] !== RESERVE_STATE_RANK[b.state])
      return RESERVE_STATE_RANK[a.state] - RESERVE_STATE_RANK[b.state];
    if (a.shortfall !== b.shortfall) return b.shortfall - a.shortfall;
    return a.sku.localeCompare(b.sku);
  });
  return rows;
}

export interface ReserveLevelWarning {
  /** Free units left once this draw is taken. */
  freeAfter: number;
  reserveLevel: number;
}

/**
 * Should taking `taking` units of this SKU warn?
 *
 * Warns when a level is set (and switched on) and the draw would leave free
 * stock AT or BELOW it — the card's "at/below it, further use warns". It
 * returns facts, not a sentence: the screen states the two numbers so the
 * person deciding sees what the system saw.
 */
export function reserveLevelWarning(input: {
  free: number;
  taking: number;
  reserveLevel: number | null | undefined;
}): ReserveLevelWarning | null {
  const level = input.reserveLevel;
  if (level == null || level <= 0) return null;
  const freeAfter = Math.max(0, Math.floor(input.free) - Math.floor(input.taking));
  return freeAfter <= level ? { freeAfter, reserveLevel: Math.floor(level) } : null;
}

// ── The monthly split ───────────────────────────────────────────────────────

/** One `ops_stock_pool_usage` row, camel-cased. */
export interface PoolUsageEntry {
  id: string;
  sku: string;
  qty: number;
  reason: PoolUseReason;
  note?: string | null;
  ref?: string | null;
  takenByName?: string | null;
  /** ISO timestamp. The route slices the month; this engine only summarises. */
  takenAt: string;
}

export interface UsageReasonSlice {
  reason: PoolUseReason;
  label: string;
  /** Units taken for this reason. */
  units: number;
  /** How many separate draws. A 555-unit accessory record is ONE draw. */
  draws: number;
  /** Whole-number percent of units. The slices sum to exactly 100. */
  share: number;
}

export interface UsageSkuSlice {
  sku: string;
  units: number;
  draws: number;
  topReason: PoolUseReason;
  topReasonLabel: string;
}

export interface PoolUsageSummary {
  totalUnits: number;
  totalDraws: number;
  byReason: UsageReasonSlice[];
  bySku: UsageSkuSlice[];
}

/**
 * Percent shares that add up.
 *
 * Largest-remainder apportionment: floor every share, then hand the leftover
 * points to the biggest remainders. Decision 4 in the header — a split that
 * prints 99% invites a question the data cannot answer.
 */
function sharesOf(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v * 100) / total);
  const floors = exact.map((v) => Math.floor(v));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  const out = [...floors];
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * "Where did the ready stock go?" for whatever slice of the ledger it is given.
 *
 * Counts UNITS (the pool's own currency) and states the draw count beside it,
 * because one 555-unit accessory record and 555 mattresses read identically
 * otherwise. Nothing is subtracted for a later release — see decision 2.
 */
export function summarisePoolUsage(
  entries: readonly PoolUsageEntry[],
): PoolUsageSummary {
  const perReason = new Map<PoolUseReason, { units: number; draws: number }>();
  const perSku = new Map<
    string,
    { units: number; draws: number; byReason: Map<PoolUseReason, number> }
  >();

  let totalUnits = 0;
  for (const e of entries) {
    const qty = Number.isFinite(e.qty) && e.qty > 0 ? Math.floor(e.qty) : 0;
    totalUnits += qty;

    const r = perReason.get(e.reason) ?? { units: 0, draws: 0 };
    r.units += qty;
    r.draws += 1;
    perReason.set(e.reason, r);

    const sku = e.sku?.trim() || "—";
    const s =
      perSku.get(sku) ??
      perSku.set(sku, { units: 0, draws: 0, byReason: new Map() }).get(sku)!;
    s.units += qty;
    s.draws += 1;
    s.byReason.set(e.reason, (s.byReason.get(e.reason) ?? 0) + qty);
  }

  // Keep the card's order — a split people read every month should not
  // re-order itself because one reason overtook another this week.
  const reasons = POOL_USE_REASONS.filter((r) => perReason.has(r));
  const shares = sharesOf(reasons.map((r) => perReason.get(r)!.units));
  const byReason: UsageReasonSlice[] = reasons.map((reason, i) => ({
    reason,
    label: POOL_USE_REASON_LABEL[reason],
    units: perReason.get(reason)!.units,
    draws: perReason.get(reason)!.draws,
    share: shares[i],
  }));

  const bySku: UsageSkuSlice[] = [...perSku.entries()]
    .map(([sku, s]) => {
      let topReason: PoolUseReason = POOL_USE_REASONS[0];
      let best = -1;
      for (const reason of POOL_USE_REASONS) {
        const units = s.byReason.get(reason) ?? -1;
        if (units > best) {
          best = units;
          topReason = reason;
        }
      }
      return {
        sku,
        units: s.units,
        draws: s.draws,
        topReason,
        topReasonLabel: POOL_USE_REASON_LABEL[topReason],
      };
    })
    .sort((a, b) => b.units - a.units || a.sku.localeCompare(b.sku));

  return {
    totalUnits,
    totalDraws: entries.length,
    byReason,
    bySku,
  };
}
