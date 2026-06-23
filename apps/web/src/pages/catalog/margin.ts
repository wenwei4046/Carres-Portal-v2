/**
 * Pure helper for SKU plan margin.
 *
 * "Plan margin" = catalog selling price minus catalog procurement cost.
 * It is NOT realized profit (no overheads, no fabric surcharge for sofas).
 * For sofa models, label the result "base margin" in the UI to signal that
 * the sofa-fabric surcharge axis is excluded.
 *
 * Rules:
 *  - cost === null  → return null  ("cost not set"; NEVER coerce to 0)
 *  - price === 0    → pct = 0      (price-not-set sentinel; avoid ÷0)
 */

export interface SkuMargin {
  /** price − cost, in RM */
  amount: number;
  /** (price − cost) / price, 0–1 range; 0 when price === 0 */
  pct: number;
}

export function skuMargin(price: number, cost: number | null): SkuMargin | null {
  if (cost === null) return null;
  const amount = price - cost;
  const pct = price === 0 ? 0 : amount / price;
  return { amount, pct };
}
