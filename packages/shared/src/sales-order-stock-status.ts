/**
 * ⭐ SALES ORDER `Stock Status` — ONE fact, ONE summary rule (owner-approved
 * scope, Jess 2026-10-05; Orders MASTER § Stock Status; COPY-STANDARD
 * § Sales Order Stock Status).
 *
 * Measured before it: `GET /register-facts` wrote `unknown` for every SKU of
 * every order (#1838), so every Sales Order printed `Receipt unconfirmed`.
 *
 * The register column, the per-line pill in the items table, the `stock`
 * filter and `Group by: Stock Status` all read THIS function, and it reads the
 * Order Route's own arrangement (`routeGoodsLinesOf`): the `po_line_sources`
 * lineage, Receiving's counts in lineage order, a cancelled PO covering
 * nothing, and the Units Stock binds to each line. Nothing here re-reads a
 * table or re-derives a binding (Law D).
 *
 *   To purchase      no usable goods yet, and some required quantity is not
 *                    fully purchased
 *   Awaiting goods   no usable goods yet, the required quantity is fully
 *                    purchased and the purchased goods have NOT arrived
 *   Partially ready  part of the required quantity is usable, a gap remains
 *   Ready            the whole required quantity is usable AND allocated to
 *                    this order — goods only; it never claims any other
 *                    Delivery release condition is met
 *
 * USABLE = Units reserved to the line in a deliverable condition, or already
 * delivered against it (a delivered line reads Ready, never To purchase).
 * Damaged or wrong goods are never usable: they are counted apart as the
 * issue indicator `{k} damaged or wrong`, which is not a fifth status. A
 * failed read is not a status either — the reader returns no fact at all.
 * Service lines and lines with no quantity are not goods and are excluded.
 *
 * Owner rulings 2026-10-05: exactly FOUR states, no fifth. Available stock
 * never changes a status by itself — `Reserve stock` is a manual act through
 * the existing reservation door, and only a confirmed reservation moves the
 * line toward Ready. ⚠ ONE case fits no state truthfully and is held apart as
 * `open_decision` until the owner rules (see `stockStatusOfCounts`).
 */
import { lineKind } from "./line-category";
import { routeGoodsLinesOf, type RouteGoodsFacts, type RouteGoodsLine } from "./sales-order-route-goods";

export type SalesOrderStockStatus = "to_purchase" | "awaiting_goods" | "partially_ready" | "ready";
/**
 * ⚠ NOT A STATUS — the one isolated case the owner has not ruled (2026-10-05):
 * goods bought for this order ARRIVED but no Unit is reserved to it, and no
 * part of it is usable. `Awaiting goods` would send staff to chase a supplier
 * for goods already in the warehouse, so it is never printed as that. The
 * owner's ruling replaces this value with one of the four, in ONE place
 * (`stockStatusOfCounts`), before this ships.
 */
export const STOCK_OPEN_DECISION = "open_decision" as const;
export type SalesOrderStockVerdict = SalesOrderStockStatus | typeof STOCK_OPEN_DECISION;

/** The four approved states, in reading order, with their solid-pill tone
 *  (UI MASTER §3: complete green · partial blue · waiting/not started grey;
 *  red only for a proven late/blocking condition, which none of these is). */
export const SALES_ORDER_STOCK_STATUSES = [
  {
    key: "to_purchase",
    label: "To purchase",
    tone: "neutral",
    legend: "No goods are usable for this order yet, and part of the required quantity is not purchased.",
  },
  {
    key: "awaiting_goods",
    label: "Awaiting goods",
    tone: "neutral",
    legend: "Waiting for goods from the supplier.",
  },
  {
    key: "partially_ready",
    label: "Partially ready",
    tone: "info",
    legend: "Part of the required goods is usable and allocated to this order. The rest is still missing.",
  },
  {
    key: "ready",
    label: "Ready",
    tone: "success",
    legend: "All required goods are usable and allocated to this order. Delivery may still need other conditions.",
  },
] as const satisfies ReadonlyArray<{
  key: SalesOrderStockStatus;
  label: string;
  tone: "neutral" | "info" | "success";
  legend: string;
}>;

