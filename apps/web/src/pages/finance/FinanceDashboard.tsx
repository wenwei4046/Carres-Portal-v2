import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Loading from "@/components/kit/Loading";
import { SectionCard } from "@/components/SectionPanel";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useInvoiceRegister } from "@/lib/queries";
import { useApOutstanding } from "@/lib/payables-queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { customerOwingRows, outstandingTotal, unpaidTotal } from "./money-owed";

/**
 * Finance → Dashboard. Two figures about money owed, each read through
 * `money-owed.ts` (Law D — the same arithmetic as the page it opens):
 *
 *   Outstanding  what customers still owe HQ → opens AR · Receivables
 *   Unpaid       what Carres still owes suppliers → opens Unpaid by Supplier
 *
 * A figure whose read failed says `Could not load {source}`, never RM 0.00
 * (Workspace MASTER §8.2). There is no Cash figure: the ledger holds no
 * opening balances yet, so any cash number would be invented. It used to read
 * `finance_dashboard_summary` / `finance_cashflow_series` (0062/0064).
 */
export default function FinanceDashboard() {
  const invoices = useInvoiceRegister();
  const payables = useApOutstanding();
  const owing = invoices.data ? outstandingTotal(customerOwingRows(invoices.data)) : null;
  const unpaid = payables.data ? unpaidTotal(payables.data) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="finance-dashboard-destination-header" word="Dashboard"
        docTitle="Dashboard — Carres" />
      <div className="flex-1 overflow-auto p-4">
        <h2 className="text-strong mb-3">Material exposure</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Measure
            testId="dashboard-outstanding"
            title="Outstanding"
            source="Invoices"
            query={invoices}
            amount={owing?.total ?? null}
            count={owing ? `${owing.orders} ${owing.orders === 1 ? "order" : "orders"}` : null}
            meaning="What customers still owe HQ, storage included. Orders with no price yet are left out."
            door={<Link className="btn-secondary" to="/finance/ar">Open AR · Receivables</Link>}
          />
          <Measure
            testId="dashboard-unpaid"
            title="Unpaid"
            source="Unpaid by Supplier"
            query={payables}
            amount={unpaid?.total ?? null}
            count={unpaid ? `${unpaid.suppliers} ${unpaid.suppliers === 1 ? "supplier" : "suppliers"}` : null}
            meaning="What Carres still owes suppliers and other creditors on confirmed bills."
            door={<Link className="btn-secondary" to="/finance/ap-outstanding">Open Unpaid by Supplier</Link>}
          />
        </div>
      </div>
    </div>
  );
}

function Measure({ testId, title, source, query, amount, count, meaning, door }: {
  testId: string;
  title: string;
  source: string;
  query: { isError: boolean; isSuccess: boolean; dataUpdatedAt: number; refetch: () => unknown };
  amount: number | null;
  count: string | null;
  meaning: string;
  door: ReactNode;
}) {
  const lastAvailable = query.dataUpdatedAt > 0 ? fmtDate(new Date(query.dataUpdatedAt).toISOString(), { time: true }) : null;
  return (
    <SectionCard>
      <div className="flex flex-col gap-2 p-3" data-testid={testId}>
        <h3 className="text-strong">{title}</h3>
        {query.isError ? (
          <div role="alert">
            <p className="font-semibold">Could not load {source}</p>
            {amount !== null && lastAvailable && (
              <p className="text-label font-normal">Last available {lastAvailable} · {rm(amount)}</p>
            )}
            <button className="btn-secondary mt-2" onClick={() => void query.refetch()}>Try again</button>
          </div>
        ) : !query.isSuccess || amount === null ? (
          <Loading variant="skeleton" lines={2} />
        ) : (
          <div>
            <p className="text-title font-semibold tabular-nums" data-testid={`${testId}-amount`}>{rm(amount)}</p>
            <p className="text-label font-normal">{count}</p>
          </div>
        )}
        <p className="text-label font-normal">{meaning}</p>
        <div>{door}</div>
      </div>
    </SectionCard>
  );
}
