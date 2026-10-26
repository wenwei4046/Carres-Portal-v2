/**
 * Reports → Sales order lines · Delivery order lines · Sales invoice lines.
 * Read-only, one row per document line; every figure comes from
 * `document-lines.ts` over the read its Register already makes. The grid's own
 * Search / Export / Columns and its date filter are the whole toolset.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useCatalog, useDeliveryOrdersRegister, useInvoiceRegister, useSalesOrderRegisterOrders } from "@/lib/queries";
import { LoadFailed } from "@/pages/finance/other-money-in/parts";
import ModuleHeader from "./components/ModuleHeader";
import { skuKey, useCatalogNames } from "./sales-order-register-readings";
import { deliveryOrderLinesOf, salesInvoiceLinesOf, salesOrderLinesOf, type DocumentLine } from "./document-lines";

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
