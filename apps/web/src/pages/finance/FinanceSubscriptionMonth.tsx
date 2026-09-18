import { useMemo, useState } from "react";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { FinanceKpi } from "@/components/FinanceKpi";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useRentalMonth } from "@/lib/queries";
import type { RentalMonthView } from "@carres/shared";

type UnpaidRow = RentalMonthView["unpaid"][number];

/**
 * Finance → Subscriptions (migration 0538). One calendar month across every
 * agreement: what was due, what was collected, what is still unpaid, and the
 * unpaid months with the salesperson on the order, who Finance hands the chase
 * to. Read only. How the monthly money arrives is not settled yet (SUB-7), so
 * nothing here says it arrives by itself.
 */
export default function FinanceSubscriptionMonth() {
  const [month, setMonth] = useState(() => appTodayIso().slice(0, 7));
  const q = useRentalMonth(month);
  const rows = q.data?.unpaid ?? [];

  const columns = useMemo<DataGridColumn<UnpaidRow>[]>(() => [
    { key: "customer", label: "Customer", width: 200, accessor: (r) => r.customerName ?? "—",
      searchValue: (r) => `${r.customerName ?? ""} ${r.customerPhone ?? ""}` },
    { key: "phone", label: "Phone", width: 130, accessor: (r) => r.customerPhone ?? "—" },
    { key: "so", label: "Sales Order", width: 120, accessor: (r) => (r.orderSo ? `SO-${r.orderSo}` : "—"),
      searchValue: (r) => r.orderSo ?? "" },
    { key: "agreement", label: "Agreement", width: 130, accessor: (r) => r.agreementNo,
      searchValue: (r) => r.agreementNo },
    { key: "amount", label: "Amount", width: 120, align: "right", accessor: (r) => rm(r.amountDue),
      numberValue: (r) => r.amountDue, filterType: "number", exportValue: (r) => r.amountDue },
    { key: "due", label: "Due Date", width: 120, accessor: (r) => fmtDate(r.dueDate),
      dateValue: (r) => r.dueDate, filterType: "date" },
    { key: "late", label: "Days Late", width: 100, align: "right",
      accessor: (r) => (r.daysLate > 0 ? String(r.daysLate) : "Not late"),
      numberValue: (r) => r.daysLate, filterType: "number" },
    { key: "salesperson", label: "Salesperson", width: 160, accessor: (r) => r.salespersonName ?? "—",
      filterValue: (r) => r.salespersonName ?? "—", filterType: "enum" },
  ], []);

  const figure = (n: number | undefined) => (q.isSuccess && n != null ? rm(n) : null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="subscription-month-destination-header" word="Subscriptions"
        docTitle="Subscriptions — Carres" />
      <div className="grid grid-cols-3 gap-3.5 px-4 pt-4" data-testid="subscription-month-summary">
        <FinanceKpi label="Due" value={figure(q.data?.due)} noValue="—" />
        <FinanceKpi label="Collected" value={figure(q.data?.collected)} noValue="—" />
        <FinanceKpi label="Outstanding" value={figure(q.data?.outstanding)} noValue="—" accent />
      </div>
      {q.isError ? (
        <p role="alert" className="p-4 text-body">The subscription months could not be loaded. Try again.</p>
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={rows}
            columns={columns}
            rowKey={(r) => r.billingId}
            storageKey="carres.finance.subscription-month.v1"
            appearance="reference"
            exportName="Unpaid subscriptions"
            groupBanner={false}
            stickyIdentity
            isLoading={!q.isSuccess}
            searchPlaceholder="Search customer, SO or agreement…"
            toolbarStart={
              <input
                type="month"
                aria-label="Month"
                className="h-8 rounded-md border border-border bg-background px-2 text-body"
                value={month}
                onChange={(e) => e.target.value && setMonth(e.target.value)}
                data-testid="subscription-month-picker"
              />
            }
            emptyMessage="Every subscription month due in this month is paid."
            statusSummary={(visible) => (
              <span data-testid="subscription-month-unpaid">
                {visible.length} unpaid · {rm(visible.reduce((a, r) => a + r.amountDue, 0))}
              </span>
            )}
          />
        </ListPageShell>
      )}
    </div>
  );
}
