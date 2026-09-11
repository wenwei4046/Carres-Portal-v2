/**
 * Finance → Trial Balance. Every account's balance on one day, debits beside
 * credits, grouped by kind — and the one check the page exists for: the two
 * columns are equal.
 *
 * It is a Register (§6.7), so there is no KPI strip. The debit and credit
 * totals are the grid's own footer row; the difference sits in the status
 * footer; a ② band appears only while debits and credits differ. The ledger
 * holds no opening balances, so Row 2 says the figures are movement since the
 * ledger started — never a full position.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { TrialBalanceAccountRow } from "@carres/shared/finance-ledger";
import { isZeroMoney, ledgerAccountHref, ledgerKindWord } from "@carres/shared/finance-ledger";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { DateField } from "@/components/register/DateField";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useTrialBalance } from "./ledger-queries";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A debit balance sits in Debit, a credit balance in Credit — the side the
 *  account's own debits and credits leave it on, whatever its kind. */
const net = (r: TrialBalanceAccountRow) => Math.round((r.total_debit - r.total_credit) * 100) / 100;
const debitSide = (r: TrialBalanceAccountRow) => Math.max(net(r), 0);
const creditSide = (r: TrialBalanceAccountRow) => Math.max(-net(r), 0);
const sum = (rows: TrialBalanceAccountRow[], side: (r: TrialBalanceAccountRow) => number) =>
  rows.reduce((s, r) => s + side(r), 0);

export default function LedgerTrialBalance() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("asOf");
  const asOf = asked && ISO_DAY.test(asked) ? asked : appTodayIso();
  const setAsOf = (iso: string) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (iso) next.set("asOf", iso); else next.delete("asOf");
    return next;
  });
  const query = useTrialBalance(asOf);
  const report = query.data;
  const notStarted = (query.error as { status?: number } | null)?.status === 409;

  // An account nothing was ever posted to has no balance to try. Leaving it
  // out keeps the page to the accounts that make up the totals.
  const rows = useMemo(
    () => (report?.accounts ?? []).filter((a) => !isZeroMoney(a.total_debit) || !isZeroMoney(a.total_credit)),
    [report],
  );
  const goLive = report?.go_live_on ?? null;

  const columns = useMemo<DataGridColumn<TrialBalanceAccountRow>[]>(() => [
    { key: "account", label: "Account", width: 300,
      accessor: (r) => <Link className="underline underline-offset-2"
        to={ledgerAccountHref(r.account_code, goLive, asOf)}>{r.account_code} {r.account_name}</Link>,
      searchValue: (r) => `${r.account_code} ${r.account_name}`,
      exportValue: (r) => `${r.account_code} ${r.account_name}` },
    { key: "kind", label: "Kind", width: 130, accessor: (r) => ledgerKindWord(r.kind),
      groupValue: (r) => ledgerKindWord(r.kind), filterType: "enum" },
    { key: "debit", label: "Debit", width: 150, align: "right",
      accessor: (r) => (debitSide(r) > 0 ? rm(debitSide(r)) : ""),
      numberValue: debitSide, exportValue: debitSide,
      footerTotal: (visible) => rm(sum(visible, debitSide)) },
    { key: "credit", label: "Credit", width: 150, align: "right",
      accessor: (r) => (creditSide(r) > 0 ? rm(creditSide(r)) : ""),
      numberValue: creditSide, exportValue: creditSide,
      footerTotal: (visible) => rm(sum(visible, creditSide)) },
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
        <DataGrid rows={report?.status === "ok" ? rows : []} columns={columns} rowKey={(r) => r.account_code}
          storageKey="carres.finance.trial-balance.v1" appearance="reference" exportName="Trial Balance"
          initialGroupBy={["kind"]} groupBanner={false} stickyIdentity isLoading={!query.isSuccess}
          searchPlaceholder="Search accounts…"
          toolbarStart={<span className="flex items-center gap-3 text-body">
            <span>As of</span>
            <span className="w-40"><DateField value={asOf} onChange={setAsOf} aria-label="As of" /></span>
            {goLive && <span data-testid="trial-balance-go-live">
              Since {fmtDate(goLive)} · No opening balances
            </span>}
          </span>}
          emptyMessage={report?.status === "before_go_live"
            ? `The ledger started on ${fmtDate(report.go_live_on)}. Pick a day from then on.`
            : "No entries up to this day."}
          statusSummary={(visible) => <span data-testid="trial-balance-summary">
            {visible.length} {visible.length === 1 ? "account" : "accounts"}
            {" · "}{difference === null ? "Difference not checked" : `Difference ${rm(Math.abs(difference))}`}
          </span>}
        />
      </ListPageShell>
    </>}
  </div>;
}
