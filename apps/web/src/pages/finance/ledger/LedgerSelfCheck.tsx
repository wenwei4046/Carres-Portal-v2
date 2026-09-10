/**
 * Finance → Self-check. The books grade themselves: one card per question,
 * each saying `Clean`, how many findings, or `Not checked` when its read
 * failed. A finding names the entry it is about, and the entry number opens
 * that entry in the Journal.
 *
 * Control accounts are listed from the chart (`gl_accounts.is_control`), so
 * an account added later gets its own card without a code change.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Checked, LedgerHealthRow, SectionVerdict } from "@carres/shared/finance-ledger";
import {
  booksVerdict,
  controlVerdict,
  healthCheckWords,
  ledgerEntryHref,
  payablesVerdict,
  receivablesVerdict,
  rentalsVerdict,
} from "@carres/shared/finance-ledger";
import StatusPill from "@/components/kit/StatusPill";
import { SectionCard } from "@/components/SectionPanel";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useLedgerSelfCheck } from "./ledger-queries";

const dateWord = (iso: string) => fmtDate(iso);

function VerdictPill({ findings }: { findings: number | null }) {
  if (findings === null) return <StatusPill tone="neutral">Not checked</StatusPill>;
  if (findings === 0) return <StatusPill tone="success">Clean</StatusPill>;
  return <StatusPill tone="danger">{findings} {findings === 1 ? "finding" : "findings"}</StatusPill>;
}

function Card({ title, findings, testId, children }: {
  title: string;
  findings: number | null;
  testId: string;
  children: ReactNode;
}) {
  return <SectionCard><div className="p-3" data-testid={testId}>
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="text-strong">{title}</h2>
      <VerdictPill findings={findings} />
    </div>
    <div className="flex flex-col gap-1 text-body">{children}</div>
  </div></SectionCard>;
}

function Verdict({ verdict }: { verdict: SectionVerdict }) {
  return <>
    {verdict.findings.length === 0 && <p>{verdict.clean}</p>}
    {verdict.findings.map((f) => <p key={f} className="font-semibold">{f}</p>)}
    {verdict.notes.map((n) => <p key={n}>{n}</p>)}
  </>;
}

function EntryLinks({ entryNos }: { entryNos: string[] }) {
  if (entryNos.length === 0) return null;
  return <p>Entries:{" "}{entryNos.map((no, i) => <span key={no}>
    {i > 0 && ", "}
    <Link to={ledgerEntryHref(no)} className="underline underline-offset-2">{no}</Link>
  </span>)}</p>;
}

/** A section whose read failed: its own words, and never a zero. */
function NotChecked({ section }: { section: Checked<object> }) {
  return section.ok ? null : <p>{section.message}</p>;
}

function HealthRow({ row }: { row: LedgerHealthRow }) {
  const words = healthCheckWords(row, rm, dateWord);
  return <div className="flex items-start justify-between gap-3 py-1" data-testid={`health-${row.check_key}`}>
    <div><p className="font-semibold">{words.title}</p><p>{words.sentence}</p></div>
    {words.verdict === "finding" ? <StatusPill tone="danger">Finding</StatusPill>
      : words.verdict === "clean" ? <StatusPill tone="success">Clean</StatusPill> : null}
  </div>;
}

export default function LedgerSelfCheck() {
  const query = useLedgerSelfCheck();
  const report = query.data;
  const checkedAt = report ? `Checked ${fmtDate(report.checked_at, { time: true })}` : null;

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="self-check-destination-header" word="Self-check"
      docTitle="Self-check — Carres"
      right={<span className="flex items-center gap-3 text-body">
        {checkedAt && <span data-testid="self-check-checked-at">{checkedAt}</span>}
        <button className="btn-secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Check again
        </button>
      </span>} />
    {query.isError ? <div role="alert" className="p-6 text-body">
      <p>The Self-check could not be loaded. Try again.</p>
      <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
    </div> : !report ? <p className="p-6 text-body">Checking the ledger…</p>
    : <div className="flex-1 overflow-auto p-4" data-testid="self-check-scroll">
      <div className="flex flex-col gap-4">
        <Card title="Debits and credits" testId="self-check-books"
          findings={report.books.ok ? booksVerdict(report.books, rm).findings.length : null}>
          {report.books.ok ? <Verdict verdict={booksVerdict(report.books, rm)} /> : <NotChecked section={report.books} />}
        </Card>

        {report.controls.ok && report.controls.accounts.length === 0 && <Card
          title="Customer and supplier accounts" testId="self-check-controls" findings={1}>
          <p className="font-semibold">The chart has no customer or supplier account to check.</p>
        </Card>}
        {report.controls.ok ? report.controls.accounts.map((a) => {
          const verdict = controlVerdict(a, rm);
          return <Card key={a.account_code} title={`${a.account_code} ${a.account_name}`}
            testId={`self-check-control-${a.account_code}`} findings={verdict.findings.length}>
            {verdict.findings.length === 0 && <p>{verdict.clean}</p>}
            {a.findings.map((f, i) => <div key={`${f.kind}-${f.party_type ?? ""}-${i}`}>
              <p className="font-semibold">{verdict.findings[i]}</p>
              <EntryLinks entryNos={f.entry_nos} />
            </div>)}
          </Card>;
        }) : <Card title="Customer and supplier accounts" testId="self-check-controls" findings={null}>
          <NotChecked section={report.controls} />
        </Card>}

        <Card title="Customer receivables" testId="self-check-receivables"
          findings={report.receivables.ok ? receivablesVerdict(report.receivables, rm).findings.length : null}>
          {report.receivables.ok ? <Verdict verdict={receivablesVerdict(report.receivables, rm)} />
            : <NotChecked section={report.receivables} />}
        </Card>

        <Card title="Supplier payables" testId="self-check-payables"
          findings={report.payables.ok ? payablesVerdict(report.payables, rm).findings.length : null}>
          {report.payables.ok ? <>
            <Verdict verdict={payablesVerdict(report.payables, rm)} />
            {report.payables.suppliers.map((s) => <p key={s.supplier_id}>
              {s.supplier_name ?? "Supplier name not available"} · Ledger {rm(s.ledger_owing)} · Bills {rm(s.bills_owing)}
            </p>)}
          </> : <NotChecked section={report.payables} />}
        </Card>

        <Card title="Rental months" testId="self-check-rentals"
          findings={report.rentals.ok ? rentalsVerdict(report.rentals, rm).findings.length : null}>
          {report.rentals.ok ? <>
            <Verdict verdict={rentalsVerdict(report.rentals, rm)} />
            {report.rentals.months.map((m) => <p key={m.doc_no}>
              {m.doc_no} · {fmtDate(m.paid_on)} · {rm(m.paid_amount)}
            </p>)}
          </> : <NotChecked section={report.rentals} />}
        </Card>

        <Card title="Ledger checks" testId="self-check-health"
          findings={report.health.ok ? report.health.rows.filter((r) => r.status === "FAIL" && r.check_key !== "overall").length : null}>
          {report.health.ok ? report.health.rows.map((r) => <HealthRow key={r.check_key} row={r} />)
            : <NotChecked section={report.health} />}
        </Card>
      </div>
    </div>}
  </div>;
}
