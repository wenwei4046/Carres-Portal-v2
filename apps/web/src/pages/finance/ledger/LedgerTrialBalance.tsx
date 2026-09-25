/**
 * Finance → Trial Balance. Every account's balance on one day, debits beside
 * credits, grouped by kind — and the one check the page exists for: the two
 * columns are equal. Inside each kind the accounts sit under their headings
 * in the chart's order, and every heading, at every depth, carries its own
 * Debit and Credit subtotal, nested the way the Balance Sheet and the Profit
 * and Loss nest theirs (0579). The API adds those subtotals up. Sorting a
 * column prints the accounts alone, sorted; clearing the sort brings the
 * headings back.
 *
 * It is a Register (§6.7), so there is no KPI strip. The debit and credit
 * totals are the grid's own footer row; the difference sits in the status
 * footer; a ② band appears only while debits and credits differ. The ledger
 * holds no opening balances, so Row 2 says the figures are movement since the
 * ledger started — never a full position.
 */
import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { TrialBalanceAccountRow, TrialBalanceReport } from "@carres/shared/finance-ledger";
import { isZeroMoney, ledgerAccountHref, ledgerKindWord, trialBalanceSides } from "@carres/shared/finance-ledger";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { DateField } from "@/components/register/DateField";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useTrialBalance } from "./ledger-queries";
import { DepartmentFilter, useDepartmentParam } from "../department";
import { headingWalk, indent } from "../reports/StatementTable";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One printed row: a heading with its subtotal, or an account with its
 *  balance on the side its own debits and credits leave it. */
export interface TrialBalanceLine {
  heading: boolean;
  code: string;
  name: string;
  kind: string;
  depth: number;
  debit: number;
  credit: number;
}

/** An account's own line: its balance on the side its debits and credits leave it. */
const accountLine = (a: TrialBalanceAccountRow, depth: number): TrialBalanceLine =>
  ({ heading: false, code: a.account_code, name: a.account_name, kind: a.kind, depth, ...trialBalanceSides(a) });

/** An account nothing was posted to has no balance to try and is left out. */
const moved = (tb: TrialBalanceReport) =>
  tb.accounts.filter((a) => !isZeroMoney(a.total_debit) || !isZeroMoney(a.total_credit));

/** The accounts alone, in the ledger's order: what the page prints while a
 *  column is sorted, the same list it printed before headings. */
export const trialBalanceAccountLines = (tb: TrialBalanceReport): TrialBalanceLine[] =>
  moved(tb).map((a) => accountLine(a, 1));

/**
 * The rows in the chart's order, through the statements' own walk
 * (`headingWalk`): under each heading its accounts and sub-headings mixed by
 * their place in the chart, and every heading with its subtotal. A heading
 * with no account that moved under it is left out, so it adds no line.
 */
export function trialBalanceLines(tb: TrialBalanceReport): TrialBalanceLine[] {
  // An answer from before headings were sent prints its accounts flat.
  if (!tb.headings?.length) return trialBalanceAccountLines(tb);
  type Line = TrialBalanceAccountRow & { ordinal: number };
  const under = new Map<string, Line[]>();
  for (const a of moved(tb)) under.set(a.header_code, [...(under.get(a.header_code) ?? []), { ...a, ordinal: a.chart_position }]);
  const out: TrialBalanceLine[] = [];
  for (const kind of new Set(tb.headings.map((h) => h.kind))) {
    const { rows } = headingWalk(tb.headings.filter((h) => h.kind === kind).map((h) =>
      ({ ...h, parentCode: h.parent_code, ordinal: h.chart_position, lines: under.get(h.code) ?? [] })));
    for (const r of rows) {
      out.push("group" in r
        ? { heading: true, code: r.group.code, name: r.group.name, kind, depth: r.depth, debit: r.group.debit, credit: r.group.credit }
        : accountLine(r.line, r.depth));
    }
  }
  return out;
}

const isAccount = (r: TrialBalanceLine) => !r.heading;
const count = (rows: TrialBalanceLine[]) => rows.filter(isAccount).length;
const sum = (rows: TrialBalanceLine[], side: "debit" | "credit") =>
  rows.reduce((s, r) => (r.heading ? s : s + r[side]), 0);
const money = (n: number) => (n > 0 ? rm(n) : "");
/** Two spaces a level in an export, as the month-end pack indents its statements. */
export const trialBalanceLabel = (r: TrialBalanceLine) => "  ".repeat(r.depth - 1) + (r.heading ? r.name : `${r.code} ${r.name}`);

