/**
 * Reports → Sales order lines · Delivery order lines · Sales invoice lines.
 * Read-only, one row per document line; every figure comes from
 * `document-lines.ts` over the read its Register already makes. The grid's own
 * Search / Export / Columns and its date filter are the whole toolset.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useCatalog, useDeliveryOrdersRegister, useInvoiceRegister, useSalesOrderRegisterOrders } from "@/lib/queries";
import { LoadFailed } from "@/pages/finance/other-money-in/parts";
import ModuleHeader from "./components/ModuleHeader";
import { skuKey, useCatalogNames } from "./sales-order-register-readings";
import {
  deliveryOrderLinesOf, deliveryReturnLinesOf, salesInvoiceLinesOf, salesOrderLinesOf,
  type DeliveryReturnRow, type DocumentLine, type ReturnLine,
} from "./document-lines";

const KINDS = {
  so: { page: "Sales order lines", date: "Proceed date", doc: "SO no.", priced: true, note: "Rentals are not listed." },
  do: { page: "Delivery order lines", date: "DO date", doc: "DO No", priced: false, note: "Cancelled delivery orders are not listed." },
  inv: { page: "Sales invoice lines", date: "Invoice date", doc: "Invoice No", priced: true, note: "Only issued sales invoices are listed." },
} as const;
type Kind = keyof typeof KINDS;

const sum = (rows: DocumentLine[], k: "qty" | "amount") => rows.reduce((t, r) => t + (r[k] ?? 0), 0);
const soHref = (r: DocumentLine) => `/operation/orders/so/${encodeURIComponent(r.orderId)}`;

function LinesGrid({ kind, rows, loading, failed, retry }: {
  kind: Kind; rows: DocumentLine[]; loading: boolean; failed: boolean; retry: () => void;
}) {
  const w = KINDS[kind];
  const columns = useMemo<DataGridColumn<DocumentLine>[]>(() => {
    const doc: DataGridColumn<DocumentLine> = {
      key: "doc", label: w.doc, width: 150, filterType: "numbering", filterValue: (r) => r.docNo, exportValue: (r) => r.docNo,
      accessor: (r) => kind === "inv" ? r.docNo : (
        <Link className="tabular-nums text-kit-blue-11 hover:underline"
          to={kind === "do" ? `/operation/delivery-orders/${encodeURIComponent(r.docNo)}` : soHref(r)}>{r.docNo}</Link>
      ),
    };
    const so: DataGridColumn<DocumentLine> = {
      key: "so", label: "SO no.", width: 120, filterValue: (r) => `SO-${r.so}`, exportValue: (r) => `SO-${r.so}`,
      accessor: (r) => <Link className="tabular-nums text-kit-blue-11 hover:underline" to={soHref(r)}>SO-{r.so}</Link>,
    };
    const money: DataGridColumn<DocumentLine>[] = w.priced ? [
      { key: "price", label: "Unit price", width: 120, align: "right", accessor: (r) => r.unitPrice == null ? "" : rm(r.unitPrice),
        numberValue: (r) => r.unitPrice, exportValue: (r) => r.unitPrice ?? "" },
      { key: "amount", label: "Amount", width: 130, align: "right", accessor: (r) => r.amount == null ? "" : rm(r.amount),
        numberValue: (r) => r.amount, exportValue: (r) => r.amount ?? "", footerTotal: (v) => rm(sum(v, "amount")) },
    ] : [];
    return [
      { key: "date", label: w.date, width: 120, accessor: (r) => fmtDate(r.date), filterType: "date", dateValue: (r) => r.date,
        sortFn: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""), exportValue: (r) => r.date?.slice(0, 10) ?? "" },
      doc,
      ...(kind === "so" ? [] : [so]),
      { key: "customer", label: "Customer", width: 180, accessor: (r) => r.customer },
      { key: "item", label: "Item", width: 220, accessor: (r) => r.item },
      { key: "qty", label: "Qty", width: 80, align: "right", accessor: (r) => r.qty, numberValue: (r) => r.qty, exportValue: (r) => r.qty,
        footerTotal: (v) => sum(v, "qty") },
      ...money,
      // An invoice line read from the live order (no snapshot line) says so.
      ...(kind === "inv" ? [{
        key: "from", label: "Lines from", width: 150,
        accessor: (r: DocumentLine) => r.linesFrom === "order" ? "Sales order today" : "Invoice",
        exportValue: (r: DocumentLine) => r.linesFrom === "order" ? "Sales order today" : "Invoice",
      }] : []),
    ];
  }, [kind, w]);

  return <div className="flex h-full min-h-0 flex-col" data-testid={`${kind}-lines-report`}>
    <ModuleHeader destinationHeader testId={`${kind}-lines-header`} word={w.page} docTitle={`${w.page} · Carres`} />
    <ListPageShell register>
      <DataGrid rows={rows} columns={columns} rowKey={(r) => r.key} storageKey={`carres.reports.${kind}-lines.v1`}
        appearance="reference" exportName={w.page} groupBanner={false} leadingColumns={{ date: "date", identity: "doc" }}
        sortDefault={{ key: "date", dir: "desc" }} isLoading={loading}
        errorState={failed ? <LoadFailed what={w.page} onRetry={retry} /> : undefined}
        emptyMessage={`No lines yet. ${w.note}`}
        statusSummary={(visible) => <span data-testid={`${kind}-lines-summary`}>{visible.length} of {rows.length} lines · {w.note}</span>} />
    </ListPageShell>
  </div>;
}

function useNameOf() {
  const names = useCatalogNames();
  return useMemo(() => (sku: string) => names.get(skuKey(sku))?.name, [names]);
}

/** Add-on key → its catalog name, from the same catalog read. */
function useAddonName() {
  const catalogQ = useCatalog();
  return useMemo(() => {
    const m = new Map((catalogQ.data?.addons ?? []).map((a) => [a.key, a.name] as const));
    return (key: string) => m.get(key) || undefined;
  }, [catalogQ.data]);
}

