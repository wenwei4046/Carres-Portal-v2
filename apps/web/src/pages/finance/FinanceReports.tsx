/**
 * Finance → Reports. The Profit and Loss for a period and the Balance Sheet
 * on a day, both read from the ledger (gl_profit_and_loss and
 * gl_balance_sheet), plus the door to Reports → Payment.
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
 *  - A trend. The ledger answers one period per request, so a monthly trend
 *    would cost one request per month. It can return when the ledger serves
 *    a monthly series.
 */
import { Link, useSearchParams } from "react-router-dom";
import { ledgerAccountHref } from "@carres/shared/finance-ledger";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Panel from "@/components/kit/Panel";
import Select from "@/components/kit/Select";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import StatementTable from "./reports/StatementTable";
import { useBalanceSheet, useProfitAndLoss } from "./reports/report-queries";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day as YYYY-MM-DD, or null. */
function readDay(v: string | null): string | null {
  if (!v || !ISO_DAY.test(v)) return null;
  const [y, m, d] = v.split("-").map(Number) as [number, number, number];
  const day = new Date(Date.UTC(y, m - 1, d));
  return day.getUTCFullYear() === y && day.getUTCMonth() === m - 1 && day.getUTCDate() === d ? v : null;
}

/** The last day of a YYYY-MM month. */
function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** YYYY-MM when the period is exactly one whole month, else null. */
function wholeMonth(from: string, to: string): string | null {
  const ym = from.slice(0, 7);
  return from === `${ym}-01` && to === monthEnd(ym) ? ym : null;
}

/** Every month from the ledger's first to this one, newest first, plus the
 *  month on screen if it falls outside that. */
function monthChoices(goLive: string | null, today: string, shown: string | null): string[] {
  const last = today.slice(0, 7);
  const out = new Set<string>([last]);
  let ym = (goLive ?? today).slice(0, 7);
  for (let i = 0; ym <= last && i < 600; i += 1) {
    out.add(ym);
    ym = nextMonth(ym);
  }
  if (shown) out.add(shown);
  return [...out].sort().reverse();
}

/** The period in the address, or this month. An Up to before From is read as From. */
function readPeriod(params: URLSearchParams, today: string): { from: string; to: string } {
  const ym = today.slice(0, 7);
  const from = readDay(params.get("from")) ?? `${ym}-01`;
  const to = readDay(params.get("to")) ?? monthEnd(ym);
  return { from, to: to < from ? from : to };
}

const notStartedError = (error: unknown) => (error as { status?: number } | null)?.status === 409;

// Entries can cancel out, so an account at RM 0.00 is not "no entries".
const PL_ALL_ZERO = "Every account is at RM 0.00 in this period.";
const BS_ALL_ZERO = "Every account is at RM 0.00 on this day.";

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

export default function FinanceReports() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const { from, to } = readPeriod(params, today);
  const asOf = readDay(params.get("asOf")) ?? today;

  const pl = useProfitAndLoss(from, to);
  const bs = useBalanceSheet(asOf);
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

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="reports-destination-header" word="Reports" docTitle="Reports — Carres" />
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

        {notStarted ? <div role="alert" className="text-body">
          <p>The ledger has no start date yet. Nothing can be totalled.</p>
        </div> : <>
          {goLive && <p className="text-body text-kit-slate-11" data-testid="reports-go-live">
            Since {fmtDate(goLive)} · No opening balances
          </p>}

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <Panel title="Profit and Loss">
              <div className="flex flex-col gap-4">
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
                </div>
                {pl.isError ? <ReadFailed testId="profit-and-loss-failed"
                  sentence="The profit and loss could not be loaded. Try again."
                  retrying={pl.isFetching} onRetry={() => void pl.refetch()} />
                : <StatementTable label="Profit and Loss" testId="profit-and-loss"
                  sections={plReport?.status === "ok" ? plReport.sections : []}
                  loading={pl.isPending}
                  empty={plReport?.status === "before_go_live" ? beforeGoLive(plReport.goLiveOn) : PL_ALL_ZERO}
                  nothing={PL_ALL_ZERO}
                  accountHref={(code) => ledgerAccountHref(code, from, to)}
                  bottomLine={plReport?.status === "ok" ? { label: "Net result", amount: plReport.net } : null} />}
              </div>
            </Panel>

            <Panel title="Balance Sheet">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-40">
                    <DatePicker id="reports-bs-as-of" label="As of" value={asOf} onChange={pickAsOf} />
                  </div>
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
                  empty={bsReport?.status === "before_go_live" ? beforeGoLive(bsReport.goLiveOn) : BS_ALL_ZERO}
                  nothing={BS_ALL_ZERO}
                  accountHref={(code) => ledgerAccountHref(code, bsReport?.goLiveOn ?? null, asOf)}
                  bottomLine={null} />}
              </div>
            </Panel>
          </div>
        </>}
      </div>
    </div>
  </div>;
}