export default function LedgerTrialBalance() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("asOf");
  const asOf = asked && ISO_DAY.test(asked) ? asked : appTodayIso();
  const setAsOf = (iso: string) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (iso) next.set("asOf", iso); else next.delete("asOf");
    return next;
  });
  const [dept, setDept] = useDepartmentParam();
  const query = useTrialBalance(asOf, dept);
  const report = query.data;
  const notStarted = (query.error as { status?: number } | null)?.status === 409;

  // A sorted column prints the accounts alone, sorted, as the page always
  // has: a sort would pull accounts out from under their headings and leave
  // the subtotals beside the wrong rows. Clearing the sort brings the
  // headings back.
  const [sorted, setSorted] = useState(false);
  const onSortChange = useCallback((s: unknown) => setSorted(s !== null), []);
  const rows = useMemo(
    () => (report?.status !== "ok" ? [] : sorted ? trialBalanceAccountLines(report) : trialBalanceLines(report)),
    [report, sorted],
  );
  const goLive = report?.go_live_on ?? null;

  const columns = useMemo<DataGridColumn<TrialBalanceLine>[]>(() => [
    { key: "account", label: "Account", width: 300,
      accessor: (r) => r.heading
        ? <span className={`font-semibold ${indent(r.depth)}`}>{r.name}</span>
        : <span className={indent(r.depth)}><Link className="underline underline-offset-2"
          to={ledgerAccountHref(r.code, goLive, asOf)}>{r.code} {r.name}</Link></span>,
      searchValue: (r) => `${r.code} ${r.name}`,
      exportValue: trialBalanceLabel },
    { key: "kind", label: "Kind", width: 130, accessor: (r) => ledgerKindWord(r.kind),
      groupValue: (r) => ledgerKindWord(r.kind), filterType: "enum" },
    { key: "debit", label: "Debit", width: 150, align: "right",
      accessor: (r) => (r.heading ? <span className="font-semibold">{money(r.debit)}</span> : money(r.debit)),
      numberValue: (r) => r.debit, exportValue: (r) => r.debit,
      footerTotal: (visible) => rm(sum(visible, "debit")) },
    { key: "credit", label: "Credit", width: 150, align: "right",
      accessor: (r) => (r.heading ? <span className="font-semibold">{money(r.credit)}</span> : money(r.credit)),
      numberValue: (r) => r.credit, exportValue: (r) => r.credit,
      footerTotal: (visible) => rm(sum(visible, "credit")) },
  ], [goLive, asOf]);

  const difference = report?.status === "ok" ? report.difference : null;
  const differs = difference !== null && !isZeroMoney(difference);

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="trial-balance-destination-header" word="Trial Balance"
      docTitle="Trial Balance — Carres" />
    {notStarted ? <div role="alert" className="p-6 text-body">
      <p>The ledger has no start date yet. Nothing can be totalled.</p>
    </div> : query.isError ? <div role="alert" className="p-6 text-body">
      <p>The trial balance could not be loaded. Try again.</p>
      <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
    </div> : <>
      {differs && difference !== null && <div role="status" data-testid="trial-balance-differs"
        className="flex h-10 shrink-0 items-center gap-2 bg-kit-amber-3 px-4 text-body text-kit-amber-11">
        ⚠ Debits and credits differ by {rm(Math.abs(difference))}.
        <Link className="underline underline-offset-2" to="/finance/ledger/self-check">Open Self-check</Link>
      </div>}
      <ListPageShell register>
        <DataGrid rows={rows} columns={columns} rowKey={(r) => `${r.heading ? "heading" : "account"}:${r.code}`}
          storageKey="carres.finance.trial-balance.v1" appearance="reference" exportName="Trial Balance"
          initialGroupBy={["kind"]} groupBanner={false} stickyIdentity isLoading={!query.isSuccess}
          onSortChange={onSortChange} countsInGroup={isAccount}
          searchPlaceholder="Search accounts…"
          toolbarStart={<span className="flex items-center gap-3 text-body">
            <span>As of</span>
            <span className="w-40"><DateField value={asOf} onChange={setAsOf} aria-label="As of" /></span>
            <DepartmentFilter value={dept} onChange={setDept} />
            {goLive && <span data-testid="trial-balance-go-live">
              Since {fmtDate(goLive)} · No opening balances
            </span>}
          </span>}
          emptyMessage={report?.status === "before_go_live"
            ? `The ledger started on ${fmtDate(report.go_live_on)}. Pick a day from then on.`
            : "No entries up to this day."}
          statusSummary={(visible) => <span data-testid="trial-balance-summary">
            {count(visible)} {count(visible) === 1 ? "account" : "accounts"}
            {" · "}{difference === null ? "Difference not checked" : `Difference ${rm(Math.abs(difference))}`}
          </span>}
        />
      </ListPageShell>
    </>}
  </div>;
}