export function SalesOrderLinesReport() {
  const q = useSalesOrderRegisterOrders({ stage: "proceeded" });
  const nameOf = useNameOf();
  const addonName = useAddonName();
  const rows = useMemo(() => salesOrderLinesOf(q.data?.orders ?? [], nameOf, addonName), [q.data, nameOf, addonName]);
  return <LinesGrid kind="so" rows={rows} loading={q.isPending} failed={q.isError} retry={() => void q.refetch()} />;
}

export function DeliveryOrderLinesReport() {
  const q = useDeliveryOrdersRegister();
  const nameOf = useNameOf();
  const rows = useMemo(() => deliveryOrderLinesOf(q.data?.deliveryOrders ?? [], nameOf), [q.data, nameOf]);
  return <LinesGrid kind="do" rows={rows} loading={q.isPending} failed={q.isError} retry={() => void q.refetch()} />;
}

export function SalesInvoiceLinesReport() {
  const q = useInvoiceRegister();
  const nameOf = useNameOf();
  const addonName = useAddonName();
  const rows = useMemo(() => salesInvoiceLinesOf(q.data ?? [], nameOf, addonName), [q.data, nameOf, addonName]);
  return <LinesGrid kind="inv" rows={rows} loading={q.isPending} failed={q.isError} retry={() => void q.refetch()} />;
}

/* Delivery return lines. Follows Houzs frontend/src/pages/scm-v2/DeliveryReturnDetailListing.tsx:32-153
   per Weisiang's ruling (2026-10-22): clear Carres rules, implement Houzs. It reads #2122's
   Delivery Returns list (0716 tables), so it shows nothing until #2122 merges; until then the
   tab is reachable by direct URL only and has no nav entry. Carres 0716 records no refund money
   (Finance owns it), so Houzs's Unit Price · Line Refund · Pending Refund · Condition · Received
   columns have nothing to read and are left out. */
