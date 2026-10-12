import type { PurchaseDemandRow } from "@carres/shared";

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
  lines: PurchaseDemandRow[];
}

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
export function supplierGroups(rows: readonly PurchaseDemandRow[], nowKey: string): SupplierGroup[] {
  const byKey = new Map<string, PurchaseDemandRow[]>();
  for (const row of rows) {
    if (!isOpenDemand(row)) continue;
    const key = `${row.supplierId ?? "none"}|${row.category ?? "other"}`;
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
      lines,
    });
  }
  /* What needs ordering first comes first: a window that has gone by, then
     the supplier's name, then the category. */
  return groups.sort(
    (a, b) =>
      Number(b.cutOffPassed) - Number(a.cutOffPassed) ||
      (a.supplier ?? "￿").localeCompare(b.supplier ?? "￿") ||
      (a.category ?? "").localeCompare(b.category ?? ""),
  );
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
  footer: (groups: number, suppliers: number) =>
    `${groups} ${groups === 1 ? "group" : "groups"} · ${suppliers} ${suppliers === 1 ? "supplier" : "suppliers"}`,
} as const;
