/**
 * Finance → Reports. The Profit and Loss for a period and the Balance Sheet
 * on a day, both read from the ledger (gl_profit_and_loss and
 * gl_balance_sheet), a twelve-month trend of the Profit and Loss, plus the
 * door to Reports → Payment.
 *
 * Every figure is a ledger sum served by the API; the page adds nothing up.
 * Each account line opens the Journal narrowed to that account and dates.
 *
 * Removed, and why:
 *  - The monthly table, its four KPIs and the revenue trend. They read
 *    finance_monthly_pl, which set cost at 55% of revenue and running cost
 *    at RM 42,000 a month. Nobody entered those figures.
 *  - Top SKUs. finance_top_skus adds up order lines (price × qty) for all
 *    time, whatever period is chosen. That is order value, not income the
 *    ledger recognised, so it would be a second revenue figure.
 *
 * The trend asks gl_profit_and_loss once per month (twelve at most, none
 * before go-live), through the same query the statement uses, so the month on
 * screen is not read twice.
 *
 * `By month` on either statement does the same: one column per month (3, 6 or
 * 12, the latest first), each the statement's own read for that month, so a
 * month there never disagrees with the statement for that month.
 */
import { Link, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { ledgerAccountHref } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import DocumentTable from "@/components/kit/DocumentTable";
import Loading from "@/components/kit/Loading";
import DatePicker from "@/components/kit/DatePicker";
import Panel from "@/components/kit/Panel";
import Select from "@/components/kit/Select";
import Tabs from "@/components/kit/Tabs";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import StatementTable, { indent, nothingInPeriod, nothingOnDay, paidBeforeInvoiceNote } from "./reports/StatementTable";
import { packMonths, statementExport } from "./month-end-pack";
import ExportStatement from "./reports/ExportStatement";
import { monthChoices, monthEnd, readDay, readPeriod, wholeMonth } from "./reports/period";
import { balanceSheetQuery, profitAndLossQuery, useBalanceSheet, useProfitAndLoss, type ProfitAndLoss } from "./reports/report-queries";
import { byMonthExport, byMonthLines, lastMonths, MONTH_CHOICES, readMonthCount } from "./reports/by-month";
import { DepartmentFilter, departmentWord, useDepartmentParam, useDepartments } from "./department";

const notStartedError = (error: unknown) => (error as { status?: number } | null)?.status === 409;


const beforeGoLive =(goLiveOn: string) => `The ledger started on ${fmtDate(goLiveOn)}. Pick a day from then on.`;

function ReadFailed({ testId, sentence, retrying, onRetry }: {
  testId: string;
  sentence: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return <div role="alert" data-testid={testId} className="flex flex-col items-start gap-3 text-body">
    <p>{sentence}</p>
    <Button variant="neutral" loading={retrying} onClick={onRetry}>Try again</Button>
  </div>;
}

const TREND_MONTHS = 12;

/** A section's served total; a section with no accounts in the chart is 0. */
const sectionTotal = (pl: Extract<ProfitAndLoss, { status: "ok" }>, kind: string) =>
  pl.sections.find((s) => s.kind === kind)?.total ?? 0;

/** Income, expense and net result for each of the last twelve months since go-live, oldest first.
 *  The department picked above filters the trend too, so the twelve months and the statement
 *  on the same page never answer with different money. */
function ProfitAndLossTrend({ goLive, today, dept }: { goLive: string; today: string; dept: string }) {
  const months = packMonths(today, goLive).slice(0, TREND_MONTHS).reverse();
  const reads = useQueries({ queries: months.map((ym) => profitAndLossQuery(`${ym}-01`, monthEnd(ym), dept)) });
  if (reads.some((r) => r.isError)) {
    return <ReadFailed testId="pl-trend-failed" sentence="The profit and loss could not be loaded. Try again."
      retrying={reads.some((r) => r.isFetching)}
      onRetry={() => reads.forEach((r) => { if (r.isError) void r.refetch(); })} />;
  }
  if (reads.some((r) => !r.data)) return <Loading variant="skeleton" lines={2} />;
  // A month the ledger calls before go-live has no figures: it is left out, never shown as RM 0.00.
  const points = months.flatMap((ym, i) => {
    const pl = reads[i]!.data!;
    return pl.status === "ok" ? [{ ym, income: sectionTotal(pl, "INCOME"), expense: sectionTotal(pl, "EXPENSE"), net: pl.net }] : [];
  });
  const peak = Math.max(0, ...points.map((p) => Math.max(p.income, p.expense)));
  const height = (n: number) => `${peak > 0 ? (Math.max(n, 0) / peak) * 100 : 0}%`;
  return <div className="flex flex-col gap-3.5" data-testid="pl-trend">
    <div className="flex flex-wrap items-center justify-end gap-3.5 text-label text-kit-slate-11">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-kit-green-11" />Income</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-kit-slate-11" />Expense</span>
    </div>
    <div className="overflow-x-auto">
      <ol className="flex min-w-max gap-2">
        {points.map((p) => (
          <li key={p.ym} className="flex w-24 flex-col items-center gap-1" data-testid={`pl-trend-month-${p.ym}`}>
            <span className="flex h-24 w-full items-end justify-center gap-1" aria-hidden>
              <span className="w-3 rounded-sm bg-kit-green-11" style={{ height: height(p.income) }} />
              <span className="w-3 rounded-sm bg-kit-slate-11" style={{ height: height(p.expense) }} />
            </span>
            <span className="text-label text-kit-slate-11">{fmtMonth(p.ym)}</span>
            <span className="text-label tabular-nums">{rm(p.net)}</span>
            <span className="sr-only">Income {rm(p.income)} · Expense {rm(p.expense)}</span>
          </li>
        ))}
      </ol>
    </div>
  </div>;
}

const VIEWS = {
  pl: [{ value: "period", label: "One period" }, { value: "month", label: "By month" }],
  bs: [{ value: "day", label: "One day" }, { value: "month", label: "By month" }],
} as const;

/** The Profit and Loss or the Balance Sheet by month: one column per month, the latest first.
 *  A Profit and Loss column is the month's first day to its last; a Balance Sheet column is
 *  as of the month's last day, or today while the month is still running (the day the
 *  Balance Sheet opens on). Each is read through the statement's own query, with the
 *  department picked above. */
function StatementByMonth({ statement, count, onCount, today, dept, deptWord }: {
  statement: "pl" | "bs";
  count: number;
  onCount: (n: string) => void;
  today: string;
  dept: string;
  deptWord: string | null;
}) {
  const isPl = statement === "pl";
  const months = lastMonths(today, count);
  const asOf = (ym: string) => (monthEnd(ym) > today ? today : monthEnd(ym));
  const reads = useQueries({
    queries: months.map((ym) => (isPl ? profitAndLossQuery(`${ym}-01`, monthEnd(ym), dept) : balanceSheetQuery(asOf(ym), dept))),
  });
  const name = isPl ? "Profit and Loss" : "Balance Sheet";
  const word = isPl ? "profit and loss" : "balance sheet";
  const testId = isPl ? "profit-and-loss-by-month" : "balance-sheet-by-month";
  const heads = (year?: "always") => months.map((ym) => (isPl ? fmtMonth(ym) : fmtDate(asOf(ym), year && { year })));

  const data = reads.every((r) => r.data) ? reads.map((r) => r.data!) : null;
  const goLive = data?.[0]?.goLiveOn ?? null;
  const lines = data && byMonthLines(
    data.map((d) => (d.status === "ok" ? d.sections : null)),
    isPl ? nothingInPeriod : nothingOnDay,
    isPl ? { label: "Net result", amounts: data.map((d) => (d.status === "ok" && "net" in d ? d.net : null)) }
    // The ledger's own check, only when a month failed it: the pack's words, the amount per month.
    : data.some((d) => d.status === "ok" && "balances" in d && !d.balances)
      ? { label: "Assets differ from liabilities plus equity by",
        amounts: data.map((d) => (d.status === "ok" && "balances" in d && !d.balances ? Math.abs(d.difference) : null)) }
      : null,
  );
  const started = data?.some((d) => d.status === "ok") ?? false;

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-40">
        <Select id={`reports-${statement}-months`} label="Months" value={String(count)} onValueChange={onCount}
          options={MONTH_CHOICES.map((n) => ({ value: String(n), label: `${n} months` }))} />
      </div>
      <ExportStatement testId={`${testId}-export`} word={word} pdf={false}
        build={lines && goLive && started ? () => byMonthExport(name, months, heads("always"), lines, goLive, deptWord) : null} />
    </div>
    {reads.some((r) => r.isError) ? <ReadFailed testId={`${testId}-failed`}
      sentence={`The ${word} could not be loaded. Try again.`}
      retrying={reads.some((r) => r.isFetching)}
      onRetry={() => reads.forEach((r) => { if (r.isError) void r.refetch(); })} />
    : !lines || !goLive ? <Loading variant="skeleton" lines={4} />
    : !started ? <p className="text-body">{beforeGoLive(goLive)}</p>
    : <>
      {data!.some((d) => d.status === "before_go_live") && <p className="text-body text-kit-slate-11" data-testid={`${testId}-go-live`}>
        The ledger started on {fmtDate(goLive)}. Months before then have no figures.
      </p>}
      <div data-testid={testId}>
        <DocumentTable label={`${name} by month`}
          columns={[{ key: "account", label: "Account" }, ...heads().map((label, i) => ({ key: months[i]!, label, numeric: true }))]}
          rows={lines.map((l) => ({
            key: l.id,
            total: l.id === "bottom",
            cells: {
              account: <span className={`${l.strong ? "font-semibold" : ""} ${l.id.endsWith(":nothing") ? "text-kit-slate-11" : ""} ${indent(l.depth)}`}>
                {l.label}</span>,
              ...Object.fromEntries(months.map((ym, i) => {
                const a = l.amounts[i];
                return [ym, a === null || a === undefined ? null : l.strong ? <span className="font-semibold">{rm(a)}</span> : rm(a)];
              })),
            },
          }))} />
      </div>
    </>}
  </div>;
}

export default function FinanceReports() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const { from, to } = readPeriod(params, today);
  const asOf = readDay(params.get("asOf")) ?? today;

  const [dept, setDept] = useDepartmentParam();
  const { data: departments = [] } = useDepartments();
  const deptWord = departmentWord(dept, departments);
  const pl = useProfitAndLoss(from, to, dept);
  const bs = useBalanceSheet(asOf, dept);
  const notStarted = notStartedError(pl.error) || notStartedError(bs.error);
  const goLive = pl.data?.goLiveOn ?? bs.data?.goLiveOn ?? null;
  const plReport = pl.data;
  const bsReport = bs.data;

  const edit = (change: (next: URLSearchParams) => void) => setParams((before) => {
    const next = new URLSearchParams(before);
    change(next);
    return next;
  });
  const pickMonth = (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    edit((next) => {
      next.set("from", `${ym}-01`);
      next.set("to", monthEnd(ym));
    });
  };
  // Both dates are always written, from the period on screen. Writing one
  // alone would leave the other to its default, which moves with the month.
  const pickFrom = (iso: string | null) => {
    if (!iso) return;
    edit((next) => {
      next.set("from", iso);
      next.set("to", iso > to ? iso : to);
    });
  };
  const pickTo = (iso: string | null) => {
    if (!iso) return;
    edit((next) => {
      next.set("to", iso);
      next.set("from", iso < from ? iso : from);
    });
  };
  const pickAsOf = (iso: string | null) => {
    if (iso) edit((next) => next.set("asOf", iso));
  };

  const month = wholeMonth(from, to);
  const plView = params.get("plView") === "month" ? "month" : "period";
  const bsView = params.get("bsView") === "month" ? "month" : "day";
  // `?plView=month` · `?plMonths=6`: the view and its months stay in the address, as the dates do.
  const pickView = (key: "plView" | "bsView", v: string) => edit((next) => {
    if (v === "month") next.set(key, "month"); else next.delete(key);
  });
  const pickCount = (key: "plMonths" | "bsMonths", v: string) => edit((next) => next.set(key, String(readMonthCount(v))));

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="reports-destination-header" word="Reports" docTitle="Reports · Carres" />
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="flex flex-col gap-6">
        {/* Payment MASTER §16: Reports → Payment is a destination of this
            page, not a hidden route. */}
        <Link to="/finance/reports/payment" data-testid="reports-payment-door"
          className="flex items-center justify-between rounded-card border border-border bg-card px-4 py-3 hover:bg-muted/40">
          <span>
            <span className="block text-meta font-semibold">Payment</span>
            <span className="block text-label text-muted-foreground">
              Money received · Customer balances · Storage charged and collected · Storage
              waived · Payment corrections · Money needing review</span>
          </span>
          <span className="text-label text-muted-foreground">Open →</span>
        </Link>
        <Link to="/finance/reports/dealer-commission" data-testid="reports-dealer-commission-door"
          className="flex items-center justify-between rounded-card border border-border bg-card px-4 py-3 hover:bg-muted/40">
          <span>
            <span className="block text-meta font-semibold">Dealer commission</span>
            <span className="block text-label text-muted-foreground">
              Commission on collected · Commission still to collect · Rebate this month · Quota left</span>
          </span>
          <span className="text-label text-muted-foreground">Open →</span>
        </Link>
        <Link to="/finance/reports/card-charges" data-testid="reports-card-charges-door"
          className="flex items-center justify-between rounded-card border border-border bg-card px-4 py-3 hover:bg-muted/40">
          <span>
            <span className="block text-meta font-semibold">Card charges</span>
            <span className="block text-label text-muted-foreground">
              Sales total · Fee · Paid into bank · Fee % · by month and card company</span>
          </span>
          <span className="text-label text-muted-foreground">Open →</span>
        </Link>
        {/* 0638 (Chew 2026-10-03): the same door, in the same words' shape. */}
        <Link to="/finance/reports/cash-flow" data-testid="reports-cash-flow-door"
          className="flex items-center justify-between rounded-card border border-border bg-card px-4 py-3 hover:bg-muted/40">
          <span>
            <span className="block text-meta font-semibold">Cash Flow</span>
            <span className="block text-label text-muted-foreground">
              Inflow · Outflow · Net cash flow · Carried forward · by cash and bank account</span>
          </span>
          <span className="text-label text-muted-foreground">Open →</span>
        </Link>
        {/* 0640 (Chew 2026-10-03): the same door. */}
        <Link to="/finance/reports/ap-aging" data-testid="reports-ap-aging-door"
          className="flex items-center justify-between rounded-card border border-border bg-card px-4 py-3 hover:bg-muted/40">
          <span>
            <span className="block text-meta font-semibold">AP Aging</span>
            <span className="block text-label text-muted-foreground">
              Balance · This month to 4 months and over · Not tied to a bill · by supplier on a day</span>
          </span>
          <span className="text-label text-muted-foreground">Open →</span>
        </Link>
        {/* 0643 (Chew 2026-10-03): the same door. Provisional until Stock confirms its month-end count. */}
        <Link to="/finance/reports/stock-value" data-testid="reports-stock-value-door"
          className="flex items-center justify-between rounded-card border border-border bg-card px-4 py-3 hover:bg-muted/40">
          <span>
            <span className="block text-meta font-semibold">Stock value</span>
            <span className="block text-label text-muted-foreground">
              Warehouse · Showroom · In transit · Sent for repair · at a month end, provisional</span>
          </span>
          <span className="text-label text-muted-foreground">Open →</span>
        </Link>

        {notStarted ? <div role="alert" className="text-body">
          <p>The ledger has no start date yet. Nothing can be totalled.</p>
        </div> : <>
          {goLive && <p className="text-body text-kit-slate-11" data-testid="reports-go-live">
            Since {fmtDate(goLive)} · No opening balances
          </p>}
          <DepartmentFilter value={dept} onChange={setDept} />

          {/* grid-cols-1 lets a wide By month table scroll inside its panel, not the page. */}
          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            <Panel title="Profit and Loss">
              <div className="flex flex-col gap-4">
                <Tabs label="Profit and Loss view" tabs={VIEWS.pl} value={plView} onValueChange={(v) => pickView("plView", v)} />
                {plView === "month" ? <StatementByMonth statement="pl" count={readMonthCount(params.get("plMonths"))}
                  onCount={(v) => pickCount("plMonths", v)} today={today} dept={dept} deptWord={deptWord} />
                : <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <Select id="reports-pl-month" label="Month" value={month ?? ""} onValueChange={pickMonth}
                      placeholder="Custom Date Range"
                      options={monthChoices(goLive, today, month).map((m) => ({ value: m, label: fmtMonth(m) }))} />
                  </div>
                  <div className="w-40">
                    <DatePicker id="reports-pl-from" label="From" value={from} onChange={pickFrom} />
                  </div>
                  <div className="w-40">
                    <DatePicker id="reports-pl-to" label="Up to" value={to} minDate={from} onChange={pickTo} />
                  </div>
                  <ExportStatement testId="profit-and-loss-export" word="profit and loss"
                    build={plReport?.status === "ok" ? () => statementExport(plReport, deptWord) : null} />
                </div>
                {pl.isError ? <ReadFailed testId="profit-and-loss-failed"
                  sentence="The profit and loss could not be loaded. Try again."
                  retrying={pl.isFetching} onRetry={() => void pl.refetch()} />
                : <StatementTable label="Profit and Loss" testId="profit-and-loss"
                  sections={plReport?.status === "ok" ? plReport.sections : []}
                  loading={pl.isPending}
                  empty={plReport?.status === "before_go_live" ? beforeGoLive(plReport.goLiveOn) : nothingInPeriod("INCOME")}
                  nothing={nothingInPeriod}
                  accountHref={(code) => ledgerAccountHref(code, from, to)}
                  bottomLine={plReport?.status === "ok" ? { label: "Net result", amount: plReport.net } : null} />}
                </>}
              </div>
            </Panel>

            <Panel title="Balance Sheet">
              <div className="flex flex-col gap-4">
                <Tabs label="Balance Sheet view" tabs={VIEWS.bs} value={bsView} onValueChange={(v) => pickView("bsView", v)} />
                {bsView === "month" ? <StatementByMonth statement="bs" count={readMonthCount(params.get("bsMonths"))}
                  onCount={(v) => pickCount("bsMonths", v)} today={today} dept={dept} deptWord={deptWord} />
                : <>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <DatePicker id="reports-bs-as-of" label="As of" value={asOf} onChange={pickAsOf} />
                  </div>
                  <ExportStatement testId="balance-sheet-export" word="balance sheet"
                    build={bsReport?.status === "ok" ? () => statementExport(bsReport, deptWord) : null} />
                </div>
                {bsReport?.status === "ok" && !bsReport.balances && <div role="status" data-testid="balance-sheet-differs"
                  className="flex flex-wrap items-center gap-2 rounded-control bg-kit-amber-3 px-4 py-2 text-body text-kit-amber-11">
                  ⚠ Assets differ from liabilities plus equity by {rm(Math.abs(bsReport.difference))}.
                  <Link className="underline underline-offset-2" to="/finance/ledger/self-check">Open Self-check</Link>
                </div>}
                {bs.isError ? <ReadFailed testId="balance-sheet-failed"
                  sentence="The balance sheet could not be loaded. Try again."
                  retrying={bs.isFetching} onRetry={() => void bs.refetch()} />
                : <StatementTable label="Balance Sheet" testId="balance-sheet"
                  sections={bsReport?.status === "ok" ? bsReport.sections : []}
                  loading={bs.isPending}
                  empty={bsReport?.status === "before_go_live" ? beforeGoLive(bsReport.goLiveOn) : nothingOnDay("ASSET")}
                  nothing={nothingOnDay}
                  accountHref={(code) => ledgerAccountHref(code, bsReport?.goLiveOn ?? null, asOf)}
                  lineNote={paidBeforeInvoiceNote}
                  bottomLine={null} />}
                </>}
              </div>
            </Panel>
          </div>

          {goLive && <Panel title="Profit and Loss · Last 12 months">
            <ProfitAndLossTrend goLive={goLive} today={today} dept={dept} />
          </Panel>}
        </>}
      </div>
    </div>
  </div>;
}
