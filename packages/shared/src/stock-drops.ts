/**
 * STOCK DROPS — what Finance reads of Stock's write-offs (migration 0714's
 * Stock Adjustment and Stock Take; YH 2026-10-26: no journal, a read-only list
 * for Finance).
 *
 * Each written-off Unit is valued the way the provisional stock value values
 * it (0643, `stock-value.ts`): its PO line cost; a free-of-charge line costs
 * nothing; no PO line, or a line with no price, is no cost recorded — listed,
 * never valued as zero. The total is added up here and nowhere else (Law D),
 * in whole sen through Daily Bank's reader. Nothing is posted.
 */
import { sen } from "./daily-bank";

type Wire = number | string;

/** The PO line a Unit was bought on, as the database sends it. */
export interface StockDropPoLine {
  cost: Wire | null;
  commercial_treatment: string | null;
}

/** Per-unit cost, as 0643 reads it; null when no cost is recorded. */
export function stockDropUnitCost(line: StockDropPoLine | null | undefined): number | null {
  if (!line) return null;
  if (line.commercial_treatment === "free_of_charge") return 0;
  if (line.cost === null || line.cost === undefined || line.cost === "") return null;
  return sen(line.cost) / 100;
}

export interface StockDropRow {
  /** stock_adjustment_units: one written-off Unit on one Stock Adjustment. */
  key: string;
  adjustment_no: string;
  dropped_at: string;
  site_name: string | null;
  reason: string;
  unit_code: string;
  sku: string;
  qty: number;
  /** Per unit, RM; null when no cost is recorded. A free-of-charge line is 0. */
  unit_cost: number | null;
  /** qty × unit_cost, RM; null when no cost is recorded. */
  value: number | null;
}

export interface StockDropsTotal {
  units: number;
  /** Sen, over the Units whose cost is recorded. */
  value: number;
  /** Units with no cost recorded: not in `value`. */
  noCost: number;
}

/** The value of one written-off Unit: qty × cost to the sen, or null. */
export function stockDropValue(qty: number, unitCost: number | null): number | null {
  if (!Number.isInteger(qty) || qty < 1) throw new Error("Stock drops do not add up.");
  return unitCost === null ? null : (qty * sen(unitCost)) / 100;
}

export function stockDropsTotal(rows: readonly Pick<StockDropRow, "value">[]): StockDropsTotal {
  return rows.reduce<StockDropsTotal>(
    (t, r) => (r.value === null
      ? { ...t, units: t.units + 1, noCost: t.noCost + 1 }
      : { ...t, units: t.units + 1, value: t.value + sen(r.value) }),
    { units: 0, value: 0, noCost: 0 },
  );
}
