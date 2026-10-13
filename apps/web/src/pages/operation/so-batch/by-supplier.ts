import type { PurchaseDemandRow, SoBatchOrderRow } from "@carres/shared";

/**
 * SO BATCH PURCHASE · BY SUPPLIER (owner 12 Oct 2026; 01 §5; Purchasing MASTER
 * §9.1). The same demand the By sales order list holds, read the way a buyer
 * orders it: one row per supplier and category, because one PO goes to one
 * supplier for one category.
 *
 * Pure: it only groups and words the rows the SO Batch read already carries.
 * Every date and number is the server's (`orderBy`, `poDeliveryDate`,
 * `poDeliveryWorkingDays`, `poWindow`, `toBuy`); nothing is recalculated here.
 */
export interface SupplierGroup {
  key: string;
  supplierId: string | null;
  /** `null` = the catalog names no supplier for these goods yet. */
  supplier: string | null;
  category: PurchaseDemandRow["category"];
  kind: PurchaseDemandRow["supplierKind"];
  /** Working days from PO Date to PO Delivery Date, when every line agrees. */
  productionDays: number | null;
  qty: number;
  models: number;
  orders: Array<{ orderId: string; so: number | null }>;
  /** The earliest Order By date among the lines still to buy. */
  orderBy: string | null;
  /** The latest PO Delivery Date a PO issued today would carry. */
  readyBy: string | null;
  /** A line's PO window has gone by and it is still to buy. */
  cutOffPassed: boolean;
  /** Every supplier in the group, by name. One for `By supplier`; several
   *  when the rows are grouped by category or by order deadline. */
  suppliers: string[];
  /** `By order deadline` only: which part of the calendar this row is. */
  deadline?: "passed" | "day" | "later" | "none";
  lines: PurchaseDemandRow[];
  /** Set on a group whose goods are already on a PO (`Ordered`): its PO
   *  numbers and its lines. Such a group has nothing to buy and no `lines`. */
  ordered?: { poIds: string[]; lines: OrderedLine[] };
}

/** One Sales Order line's quantity on one PO, as the `Ordered` tab lists it. */
export interface OrderedLine {
  id: string;
  orderId: string;
  so: number | null;
  /** The model code as the data spells it (`CODY-SK`). */
  sku: string;
  item: string;
  variant: string | null;
  category: PurchaseDemandRow["category"];
  qty: number;
  poId: string;
  supplier: string | null;
}

export type SupplierShow = "buy" | "ordered" | "all";

/**
 * HOW THE SAME LINES ARE GROUPED (owner 13 Oct 2026, the design file's
 * `GROUP BY`): by supplier and category, by category, or by order deadline.
 * `By sales order` is the page's own Sales Order list, not a grouping here.
 */
export type GroupBy = "supplier" | "category" | "deadline";
const CATEGORY_ORDER = ["mattress", "bedframe", "sofa"];
const categoryRank = (category: string | null) => { const at = CATEGORY_ORDER.indexOf(category ?? ""); return at < 0 ? CATEGORY_ORDER.length : at; };

/**
 * Which deadline row a line belongs to, as the design file groups them: every
 * passed date together, then one row per day for the next seven days, then
 * everything later together. A line with no Order By date says so.
 */
export function deadlineKey(orderBy: string | null | undefined, today: string): string {
  if (!orderBy) return "none";
  const days = daysBetween(today, orderBy);
  if (days < 0) return "passed";
  if (days < 7) return orderBy;
  return "later";
}
const deadlineRank = (key: string) => (key === "passed" ? "0" : key === "later" ? "8" : key === "none" ? "9" : `1${key}`);

const toBuyOf = (row: PurchaseDemandRow) => row.toBuy ?? 0;

/** The rows this view counts: something is still to buy on them. */
export function isOpenDemand(row: PurchaseDemandRow): boolean {
  return toBuyOf(row) > 0;
}

/**
 * Group the open demand by supplier and category. `nowKey` is Malaysia's wall
 * clock as `YYYY-MM-DDTHH:MM`, the same spelling as a row's `poWindow`, so
 * "has this window gone by" is one string comparison.
 */
