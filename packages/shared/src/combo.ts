/**
 * Combo (套餐) price-split helper (migration 0177).
 *
 * A combo is a fixed-set bundle sold at ONE `comboPrice`. At submit time we
 * must split that single price back across the component SKUs so each order
 * line carries a sensible per-unit price — the line totals must add back up to
 * the combo price exactly (for the common case), and the split should be
 * proportional to each component's catalog value so margins stay sane.
 *
 * `explodeCombo` is PURE: no React, no IO, no Supabase. It takes the combo plus
 * a `skuPrice(sku) => number` lookup the caller supplies (from the catalog) and
 * returns the exploded order lines. All math is done in INTEGER CENTS to avoid
 * floating-point drift, then converted back to clean 2-dp RM at the end.
 */

import type { ComboComponent } from "./domain";

export interface ExplodedComboLine {
  sku: string;
  qty: number;
  unitPrice: number;
  comboKey: string;
  comboLabel: string;
}

/**
 * Split a combo's single `comboPrice` across its components, proportional to
 * each component's catalog value (`skuPrice(sku) * qty`). Integer-cents math.
 *
 * Algorithm (do NOT change without re-deriving — order + residue matter):
 *   1. Empty `components` → return `[]`.
 *   2. Sort components by `sortOrder` ascending, STABLE (ties keep input order).
 *   3. `comboCents = round(comboPrice * 100)`.
 *   4. Per component i: `unitCatalog_i = max(0, skuPrice(sku_i))`,
 *      `weight_i = unitCatalog_i * qty_i`.
 *   5. `W = Σ weight_i`. If `W <= 0` (all components zero-price), fall back to
 *      splitting by unit count: `weight_i = qty_i`, `W = Σ qty_i`.
 *   6. For every component EXCEPT the last (in sorted order):
 *        rawLineCents_i = comboCents * weight_i / W
 *        unitCents_i    = round(rawLineCents_i / qty_i)   (nearest cent / UNIT)
 *        lineCents_i    = unitCents_i * qty_i
 *   7. The LAST component absorbs the residue:
 *        lineCentsLast  = comboCents - Σ_{i<last} lineCents_i
 *        unitCentsLast  = round(lineCentsLast / qtyLast)
 *   8. `unitPrice_i = unitCents_i / 100` (clean 2-dp).
 *
 * EXACTNESS: `round(Σ(unitPrice_i × qty_i), 2) === comboPrice` holds EXACTLY
 * whenever the residue is absorbable — which is ALWAYS true when the last
 * component has `qty === 1` (including every all-qty-1 combo, the common case).
 * When ALL components have `qty > 1` and `qtyLast` does not divide the residual
 * cents, the last line carries a residual of at most `(qtyLast - 1)` cents
 * (immaterial for furniture pricing). This is accepted v1 behaviour, not a bug.
 */
export function explodeCombo(
  combo: {
    comboKey: string;
    name: string;
    comboPrice: number;
    components: ComboComponent[];
  },
  skuPrice: (sku: string) => number,
): ExplodedComboLine[] {
  // 1. Empty → nothing to explode.
  if (combo.components.length === 0) return [];

  // 2. Stable sort by sortOrder ascending (ties keep input order). Spreading
  // first guards against mutating the caller's array; Array.prototype.sort is
  // stable in modern JS so equal sortOrder values keep their original order.
  const sorted = [...combo.components].sort((a, b) => a.sortOrder - b.sortOrder);

  // 3. Whole price in integer cents.
  const comboCents = Math.round(combo.comboPrice * 100);

  // 4. Catalog weight per component (clamp negative catalog prices to 0).
  let weights = sorted.map((c) => Math.max(0, skuPrice(c.sku)) * c.qty);
  let W = weights.reduce((acc, w) => acc + w, 0);

  // 5. All zero-price → split by unit count instead of value.
  if (W <= 0) {
    weights = sorted.map((c) => c.qty);
    W = weights.reduce((acc, w) => acc + w, 0);
  }

  const lastIdx = sorted.length - 1;
  const unitCents: number[] = new Array(sorted.length);
  let allocatedCents = 0;

  // 6. Every component except the last gets its proportional share, rounded to
  // the nearest cent PER UNIT.
  for (let i = 0; i < lastIdx; i++) {
    const c = sorted[i];
    const rawLineCents = (comboCents * weights[i]) / W;
    const u = Math.round(rawLineCents / c.qty);
    unitCents[i] = u;
    allocatedCents += u * c.qty;
  }

  // 7. Last component absorbs whatever cents remain.
  const last = sorted[lastIdx];
  const lineCentsLast = comboCents - allocatedCents;
  unitCents[lastIdx] = Math.round(lineCentsLast / last.qty);

  // 8 + 9. Back to clean 2-dp RM, one entry per component (sorted order),
  // stamped with the combo key + label so downstream lines can be grouped.
  return sorted.map((c, i) => ({
    sku: c.sku,
    qty: c.qty,
    unitPrice: unitCents[i] / 100,
    comboKey: combo.comboKey,
    comboLabel: combo.name,
  }));
}
