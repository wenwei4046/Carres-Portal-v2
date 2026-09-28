/**
 * CARD 8's derived completion for ONE order, from rows already read — the ONE
 * composition both `GET /orders/:id/completion` (the object page) and
 * `GET /orders/register-facts` (the Order list's Obligations filter) call, so
 * the page and the list can never disagree (Law D).
 *
 * Goods (Card 2 allocation) + Money in (Card 4 `orderMoney`, with the §2
 * storage obligation through `storageObligation`) + Money out (Card 7
 * refunds) + Loan (Card 6) = No Action Required. PURE: the caller reads.
 */
import {
  invoiceStorageSumOf,
  orderMoney,
  resolveOrderCompletion,
  resolveUnitAllocation,
  storageHold,
  storageObligation,
  type AllocationUnit,
  type OrderCompletion,
} from "@carres/shared";

export interface CompletionOrderRow {
  id: string;
  so: number;
  status: string;
  paid: number | string | null;
  delivery_date: string | null;
  order_lines?: Array<{ sku: string; qty: number; unit_price: number | string | null }> | null;
  order_addons?: Array<{ qty: number; unit_price: number | string | null }> | null;
  ops_order_control?: Record<string, unknown> | Array<Record<string, unknown>> | null;
}

export interface CompletionUnitRow {
  id: string;
  unit_code: string | null;
  sku: string;
  status: string;
  condition: string;
  warehouse_id: string | null;
  po_no: string | null;
  qty: number | null;
  date_in: string | null;
  sold_at: string | null;
}

export interface CompletionReads {
  ord: CompletionOrderRow;
  /** The CURRENT customer commitment's lines (Card 1). */
  commitmentLines: ReadonlyArray<{ sku: string; qty: number | string }>;
  units: ReadonlyArray<CompletionUnitRow>;
  refunds: ReadonlyArray<{ status: "requested" | "approved" | "rejected" | "paid" }>;
  loans: ReadonlyArray<{
    status: "on_loan" | "returned";
    source: "warehouse" | "supplier";
    returned_to_supplier_at: string | null;
  }>;
  invoices: Parameters<typeof invoiceStorageSumOf>[0];
  /** CARD-2026-08-28: the catalog owns which storage rate applies. */
  storageCategories: Map<string, string>;
  asOf: string;
}

export function completionOfOrder(r: CompletionReads): OrderCompletion {
  const { ord } = r;
  const soRef = `SO-${ord.so}`;
  const units: AllocationUnit[] = r.units.map((u) => ({
    id: u.id,
    unitCode: u.unit_code,
    sku: u.sku,
    status: u.status as AllocationUnit["status"],
    condition: u.condition,
    warehouseId: u.warehouse_id,
    poNo: u.po_no,
    qty: u.qty ?? 1,
    dateIn: u.date_in,
    soldAt: u.sold_at,
  }));
  const allocation = resolveUnitAllocation({
    orderId: ord.id,
    soRef,
    commitmentLines: r.commitmentLines.map((l) => ({ sku: l.sku, qty: Number(l.qty) || 0 })),
    units,
  });

  const lines = ord.order_lines ?? [];
  const addons = ord.order_addons ?? [];
  const ctrl = Array.isArray(ord.ops_order_control)
    ? (ord.ops_order_control[0] ?? null)
    : (ord.ops_order_control ?? null);
  const price = (x: { qty: number; unit_price?: number | string | null }) =>
    Number(x.unit_price ?? 0) * Number(x.qty ?? 0);
  const hold = storageHold({
    storageFrom:
      ((ctrl?.extension_original_date as string | null) ??
        (ctrl?.storage_from as string | null) ??
        ord.delivery_date) || null,
    override: (ctrl?.storage_fee_override as number | string | null) ?? null,
    importedMsbf: (ctrl?.storage_fee_msbf as number | string | null) ?? null,
    importedSof: (ctrl?.storage_fee_sof as number | string | null) ?? null,
    skus: lines.map((l) => String(l.sku)),
    categories: r.storageCategories,
    asOf: r.asOf,
    collectedAt: (ctrl?.storage_collected_at as string | null) ?? null,
    waiverStatus: (ctrl?.storage_waiver_status as string | null) ?? null,
  });
  // Gate convergence (2026-09-07): invoice-backed storage beats legacy C9
  // when papers exist, netted so `paid` subtracts once (`storageObligation`,
  // the ONE precedence law).
  const lineSum = lines.reduce((s, l) => s + price(l), 0);
  const addonSum = addons.reduce((s, a) => s + price(a), 0);
  const storage = storageObligation({
    invoiceStorageSum: invoiceStorageSumOf(r.invoices),
    goodsTotal: lineSum + addonSum,
    paid: ord.paid,
    legacyOwing: hold.owing,
    legacyReleased: hold.released,
  });
  const money = orderMoney({
    lineSum,
    addonSum,
    paid: ord.paid,
    controlBalance: (ctrl?.balance as number | string | null) ?? null,
    storageOwing: storage.owing,
    storageReleased: storage.released,
  });

  return resolveOrderCompletion({
    cancelled: ord.status === "cancelled",
    allocation,
    money: { outstanding: money.outstanding, known: money.known },
    refunds: r.refunds,
    loans: r.loans,
  });
}
