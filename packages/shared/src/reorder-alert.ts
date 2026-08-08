/**
 * Reorder alert for import accessories — Ready Stock card K1
 * (`docs/ready-stock-execution-queue.md`, Jess-locked 2026-07-27).
 *
 * THE PROBLEM IT SOLVES: pillow / mattress protector come from China on a
 * ~2-month lead. By the time the shelf reads zero it is already two months too
 * late. So the alert must fire while there is still stock on the floor, off a
 * number a human chose — never off "we ran out".
 *
 * Pure, deterministic, no I/O (same contract as `net-requirements.ts`): hand it
 * the raw stock rows + the configured reorder points and it answers, per SKU,
 * `current · incoming · reorder point · reorder?`.
 *
 * LIVE-DATA DECISIONS (measured 2026-07-27 on prod, not assumed):
 *
 * - **Current reads `ops_stock_items`, summing `qty`** — the per-unit register
 *   the Stock → On hand page and the Klg sheet import both write. NOT
 *   `stock_balances`: that rollup is `count(*)`-based (0137, written before the
 *   `qty` bulk column landed in 0218), so one accessory row of 555 units rolls
 *   up as 1. It also has no live writer for these rows.
 * - **`ops_stock_items.sku` is free text from Jess's Klg sheet, not a catalog
 *   code** — all 49 live stock SKUs join to ZERO `product_skus` rows. So the
 *   reorder point is keyed on that same string, and the accessory rows are
 *   found by the shipped `lineCategory`/`accShort` classifier rather than by a
 *   catalog category that would match nothing.
 * - **Current = FREE only.** Reserved units are already spoken for; the queue
 *   doc's ground truth says "Available = free is already the working truth".
 *   Incoming is added on top as `cover`, so an order already placed stops the
 *   alert from nagging (the netting law from the MRP engine).
 *
 * DELIBERATELY NOT BUILT HERE: the 🟢🟡🟠🔴 health ladder and slow-moving
 * alerts are card K5; the monthly plan is K2. K1 has exactly three states.
 */

import { lineClass, accShort } from "./line-category";

/**
 * The accessory types that come in by sea container and therefore need an
 * early-warning number. `accShort` already speaks these words on the Orders
 * grid, so the vocabulary is shared rather than re-derived.
 */
export const IMPORT_ACCESSORY_KINDS = ["Pillow", "M.P", "Topper"] as const;
export type ImportAccessoryKind = (typeof IMPORT_ACCESSORY_KINDS)[number];

/** Default lead for a China container, in calendar days (~2 months). */
export const IMPORT_LEAD_DAYS_DEFAULT = 60;

/**
 * Is this SKU an imported accessory? Returns its short type name (the word the
 * operator already sees elsewhere) or `null`.
 */
export function importAccessoryKind(sku: string): ImportAccessoryKind | null {
  // D9 — `lineClass`, not `lineCategory`: a SKU nothing recognised must not be
  // forecast as a container of pillows.
  if (lineClass(sku) !== "acc") return null;
  const short = accShort(sku);
  return (IMPORT_ACCESSORY_KINDS as readonly string[]).includes(short)
    ? (short as ImportAccessoryKind)
    : null;
}

/** One `ops_stock_items` row, reduced to what the alert needs. */
export interface ReorderStockUnit {
  sku: string;
  /** free / reserved / incoming / sold / transferred / voided. */
  status: string;
  /** Units this record represents (0218 bulk rows). Absent/null = 1. */
  qty?: number | null;
}

/** One `ops_reorder_points` row. */
export interface ReorderPointConfig {
  sku: string;
  reorderPoint: number;
  leadDays?: number | null;
  note?: string | null;
}

/**
 * - `reorder` — cover has fallen to or below the point. THE worklist item.
 * - `ok`      — above the point (or the point is 0 = alert switched off).
 * - `unset`   — an import accessory nobody has given a number to yet. Not an
 *               alarm; it is the ask, and it is why the alert can be trusted:
 *               a silent screen means "configured and fine", never "unknown".
 */
export type ReorderState = "reorder" | "ok" | "unset";

