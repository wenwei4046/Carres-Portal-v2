/**
 * STOCK VALUE — the ONE arithmetic for Finance's PROVISIONAL month-end stock
 * value (migration 0643; Chew 2026-10-03, docs/finance/MASTER.md §3.5).
 *
 * `fin_stock_value` serves the Units: every Carres-owned Unit held at the end
 * of the chosen day, the group it falls in and its cost. The group totals are
 * added up here and nowhere else (Law D), in whole sen through Daily Bank's
 * reader. A Unit with no cost recorded is counted, never valued as zero.
 *
 * It is provisional until Stock's Month-end Stock Confirmation exists (Stock
 * MASTER §12.10); then that confirmation is the figure, and this is retired.
 */
import { z } from "zod";
import { sen } from "./daily-bank";

export const STOCK_BUCKETS = ["warehouse", "showroom", "transit", "repair", "unclassified"] as const;
export type StockBucket = (typeof STOCK_BUCKETS)[number];

/** The words for each group (COPY-STANDARD "Finance (Chew)" · Stock value). */
export const STOCK_BUCKET_WORD: Record<StockBucket, string> = {
  warehouse: "Warehouse",
  showroom: "Showroom",
  transit: "In transit",
  repair: "Sent for repair",
  unclassified: "Not placed",
};

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-31");

/** `GET /finance/ledger/stock-value?monthEnd=` — the day the stock is valued at. */
export const stockValueQuery = z.object({ monthEnd: isoDay }).strict();
export type StockValueQuery = z.infer<typeof stockValueQuery>;

type Wire = number | string;

export interface StockValueUnit {
  id: string;
  unit_code: string;
  sku: string;
  qty: number;
  scope: "unit" | "quantity";
  /** As it stood at the cut: free · reserved · on_hold · transferred. */
  status: string;
  bucket: StockBucket;
  site_name: string | null;
  holder_name: string | null;
  po_no: string | null;
  /** Per unit; null when no cost is recorded. A free-of-charge line is 0. */
  unit_cost: Wire | null;
  value: Wire | null;
}

export interface StockValueAnswer {
  month_end: string;
  cut_at: string;
  today: string;
  provisional: true;
  units: StockValueUnit[];
  left_out: { consignment_units: number; consignment_qty: number };
}

export interface StockBucketTotal {
  bucket: StockBucket;
  /** Rows: a Unit, or one quantity row. */
  units: number;
  qty: number;
  /** Sen, over the Units whose cost is recorded. */
  value: number;
  /** Units with no cost recorded: not in `value`. */
  noCost: number;
}

export interface StockValueReport {
  buckets: StockBucketTotal[];
  total: Omit<StockBucketTotal, "bucket">;
}

/**
 * The groups and the total. Refuses an answer it cannot read: an unknown
 * group, a quantity that is not a whole number above zero, or a value that is
 * not the quantity times the cost to the sen.
 */
export function stockValueReport(a: StockValueAnswer): StockValueReport {
  const by = new Map<StockBucket, StockBucketTotal>(
    STOCK_BUCKETS.map((b) => [b, { bucket: b, units: 0, qty: 0, value: 0, noCost: 0 }]),
  );
  for (const u of a.units) {
    const t = by.get(u.bucket);
    if (!t) throw new Error("Stock value does not add up.");
    if (!Number.isInteger(u.qty) || u.qty < 1) throw new Error("Stock value does not add up.");
    t.units += 1;
    t.qty += u.qty;
    if (u.unit_cost === null || u.unit_cost === undefined) {
      if (u.value !== null && u.value !== undefined) throw new Error("Stock value does not add up.");
      t.noCost += 1;
      continue;
    }
    if (u.value === null || u.value === undefined) throw new Error("Stock value does not add up.");
    const value = sen(u.value);
    if (value !== u.qty * sen(u.unit_cost)) throw new Error("Stock value does not add up.");
    t.value += value;
  }
  const buckets = [...by.values()];
  const total = buckets.reduce(
    (s, b) => ({ units: s.units + b.units, qty: s.qty + b.qty, value: s.value + b.value, noCost: s.noCost + b.noCost }),
    { units: 0, qty: 0, value: 0, noCost: 0 },
  );
  return { buckets, total };
}

/** The last day of a YYYY-MM month. */
export function lastDayOf(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, "0")}`;
}