export function supplierGroups(rows: readonly PurchaseDemandRow[], nowKey: string, by: GroupBy = "supplier", today: string = nowKey.slice(0, 10)): SupplierGroup[] {
  const byKey = new Map<string, PurchaseDemandRow[]>();
  for (const row of rows) {
    if (!isOpenDemand(row)) continue;
    const key = by === "category" ? `category|${row.category ?? "other"}`
      : by === "deadline" ? `deadline|${deadlineKey(row.orderBy, today)}`
      : `${row.supplierId ?? "none"}|${row.category ?? "other"}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(row);
    else byKey.set(key, [row]);
  }
  const groups: SupplierGroup[] = [];
  for (const [key, bucket] of byKey) {
    const lines = [...bucket].sort(
      (a, b) =>
        a.item.localeCompare(b.item) ||
        (a.variant ?? "").localeCompare(b.variant ?? "") ||
        (a.so ?? Number.MAX_SAFE_INTEGER) - (b.so ?? Number.MAX_SAFE_INTEGER),
    );
    const first = lines[0]!;
    const orders = new Map<string, number | null>();
    for (const line of lines) if (!orders.has(line.orderId)) orders.set(line.orderId, line.so);
    const days = new Set(lines.map((l) => l.poDeliveryWorkingDays ?? null));
    const orderBys = lines.map((l) => l.orderBy).filter((d): d is string => !!d).sort();
    const readyBys = lines.map((l) => l.poDeliveryDate).filter((d): d is string => !!d).sort();
    groups.push({
      key,
      supplierId: first.supplierId,
      supplier: first.supplier,
      category: first.category,
      kind: first.supplierKind,
      productionDays: days.size === 1 ? [...days][0]! : null,
      qty: lines.reduce((n, l) => n + toBuyOf(l), 0),
      models: new Set(lines.map((l) => l.item)).size,
      orders: [...orders]
        .map(([orderId, so]) => ({ orderId, so }))
        .sort((a, b) => (a.so ?? Number.MAX_SAFE_INTEGER) - (b.so ?? Number.MAX_SAFE_INTEGER)),
      orderBy: orderBys[0] ?? null,
      readyBy: readyBys[readyBys.length - 1] ?? null,
      cutOffPassed: lines.some((l) => !!l.poWindow && l.poWindow < nowKey),
      suppliers: [...new Set(lines.map((l) => l.supplier).filter((name): name is string => !!name))].sort(),
      ...(by === "deadline" ? { deadline: ((part) => (part === "passed" || part === "later" || part === "none" ? part : "day"))(key.slice("deadline|".length)) as SupplierGroup["deadline"] } : {}),
      lines,
    });
  }
  if (by === "category") return groups.sort((a, b) => categoryRank(a.category) - categoryRank(b.category) || (a.category ?? "").localeCompare(b.category ?? ""));
  if (by === "deadline") return groups.sort((a, b) => deadlineRank(a.key.slice("deadline|".length)).localeCompare(deadlineRank(b.key.slice("deadline|".length))));
  /* What needs ordering first comes first: a window that has gone by, then
     the supplier's name, then the category. */
  return groups.sort(
    (a, b) =>
      Number(b.cutOffPassed) - Number(a.cutOffPassed) ||
      (a.supplier ?? "￿").localeCompare(b.supplier ?? "￿") ||
      (a.category ?? "").localeCompare(b.category ?? ""),
  );
}

/**
 * Group what is ALREADY on a PO by supplier and category, from the Register's
 * own order rows (`registerRows`): each line's quantity per PO, and each PO's
 * supplier and PO Delivery Date. Nothing is computed about buying here; the
 * to-buy arithmetic stays with `supplierGroups`.
 */
export function orderedSupplierGroups(orders: readonly SoBatchOrderRow[], by: GroupBy = "supplier"): SupplierGroup[] {
  /* An ordered line has no deadline left to meet, so that grouping shows none. */
  if (by === "deadline") return [];
  const byKey = new Map<string, { supplierId: string | null; supplier: string | null; category: PurchaseDemandRow["category"]; lines: OrderedLine[]; dates: string[]; suppliers: Set<string> }>();
  for (const order of orders) {
    for (const line of order.lines) {
      for (const onPo of line.pos) {
        if (!(onPo.qty > 0)) continue;
        const po = order.pos.find((candidate) => candidate.poId === onPo.poId);
        const category = (line.category ?? null) as PurchaseDemandRow["category"];
        const key = by === "category" ? `ordered|category|${category ?? "other"}` : `ordered|${po?.supplierId ?? "none"}|${category ?? "other"}`;
        const bucket = byKey.get(key) ?? { supplierId: po?.supplierId ?? null, supplier: po?.supplierName ?? null, category, lines: [], dates: [], suppliers: new Set<string>() };
        if (po?.supplierName) bucket.suppliers.add(po.supplierName);
        bucket.lines.push({
          id: `${line.orderLineId}|${onPo.poId}`, orderId: order.orderId, so: order.so,
          sku: line.sku, item: line.item ?? line.sku, variant: line.variant ?? null, category, qty: onPo.qty, poId: onPo.poId, supplier: po?.supplierName ?? null,
        });
        if (po?.officialDeliveryDate) bucket.dates.push(po.officialDeliveryDate);
        byKey.set(key, bucket);
      }
    }
  }
  const groups: SupplierGroup[] = [];
  for (const [key, bucket] of byKey) {
    const lines = [...bucket.lines].sort((a, b) =>
      a.item.localeCompare(b.item) || (a.variant ?? "").localeCompare(b.variant ?? "") ||
      (a.so ?? Number.MAX_SAFE_INTEGER) - (b.so ?? Number.MAX_SAFE_INTEGER));
    const orderIds = new Map<string, number | null>();
    for (const line of lines) if (!orderIds.has(line.orderId)) orderIds.set(line.orderId, line.so);
    groups.push({
      key, supplierId: bucket.supplierId, supplier: bucket.supplier, category: bucket.category,
      kind: null as unknown as SupplierGroup["kind"], productionDays: null,
      qty: lines.reduce((n, l) => n + l.qty, 0),
      models: new Set(lines.map((l) => l.item)).size,
      orders: [...orderIds].map(([orderId, so]) => ({ orderId, so }))
        .sort((a, b) => (a.so ?? Number.MAX_SAFE_INTEGER) - (b.so ?? Number.MAX_SAFE_INTEGER)),
      orderBy: null,
      readyBy: [...bucket.dates].sort().at(-1) ?? null,
      cutOffPassed: false,
      suppliers: [...bucket.suppliers].sort(),
      lines: [],
      ordered: { poIds: [...new Set(lines.map((l) => l.poId))].sort(), lines },
    });
  }
  if (by === "category") return groups.sort((a, b) => categoryRank(a.category) - categoryRank(b.category));
  return groups.sort((a, b) =>
    (a.supplier ?? "\uffff").localeCompare(b.supplier ?? "\uffff") || (a.category ?? "").localeCompare(b.category ?? ""));
}

/**
 * THE TODAY CARD'S NUMBERS (owner's 12 Oct 2026 package, Summary · Today).
 * Every number is read from facts the page already holds: a line's `toBuy`,
 * its `poWindow` and its `orderBy`. Pieces are counted, never Sales Orders,
 * except the two rows the page passes in from its own counts.
 */
export interface TodayNumbers {
  /** Pieces still to buy whose PO window has gone by. */
  toOrderNow: number;
  /** Pieces still to buy whose Order By date has gone by. */
  pastOrderBy: number;
  /** Today's PO windows, earliest first. */
  windows: Array<{ key: string; time: string; qty: number; passed: boolean }>;
}

export function todayNumbers(rows: readonly PurchaseDemandRow[], nowKey: string, today: string, windowTimes: readonly string[]): TodayNumbers {
  /* `today` is the server's Malaysia date, the same one the list's deadlines
     are counted from, so the card and the rows cannot disagree about a day. */
  const open = rows.filter(isOpenDemand);
  const sum = (list: readonly PurchaseDemandRow[]) => list.reduce((n, row) => n + toBuyOf(row), 0);
  const times = [...new Set([...windowTimes, ...open.map((row) => row.poWindow).filter((w): w is string => !!w && w.startsWith(today)).map((w) => w.slice(11, 16))])].sort();
  return {
    toOrderNow: sum(open.filter((row) => !!row.poWindow && row.poWindow < nowKey)),
    pastOrderBy: sum(open.filter((row) => !!row.orderBy && row.orderBy < today)),
    windows: times.map((time) => {
      const key = `${today}T${time}`;
      return { key, time, qty: sum(open.filter((row) => row.poWindow === key)), passed: key < nowKey };
    }),
  };
}

/**
 * ⭐ THE LIST FITS THE ROOM IT IS GIVEN (Layout Standard, 13 Oct 2026: "below
 * 1440 wide the fixed columns shrink ... so all four views fit 1164 with the
 * Tasks panel open, no side scroll").
 *
 * The first column takes what the fixed columns leave. When that would push
 * it under its floor, the fixed columns give way together, only as far as is
 * needed and never under their own floors (60; Status 112; first column 100).
 * Words wrap inside a narrower column; nothing is cut. Below the floors the
 * list scrolls sideways, as any list must.
 */
export const COLUMN_FLOOR = { fixed: 60, status: 112, first: 100 } as const;
const LEAD_SLACK = 10;
export function fitColumns(room: number, lead: number, firstMin: number, base: readonly number[], floors: readonly number[]): { first: number; fixed: number[]; tight: boolean } {
  const total = (widths: readonly number[]) => widths.reduce((sum, width) => sum + width, 0);
  if (room <= 0) return { first: Math.max(firstMin, 260), fixed: [...base], tight: false };
  const spare = room - lead - 2;
  /* `lead` carries 8 of slack beside the tick and the arrow (72). The full
     widths are kept while the first column still has its floor without that
     slack, which is the list at 1025 wide. */
  if (spare + LEAD_SLACK - total(base) >= firstMin) return { first: Math.max(firstMin, Math.floor(spare - total(base))), fixed: [...base], tight: false };
  const first = Math.min(firstMin, COLUMN_FLOOR.first);
  let fixed = [...base];
  for (let factor = 0.99; factor >= 0.3; factor -= 0.01) {
    fixed = base.map((width, index) => Math.max(Math.min(width, floors[index] ?? COLUMN_FLOOR.fixed), Math.round(width * factor)));
    if (total(fixed) <= spare - first) break;
  }
  return { first: Math.max(first, Math.floor(spare - total(fixed))), fixed, tight: true };
}

/** Whole days from `today` to `date` (both `YYYY-MM-DD`): negative = gone by. */
export function daysBetween(today: string, date: string): number {
  const at = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((at(date) - at(today)) / 86_400_000);
}

/** The words. COPY-STANDARD "SO Batch Purchase · By supplier". */
export const BY_SUPPLIER = {
  view: "By supplier",
  bySalesOrder: "By sales order",
  colSupplier: "Supplier",
  colItems: "Items",
  colOrders: "Sales orders",
  colDeadline: "Order PO deadline",
  colReadyBy: "Supplier ready by",
  colStatus: "Status",
  supplierNotSet: "Supplier not set",
  setSupplier: "Set the supplier in Catalog",
  delivers: "Supplier delivers",
  collect: "We collect",
  ifSentToday: "if sent today",
  cutOffPassed: "Cut-off passed",
  toBuy: "To buy",
  notRecorded: "Not recorded",
  /* The item lines' headers: the Purchasing dictionary's own words. */
  lineItem: "Item",
  lineToBuy: "To buy",
  lineSoNo: "Sales order",
  lineOrderBy: "Order deadline",
  lineDeliverTo: "Supplier delivers to",
  /* The one view button (owner 13 Oct 2026, the design file's menu). */
  groupBy: "GROUP BY",
  showColumnsFor: "SHOW COLUMNS FOR",
  byCategory: "By category",
  byDeadline: "By order deadline",
  comingSoon: "Coming soon",
  colCategory: "Category",
  colSuppliers: "Suppliers",
  lineSupplier: "Supplier",
  moreSuppliers: (names: readonly string[]) => (names.length > 1 ? `+ ${names.slice(1).join(", ")}` : ""),
  deadlinePassed: "Deadline passed",
  nextWeekAndLater: "Next week +",
  from: (date: string) => `From ${date}`,
  lateToOrder: "Late to order",
  /* The three tabs and the `Ordered` rows (owner's 12 Oct 2026 package). */
  showBuy: "To buy",
  showOrdered: "Ordered",
  showAll: "All",
  ordered: "Ordered",
  linePoNo: "PO No",
  lineQty: "Qty",
  category: (category: PurchaseDemandRow["category"]) =>
    category === "mattress" ? "Mattress" : category === "bedframe" ? "Bedframe" : category === "sofa" ? "Sofa" : "Other goods",
  poRefs: (poIds: readonly string[], display: (id: string) => string) =>
    poIds.length === 0 ? "" : poIds.length === 1 ? display(poIds[0]!) : `${display(poIds[0]!)} +${poIds.length - 1}`,
  nothingToBuy: "Nothing to buy. Every Sales Order already has its PO.",
  nothingOrdered: "No Sales Order has a PO yet.",
  /* The Today card. */
  today: "Today",
  toOrderNow: "To order now",
  pastOrderBy: "Past the order-by date",
  windowToday: (time: string) => `${time} today`,
  toOrder: (category: PurchaseDemandRow["category"], n: number) => `${BY_SUPPLIER.qty(category, n)} to order`,
  passed: (category: PurchaseDemandRow["category"], n: number) => `${BY_SUPPLIER.qty(category, n)} passed`,
  allOrdered: "All ordered",
  tooLate: "Too late for customer date",
  partlyOrdered: "Partly ordered",
  qty: (category: PurchaseDemandRow["category"], n: number) =>
    category === "sofa" ? `${n} ${n === 1 ? "set" : "sets"}` : `${n} ${n === 1 ? "pc" : "pcs"}`,
  models: (n: number) => `${n} ${n === 1 ? "model" : "models"}`,
  /** `Supplier delivers · 14d` — who brings the goods and the production days. */
  supplierLine: (g: Pick<SupplierGroup, "kind" | "productionDays" | "supplier">) => {
    if (!g.supplier) return BY_SUPPLIER.setSupplier;
    const who = g.kind === "factory_pickup" ? BY_SUPPLIER.collect : g.kind === "own_logistics" ? BY_SUPPLIER.delivers : "";
    const days = g.productionDays != null ? `${g.productionDays}d` : "";
    return [who, days].filter(Boolean).join(" · ");
  },
  /** `4 days left` · `Today` · `5 days late` (owner time words, 12 Oct 2026). */
  deadline: (days: number) =>
    days > 0 ? `${days} ${days === 1 ? "day" : "days"} left` : days === 0 ? "Today" : `${-days} ${days === -1 ? "day" : "days"} late`,
  /** `CR1451` for one order, `CR1456 +2` for several. */
  orderRefs: (orders: SupplierGroup["orders"], ref: (so: number | null) => string) =>
    orders.length === 0 ? "" : orders.length === 1 ? ref(orders[0]!.so) : `${ref(orders[0]!.so)} +${orders.length - 1}`,
  toBuyLine: (category: PurchaseDemandRow["category"], n: number) => `${BY_SUPPLIER.qty(category, n)} to buy`,
  /* The rows' count only (owner 13 Oct 2026); what is to buy is in Summary. */
  footer: (groups: number) => `${groups} ${groups === 1 ? "group" : "groups"}`,
  /* A supplier with rows in two categories names the category on each row. */
  groupName: (g: Pick<SupplierGroup, "supplier" | "category">, withCategory: boolean) =>
    !g.supplier ? BY_SUPPLIER.supplierNotSet : withCategory ? `${g.supplier} · ${BY_SUPPLIER.category(g.category)}` : g.supplier,
} as const;
