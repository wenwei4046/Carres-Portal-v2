import { Link } from "react-router-dom";
import Loading from "@/components/kit/Loading";
import { FinanceKpi } from "@/components/FinanceKpi";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useInvoiceRegister } from "@/lib/queries";
import { useApOutstanding } from "@/lib/payables-queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { customerOwingRows, outstandingTotal, unpaidTotal } from "./money-owed";

/**
 * Finance → Dashboard. The layout it had before PR #1248 (owner ruling
 * 2026-09-14): a row of figure tiles, then the Payables card. Every number is
 * read through `money-owed.ts` (Law D — the same arithmetic as the page each
 * one opens):
 *
 *   Outstanding  what customers still owe HQ      → opens AR · Receivables
 *   Unpaid       what Carres still owes suppliers → opens AP · Payables
 *
 * The old layout's Overdue, Net cash, Cashflow, AR aging and Activity blocks
 * are left out: no current read gives a correct number for them (the ledger
 * holds no opening balances; the invoice register carries no due date). They
 * used to read `finance_dashboard_summary` / `finance_cashflow_series`
 * (0062/0064), which this page must never call again.
 *
 * A figure whose read failed says `Could not load {source}`, never RM 0.00
 * (Workspace MASTER §8.2).
 */
export default function FinanceDashboard() {
  const invoices = useInvoiceRegister();
  const payables = useApOutstanding();
  const owing = invoices.data ? outstandingTotal(customerOwingRows(invoices.data)) : null;
  const unpaid = payables.data ? unpaidTotal(payables.data) : null;
  // A figure prints only from a read that succeeded; a failed refetch shows the words instead.
  const owingValue = owing && !invoices.isError ? rm(owing.total) : null;
  const unpaidValue = unpaid && !payables.isError ? rm(unpaid.total) : null;
  const orders = owing ? `${owing.orders} ${owing.orders === 1 ? "order" : "orders"}` : undefined;
  const suppliers = unpaid ? `${unpaid.suppliers} ${unpaid.suppliers === 1 ? "supplier" : "suppliers"}` : undefined;
  const owingMissing = <NoFigure source="Invoices" query={invoices} last={owing?.total ?? null} />;
  const unpaidMissing = <NoFigure source="AP · Payables" query={payables} last={unpaid?.total ?? null} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="finance-dashboard-destination-header" word="Dashboard"
        docTitle="Dashboard — Carres" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] p-4 md:p-9">
          <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <FinanceKpi
              testId="dashboard-outstanding"
              valueTestId="dashboard-outstanding-amount"
              label="Outstanding"
              value={owingValue}
              hint={orders}
              tone="warn"
              accent
              noValue={owingMissing}
              door={<Link className="btn-secondary" to="/finance/ar">Open AR · Receivables</Link>}
            />
            <FinanceKpi
              testId="dashboard-unpaid"
              valueTestId="dashboard-unpaid-amount"
              label="Unpaid"
              value={unpaidValue}
              hint={suppliers}
              noValue={unpaidMissing}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <FinanceKpi
              testId="dashboard-payables"
              valueTestId="dashboard-payables-amount"
              label="AP · Payables"
              value={unpaidValue}
              hint={suppliers}
              noValue={unpaidMissing}
              door={<Link className="btn-secondary" to="/finance/ap-outstanding">Open AP · Payables</Link>}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** In place of a number: the loading bars, or `Could not load {source}` with the last figure it had. */
function NoFigure({ source, query, last }: {
  source: string;
  query: { isError: boolean; dataUpdatedAt: number; refetch: () => unknown };
  last: number | null;
}) {
  if (!query.isError) return <Loading variant="skeleton" lines={2} />;
  const lastAvailable = query.dataUpdatedAt > 0 ? fmtDate(new Date(query.dataUpdatedAt).toISOString(), { time: true }) : null;
  return (
    <div role="alert">
      <p className="font-semibold">Could not load {source}</p>
      {last !== null && lastAvailable && (
        <p className="text-label font-normal">Last available {lastAvailable} · {rm(last)}</p>
      )}
      <button className="btn-secondary mt-2" onClick={() => void query.refetch()}>Try again</button>
    </div>
  );
}
