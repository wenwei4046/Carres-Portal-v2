import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ListPageShell from "@/components/ListPageShell";
import Button from "@/components/kit/Button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import { BILL_STATUS_WORD, money, word } from "@/pages/finance/payables/payables-words";
import ModuleHeader from "./components/ModuleHeader";

/**
 * PURCHASE INVOICES — the supplier bills, read-only, inside Purchasing.
 *
 * Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): purchasing staff see
 * purchase invoices and what is paid on them inside the purchasing area, Houzs
 * way. Jess's rules that Finance alone shows bills and that Operations carries no
 * finance fields are overturned; Jess was not part of this decision.
 *
 * ONE LEDGER: every row is Finance's own bill, read through 0721's
 * `purchasing_supplier_bill_list` with Finance's own paid figure. Nothing here
 * writes. Entering, confirming and paying a bill stay on Finance → Bills
 * (finance + principal in the database); the principal gets a link there.
 */
type BillRow = {
  id: string;
  bill_no: string | null;
  status: string;
  supplier_name: string;
  supplier_invoice_no: string;
  bill_date: string;
  due_date: string | null;
  po_id: string | null;
  total_amount: number | string;
  paid_total: number | string;
  unpaid: number | string | null;
};

export default function OperationPurchaseInvoices() {
  const role = useAuth((s) => s.role);
  const navigate = useNavigate();
  const query = useQuery<{ rows: BillRow[] }>({
    queryKey: ["operation", "purchase-invoices"],
    queryFn: () => apiFetch("/api/operation/purchase-invoices"),
  });
  const rows = query.data?.rows ?? [];
  const columns = useMemo<DataGridColumn<BillRow>[]>(() => [
    { key: "bill", label: "Bill No", width: 130, accessor: (r) => r.bill_no ?? "" },
    { key: "date", label: "Bill Date", width: 120, accessor: (r) => fmtDate(r.bill_date), dateValue: (r) => r.bill_date, filterType: "date" },
    { key: "supplier", label: "Supplier", width: 200, wrap: true, accessor: (r) => r.supplier_name,
      filterValue: (r) => r.supplier_name, filterType: "enum" },
    { key: "invoice", label: "Supplier Invoice", width: 160, accessor: (r) => r.supplier_invoice_no },
    { key: "po", label: "PO", width: 130, accessor: (r) => r.po_id ?? "" },
    { key: "due", label: "Due Date", width: 120, accessor: (r) => (r.due_date ? fmtDate(r.due_date) : "") },
    { key: "status", label: "Status", width: 110, accessor: (r) => word(BILL_STATUS_WORD, r.status),
      filterValue: (r) => word(BILL_STATUS_WORD, r.status), filterType: "enum" },
    { key: "total", label: "Total", width: 120, align: "right", accessor: (r) => money(r.total_amount) },
    { key: "paid", label: "Paid", width: 120, align: "right", accessor: (r) => money(r.paid_total) },
    { key: "unpaid", label: "Unpaid", width: 120, align: "right", accessor: (r) => money(r.unpaid) },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="purchase-invoices-destination-header" word="Purchase Invoices"
        docTitle="Purchase Invoices · Carres"
        right={role === "principal"
          ? <Button variant="neutral" onClick={() => navigate("/finance/bills")}>Open in Finance</Button>
          : undefined} />
      <ListPageShell register>
        <DataGrid
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          rowTestId={(r) => `purchase-invoice-row-${r.id}`}
          storageKey="carres.operation.purchase-invoices.v1"
          appearance="reference"
          fillColumn="supplier"
          exportName="Purchase Invoices"
          groupBanner={false}
          stickyIdentity
          isLoading={query.isLoading}
          searchPlaceholder="Search bill, supplier or PO…"
          emptyMessage={query.isError
            ? "Purchase invoices could not be read. Refresh to try again."
            : "No purchase invoice yet. Finance enters each supplier bill."}
        />
      </ListPageShell>
    </div>
  );
}