export function stockStatusWord(status: SalesOrderStockStatus): string {
  return SALES_ORDER_STOCK_STATUSES.find((row) => row.key === status)!.label;
}

/** The issue indicator — the Order Route's governed RECEIVING phrase. Amber. */
export function stockIssueWord(issueQty: number): string {
  return `${issueQty} damaged or wrong`;
}
export const STOCK_ISSUE_LEGEND = "Damaged or wrong goods are not usable and do not count toward Ready.";

/** The quantities ONE status is read from — a line's, or an order's sum. */
export interface StockReadinessCounts {
  requiredQty: number;
  usableQty: number;
  purchasedQty: number;
  /** Damaged or wrong goods in this line's share of a receipt, plus reserved
   *  Units Stock controls (damaged, waiting for repair). */
  issueQty: number;
  /** Goods received on the line's own lineage that no Unit binding gives to
   *  the order yet (see the REAL GAP below). Carried, not yet mapped. */
  arrivedUnallocatedQty: number;
}

export interface SalesOrderStockLine extends StockReadinessCounts {
  lineId: string;
  sku: string;
  status: SalesOrderStockVerdict;
}

export interface SalesOrderStockFact extends StockReadinessCounts {
  /** `null` — the order carries no goods (services only): `Not applicable`. */
  status: SalesOrderStockVerdict | null;
  lines: SalesOrderStockLine[];
}

/** THE ONE SUMMARY RULE. A line and an order are read by the same function;
 *  the order's counts are its lines' counts, each already capped at the
 *  line's own quantity, so one line's surplus never fills another's gap. */
export function stockStatusOfCounts(c: StockReadinessCounts): SalesOrderStockVerdict | null {
  if (c.requiredQty <= 0) return null;
  if (c.usableQty >= c.requiredQty) return "ready";
  if (c.usableQty > 0) return "partially_ready";
  if (c.purchasedQty < c.requiredQty) return "to_purchase";
  /* ⚠ THE ONE ISOLATED RULE — owner decision pending (2026-10-05). Fully
     purchased, nothing usable, and goods bought for this order have ARRIVED
     but no Unit is reserved to it. `Awaiting goods` is true only while the
     purchased goods have NOT arrived, so this case is held apart. The ruling
     changes THIS line and nothing else. */
  if (c.arrivedUnallocatedQty > 0) return STOCK_OPEN_DECISION;
  return "awaiting_goods";
}

const issueOf = (line: RouteGoodsLine) =>
  line.atRiskQty + line.sources.reduce((sum, source) => sum + source.damagedOrWrongQty, 0);

/** The fact, from lines the Route's own arrangement already produced. */
export function stockFactOfGoodsLines(goods: readonly RouteGoodsLine[]): SalesOrderStockFact {
  const lines: SalesOrderStockLine[] = [];
  for (const line of goods) {
    if (line.qty <= 0) continue;
    const counts: StockReadinessCounts = {
      requiredQty: line.qty,
      usableQty: Math.min(line.qty, line.usableQty),
      purchasedQty: Math.min(line.qty, Math.max(line.purchasedQty, line.usableQty)),
      issueQty: issueOf(line),
      arrivedUnallocatedQty: line.arrivedUnallocatedQty,
    };
    lines.push({ lineId: line.lineId, sku: line.sku, ...counts, status: stockStatusOfCounts(counts)! });
  }
  const sum = (key: keyof StockReadinessCounts) => lines.reduce((total, line) => total + line[key], 0);
  const counts: StockReadinessCounts = {
    requiredQty: sum("requiredQty"),
    usableQty: sum("usableQty"),
    purchasedQty: sum("purchasedQty"),
    issueQty: sum("issueQty"),
    arrivedUnallocatedQty: sum("arrivedUnallocatedQty"),
  };
  return { ...counts, status: stockStatusOfCounts(counts), lines };
}

/**
 * One order's `Stock Status` from the owners' records. Service lines are not
 * goods (the same filter the Order Route applies before it draws a lane).
 */
export function salesOrderStockOf(facts: RouteGoodsFacts): SalesOrderStockFact {
  return stockFactOfGoodsLines(
    routeGoodsLinesOf({ ...facts, lines: facts.lines.filter((line) => lineKind(line.sku) !== "service") }),
  );
}
