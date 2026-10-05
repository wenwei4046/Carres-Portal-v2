/**
 * MONTHLY DEMAND — the physical pieces still owed to customers, by the month
 * they asked for them.
 *
 * ⭐ OWNER RULINGS 2026-09-22 and 2026-09-26 (Orders MASTER § Monthly demand).
 * This is confirmed order demand, never a forecast. It ARRANGES facts their
 * owners recorded and derives nothing of its own:
 *   the month          `orders.delivery_date` — the customer's requested date,
 *                      never the document date, Proceed Date or a supplier's
 *   the quantity       the current effective Revision's `order_lines.qty`
 *   delivered          Stock's Units sold against the order, by the line the
 *                      Unit names (`reserved_order_line_id`)
 *   To buy             SO Batch Purchase's one arithmetic, handed in per LINE,
 *                      so a Product category narrows it with the lines it counts.
 *                      A category SO Batch does not buy per order (Accessory:
 *                      warehouse ready stock) has no To buy: `not-applicable`,
 *                      which the page prints as `Not applicable`, never `0`
 * A date is never manufactured: an order with no definite date is counted
 * under `No delivery date`. A source that could not be read is `null`, which
 * the page prints as `Unavailable` — never zero.
 */
import { goodsCategoryWordOf } from "./line-category";
import { normalizeSkuKey } from "./sku-code";

export const MONTHLY_DEMAND_CATEGORIES = ["Mattress", "Bedframe", "Sofa", "Accessory"] as const;
export type MonthlyDemandCategory = (typeof MONTHLY_DEMAND_CATEGORIES)[number];

/**
 * The categories SO Batch Purchase buys PER ORDER. Accessories (mattress
 * protectors, pillows) are warehouse ready stock, fulfilled from stock and
 * replenished ahead (Purchasing MASTER § MP / PILLOW STOCK PATH; Purchasing
 * agreed 2026-10-05), so a view narrowed to them has no To buy at all.
 */
const BOUGHT_PER_ORDER: ReadonlySet<MonthlyDemandCategory> = new Set(["Mattress", "Bedframe", "Sofa"]);

export interface MonthlyDemandOrder {
  id: string;
  /** `orders.delivery_date` (YYYY-MM-DD). */
  deliveryDate: string | null;
  /** Legacy `delivery_date_tbd`: the customer was asked and gave no date. */
  deliveryDateTbd: boolean;
  /** Where the order was SOLD — the showroom, else the dealer. */
  salesLocation: string | null;
  /** Where the goods GO. */
  state: string | null;
  city: string | null;
  lines: ReadonlyArray<{
    id: string;
    sku: string;
    qty: number;
    /** The catalog's category, stamped by the server. Null = no catalog row. */
    category?: string | null;
    attrs?: Record<string, unknown> | null;
  }>;
  /** Units sold against this order. */
  delivered: ReadonlyArray<{ orderLineId: string | null; sku: string; qty?: number | null }>;
}

export interface MonthlyDemandFilters {
  salesLocation?: string | null;
  state?: string | null;
  city?: string | null;
  category?: MonthlyDemandCategory | null;
}

export interface MonthlyDemandRow {
  /** `before` · `YYYY-MM` · `after` · `no-date` · `total`. */
  key: string;
  kind: "before" | "month" | "after" | "no-date" | "total";
  /** The month the row is about: its own, or the window edge it lies beyond. */
  month: string | null;
  /** Not delivered, by category. */
  categories: Record<MonthlyDemandCategory, number>;
  notInCatalog: number;
  totalQty: number;
  delivered: number;
  notDelivered: number;
  /** Null = SO Batch Purchase could not be read. `not-applicable` = the chosen
   *  Product category is not bought per order, so there is nothing to count. */
  toBuy: number | null | "not-applicable";
}

export interface MonthlyDemandView {
  window: { months: string[]; first: string; last: string };
  rows: MonthlyDemandRow[];
  /** The three numbers — ONE month, never the table's Total. */
  focus: { month: string; totalQty: number; delivered: number; notDelivered: number };
  hasNotInCatalog: boolean;
  choices: { salesLocations: string[]; states: string[]; cities: string[] };
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const count = (value: unknown) => Math.max(0, Math.floor(Number(value) || 0));
const skuOf = (sku: string) => normalizeSkuKey(sku) || sku;
const words = (value: string | null | undefined) => value?.trim() || null;

export function monthlyDemandWindowOf(startMonth: string, months: number) {
  const size = Math.min(6, Math.max(1, Math.floor(months) || 1));
  const start = MONTH.test(startMonth) ? startMonth : "1970-01";
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7)) - 1;
  const list = Array.from({ length: size }, (_, i) => {
    const at = year * 12 + month + i;
    return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
  });
  return { months: list, first: list[0]!, last: list[list.length - 1]! };
}

const emptyRow = (key: string, kind: MonthlyDemandRow["kind"], month: string | null, toBuy: MonthlyDemandRow["toBuy"]): MonthlyDemandRow => ({
  key,
  kind,
  month,
  categories: { Mattress: 0, Bedframe: 0, Sofa: 0, Accessory: 0 },
  notInCatalog: 0,
  totalQty: 0,
  delivered: 0,
  notDelivered: 0,
  toBuy,
});

