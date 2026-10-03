/**
 * Finance → Reports → Cash Flow, at `/finance/reports/cash-flow` (migration
 * 0638; Chew 2026-10-03, docs/finance/MASTER.md §3.6, after Houzs Part 10 §4).
 *
 * What came into and went out of the cash and bank accounts over a period,
 * and what it was for: a receipts and payments statement, not an indirect
 * cash-flow statement. Each line is the account on the other side of the
 * money, and opens the Journal on that account for the period. A move between
 * two of Carres's own accounts is a transfer, in on one and out on the other.
 *
 * Card and online money counts as cash when its payout reaches a bank (a line
 * named `Card payout from …`); until then the foot says how much customers
 * paid that way in the period and how much still waits for its payout.
 *
 * Every figure is the shared cash-flow arithmetic's (Law D); this page only
 * prints it, in the Profit and Loss's statement shape and words.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { cashFlowReport, type CashFlowLine, type CashFlowReport } from "@carres/shared/cash-flow";
import { ledgerAccountHref } from "@carres/shared/finance-ledger";
import DataTable, { type Column, type GroupRowCell } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import Panel from "@/components/kit/Panel";
import Select from "@/components/kit/Select";
import TotalsSummary from "@/components/kit/TotalsSummary";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useCashFlow } from "../ledger/ledger-queries";
import type { PackSheet } from "../month-end-pack";
import { noOpening } from "../month-end-pack";
import { ReadFailed } from "../payables/PayablesParts";
import ExportStatement from "./ExportStatement";
import { STATEMENT_LINK } from "./StatementTable";
import { monthChoices, monthEnd, readPeriod, wholeMonth } from "./period";

const SECTION_WORD = { IN: "Inflow", OUT: "Outflow" } as const;
const NOTHING = {
  IN: "No money came into the cash and bank accounts in this period.",
  OUT: "No money went out of the cash and bank accounts in this period.",
} as const;

/** What one line of the statement says the money was. */
export function cashFlowLineWord(l: CashFlowLine): string {
  const account = `${l.code} ${l.name}`;
  if (l.transfer) return l.side === "IN" ? `Transfer from ${account}` : `Transfer to ${account}`;
  if (l.holding && l.side === "IN") return `Card payout from ${account}`;
  return account;
}

type Row =
  | { id: string; section: "IN" | "OUT"; kind: "line"; line: CashFlowLine }
  | { id: string; section: "IN" | "OUT"; kind: "nothing" };

function statementRows(r: CashFlowReport): Row[] {
  const part = (section: "IN" | "OUT", lines: CashFlowLine[]): Row[] => lines.length
    ? lines.map((line) => ({ id: line.key, section, kind: "line" as const, line }))
    : [{ id: `${section}:nothing`, section, kind: "nothing" as const }];
  return [...part("IN", r.inflow), ...part("OUT", r.outflow)];
}

/** The statement as sheet rows: the shape the Profit and Loss exports. */
export function cashFlowSheet(r: CashFlowReport, from: string, to: string, goLive: string): { sheet: PackSheet; stem: string } {
  const day = (iso: string) => fmtDate(iso, { year: "always" });
  const ym = from.slice(0, 7);
  const when = from === `${ym}-01` && to === monthEnd(ym) ? fmtMonth(ym) : `${day(from)} to ${day(to)}`;
  const rows: Array<Array<string | number>> = [["Cash Flow", `${day(from)} to ${day(to)}`], [noOpening(goLive)], [], ["Account", "Amount"]];
  for (const section of ["IN", "OUT"] as const) {
    const lines = section === "IN" ? r.inflow : r.outflow;
    rows.push([SECTION_WORD[section], section === "IN" ? r.totalInflow : r.totalOutflow]);
    if (!lines.length) rows.push([NOTHING[section]]);
    for (const l of lines) rows.push([cashFlowLineWord(l), l.amount]);
  }
  rows.push(["Net cash flow", r.net], ["Brought forward", r.broughtForward], ["Carried forward", r.carriedForward],
    ["Card and online payments in this period", r.cardTaken], ["Waiting for card payout at the end", r.cardWaiting]);
  return { sheet: { name: "Cash Flow", rows }, stem: `Cash Flow ${when}` };
}

function Statement({ report, from, to }: { report: CashFlowReport; from: string; to: string }) {
  const columns: Column<Row>[] = [
    { key: "account", label: "Account", width: "auto",
      cell: (row) => row.kind === "nothing"
        ? <span className="text-kit-slate-11">{NOTHING[row.section]}</span>
        : <Link className={STATEMENT_LINK} to={ledgerAccountHref(row.line.code, from, to)}
            title={cashFlowLineWord(row.line)}>
            {cashFlowLineWord(row.line)}
          </Link> },
    { key: "amount", label: "Amount", width: "140px", align: "right", numeric: true,
      cell: (row) => (row.kind === "nothing" ? null : rm(row.line.amount)) },
  ];
  const band = (row: Row): readonly GroupRowCell[] => [
    { content: <span className="font-semibold">{SECTION_WORD[row.section]}</span> },
    { align: "right", content: <span className="font-semibold tabular-nums">
      {rm(row.section === "IN" ? report.totalInflow : report.totalOutflow)}</span> },
  ];
  return <div className="flex flex-col gap-4">
    <DataTable label="Cash Flow" testId="cash-flow" rowTestId="cash-flow-row" rows={statementRows(report)} columns={columns}
      rowId={(row) => row.id} empty={NOTHING.IN} group={{ keyOf: (row) => row.section, cells: band }}
      totals={{
        label: "Net cash flow",
        cells: () => [
          { content: <span className="font-semibold">Net cash flow</span> },
          { align: "right", content: <span className="font-semibold tabular-nums">{rm(report.net)}</span> },
        ],
      }} />
    <TotalsSummary label="Cash and bank balances" rows={[
      { key: "bf", label: "Brought forward", value: rm(report.broughtForward) },
      { key: "cf", label: "Carried forward", value: rm(report.carriedForward), strong: true },
      { key: "taken", label: "Card and online payments in this period", value: rm(report.cardTaken) },
      { key: "waiting", label: "Waiting for card payout at the end", value: rm(report.cardWaiting) },
    ]} />
  </div>;
}

