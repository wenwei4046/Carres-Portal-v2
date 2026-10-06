/**
 * Finance → Ledger → General Ledger, at `/finance/ledger/general-ledger`
 * (migration 0639; Chew 2026-10-03, docs/finance/MASTER.md §3.6 and §4, after
 * Houzs Part 10 §7).
 *
 * Every account for a period, one block each: what it carried in, every line
 * with the balance after it, the period's debits and credits, and what it
 * carries out. The balances are gl_account_ledger's own, the figures the
 * Journal prints for one account, read and checked by the shared reader; the
 * page only prints them. An entry number opens that entry on the Journal.
 *
 * It is the statement shape of the ledger pages (kit DataTable with a band per
 * account), not a Register: a sort or a filter would pull a line away from the
 * balance before it. A search narrows the accounts shown, never the lines.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { generalLedgerBlocks, type GeneralLedgerBlock } from "@carres/shared/general-ledger";
import { ledgerDocWord, ledgerKindWord, ledgerSourceWord } from "@carres/shared/finance-ledger";
import DataTable, { type Column } from "@/components/kit/DataTable";
import DatePicker from "@/components/kit/DatePicker";
import SearchInput from "@/components/kit/SearchInput";
import Select from "@/components/kit/Select";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useGeneralLedger } from "./ledger-queries";
import { balanceWords } from "./LedgerJournal";
import { DepartmentFilter, departmentWord, useDepartmentParam, useDepartments } from "../department";
import { noOpening, type PackSheet } from "../month-end-pack";
import { ReadFailed } from "../payables/PayablesParts";
import ExportStatement from "../reports/ExportStatement";
import { monthChoices, monthEnd, readPeriod, wholeMonth } from "../reports/period";
import { STATEMENT_LINK } from "../reports/StatementTable";

type Row =
  | { id: string; code: string; kind: "opening"; block: GeneralLedgerBlock }
  | { id: string; code: string; kind: "line"; block: GeneralLedgerBlock; line: GeneralLedgerBlock["lines"][number] }
  | { id: string; code: string; kind: "total"; block: GeneralLedgerBlock };

function rowsOf(blocks: GeneralLedgerBlock[]): Row[] {
  return blocks.flatMap((block): Row[] => [
    { id: `${block.code}:opening`, code: block.code, kind: "opening", block },
    ...block.lines.map((line, i): Row => ({ id: `${block.code}:${line.entryNo}:${i}`, code: block.code, kind: "line", block, line })),
    { id: `${block.code}:total`, code: block.code, kind: "total", block },
  ]);
}

const money = (n: number) => (Math.round(n * 100) === 0 ? "" : rm(n));
const strong = (text: string) => <span className="font-semibold">{text}</span>;

const COLUMNS: readonly Column<Row>[] = [
  { key: "date", label: "Date", width: "110px", cell: (r) => (r.kind === "line" ? fmtDate(r.line.entryDate) : "") },
  { key: "entry", label: "Entry No", width: "140px",
    cell: (r) => (r.kind === "line"
      ? <Link className={STATEMENT_LINK} to={`/finance/ledger?${new URLSearchParams({ entry: r.line.entryNo }).toString()}`}>{r.line.entryNo}</Link>
      : "") },
  { key: "source", label: "Source", width: "150px", cell: (r) => (r.kind === "line" ? ledgerSourceWord(r.line.sourceType) : "") },
  { key: "document", label: "Document", width: "150px", cell: (r) => (r.kind === "line" ? ledgerDocWord(r.line.docNo) : "") },
  { key: "description", label: "Description", width: "auto",
    cell: (r) => (r.kind === "opening" ? "Brought forward" : r.kind === "total" ? strong("Total")
      : <span title={r.line.description ?? "No memo"}>{r.line.description ?? "No memo"}</span>) },
  { key: "debit", label: "Debit", width: "120px", align: "right", numeric: true,
    cell: (r) => (r.kind === "line" ? money(r.line.debit) : r.kind === "total" ? strong(rm(r.block.totalDebit)) : "") },
  { key: "credit", label: "Credit", width: "120px", align: "right", numeric: true,
    cell: (r) => (r.kind === "line" ? money(r.line.credit) : r.kind === "total" ? strong(rm(r.block.totalCredit)) : "") },
  { key: "balance", label: "Balance", width: "170px", align: "right", numeric: true,
    cell: (r) => r.kind === "opening" ? balanceWords(r.block.kind, r.block.opening)
      : r.kind === "line" ? balanceWords(r.block.kind, r.line.balance)
      : strong(balanceWords(r.block.kind, r.block.closing)) },
];

/** The blocks as sheet rows, the screen's own words, for Export Excel. */
export function generalLedgerSheet(blocks: GeneralLedgerBlock[], from: string, to: string, goLive: string,
  department: string | null): { sheet: PackSheet; stem: string } {
  const day = (iso: string) => fmtDate(iso, { year: "always" });
  const ym = from.slice(0, 7);
  const when = from === `${ym}-01` && to === monthEnd(ym) ? fmtMonth(ym) : `${day(from)} to ${day(to)}`;
  const rows: Array<Array<string | number>> = [["General Ledger", `${day(from)} to ${day(to)}`], [noOpening(goLive)]];
  if (department) rows.push(["Department", department]);
  rows.push([], ["Account", "Date", "Entry No", "Source", "Document", "Description", "Debit", "Credit", "Balance"]);
  for (const b of blocks) {
    const account = `${b.code} ${b.name}`;
    rows.push([account, "", "", "", "", "Brought forward", "", "", balanceWords(b.kind, b.opening)]);
    for (const l of b.lines) {
      rows.push([account, day(l.entryDate), l.entryNo, ledgerSourceWord(l.sourceType), ledgerDocWord(l.docNo),
        l.description ?? "No memo", l.debit, l.credit, balanceWords(b.kind, l.balance)]);
    }
    rows.push([account, "", "", "", "", "Total", b.totalDebit, b.totalCredit, balanceWords(b.kind, b.closing)]);
  }
  const stem = ["General Ledger", when, department].filter(Boolean).join(" ").replace(/[\\/:*?"<>|]/g, "-");
  return { sheet: { name: "General Ledger", rows }, stem };
}

export default function GeneralLedger() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const { from, to } = readPeriod(params, today);
  const [dept, setDept] = useDepartmentParam();
  const { data: departments = [] } = useDepartments();
  const deptWord = departmentWord(dept, departments);
  const query = useGeneralLedger(from, to, dept);
  const [search, setSearch] = useState("");

  const blocks = useMemo((): GeneralLedgerBlock[] | "unreadable" | null => {
    if (!query.data) return null;
    try {
      return generalLedgerBlocks(query.data);
    } catch {
      return "unreadable";
    }
  }, [query.data]);
  const shown = useMemo(() => {
    if (!Array.isArray(blocks)) return [];
    const words = search.trim().toLowerCase();
    return words ? blocks.filter((b) => `${b.code} ${b.name}`.toLowerCase().includes(words)) : blocks;
  }, [blocks, search]);

  const goLive = query.data?.go_live_on ?? null;
  const beforeStart = query.data?.status === "BEFORE_GO_LIVE";
  const notStarted = (query.error as { status?: number } | null)?.status === 409;
  const month = wholeMonth(from, to);

  const edit = (change: (next: URLSearchParams) => void) => setParams((before) => {
    const next = new URLSearchParams(before);
    change(next);
    return next;
  });
  const pickMonth = (ym: string) => {
    if (/^\d{4}-\d{2}$/.test(ym)) edit((next) => { next.set("from", `${ym}-01`); next.set("to", monthEnd(ym)); });
  };
  const pickFrom = (iso: string | null) => {
    if (iso) edit((next) => { next.set("from", iso); next.set("to", iso > to ? iso : to); });
  };
  const pickTo = (iso: string | null) => {
    if (iso) edit((next) => { next.set("to", iso); next.set("from", iso < from ? iso : from); });
  };

  const ready = Array.isArray(blocks) && goLive !== null && !beforeStart;

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="general-ledger-destination-header" word="General Ledger" docTitle="General Ledger · Carres" />
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="flex flex-col gap-6">
        {notStarted ? <div role="alert" className="text-body"><p>The ledger has no start date yet. Nothing can be totalled.</p></div> : <>
          {goLive && <p className="text-body text-kit-slate-11" data-testid="general-ledger-go-live">
            Since {fmtDate(goLive)} · No opening balances</p>}
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Select id="general-ledger-month" label="Month" value={month ?? ""} onValueChange={pickMonth} placeholder="Custom Date Range"
                options={monthChoices(goLive, today, month).map((m) => ({ value: m, label: fmtMonth(m) }))} />
            </div>
            <div className="w-40"><DatePicker id="general-ledger-from" label="From" value={from} onChange={pickFrom} /></div>
            <div className="w-40"><DatePicker id="general-ledger-to" label="Up to" value={to} minDate={from} onChange={pickTo} /></div>
            <DepartmentFilter value={dept} onChange={setDept} />
            <div className="w-56">
              <SearchInput id="general-ledger-search" placeholder="Search accounts…" aria-label="Search accounts"
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ExportStatement testId="general-ledger-export" word="general ledger" pdf={false}
              build={ready && goLive ? () => generalLedgerSheet(shown, from, to, goLive, dept ? deptWord : null) : null} />
          </div>
          {query.isError || blocks === "unreadable" ? <ReadFailed what="The General Ledger" onRetry={() => void query.refetch()} />
          : beforeStart && goLive ? <p className="text-body" data-testid="general-ledger-before-start">
              The ledger started on {fmtDate(goLive)}. Pick a day from then on.</p>
          : !ready ? <p className="text-body" role="status">Loading the General Ledger…</p>
          : <DataTable label="General Ledger" testId="general-ledger" rowTestId="general-ledger-row" rows={rowsOf(shown)}
              columns={COLUMNS} rowId={(r) => r.id}
              empty={search.trim() ? "No account matches this search." : "No account moved or carried a balance in this period."}
              group={{
                keyOf: (r) => r.code,
                header: (r) => <span className="font-semibold">{r.block.code} {r.block.name} · {ledgerKindWord(r.block.kind)}</span>,
              }} />}
          {ready && <p className="text-body text-kit-slate-11" data-testid="general-ledger-summary">
            {shown.length} {shown.length === 1 ? "account" : "accounts"}
            {search.trim() && Array.isArray(blocks) ? ` of ${blocks.length}` : ""} · {fmtDate(from)} to {fmtDate(to)}
          </p>}
        </>}
      </div>
    </div>
  </div>;
}