/** The column a goods line is counted in. Null = a service, which is no piece. */
export function monthlyDemandCategoryOf(line: Pick<MonthlyDemandOrder["lines"][number], "sku" | "attrs" | "category">): MonthlyDemandCategory | "not-in-catalog" | null {
  const word = goodsCategoryWordOf({ sku: line.sku, attrs: line.attrs ?? undefined, category: line.category ?? undefined });
  if (word === "Service") return null;
  if (word === "Other goods") return "not-in-catalog";
  if (word === "Mattress" || word === "Bedframe" || word === "Sofa") return word;
  /* Pillow, Mattress protector, Topper, Footrest and Accessory are one column. */
  return "Accessory";
}

/** What each line has had delivered, never more than was ordered. */
function deliveredByLine(order: MonthlyDemandOrder): Map<string, number> {
  const room = new Map(order.lines.map((line) => [line.id, count(line.qty)]));
  const done = new Map<string, number>();
  const give = (lineId: string, qty: number) => {
    const taken = Math.min(qty, room.get(lineId) ?? 0);
    room.set(lineId, (room.get(lineId) ?? 0) - taken);
    done.set(lineId, (done.get(lineId) ?? 0) + taken);
    return qty - taken;
  };
  const loose: Array<{ sku: string; qty: number }> = [];
  for (const unit of order.delivered) {
    const qty = count(unit.qty ?? 1) || 1;
    if (unit.orderLineId && room.has(unit.orderLineId)) give(unit.orderLineId, qty);
    else loose.push({ sku: unit.sku, qty });
  }
  /* A Unit that names no line was sold before lines were recorded on Units. */
  for (const unit of loose) {
    let left = unit.qty;
    for (const line of order.lines) {
      if (left <= 0) break;
      if (skuOf(line.sku) === skuOf(unit.sku)) left = give(line.id, left);
    }
  }
  return done;
}

export function monthlyDemandOf(input: {
  orders: ReadonlyArray<MonthlyDemandOrder>;
  startMonth: string;
  months: number;
  /** SO Batch Purchase's still-to-buy quantity per order line. Null = unread. */
  toBuyByLine: ReadonlyMap<string, number> | null;
  filters?: MonthlyDemandFilters;
  focusMonth?: string | null;
}): MonthlyDemandView {
  const window = monthlyDemandWindowOf(input.startMonth, input.months);
  const filters = input.filters ?? {};
  /* Not applicable outranks an unread source: a category SO Batch never buys
     per order has no To buy whatever that read returned. */
  const boughtPerOrder = !filters.category || BOUGHT_PER_ORDER.has(filters.category);
  const toBuyByLine = boughtPerOrder ? input.toBuyByLine : null;
  const blank: MonthlyDemandRow["toBuy"] = !boughtPerOrder ? "not-applicable" : toBuyByLine === null ? null : 0;
  const rows = new Map<string, MonthlyDemandRow>();
  rows.set("before", emptyRow("before", "before", window.first, blank));
  for (const month of window.months) rows.set(month, emptyRow(month, "month", month, blank));
  rows.set("after", emptyRow("after", "after", window.last, blank));
  rows.set("no-date", emptyRow("no-date", "no-date", null, blank));
  const total = emptyRow("total", "total", null, blank);

  const pick = (value: string | null | undefined) => words(value);
  const salesLocations = new Set<string>();
  const states = new Set<string>();
  const cities = new Set<string>();

  for (const order of input.orders) {
    const location = words(order.salesLocation);
    const state = words(order.state);
    const city = words(order.city);
    if (location) salesLocations.add(location);
    if (state) states.add(state);
    if (city && (!pick(filters.state) || state === pick(filters.state))) cities.add(city);

    if (pick(filters.salesLocation) && location !== pick(filters.salesLocation)) continue;
    if (pick(filters.state) && state !== pick(filters.state)) continue;
    if (pick(filters.city) && city !== pick(filters.city)) continue;

    const dated = !order.deliveryDateTbd && order.deliveryDate ? order.deliveryDate.slice(0, 7) : null;
    const key = !dated || !MONTH.test(dated)
      ? "no-date"
      : dated < window.first
        ? "before"
        : dated > window.last
          ? "after"
          : dated;
    const row = rows.get(key)!;
    const done = deliveredByLine(order);

    for (const line of order.lines) {
      const column = monthlyDemandCategoryOf(line);
      if (!column) continue;
      if (filters.category && column !== filters.category) continue;
      const qty = count(line.qty);
      const delivered = Math.min(qty, done.get(line.id) ?? 0);
      const owed = qty - delivered;
      for (const target of [row, total]) {
        target.totalQty += qty;
        target.delivered += delivered;
        target.notDelivered += owed;
        if (column === "not-in-catalog") target.notInCatalog += owed;
        else target.categories[column] += owed;
      }
      if (toBuyByLine) {
        const toBuy = count(toBuyByLine.get(line.id) ?? 0);
        for (const target of [row, total]) if (typeof target.toBuy === "number") target.toBuy += toBuy;
      }
    }
  }

  const list = [...rows.values(), total];
  const focusMonth = input.focusMonth && window.months.includes(input.focusMonth) ? input.focusMonth : window.first;
  const focusRow = rows.get(focusMonth)!;
  return {
    window,
    rows: list,
    focus: {
      month: focusMonth,
      totalQty: focusRow.totalQty,
      delivered: focusRow.delivered,
      notDelivered: focusRow.notDelivered,
    },
    hasNotInCatalog: total.notInCatalog > 0,
    choices: {
      salesLocations: [...salesLocations].sort((a, b) => a.localeCompare(b)),
      states: [...states].sort((a, b) => a.localeCompare(b)),
      cities: [...cities].sort((a, b) => a.localeCompare(b)),
    },
  };
}
