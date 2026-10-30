import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { InvoiceRegisterRow, InvoiceStatus } from "@carres/shared/payment-invoice-register";
import { soRemaining } from "@carres/shared/payment-invoice-register";
import type { OrderActionTone } from "@carres/shared";
import ListPageShell from "@/components/ListPageShell";
import StatusPill from "@/components/kit/StatusPill";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useInvoiceRegister } from "@/lib/queries";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";

/**
 * SALES INVOICES — the Houzs list (YH, 30 Oct 2026; Houzs-ERP
 * frontend/src/pages/scm-v2/SalesInvoicesListV2.tsx). Read only: it lists the
 * invoice register's `sales` rows and a row opens that invoice on the Monitor,
 * where every invoice action already lives. Storage invoices stay on the Monitor.
 */
const STATUS: Record<InvoiceStatus, { word: string; tone: OrderActionTone }> = {
  draft: { word: "Draft", tone: "warning" },
  issued: { word: "Issued", tone: "success" },
  voided: { word: "Voided", tone: "neutral" },
};

const invoiceHref = (r: InvoiceRegisterRow) => `/finance/monitor?invoice=${r.id}`;
const invoiceNoOf = (r: InvoiceRegisterRow) => r.invoice_no ?? "Draft, no number yet";
const totalOf = (r: InvoiceRegisterRow) => Number(r.amount) + Number(r.tax_amount);
const refOf = (r: InvoiceRegisterRow) => [r.orders?.source_ref ?? []].flat().join(", ");
const dateOf = (r: InvoiceRegisterRow) => (r.issued_at ? fmtDate(r.issued_at) : "");

export default function SalesInvoices() {
  const query = useInvoiceRegister();
  const navigate = useNavigate();
  const open = (r: InvoiceRegisterRow) => navigate(invoiceHref(r));
  const all = query.data;
  const rows = useMemo(() => (all ?? []).filter((r) => r.kind === "sales"), [all]);
  // Money is owed on the order, so two invoices of one SO show the same figure.
  const owedBySo = useMemo(() => {
    const byOrder = new Map<string, InvoiceRegisterRow[]>();
    for (const r of all ?? []) byOrder.set(r.order_id, [...(byOrder.get(r.order_id) ?? []), r]);
    return new Map([...byOrder].map(([id, mine]) => [id, soRemaining(mine, id).outstanding]));
  }, [all]);
  const columns = useMemo<DataGridColumn<InvoiceRegisterRow>[]>(() => {
    const owedOf = (r: InvoiceRegisterRow) => owedBySo.get(r.order_id) ?? 0;
    return [
      { key: "invoice_no", label: "Invoice No", width: 200,
        accessor: (r) => <Link to={invoiceHref(r)} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>{invoiceNoOf(r)}</Link>,
        searchValue: invoiceNoOf, filterValue: invoiceNoOf, filterType: "numbering", exportValue: invoiceNoOf },
      { key: "date", label: "Invoice date", width: 140, accessor: dateOf,
        dateValue: (r) => r.issued_at, filterType: "date", exportValue: dateOf },
      { key: "so", label: "SO No", width: 110, accessor: (r) => `SO-${r.orders?.so}`, searchValue: (r) => `SO-${r.orders?.so}` },
      { key: "customer", label: "Customer", width: 220, accessor: (r) => r.orders?.customer_name ?? "",
        searchValue: (r) => r.orders?.customer_name ?? "" },
      { key: "ref", label: "Ref No", width: 140, accessor: refOf, searchValue: refOf },
      { key: "status", label: "Status", width: 110,
        accessor: (r) => <StatusPill tone={STATUS[r.status].tone}>{STATUS[r.status].word}</StatusPill>,
        filterValue: (r) => STATUS[r.status].word, filterType: "enum", exportValue: (r) => STATUS[r.status].word },
      { key: "owed", label: "Still owed on SO", width: 150, align: "right", accessor: (r) => rm(owedOf(r)),
        numberValue: owedOf, filterType: "number", exportValue: owedOf },
      { key: "total", label: "Invoice total", width: 140, align: "right", accessor: (r) => rm(totalOf(r)),
        numberValue: totalOf, filterType: "number", exportValue: totalOf },
    ];
  }, [owedBySo]);
  return <div className="flex h-full min-h-0 flex-col">
    <h1 className="sr-only">Sales Invoices</h1>
    <ModuleHeader destinationHeader testId="sales-invoices-destination-header" word="Sales Invoices" docTitle="Sales Invoices · Carres" />
    {query.isError && !query.data
      ? <div role="alert" className="p-6 text-body">
          <p>Sales Invoices could not be loaded. Try again.</p>
          <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
        </div>
      : <ListPageShell register>
          <DataGrid rows={rows} columns={columns} rowKey={(r) => r.id}
            storageKey="carres.finance.sales-invoices.v1" appearance="reference" exportName="Sales Invoices"
            groupBanner={false} stickyIdentity isLoading={!query.isSuccess} searchPlaceholder="Search sales invoices…"
            emptyMessage="No sales invoices yet." onRowClick={open} onRowDoubleClick={open}
            statusSummary={(visible) => <span data-testid="sales-invoices-summary">{visible.length} {visible.length === 1 ? "sales invoice" : "sales invoices"}</span>} />
        </ListPageShell>}
  </div>;
}
