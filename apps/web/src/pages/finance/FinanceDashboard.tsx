// design-standard: not-a-list-page — figure tiles and summary cards; every list they summarise lives on the page each door opens.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { LedgerEntryRow } from "@carres/shared/finance-ledger";
import { ledgerAccountHref, ledgerEntryHref, ledgerSourceWord } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Loading from "@/components/kit/Loading";
import Panel from "@/components/kit/Panel";
import Select from "@/components/kit/Select";
import { FinanceKpi } from "@/components/FinanceKpi";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useInvoiceRegister } from "@/lib/queries";
import { useApOutstanding } from "@/lib/payables-queries";
import { appTodayIso, fmtDate, fmtDateShort, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { useLatestLedgerEntries, useLedgerChart } from "./ledger/ledger-queries";
import { CASH_WEEKS, useCashAccountMovement, useCashMovement, type CashAccountMovement, type CashMovement } from "./cash-movement";
import { defaultPackMonth, exportMonthEndPack, packMonths } from "./month-end-pack";
import {
  AGE_BUCKETS,
  arAging,
  customerOwingRows,
  outstandingTotal,
  unpaidTotal,
  type ArAging,
} from "./money-owed";
import { FieldError } from "@/components/kit/FieldFrame";

/**
 * Finance → Dashboard. The layout it had before PR #1248 (owner ruling
 * 2026-09-14, "even the left-out ones" come back), every box on a current
 * source:
 *
 *   Outstanding · Overdue (>30d) · A/R Aging   money-owed.ts over the Invoices
 *                                              Register → opens AR · Receivables
 *                                              (narrowed to the same age scope)
 *   Unpaid · AP · Payables                     money-owed.ts over ap_outstanding
 *                                              → opens AP · Payables
 *   Net cash · 12 wks · Cashflow               cash-movement.ts over the ledger's
 *   Movement since go-live (per account)       account ledger (1100 Cash and bank)
 *   Activity                                   the Journal's own entries read
 *   Export month-end pack                      month-end-pack.ts: Trial Balance,
 *                                              Profit and Loss, Balance Sheet
 *
 * Nothing here reads the 0062–0064 finance functions. A figure whose read
 * failed says `Could not load {source}`, never RM 0.00 (Workspace MASTER §8.2)
 * — and says it in its own box alone: the twelve-week cash read and the
 * since-go-live per-account read are two reads, so neither can blank the other.
 */
export default function FinanceDashboard() {
  const today = appTodayIso();
  const invoices = useInvoiceRegister();
  const payables = useApOutstanding();
  const chart = useLedgerChart();
  const cash = useCashMovement(chart.data, today);
  // Its own read over its own window: the panel's window grows, the tile's and the chart's does not,
  // and neither box may blank the other two.
  const accounts = useCashAccountMovement(chart.data, today);
  const goLive = chart.data?.go_live_on ?? null;
  const notStarted = chart.isSuccess && !goLive;
  const activity = useLatestLedgerEntries(goLive);

  const owingRows = invoices.data ? customerOwingRows(invoices.data) : null;
  const owing = owingRows ? outstandingTotal(owingRows) : null;
  const aging = owingRows ? arAging(owingRows, today) : null;
  const unpaid = payables.data ? unpaidTotal(payables.data) : null;
  // A figure prints only from a read that succeeded; a failed refetch shows the words instead.
  const invoicesOk = !invoices.isError;
  const owingValue = owing && invoicesOk ? rm(owing.total) : null;
  const overdueValue = aging && invoicesOk ? rm(aging.overdue.total) : null;
  const unpaidValue = unpaid && !payables.isError ? rm(unpaid.total) : null;
  const cashOk = !cash.isError && !chart.isError;
  const accountsOk = !accounts.isError && !chart.isError;
  // Go-live still ahead: no week has begun, so there is nothing to measure — a sentence, never RM 0.00.
  const startsOn = goLive && goLive > today ? goLive : null;
  const cashData = cash.data && cashOk && !startsOn ? cash.data : null;
  const accountRows = accounts.data && accountsOk && !startsOn ? accounts.data : null;

  // An issued invoice whose date cannot be read makes the aging unreadable, not zero.
  const agingRead = aging === null && owingRows !== null
    ? { isError: true, dataUpdatedAt: 0, refetch: invoices.refetch }
    : invoices;
  const cashRead = {
    isError: !cashOk,
    dataUpdatedAt: cash.dataUpdatedAt,
    refetch: () => (chart.isError ? chart.refetch() : cash.refetch()),
  };
  const accountsRead = {
    isError: !accountsOk,
    dataUpdatedAt: accounts.dataUpdatedAt,
    refetch: () => (chart.isError ? chart.refetch() : accounts.refetch()),
  };

  const owingMissing = <NoFigure source="Invoices" query={invoices} last={owing?.total ?? null} />;
  const overdueMissing = <NoFigure source="Invoices" query={agingRead} last={aging?.overdue.total ?? null} />;
  const unpaidMissing = <NoFigure source="AP · Payables" query={payables} last={unpaid?.total ?? null} />;
  const cashMissing = notStarted ? <NotStarted />
    : startsOn ? <StartsOn date={startsOn} />
    : <NoFigure source="Cash and bank" query={cashRead} last={cash.data?.net ?? null} />;
  const accountsMissing = notStarted ? <NotStarted />
    : startsOn ? <StartsOn date={startsOn} />
    : <NoFigure source="Cash and bank" query={accountsRead} last={null} />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="finance-dashboard-destination-header" word="Dashboard"
        docTitle="Dashboard — Carres" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1400px] p-4 md:p-9">
          <MonthEndPack today={today} goLive={goLive} ready={!chart.isPending} />

          <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <FinanceKpi
              testId="dashboard-outstanding"
              valueTestId="dashboard-outstanding-amount"
              label="Outstanding"
              value={owingValue}
              hint={owing ? ordersWord(owing.orders) : undefined}
              tone="warn"
              accent
              noValue={owingMissing}
              door={<Link className="btn-secondary" to="/finance/ar">Open AR · Receivables</Link>}
            />
            <FinanceKpi
              testId="dashboard-overdue"
              valueTestId="dashboard-overdue-amount"
              label="Overdue (>30d)"
              value={overdueValue}
              hint={aging ? ordersWord(aging.overdue.orders) : undefined}
              tone={aging && aging.overdue.total > 0 ? "danger" : "ok"}
              noValue={overdueMissing}
              door={<Link className="btn-secondary" to="/finance/ar?age=over-30">Open AR · Receivables</Link>}
            />
            <FinanceKpi
              testId="dashboard-unpaid"
              valueTestId="dashboard-unpaid-amount"
              label="Unpaid"
              value={unpaidValue}
              hint={unpaid ? suppliersWord(unpaid.suppliers) : undefined}
              noValue={unpaidMissing}
            />
            <FinanceKpi
              testId="dashboard-net-cash"
              valueTestId="dashboard-net-cash-amount"
              label="Net cash · 12 wks"
              value={cashData ? rm(cashData.net) : null}
              hint={cashData ? <NetCashHint cash={cashData} /> : undefined}
              tone={cashData && cashData.net < 0 ? "danger" : "ok"}
              noValue={cashMissing}
            />
          </div>

          <div className="mb-5 grid grid-cols-1 gap-3.5 lg:grid-cols-[3fr_2fr]">
            <Panel title="Cashflow · Last 12 weeks">
              {cashData ? <CashflowChart cash={cashData} /> : cashMissing}
            </Panel>
            <Panel title="A/R Aging · Outstanding by age">
              {aging && invoicesOk ? <AgingRows aging={aging} total={owing?.total ?? 0} />
                : <NoFigure source="Invoices" query={agingRead} last={null} />}
            </Panel>
          </div>

          <div className="mb-5">
            <Panel title="Cash and bank · Movement since go-live">
              {accountRows && goLive ? <AccountMovement rows={accountRows} goLiveOn={goLive} today={today} />
                : accountsMissing}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            <Panel title="Activity · Recent transactions"
              right={<Link className="btn-secondary" to="/finance/ledger">Open Journal</Link>}>
              {notStarted ? <NotStarted />
                : activity.isError || chart.isError
                  ? <NoFigure source="Journal" last={null}
                      query={{ isError: true, dataUpdatedAt: activity.dataUpdatedAt,
                        refetch: () => (chart.isError ? chart.refetch() : activity.refetch()) }} />
                  : <ActivityTable rows={activity.data ?? null} />}
            </Panel>
            <FinanceKpi
              testId="dashboard-payables"
              valueTestId="dashboard-payables-amount"
              label="AP · Payables"
              value={unpaidValue}
              hint={unpaid ? suppliersWord(unpaid.suppliers) : undefined}
              noValue={unpaidMissing}
              door={<Link className="btn-secondary" to="/finance/ap-outstanding">Open AP · Payables</Link>}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const ordersWord = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;
const suppliersWord = (n: number) => `${n} ${n === 1 ? "supplier" : "suppliers"}`;
/**
 * The count prints only while fewer than twelve columns exist. Twelve columns can
 * still be short (the first starts mid-week on go-live); then the date says it
 * alone — "12 of 12 weeks" would call the window short and whole in one line.
 */
const fewerWeeks = (cash: CashMovement) => cash.weeks.length < CASH_WEEKS;
const weeksWord = (cash: CashMovement) => fewerWeeks(cash)
  ? `Since ${fmtDate(cash.goLiveOn)} · ${cash.weeks.length} of ${CASH_WEEKS} weeks`
  : `Since ${fmtDate(cash.goLiveOn)}`;

function NetCashHint({ cash }: { cash: CashMovement }) {
  return <>
    <span className="block">In {rm(cash.moneyIn)} · Out {rm(cash.moneyOut)}</span>
    {cash.short && <span className="block" data-testid="dashboard-net-cash-short">{weeksWord(cash)}</span>}
  </>;
}

/** One column per week since go-live (twelve at most): money in and money out, and the week's net under them. */
function CashflowChart({ cash }: { cash: CashMovement }) {
  const peak = Math.max(0, ...cash.weeks.map((w) => Math.max(w.moneyIn, w.moneyOut)));
  const height = (n: number) => `${peak > 0 ? (n / peak) * 100 : 0}%`;
  return <div className="flex flex-col gap-3.5" data-testid="dashboard-cashflow">
    <div className="flex flex-wrap items-center justify-between gap-3 text-label text-kit-slate-11">
      <span>Money in less money out on cash and bank accounts · No opening balances</span>
      <span className="flex gap-3.5">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-kit-green-11" />Inflow</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-kit-slate-11" />Outflow</span>
      </span>
    </div>
    {cash.short && <p className="text-body" data-testid="dashboard-cashflow-short">
      {`The ledger started on ${fmtDate(cash.goLiveOn)}.`}
      {fewerWeeks(cash) && ` ${cash.weeks.length} of ${CASH_WEEKS} weeks so far.`}
    </p>}
    <div className="overflow-x-auto">
      <ol className="flex min-w-max gap-2">
        {cash.weeks.map((w) => (
          <li key={w.from} className="flex w-20 flex-col items-center gap-1" data-testid={`dashboard-cashflow-week-${w.from}`}>
            <span className="flex h-24 w-full items-end justify-center gap-1" aria-hidden>
              <span className="w-3 rounded-sm bg-kit-green-11" style={{ height: height(w.moneyIn) }} />
              <span className="w-3 rounded-sm bg-kit-slate-11" style={{ height: height(w.moneyOut) }} />
            </span>
            <span className="text-label text-kit-slate-11">{fmtDateShort(w.from)}</span>
            <span className="text-label tabular-nums">{rm(w.net)}</span>
            <span className="sr-only">In {rm(w.moneyIn)} · Out {rm(w.moneyOut)}</span>
          </li>
        ))}
      </ol>
    </div>
    <div className="grid grid-cols-3 gap-3">
      <Total label="Inflow total" value={rm(cash.moneyIn)} testId="dashboard-cashflow-in" />
      <Total label="Outflow total" value={rm(cash.moneyOut)} testId="dashboard-cashflow-out" />
      <Total label="Net" value={rm(cash.net)} testId="dashboard-cashflow-net" />
    </div>
  </div>;
}

/** Each cash and bank account since go-live; each account opens its lines in the Journal. */
function AccountMovement({ rows, goLiveOn, today }: { rows: CashAccountMovement[]; goLiveOn: string; today: string }) {
  const columns: Column<CashAccountMovement>[] = [
    { key: "account", label: "Account", width: 40,
      cell: (r) => <Link className="underline underline-offset-2" to={ledgerAccountHref(r.code, goLiveOn, today)}>
        {r.code} {r.name}</Link> },
    { key: "in", label: "Inflow", width: 20, align: "right", numeric: true, cell: (r) => rm(r.moneyIn) },
    { key: "out", label: "Outflow", width: 20, align: "right", numeric: true, cell: (r) => rm(r.moneyOut) },
    { key: "net", label: "Net", width: 20, align: "right", numeric: true, cell: (r) => rm(r.net) },
  ];
  return <div className="flex flex-col gap-3.5" data-testid="dashboard-account-movement">
    <p className="text-label text-kit-slate-11">
      Money in and out of each account since {fmtDate(goLiveOn)}, when the ledger started.
      Money held before then is not counted.
    </p>
    <DataTable label="Movement since go-live" testId="dashboard-account-movement-table"
      rowTestId="dashboard-account-movement-row" rows={rows} columns={columns} rowId={(r) => r.code}
      // Never empty: the read fails when the chart has no cash or bank account.
      empty={null} />
  </div>;
}

function Total({ label, value, testId }: { label: string; value: string; testId: string }) {
  return <div>
    <div className="text-label uppercase tracking-[0.06em] font-semibold text-kit-slate-11">{label}</div>
    <div className="text-strong tabular-nums" data-testid={testId}>{value}</div>
  </div>;
}

const BUCKET_TONE: Record<(typeof AGE_BUCKETS)[number], string> = {
  "0-30": "bg-kit-green-11",
  "31-60": "bg-kit-slate-9",
  "61-90": "bg-kit-amber-11",
  "90+": "bg-kit-red-9",
};

/** The four age buckets; each row opens AR · Receivables narrowed to that bucket. */
function AgingRows({ aging, total }: { aging: ArAging; total: number }) {
  return <ul className="flex flex-col gap-3" data-testid="dashboard-aging">
    {AGE_BUCKETS.map((b) => {
      const row = aging.buckets[b];
      const pct = total > 0 ? (row.total / total) * 100 : 0;
      return <li key={b}>
        <Link to={`/finance/ar?age=${encodeURIComponent(b)}`} className="block rounded-control hover:bg-kit-slate-3"
          data-testid={`dashboard-aging-${b}`}>
          <span className="mb-1 flex justify-between text-label">
            <span className="font-semibold">{b} days</span>
            <span className="tabular-nums" data-testid={`dashboard-aging-${b}-amount`}>
              {rm(row.total)} · {ordersWord(row.orders)}
            </span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded bg-kit-slate-3">
            <span className={`block h-full ${BUCKET_TONE[b]}`} style={{ width: `${pct}%` }} />
          </span>
        </Link>
      </li>;
    })}
  </ul>;
}

/** The newest ledger entries; each number opens that entry in the Journal. */
function ActivityTable({ rows }: { rows: LedgerEntryRow[] | null }) {
  const columns: Column<LedgerEntryRow>[] = [
    { key: "date", label: "Date", width: 26, cell: (r) => fmtDate(r.entry_date) },
    { key: "entry", label: "Entry No", width: 26,
      cell: (r) => <Link className="underline underline-offset-2" to={ledgerEntryHref(r.entry_no)}>{r.entry_no}</Link> },
    { key: "source", label: "Source", width: 26, cell: (r) => ledgerSourceWord(r.source_type) },
    { key: "amount", label: "Amount", width: 22, align: "right", numeric: true, cell: (r) => rm(r.total_debit) },
  ];
  return <DataTable label="Activity" testId="dashboard-activity" rowTestId="dashboard-activity-row"
    rows={rows ?? []} columns={columns} rowId={(r) => r.id} loading={rows === null}
    empty="No entries yet. Invoices, payments and bills add entries here." />;
}

/** One button: the Trial Balance, Profit and Loss and Balance Sheet for a month, in one workbook. */
function MonthEndPack({ today, goLive, ready }: { today: string; goLive: string | null; ready: boolean }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const month = picked ?? defaultPackMonth(today, goLive);
  const run = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await exportMonthEndPack(qc, month, today);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return <div className="mb-5 flex flex-wrap items-end justify-end gap-3" data-testid="dashboard-month-end-pack">
    {failed && <FieldError>The month-end pack could not be exported. Try again.</FieldError>}
    <div className="w-40">
      <Select id="dashboard-pack-month" label="Month" value={month} onValueChange={setPicked}
        options={packMonths(today, goLive).map((m) => ({ value: m, label: fmtMonth(m) }))} />
    </div>
    <Button icon="download" loading={busy} disabled={!ready} onClick={() => void run()}>
      Export month-end pack
    </Button>
  </div>;
}

function NotStarted(): ReactNode {
  return <p className="text-body" role="status">The ledger has no start date yet.</p>;
}

/** Go-live is still ahead: no week has begun, so there is no figure to show yet. */
function StartsOn({ date }: { date: string }): ReactNode {
  return <p className="text-body" role="status" data-testid="dashboard-cash-starts-on">
    The ledger starts on {fmtDate(date)}.
  </p>;
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