export interface ReorderStockRow {
  sku: string;
  /** Pillow / M.P / Topper, or null for a non-accessory SKU given a point. */
  kind: ImportAccessoryKind | null;
  /** Free units on the floor — what "current" means. */
  onHand: number;
  /** Spoken for by an order. Shown for context, never counted as cover. */
  reserved: number;
  /** Ordered and not yet arrived (`status='incoming'`). */
  incoming: number;
  /** onHand + incoming — what the reorder point is compared against. */
  cover: number;
  reorderPoint: number | null;
  leadDays: number | null;
  state: ReorderState;
  /** How far below the point the cover sits. 0 when exactly at the point. */
  shortfall: number;
}

const STATE_RANK: Record<ReorderState, number> = { reorder: 0, unset: 1, ok: 2 };

function unitQty(u: ReorderStockUnit): number {
  const n = u.qty ?? 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Build one row per SKU that needs watching.
 *
 * The row set is the UNION of:
 *   1. every SKU with a configured reorder point (so a point survives the last
 *      unit leaving the building — that is exactly when it matters most), and
 *   2. every import accessory present in stock (so a newly imported SKU shows
 *      up asking for its number instead of hiding until it runs out).
 */
export function computeReorderRows(
  units: readonly ReorderStockUnit[],
  points: readonly ReorderPointConfig[],
): ReorderStockRow[] {
  const pointBySku = new Map<string, ReorderPointConfig>();
  for (const p of points) {
    const key = p.sku.trim();
    if (key) pointBySku.set(key, p);
  }

  const agg = new Map<string, { free: number; reserved: number; incoming: number }>();
  for (const u of units) {
    const sku = u.sku?.trim();
    if (!sku) continue;
    const bucket =
      agg.get(sku) ?? agg.set(sku, { free: 0, reserved: 0, incoming: 0 }).get(sku)!;
    const q = unitQty(u);
    if (u.status === "free") bucket.free += q;
    else if (u.status === "reserved") bucket.reserved += q;
    else if (u.status === "incoming") bucket.incoming += q;
    // sold / transferred / voided are gone — they are not stock.
  }

  const skus = new Set<string>(pointBySku.keys());
  for (const sku of agg.keys()) {
    if (importAccessoryKind(sku)) skus.add(sku);
  }

  const rows: ReorderStockRow[] = [];
  for (const sku of skus) {
    const counts = agg.get(sku) ?? { free: 0, reserved: 0, incoming: 0 };
    const cfg = pointBySku.get(sku);
    const point = cfg ? Math.max(0, Math.floor(cfg.reorderPoint)) : null;
    const cover = counts.free + counts.incoming;

    let state: ReorderState;
    if (point == null) state = "unset";
    // A point of 0 is the OFF switch — documented, and the only way to stop an
    // alert without deleting the row (which would just re-appear as `unset`).
    else if (point === 0) state = "ok";
    else state = cover <= point ? "reorder" : "ok";

    rows.push({
      sku,
      kind: importAccessoryKind(sku),
      onHand: counts.free,
      reserved: counts.reserved,
      incoming: counts.incoming,
      cover,
      reorderPoint: point,
      leadDays: cfg?.leadDays ?? null,
      state,
      shortfall: state === "reorder" && point != null ? Math.max(0, point - cover) : 0,
    });
  }

  // Worst first: the ones needing a PO, deepest gap on top; then the ones
  // waiting for a number; then the healthy ones. Alphabetical inside each.
  rows.sort((a, b) => {
    if (STATE_RANK[a.state] !== STATE_RANK[b.state])
      return STATE_RANK[a.state] - STATE_RANK[b.state];
    if (a.shortfall !== b.shortfall) return b.shortfall - a.shortfall;
    if (a.cover !== b.cover) return a.cover - b.cover;
    return a.sku.localeCompare(b.sku);
  });
  return rows;
}

/** How many SKUs are asking for a purchase order right now. */
export function reorderAlertCount(rows: readonly ReorderStockRow[]): number {
  return rows.filter((r) => r.state === "reorder").length;
}

/** How many import accessories still have no number set. */
export function reorderUnsetCount(rows: readonly ReorderStockRow[]): number {
  return rows.filter((r) => r.state === "unset").length;
}