const REFUND_WORD: Record<string, string> = { pending: "Pending", refunded: "Refunded", not_refunded: "Not refunded" };
const DR_PAGE = "Delivery return lines";
const DR_NOTE = "Every recorded return is listed.";
const DR_COLUMNS: DataGridColumn<ReturnLine>[] = [
  { key: "date", label: "Return date", width: 120, accessor: (r) => fmtDate(r.date), filterType: "date", dateValue: (r) => r.date,
    sortFn: (a, b) => (a.date ?? "").localeCompare(b.date ?? ""), exportValue: (r) => r.date?.slice(0, 10) ?? "" },
  { key: "doc", label: "Return No", width: 140, filterType: "numbering", filterValue: (r) => r.docNo, exportValue: (r) => r.docNo, accessor: (r) => r.docNo },
  { key: "do", label: "DO No", width: 140, accessor: (r) => r.doNo, exportValue: (r) => r.doNo },
  { key: "so", label: "SO no.", width: 110, accessor: (r) => r.so ? `SO-${r.so}` : "", exportValue: (r) => r.so ? `SO-${r.so}` : "" },
  { key: "customer", label: "Customer", width: 180, accessor: (r) => r.customer },
  { key: "reason", label: "Reason", width: 200, accessor: (r) => r.reason },
  { key: "item", label: "Item", width: 200, accessor: (r) => r.item },
  { key: "units", label: "Units", width: 180, accessor: (r) => r.units.join(", "), exportValue: (r) => r.units.join(", ") },
  { key: "qty", label: "Qty", width: 80, align: "right", accessor: (r) => r.qty, numberValue: (r) => r.qty, exportValue: (r) => r.qty,
    footerTotal: (v) => v.reduce((t, r) => t + r.qty, 0) },
  { key: "site", label: "Site", width: 140, accessor: (r) => r.site },
  { key: "refund", label: "Refund status", width: 130, accessor: (r) => REFUND_WORD[r.refundStatus] ?? r.refundStatus,
    exportValue: (r) => REFUND_WORD[r.refundStatus] ?? r.refundStatus },
  { key: "refundAt", label: "Refund status date", width: 140, accessor: (r) => fmtDate(r.refundStatusAt), filterType: "date",
    dateValue: (r) => r.refundStatusAt, exportValue: (r) => r.refundStatusAt?.slice(0, 10) ?? "" },
];

export function DeliveryReturnLinesReport() {
  const q = useQuery({
    queryKey: ["delivery-returns"],
    queryFn: () => apiFetch<{ returns: DeliveryReturnRow[] }>("/api/operation/delivery-returns"),
  });
  const nameOf = useNameOf();
  const rows = useMemo(() => deliveryReturnLinesOf(q.data?.returns ?? [], nameOf), [q.data, nameOf]);
  const returns = new Set(rows.map((r) => r.docNo)).size;
  return <div className="flex h-full min-h-0 flex-col" data-testid="dr-lines-report">
    <ModuleHeader destinationHeader testId="dr-lines-header" word={DR_PAGE} docTitle={`${DR_PAGE} · Carres`} />
    <ListPageShell register>
      <DataGrid rows={rows} columns={DR_COLUMNS} rowKey={(r) => r.key} storageKey="carres.reports.dr-lines.v1"
        appearance="reference" exportName={DR_PAGE} groupBanner={false} leadingColumns={{ date: "date", identity: "doc" }}
        sortDefault={{ key: "date", dir: "desc" }} isLoading={q.isPending}
        errorState={q.isError ? <LoadFailed what={DR_PAGE} onRetry={() => void q.refetch()} /> : undefined}
        emptyMessage={`No lines yet. ${DR_NOTE}`}
        statusSummary={(visible) => <span data-testid="dr-lines-summary">{visible.length} of {rows.length} lines · {returns} returns</span>} />
    </ListPageShell>
  </div>;
}
