/**
 * Finance → Trial Balance. Every account's balance on one day, debits beside
 * credits, grouped by kind — and the one check the page exists for: the two
 * columns are equal. Inside each kind the accounts sit under their headings
 * in the chart's order, and every heading, at every depth, carries its own
 * Debit and Credit subtotal, nested the way the Balance Sheet and the Profit
 * and Loss nest theirs (0579). The API adds those subtotals up.
 *
 * It is a Register (§6.7), so there is no KPI strip. The debit and credit
 * totals are the grid's own footer row; the difference sits in the status
 * footer; a ② band appears only while debits and credits differ. The ledger
 * holds no opening balances, so Row 2 says the figures are movement since the
 * ledger started — never a full position.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { TrialBalanceReport } from "@carres/shared/finance-ledger";
import { isZeroMoney, ledgerAccountHref, ledgerKindWord, trialBalanceSides } from "@carres/shared/finance-ledger";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { DateField } from "@/components/register/DateField";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useTrialBalance } from "./ledger-queries";
import { DepartmentFilter, useDepartmentParam } from "../department";
import { indent, nestedHeadings } from "../reports/StatementTable";

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

/**
 * The rows in print order. An account nothing was posted to has no balance
 * to try and is left out; so is a heading with no such account under it,
 * which is how an empty heading adds no line.
 */
export function trialBalanceLines(tb: TrialBalanceReport): TrialBalanceLine[] {
  const moved = tb.accounts.filter((a) => !isZeroMoney(a.total_debit) || !isZeroMoney(a.total_credit));
  const account = (a: (typeof moved)[number], depth: number): TrialBalanceLine =>
    ({ heading: false, code: a.account_code, name: a.account_name, kind: a.kind, depth, ...trialBalanceSides(a) });
  // An answer from before headings were sent prints its accounts flat.
  if (!tb.headings?.length) return moved.map((a) => account(a, 1));
  const under = new Map<string, typeof moved>();
  for (const a of moved) under.set(a.header_code, [...(under.get(a.header_code) ?? []), a]);
  const out: TrialBalanceLine[] = [];
  for (const kind of new Set(tb.headings.map((h) => h.kind))) {
    const groups = tb.headings.filter((h) => h.kind === kind).map((h) => ({ ...h, parentCode: h.parent_code }));
    const { headed, order } = nestedHeadings(groups, (g) => under.has(g.code));
    for (const { group: g, depth } of order) {
      if (headed) out.push({ heading: true, code: g.code, name: g.name, kind, depth, debit: g.debit, credit: g.credit });
      for (const a of under.get(g.code) ?? []) out.push(account(a, headed ? depth + 1 : depth));
    }
  }
  return out;
}

const count = (rows: TrialBalanceLine[]) => rows.filter((r) => !r.heading).length;
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

  const rows = useMemo(() => (report?.status === "ok" ? trialBalanceLines(report) : []), [report]);
  const goLive = report?.go_live_on ?? null;

  // Not sortable: the order is the chart's, and a sort would pull the
  // accounts out from under their headings.
  const columns = useMemo<DataGridColumn<TrialBalanceLine>[]>(() => [
    { key: "account", label: "Account", width: 300, sortable: false,
      accessor: (r) => r.heading
        ? <span className={`font-semibold ${indent(r.depth)}`}>{r.name}</span>
        : <span className={indent(r.depth)}><Link className="underline underline-offset-2"
          to={ledgerAccountHref(r.code, goLive, asOf)}>{r.code} {r.name}</Link></span>,
      searchValue: (r) => `${r.code} ${r.name}`,
      exportValue: trialBalanceLabel },
    { key: "kind", label: "Kind", width: 130, sortable: false, accessor: (r) => ledgerKindWord(r.kind),
      groupValue: (r) => ledgerKindWord(r.kind), filterType: "enum" },
    { key: "debit", label: "Debit", width: 150, align: "right", sortable: false,
      accessor: (r) => (r.heading ? <span className="font-semibold">{money(r.debit)}</span> : money(r.debit)),
      numberValue: (r) => r.debit, exportValue: (r) => r.debit,
      footerTotal: (visible) => rm(sum(visible, "debit")) },
    { key: "credit", label: "Credit", width: 150, align: "right", sortable: false,
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
          storageKey="carres.finance.trial-balance.v2" appearance="reference" exportName="Trial Balance"
          initialGroupBy={["kind"]} groupBanner={false} stickyIdentity isLoading={!query.isSuccess}
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
