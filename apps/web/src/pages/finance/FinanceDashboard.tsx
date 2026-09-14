import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useInvoiceRegister } from "@/lib/queries";
import { useApOutstanding } from "@/lib/payables-queries";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { customerOwingRows, outstandingTotal, unpaidTotal } from "./money-owed";

/**
 * Finance → Dashboard. The layout it had before PR #1248 (owner ruling
 * 2026-09-14): a row of figure tiles, then a Payables card. Every number is
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
  const orders = owing ? `${owing.orders} ${owing.orders === 1 ? "order" : "orders"}` : null;
  const suppliers = unpaid ? `${unpaid.suppliers} ${unpaid.suppliers === 1 ? "supplier" : "suppliers"}` : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="finance-dashboard-destination-header" word="Dashboard"
        docTitle="Dashboard — Carres" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] p-4 md:p-9">
          <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              testId="dashboard-outstanding"
              label="Outstanding"
              source="Invoices"
              query={invoices}
              amount={owing?.total ?? null}
              hint={orders}
              accent
              door={<Link className="text-label font-semibold text-primary hover:underline" to="/finance/ar">Open AR · Receivables</Link>}
            />
            <Tile
              testId="dashboard-unpaid"
              label="Unpaid"
              source="AP · Payables"
              query={payables}
              amount={unpaid?.total ?? null}
              hint={suppliers}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <div className="rounded-md border border-border bg-card p-5" data-testid="dashboard-payables">
              <div className="text-label font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                AP · Payables
              </div>
              <div className="mt-0.5 text-body font-semibold">Unpaid</div>
              <Figure source="AP · Payables" query={payables} amount={unpaid?.total ?? null}
                hint={suppliers} testId="dashboard-payables-amount" />
              <div className="mt-3">
                <Link className="btn-secondary" to="/finance/ap-outstanding">Open AP · Payables</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type Read = { isError: boolean; isSuccess: boolean; dataUpdatedAt: number; refetch: () => unknown };

/** One figure tile of the top row — the FinanceKpi look, plus a failed-read state and a door. */
function Tile({ testId, label, source, query, amount, hint, accent, door }: {
  testId: string;
  label: string;
  source: string;
  query: Read;
  amount: number | null;
  hint: string | null;
  accent?: boolean;
  door?: ReactNode;
}) {
  return (
    <div className={`rounded-md border bg-card px-5 py-[18px] ${accent ? "border-primary" : "border-border"}`}
      data-testid={testId}>
      <div className={`text-label font-semibold uppercase tracking-[0.06em] ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </div>
      <Figure source={source} query={query} amount={amount} hint={hint} testId={`${testId}-amount`}
        tone={accent ? "text-primary" : "text-foreground"} />
      {door && <div className="mt-2">{door}</div>}
    </div>
  );
}

/** The number, its loading bars, or `Could not load {source}` — never a zero for a failed read. */
function Figure({ source, query, amount, hint, testId, tone = "text-foreground" }: {
  source: string;
  query: Read;
  amount: number | null;
  hint: string | null;
  testId: string;
  tone?: string;
}) {
  if (query.isError) {
    const lastAvailable = query.dataUpdatedAt > 0 ? fmtDate(new Date(query.dataUpdatedAt).toISOString(), { time: true }) : null;
    return (
      <div role="alert" className="mt-1.5">
        <p className="font-semibold">Could not load {source}</p>
        {amount !== null && lastAvailable && (
          <p className="text-label font-normal">Last available {lastAvailable} · {rm(amount)}</p>
        )}
        <button className="btn-secondary mt-2" onClick={() => void query.refetch()}>Try again</button>
      </div>
    );
  }
  if (!query.isSuccess || amount === null) {
    return (
      <div aria-busy="true">
        <div className="mt-2.5 h-7 w-28 animate-pulse rounded bg-muted" />
        <div className="mt-2.5 h-2.5 w-16 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  return (
    <>
      <div data-kpi-value data-testid={testId}
        className={`mt-1.5 font-display text-page leading-none tabular-nums ${tone}`}>
        {rm(amount)}
      </div>
      {hint && <div className="mt-1.5 text-label text-muted-foreground">{hint}</div>}
    </>
  );
}
