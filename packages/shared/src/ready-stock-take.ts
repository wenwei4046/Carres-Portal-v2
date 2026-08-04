/**
 * Ready stock is SUGGESTED; the human decides whether to take it — card P10
 * (`docs/purchasing-execution-queue.md`, Loo 2026-08-04).
 *
 * Two pure rules live here and nothing else. The engine already knew both
 * numbers this card needed and neither reached a screen: `net-requirements.ts`
 * has computed `freeStockAvailable` since the module was written, and
 * `consumeFreeStock` has defaulted to `false` since the same day.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. `consumeFreeStock` STAYS OFF, AND THAT RULING IS RIGHT.
 *
 * Jess, 2026-07-21: make-to-order goods are labelled per order, and floating
 * them without a WMS/scan confuses goods-in/out. Nothing here turns it on. The
 * defect P10 fixes is not the ruling — it is that a decision reserved for a
 * human was never SHOWN to the human. So the suggestion is advisory and taking
 * it is an ACT.
 *
 * 2. A SUGGESTION IS MADE OF WHOLE STOCK RECORDS, AND THAT IS WHY IT IS
 *    ALWAYS EXACTLY EXECUTABLE.
 *
 * K4's door (`ops_stock_pool_draw`, 0292) flips ONE REGISTER RECORD per call
 * and its ledger row records that record's own qty — 0292 says so in its own
 * words, and refuses to split a bulk row because "splitting a 555-unit
 * accessory row belongs to the reservation engine". Live proof that this is
 * not theoretical: `SONIC-L1202S-Q` and `DIVAN ONLY (K)` are single records
 * holding 2 units each.
 *
 * So a suggestion of "2" composed from a record of 2 is exactly executable and
 * a suggestion of "1" against that same record would DRAW 2 — an over-draw
 * nobody asked for. {@link suggestReadyStockTake} therefore composes the
 * number out of whole records and can never propose a quantity the door cannot
 * deliver. That is also what makes Loo's ruling 3 buildable: *"no free-typed
 * quantity box — the system suggests, the human accepts"*. A typed 1 would
 * have had to be refused or silently rounded; a suggestion has neither problem.
 *
 * 3. UNITS ALREADY RESERVED TO AN ORDER ARE THAT ORDER'S SUPPLY.
 *
 * {@link netReservedToOrder} is the other half, and it is NOT the ruling above
 * in disguise. `consumeFreeStock` eats the FREE POOL — goods nobody has
 * committed. This nets units a human has already committed to THIS order,
 * which is the same class of fact as an open purchase-order line: goods that
 * are already this order's. Without it a take reserves the units and the row
 * still asks to buy them, so "taking reduces the quantity" and "the PO that
 * follows carries the reduced quantity" — the card's own Done-when — are both
 * false, and the only other way to make them true is a second store of "how
 * much of this line came off the shelf", which is a second truth about units
 * the register already knows about.
 */

import { stockMatchKey } from "./line-category";

// ── 1 · What the system suggests ────────────────────────────────────────────

/** One free record in the per-unit register (`ops_stock_items`). */
export interface FreeStockRecord {
  /** `ops_stock_items.id` — the door claims THIS record, never a quantity. */
  id: string;
  /** The record's own qty. A bulk row is ONE record of N units (0218). */
  qty: number;
}

export interface ReadyStockSuggestion {
  /**
   * Units this suggestion takes. Always the sum of whole records, so accepting
   * it can be executed exactly — never rounded, never partially refused.
   */
  take: number;
  /**
   * Every free unit matching the build, whole records included. It is what the
   * expanded row STATES (`Klang: 2 available`); `take` is what the button DOES.
   * They differ whenever the shelf holds more than the row needs, and the
   * operator is owed both numbers rather than the smaller one alone.
   */
  available: number;
  /** The records the take consumes, in the order they are claimed. */
  itemIds: string[];
}

/**
 * The largest set of WHOLE records whose units do not exceed `need`.
 *
 * Records are consumed in the order given — the caller supplies FIFO (oldest
 * `date_in` first), which is the pick rule `ops_stock_reserve` has used since
 * 0137 and `ops_stock_pool_draw` still uses. A record too big for what is left
 * is SKIPPED rather than ending the walk: a 2-unit record must not hide a
 * 1-unit record behind it when the row needs 1.
 *
 * Returns `null` when nothing can be taken — no records, a need of zero, or
 * every record larger than the need. `null` is what makes the card's *"a row
 * with no stock is visually untouched"* structural: there is no zero-valued
 * suggestion for a screen to render as `0`.
 */
export function suggestReadyStockTake(
  need: number,
  records: readonly FreeStockRecord[],
): ReadyStockSuggestion | null {
  const available = records.reduce((s, r) => s + Math.max(0, r.qty), 0);
  if (available <= 0) return null;
  let left = Math.max(0, Math.trunc(need));
  let take = 0;
  const itemIds: string[] = [];
  for (const r of records) {
    const q = Math.max(0, Math.trunc(r.qty));
    if (q === 0 || q > left) continue;
    itemIds.push(r.id);
    take += q;
    left -= q;
    if (left === 0) break;
  }
  if (take <= 0) return null;
  return { take, available, itemIds };
}

// ── 2 · What is already this order's ────────────────────────────────────────

/** The reference a draw writes onto a unit it commits to a customer order. */
export function orderStockRef(so: number): string {
  return `SO-${so}`;
}

export interface ReservedUnit {
  /** `ops_stock_items.reserved_ref` — `SO-1234`. */
  ref: string;
  sku: string;
  qty: number;
}

/**
 * Group reserved units the way a demand line asks about them: by the reference
 * they are committed to AND the ONE match rule the portal already uses to link
 * an order line to warehouse stock (`stockMatchKey`, Jess-locked 2026-07-01 —
 * the readiness badge and the booking gate both read it, so To Order asking
 * the same question a different way would be a second answer).
 */
export function reservedUnitsByRefAndKey(
  units: readonly ReservedUnit[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of units) {
    const k = `${u.ref}::${stockMatchKey(u.sku)}`;
    m.set(k, (m.get(k) ?? 0) + Math.max(0, u.qty));
  }
  return m;
}

export interface NettableLine {
  lineId: string;
  sku: string;
  qty: number;
  /** The reference units for this line would be reserved under; `null` = none. */
  ref: string | null;
}

/**
 * How much of each line is STILL to buy once units already reserved to that
 * line's own order are counted as supply.
 *
 * The pool is drained across the lines that share a reference and a match key,
 * in input order, so two lines of one order asking for the same product cannot
 * each claim the same reserved units. A line with no reference is untouched.
 *
 * Never below zero: over-reservation (more units committed than the order asks
 * for) leaves the line at 0 rather than crediting the surplus elsewhere.
 */
export function netReservedToOrder(
  lines: readonly NettableLine[],
  reservedByRefKey: ReadonlyMap<string, number>,
): Map<string, number> {
  const pool = new Map(reservedByRefKey);
  const out = new Map<string, number>();
  for (const l of lines) {
    const qty = Math.max(0, l.qty);
    if (l.ref == null) {
      out.set(l.lineId, qty);
      continue;
    }
    const k = `${l.ref}::${stockMatchKey(l.sku)}`;
    const have = pool.get(k) ?? 0;
    const used = Math.min(qty, have);
    if (used > 0) pool.set(k, have - used);
    out.set(l.lineId, qty - used);
  }
  return out;
}