type AccountRow = CashFlowReport["accounts"][number];

function ByAccount({ report }: { report: CashFlowReport }) {
  const columns: Column<AccountRow>[] = [
    { key: "account", label: "Account", width: "auto", cell: (a) => `${a.account.account_code} ${a.account.name}` },
    { key: "bf", label: "Brought forward", width: "150px", align: "right", numeric: true, cell: (a) => rm(a.broughtForward) },
    { key: "in", label: "Inflow", width: "150px", align: "right", numeric: true, cell: (a) => rm(a.inflow) },
    { key: "out", label: "Outflow", width: "150px", align: "right", numeric: true, cell: (a) => rm(a.outflow) },
    { key: "cf", label: "Carried forward", width: "150px", align: "right", numeric: true, cell: (a) => rm(a.carriedForward) },
  ];
  return <DataTable label="Cash Flow by account" testId="cash-flow-accounts" rowTestId="cash-flow-account" rows={report.accounts}
    columns={columns} rowId={(a) => a.account.account_code} empty="No bank or cash account yet. Finance adds them in Settings."
    totals={{
      label: "Total",
      cell: (c) => c.key === "account" ? "Total"
        : c.key === "bf" ? rm(report.broughtForward)
        : c.key === "in" ? rm(report.totalInflow)
        : c.key === "out" ? rm(report.totalOutflow)
        : c.key === "cf" ? rm(report.carriedForward)
        : null,
    }} />;
}

export default function CashFlow() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const { from, to } = readPeriod(params, today);
  const query = useCashFlow(from, to);
  const report = useMemo((): CashFlowReport | "unreadable" | null => {
    if (!query.data) return null;
    try {
      return cashFlowReport(query.data);
    } catch {
      return "unreadable";
    }
  }, [query.data]);
  const goLive = query.data?.go_live_on ?? null;
  const notStarted = query.isSuccess && goLive === null;
  const beforeStart = goLive !== null && to < goLive;
  const month = wholeMonth(from, to);

  const edit = (change: (next: URLSearchParams) => void) => setParams((before) => {
    const next = new URLSearchParams(before);
    change(next);
    return next;
  });
  const pickMonth = (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    edit((next) => { next.set("from", `${ym}-01`); next.set("to", monthEnd(ym)); });
  };
  const pickFrom = (iso: string | null) => {
    if (iso) edit((next) => { next.set("from", iso); next.set("to", iso > to ? iso : to); });
  };
  const pickTo = (iso: string | null) => {
    if (iso) edit((next) => { next.set("to", iso); next.set("from", iso < from ? iso : from); });
  };

  const ready = report !== null && report !== "unreadable" && !beforeStart && goLive !== null ? report : null;

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="cash-flow-destination-header" word="Cash Flow" docTitle="Cash Flow · Carres" />
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="flex flex-col gap-6">
        {goLive && <p className="text-body text-kit-slate-11" data-testid="cash-flow-go-live">Since {fmtDate(goLive)} · No opening balances</p>}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Select id="cash-flow-month" label="Month" value={month ?? ""} onValueChange={pickMonth} placeholder="Custom Date Range"
              options={monthChoices(goLive, today, month).map((m) => ({ value: m, label: fmtMonth(m) }))} />
          </div>
          <div className="w-40"><DatePicker id="cash-flow-from" label="From" value={from} onChange={pickFrom} /></div>
          <div className="w-40"><DatePicker id="cash-flow-to" label="Up to" value={to} minDate={from} onChange={pickTo} /></div>
          <ExportStatement testId="cash-flow-export" word="cash flow"
            build={ready && goLive ? () => cashFlowSheet(ready, from, to, goLive) : null} />
        </div>
        {notStarted ? <div role="alert" className="text-body"><p>The ledger has no start date yet. Nothing can be totalled.</p></div>
        : query.isError || report === "unreadable" ? <ReadFailed what="Cash Flow" onRetry={() => void query.refetch()} />
        : beforeStart && goLive ? <p className="text-body" data-testid="cash-flow-before-start">
            The ledger started on {fmtDate(goLive)}. Pick a day from then on.</p>
        : !ready ? <p className="text-body" role="status">Loading Cash Flow…</p>
        : <div className="flex flex-col gap-6">
            <Panel title="Cash Flow"><Statement report={ready} from={from} to={to} /></Panel>
            <Panel title="By account"><ByAccount report={ready} /></Panel>
          </div>}
      </div>
    </div>
  </div>;
}
