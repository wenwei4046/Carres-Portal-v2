import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApOutstandingRow } from "@carres/shared/schemas/finance-ap";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { fmtDate } from "@/lib/fmt-date";
import { useApBillOutstanding, useApOutstanding } from "@/lib/payables-queries";
import { cents, creditorKindWord, money, num } from "./payables-words";
import { PayablesSwitch, ReadFailed } from "./PayablesParts";
import { supplierUnpaid, unpaidTotal } from "../money-owed";

/**
 * Finance → Unpaid by Supplier (migration 0477, `ap_outstanding`). What
 * Carres still owes each supplier and creditor on confirmed bills, and how
 * much of that is already on a payment voucher waiting for approval. Read
 * only: paying is a Payment Voucher, one door.
 */
export default function ApOutstanding() {
  const navigate = useNavigate();
  const query = useApOutstanding();
  const rows = query.data ?? [];
  const columns = useMemo<DataGridColumn<ApOutstandingRow>[]>(() => [
    { key: "supplier", label: "Supplier", width: 240, accessor: (r) => r.supplier_name,
      searchValue: (r) => r.supplier_name },
    { key: "kind", label: "Creditor Type", width: 140, accessor: (r) => creditorKindWord(r.supplier_kind),
      filterValue: (r) => creditorKindWord(r.supplier_kind), filterType: "enum" },
    { key: "open", label: "Unpaid Bills", width: 120, align: "right", accessor: (r) => String(r.open_bills),
      numberValue: (r) => r.open_bills, filterType: "number" },
    { key: "billed", label: "Billed", width: 140, align: "right", accessor: (r) => money(r.billed_total),
      numberValue: (r) => num(r.billed_total), filterType: "number", exportValue: (r) => num(r.billed_total) ?? "" },
    { key: "paid", label: "Paid", width: 140, align: "right", accessor: (r) => money(r.paid_total),
      numberValue: (r) => num(r.paid_total), filterType: "number", exportValue: (r) => num(r.paid_total) ?? "" },
    { key: "unpaid", label: "Unpaid", width: 140, align: "right", accessor: (r) => money(supplierUnpaid(r)),
      numberValue: (r) => supplierUnpaid(r), filterType: "number", exportValue: (r) => supplierUnpaid(r) ?? "" },
    { key: "waiting", label: "On a Voucher, Not Approved", width: 200, align: "right",
      accessor: (r) => money(onVoucher(r)), numberValue: (r) => onVoucher(r), filterType: "number" },
    { key: "free", label: "Not on a Voucher", width: 160, align: "right", accessor: (r) => money(r.uncommitted),
      numberValue: (r) => num(r.uncommitted), filterType: "number" },
    { key: "oldest", label: "Oldest Unpaid Bill", width: 160,
      accessor: (r) => r.oldest_unpaid_bill_date ? fmtDate(r.oldest_unpaid_bill_date) : "No unpaid bill",
      dateValue: (r) => r.oldest_unpaid_bill_date, filterType: "date" },
  ], []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="ap-outstanding-destination-header" word="Unpaid by Supplier"
        docTitle="Unpaid by Supplier — Carres" />
      {query.isError ? <ReadFailed what="What is owed to suppliers" onRetry={() => void query.refetch()} /> : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.supplier_id}
            storageKey="carres.finance.ap-outstanding.v1"
            appearance="reference"
            exportName="Unpaid by Supplier"
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search suppliers…"
            toolbarStart={<PayablesSwitch current="unpaid" />}
            emptyMessage="Nothing is owed. A supplier appears here once one of their bills is confirmed."
            expandTitle="Show unpaid bills"
            expandable={{ renderExpansion: (r) => <UnpaidBillsOf row={r} /> }}
            onRowDoubleClick={(r) => navigate(`/finance/payment-vouchers/new?supplier=${r.supplier_id}`)}
            statusSummary={(visible) => {
              const t = unpaidTotal(visible); // same arithmetic as the Dashboard (Law D)
              return (
                <span data-testid="ap-outstanding-summary">
                  {t.suppliers} {t.suppliers === 1 ? "supplier" : "suppliers"} · {money(t.total)} unpaid
                </span>
              );
            }}
          />
        </ListPageShell>
      )}
    </div>
  );
}

/** Allocated to a voucher that is not approved yet: allocated − paid. */
function onVoucher(r: ApOutstandingRow): number | null {
  const a = num(r.allocated_total);
  const p = num(r.paid_total);
  return a === null || p === null ? null : cents(a - p);
}

function UnpaidBillsOf({ row }: { row: ApOutstandingRow }) {
  const bills = useApBillOutstanding(row.supplier_id);
  const open = (bills.data ?? []).filter((b) => (num(b.balance_owing) ?? 0) > 0);
  return (
    <div className="p-4 text-body" data-testid={`ap-outstanding-bills-${row.supplier_id}`}>
      {bills.isError
        ? <p role="alert">The bills could not be loaded. Try again.</p>
        : !bills.isSuccess
          ? <p>Loading bills…</p>
          : open.length === 0
            ? <p>No unpaid bill.</p>
            : open.map((b) => (
              <p key={b.bill_id}>
                <Link to={`/finance/bills/${b.bill_id}`}>{b.bill_no}</Link>
                {" · "}{b.supplier_invoice_no} · {fmtDate(b.bill_date)}
                {" · "}{b.due_date ? `due ${fmtDate(b.due_date)}` : "no due date"}
                {" · "}{money(b.balance_owing)} unpaid
              </p>
            ))}
      <Link className="btn-secondary mt-3 inline-block" to={`/finance/payment-vouchers/new?supplier=${row.supplier_id}`}>
        New Payment Voucher
      </Link>
    </div>
  );
}
