import { z } from "zod";
import type { ProductCategory } from "./db-types";
import { computeNetRequirements, type DemandLine } from "./net-requirements";
import { categoryLabel, isToOrderCategory } from "./to-order";

/**
 * MRP — one read-only screen of Needed · In Stock · On PO · Shortage per item
 * (YH, 30 Oct 2026; Purchasing MASTER §5.1 "MRP page").
 *
 * It stores nothing and owns no arithmetic: the customer lines come from
 * `loadToOrder`, the read SO Batch Purchase runs on, and the open PO draw is
 * `computeNetRequirements`, so Shortage is what SO Batch Purchase still has to
 * buy. Free Stock is shown and never netted (Jess, 2026-07-21).
 */

export const MRP_WORDS = {
  page: "MRP",
  sku: "SKU",
  item: "Item",
  supplier: "Supplier",
  needed: "Needed",
  inStock: "In Stock",
  onPo: "On PO",
  shortage: "Shortage",
  freeStock: "Free Stock",
  salesOrder: "Sales Order",
  customer: "Customer",
  delivery: "Delivery Date",
  show: "Show",
  category: "Category",
  all: "All",
  shortages: "Shortages",
  total: "Total",
  export: "Export",
  notRecorded: "Not recorded",
  empty: "Nothing is needed for these filters.",
  loadFailed: "Could not be loaded",
  tryAgain: "Try again",
  clearFilters: "Clear all",
  note: "Shortage is Needed less In Stock less On PO. In Stock is held for these orders. Free Stock is held for no order and lowers Shortage only once it is taken on SO Batch Purchase. Each sofa module counts as its own item.",
} as const;

/** One customer line as `loadToOrder` read it, before the open PO draw. */
export interface MrpSourceLine {
  lineId: string;
  orderId: string;
  so: number | null;
  customer: string | null;
  sku: string;
  model: string | null;
  variant: string | null;
  category: ProductCategory;
  supplierName: string | null;
  delivery: string | null;
  placedAt: string;
  /** What the customer ordered on this line. */
  needed: number;
  /** Ready Stock units already held for this line. */
  heldInStock: number;
  /** Incoming PO units already reserved for this line. */
  heldOnPo: number;
}

export const mrpLineSchema = z.object({
  lineId: z.string(),
  orderId: z.string(),
  so: z.number().nullable(),
  customer: z.string().nullable(),
  sku: z.string(),
  model: z.string().nullable(),
  variant: z.string().nullable(),
  category: z.string(),
  supplierName: z.string().nullable(),
  delivery: z.string().nullable(),
  needed: z.number(),
  inStock: z.number(),
  onPo: z.number(),
  shortage: z.number(),
});
export type MrpLine = z.infer<typeof mrpLineSchema>;

export const mrpResponseSchema = z.object({
  lines: z.array(mrpLineSchema),
  freeStockBySku: z.record(z.string(), z.number()),
});
export type MrpResponse = z.infer<typeof mrpResponseSchema>;

/** Draw the open POs across the lines, earliest delivery first, per line. */
export function buildMrpLines(
  sources: readonly MrpSourceLine[],
  openPoBySku: Readonly<Record<string, number>>,
  today: string,
): MrpLine[] {
  const eligible = sources.filter((s) => isToOrderCategory(s.category));
  const demand: DemandLine[] = eligible.map((s) => ({
    lineId: s.lineId,
    orderId: s.orderId,
    sku: s.sku,
    category: s.category,
    supplierId: "",
    qty: Math.max(0, s.needed - s.heldInStock - s.heldOnPo),
    deadline: s.delivery,
    leadDays: 0,
    placedAt: s.placedAt,
    committed: true,
  }));
  const net = computeNetRequirements(demand, { openPoBySku }, { today });
  const byLine = new Map(net.lines.map((r) => [r.line.lineId, r]));
  return eligible.map((s) => {
    const r = byLine.get(s.lineId);
    return {
      lineId: s.lineId,
      orderId: s.orderId,
      so: s.so,
      customer: s.customer,
      sku: s.sku,
      model: s.model,
      variant: s.variant,
      category: s.category,
      supplierName: s.supplierName,
      delivery: s.delivery,
      needed: s.needed,
      inStock: s.heldInStock,
      onPo: s.heldOnPo + (r?.coveredByOpenPo ?? 0),
      shortage: r?.toOrder ?? 0,
    };
  });
}

export interface MrpRow {
  sku: string;
  item: string;
  category: string;
  supplierName: string | null;
  needed: number;
  inStock: number;
  onPo: number;
  shortage: number;
  freeStock: number;
  lines: MrpLine[];
}

export interface MrpFilters {
  category: string | null;
  /** `YYYY-MM`, `none` for a line with no delivery date, or null for all. */
  month: string | null;
  shortagesOnly: boolean;
}

/**
 * Combined rows per SKU. Filtering happens AFTER the draw, so a filter can
 * never hand one order's PO cover to another and the rows always add up to
 * the lines under them. Biggest Shortage first.
 */
export function mrpRows(
  lines: readonly MrpLine[],
  freeStockBySku: Readonly<Record<string, number>>,
  filters: MrpFilters,
): MrpRow[] {
  const bySku = new Map<string, MrpRow>();
  for (const l of lines) {
    if (filters.category != null && l.category !== filters.category) continue;
    if (filters.month != null && (l.delivery?.slice(0, 7) ?? "none") !== filters.month) continue;
    let row = bySku.get(l.sku);
    if (!row) {
      row = {
        sku: l.sku,
        item: [l.model, l.variant].filter(Boolean).join(" ") || l.sku,
        category: l.category,
        supplierName: l.supplierName,
        needed: 0,
        inStock: 0,
        onPo: 0,
        shortage: 0,
        freeStock: freeStockBySku[l.sku] ?? 0,
        lines: [],
      };
      bySku.set(l.sku, row);
    }
    row.needed += l.needed;
    row.inStock += l.inStock;
    row.onPo += l.onPo;
    row.shortage += l.shortage;
    row.lines.push(l);
  }
  return [...bySku.values()]
    .filter((r) => !filters.shortagesOnly || r.shortage > 0)
    .sort((a, b) => b.shortage - a.shortage || (a.sku < b.sku ? -1 : 1));
}

/** The rows as the table prints them, one header line then one line per SKU. */
export function mrpCsv(rows: readonly MrpRow[]): string {
  const W = MRP_WORDS;
  const cell = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    [W.sku, W.item, W.category, W.supplier, W.needed, W.inStock, W.onPo, W.shortage, W.freeStock],
    ...rows.map((r) => [
      r.sku, r.item, categoryLabel(r.category), r.supplierName,
      r.needed, r.inStock, r.onPo, r.shortage, r.freeStock,
    ]),
  ].map((cells) => cells.map(cell).join(",")).join("\r\n");
}
