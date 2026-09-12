import { useMemo, useState } from "react";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useInvoiceRegister } from "@/lib/queries";
import { rm } from "@/lib/format-currency";
import ARDrawer, { type OrderPaymentRow } from "./ARDrawer";
import { customerOwingRows, outstandingTotal, type CustomerOwingRow } from "./money-owed";

const soWord = (r: CustomerOwingRow) => (r.so !== null ? `SO-${r.so}` : "SO not available");

/**
 * Finance → AR · Receivables. Every order a customer still owes money on, and
 * Finance's door to record a receipt against it.
 *
 * It reads the Invoices Register wire and lists `customerOwingRows` — the
 * shared `soRemaining` per order, storage included — so this list, the
 * Dashboard's Outstanding and Reports → Payment's Customer balances are one
 * arithmetic. (It used to read `finance_ar_aging` from migration 0062, which
 * counted money owed its own way.) Orders with no price yet are left out.
 */
export default function FinanceAR() {
  const query = useInvoiceRegister();
  const invoiceRows = query.data;
  const rows = useMemo(() => customerOwingRows(invoiceRows ?? []), [invoiceRows]);
  const [openId, setOpenId] = useState<string | null>(null);
  // The row's Record receipt button opens the form; a double-click only opens the order.
  const [recording, setRecording] = useState(false);
  const open = openId ? rows.find((r) => r.orderId === openId) ?? null : null;
  const payments: readonly OrderPaymentRow[] = useMemo(() => {
    if (!open) return [];
    return (invoiceRows ?? []).find((r) => r.id === open.doorId)?.orders?.order_payments ?? [];
  }, [open, invoiceRows]);

  const columns = useMemo<DataGridColumn<CustomerOwingRow>[]>(() => [
    { key: "so", label: "SO No", width: 120, accessor: soWord, searchValue: soWord },
    { key: "customer", label: "Customer", width: 240, accessor: (r) => r.customer,
      searchValue: (r) => r.customer },
    { key: "outstanding", label: "Outstanding", width: 180, align: "right",
      accessor: (r) => (
        <span className="flex flex-col items-end">
          <span className="tabular-nums">{rm(r.outstanding)}</span>
          {r.storageOwing > 0 && <span className="text-label font-normal">includes storage {rm(r.storageOwing)}</span>}
        </span>
      ),
      numberValue: (r) => r.outstanding, filterType: "number", exportValue: (r) => r.outstanding },
    { key: "act", label: "Record receipt", width: 150, filterable: false,
      accessor: (r) => (
        <button type="button" className="btn-secondary" data-testid={`ar-record-${r.orderId}`}
          onClick={(e) => { e.stopPropagation(); setRecording(true); setOpenId(r.orderId); }}>
          Record receipt
        </button>
      ),
      /* A door is not a fact: it never joins the search or the export. */
      searchValue: () => "", exportValue: () => "" },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="ar-destination-header" word="AR · Receivables"
        docTitle="AR · Receivables — Carres" />
      {query.isError ? (
        <div role="alert" className="p-6 text-body">
          <p>Invoices could not be loaded. Try again.</p>
          <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
        </div>
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.orderId}
            storageKey="carres.finance.ar.v2"
            appearance="reference"
            exportName="AR · Receivables"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search orders…"
            emptyMessage="No customer owes money."
            onRowDoubleClick={(r) => { setRecording(false); setOpenId(r.orderId); }}
            statusSummary={(visible) => {
              const t = outstandingTotal(visible);
              return (
                <span data-testid="ar-summary">
                  {t.orders} {t.orders === 1 ? "order" : "orders"} · {rm(t.total)} outstanding
                </span>
              );
            }}
          />
        </ListPageShell>
      )}
      {open && (
        <ARDrawer key={open.orderId} balance={open} payments={payments} open startRecording={recording}
          onOpenChange={(o) => { if (!o) setOpenId(null); }} />
      )}
    </div>
  );
}
