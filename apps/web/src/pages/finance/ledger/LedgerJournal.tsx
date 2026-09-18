/**
 * Finance → Journal. Every ledger entry, newest first — the read-only
 * register behind the Trial Balance and Self-check.
 *
 * Row 1 is the destination word. Row 2 carries the account scope (the one
 * narrowing the server does) beside Search · Export · Columns; source and date
 * narrow the rows in hand through the column filters. A row expands to its
 * lines; `?entry=JE-202609-0003` opens one entry on its own page, which is
 * the link every other ledger page uses.
 *
 * The principal alone also sees `New journal entry` (ruling M), which opens
 * the manual journal form at `?entry=new`; for anyone else `new` is just a
 * number nobody has.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { DepartmentFilter } from "../department";
import type { LedgerEntryRow } from "@carres/shared/finance-ledger";
import {
  ledgerDocWord,
  ledgerReversalKind,
  ledgerReversalText,
  ledgerSourceWord,
} from "@carres/shared/finance-ledger";
import ListPageShell from "@/components/ListPageShell";
import Button from "@/components/kit/Button";
import Select from "@/components/kit/Select";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { EntryLinesTable, EntryObject, ReversalLink, ReversalPill } from "./LedgerEntryParts";
import {
  JOURNAL_MAX_PAGES,
  JOURNAL_PAGE_SIZE,
  useLedgerChart,
  useLedgerEntries,
  useLedgerEntry,
  type JournalScope,
} from "./ledger-queries";
import ManualJournalForm from "./ManualJournalForm";

const ALL_ACCOUNTS = "all";
const NEW_ENTRY = "new";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const isoOrNull = (v: string | null) => (v && ISO_DAY.test(v) ? v : null);

export default function LedgerJournal() {
  const [params, setParams] = useSearchParams();
  const entryRef = params.get("entry");
  const scope: JournalScope = useMemo(() => ({
    account: params.get("account"),
    from: isoOrNull(params.get("from")),
    to: isoOrNull(params.get("to")),
    dept: params.get("dept") ?? "",
  }), [params]);

  const edit = (change: (next: URLSearchParams) => void) => setParams((before) => {
    const next = new URLSearchParams(before); change(next); return next;
  });
  const open = (entryNo: string) => edit((n) => n.set("entry", entryNo));
  const close = () => edit((n) => n.delete("entry"));
  const pickAccount = (code: string) => edit((n) => {
    if (code === ALL_ACCOUNTS) n.delete("account"); else n.set("account", code);
  });
  const showAll = () => edit((n) => { n.delete("account"); n.delete("from"); n.delete("to"); n.delete("dept"); });

  // The manual journal door (ruling M): the principal only. The API and the
  // database refuse everyone else as well; hiding the door is the courtesy.
  const mayRecord = useAuth((s) => s.role) === "principal";
  const startEntry = () => edit((n) => n.set("entry", NEW_ENTRY));
  // Replace, not push: the browser's Back from the new entry is the Journal,
  // never an emptied form that could record the same entry a second time.
  const recorded = (ref: string) => setParams((before) => {
    const next = new URLSearchParams(before); next.set("entry", ref); return next;
  }, { replace: true });

  if (entryRef === NEW_ENTRY && mayRecord) return <ManualJournalForm onBack={close} onRecorded={recorded} />;
  if (entryRef) return <EntryPage entryRef={entryRef} search={params} onClose={close} />;
  const pickDept = (v: string) => edit((n) => { if (v) n.set("dept", v); else n.delete("dept"); });
  return <JournalRegister scope={scope} search={params} onOpen={open} onPickDept={pickDept}
    onPickAccount={pickAccount} onShowAll={showAll} onNew={mayRecord ? startEntry : undefined} />;
}

function JournalRegister({ scope, search, onOpen, onPickDept, onPickAccount, onShowAll, onNew }: {
  scope: JournalScope;
  onPickDept: (v: string) => void;
  search: URLSearchParams;
  onOpen: (entryNo: string) => void;
  onPickAccount: (code: string) => void;
  onShowAll: () => void;
  /** Present only for the principal. */
  onNew?: () => void;
}) {
  const query = useLedgerEntries(scope);
  const chart = useLedgerChart();
  const accounts = useMemo(
    () => (chart.data?.accounts ?? []).filter((a) => !a.is_header),
    [chart.data],
  );
  const scopedAccount = scope.account ? accounts.find((a) => a.code === scope.account) : undefined;
  const scoped = scope.account !== null || scope.from !== null || scope.to !== null || !!scope.dept;

  const columns = useMemo<DataGridColumn<LedgerEntryRow>[]>(() => [
    { key: "entry", label: "Entry No", width: 150, accessor: (r) => r.entry_no,
      searchValue: (r) => r.entry_no, filterValue: (r) => r.entry_no, filterType: "numbering" },
    { key: "date", label: "Date", width: 140, accessor: (r) => fmtDate(r.entry_date),
      dateValue: (r) => r.entry_date, filterType: "date", exportValue: (r) => fmtDate(r.entry_date) },
    { key: "source", label: "Source", width: 190, accessor: (r) => ledgerSourceWord(r.source_type),
      searchValue: (r) => ledgerSourceWord(r.source_type), filterType: "enum" },
    { key: "document", label: "Document", width: 170, accessor: (r) => ledgerDocWord(r.source_doc_no),
      searchValue: (r) => ledgerDocWord(r.source_doc_no), filterValue: (r) => ledgerDocWord(r.source_doc_no),
      filterType: "numbering" },
    { key: "narration", label: "Narration", width: 280, accessor: (r) => r.narration ?? "No narration",
      searchValue: (r) => r.narration ?? "" },
    { key: "amount", label: "Amount", width: 140, align: "right", accessor: (r) => rm(r.total_debit),
      numberValue: (r) => r.total_debit, filterType: "number", exportValue: (r) => r.total_debit },
    { key: "reversal", label: "Reversal", width: 230,
      accessor: (r) => <ReversalLink row={r} search={search} />,
      searchValue: (r) => ledgerReversalText(r), filterValue: (r) => ledgerReversalKind(r),
      filterType: "enum", exportValue: (r) => ledgerReversalText(r) },
  ], [search]);

  const accountOptions = useMemo(() => [
    { value: ALL_ACCOUNTS, label: "All accounts" },
    ...accounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })),
  ], [accounts]);

  const scopeWords = [
    scope.account ? `${scope.account} ${scopedAccount?.name ?? ""}`.trim() + " only" : null,
    scope.from ? `From ${fmtDate(scope.from)}` : null,
    scope.to ? `Up to ${fmtDate(scope.to)}` : null,
  ].filter(Boolean).join(" · ");

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="journal-destination-header" word="Journal" docTitle="Journal — Carres" />
    {query.isError ? <div role="alert" className="p-6 text-body">
      <p>The Journal could not be loaded. Try again.</p>
      <button className="btn-secondary mt-3" onClick={() => void query.refetch()}>Try again</button>
    </div> : <>
      {query.data?.capped && <div role="status" data-testid="journal-capped"
        className="flex h-10 shrink-0 items-center gap-2 bg-kit-amber-3 px-4 text-body text-kit-amber-11">
        ⚠ The Journal shows the newest {(JOURNAL_PAGE_SIZE * JOURNAL_MAX_PAGES).toLocaleString("en-MY")} of {query.data.total.toLocaleString("en-MY")} entries. Pick an account to see older ones.
      </div>}
      <ListPageShell register>
        <DataGrid rows={query.data?.rows ?? []} columns={columns} rowKey={(r) => r.id}
          storageKey="carres.finance.journal.v1" appearance="reference" exportName="Journal"
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess}
          searchPlaceholder="Search entries…"
          toolbarStart={<span className="flex items-center gap-3 text-body">
            {onNew && <Button variant="primary" size="sm" shape="pill" icon="add" onClick={onNew}>
              New journal entry
            </Button>}
            <span className="w-64" data-testid="journal-account-picker">
              <Select id="journal-account" value={scope.account ?? ALL_ACCOUNTS}
                onValueChange={onPickAccount} placeholder="All accounts" options={accountOptions} />
            </span>
            <DepartmentFilter value={scope.dept ?? ""} onChange={onPickDept} />
            {scoped && <span className="flex items-center gap-2" data-testid="journal-scope">
              <span>{scopeWords}</span>
              <button type="button" className="underline underline-offset-2" onClick={onShowAll}>Show all entries</button>
            </span>}
          </span>}
          emptyMessage={scoped
            ? "No entry matches this account and these dates."
            : "No entries yet. Invoices, payments and bills add entries here."}
          expandTitle="Show lines" onRowDoubleClick={(r) => onOpen(r.entry_no)}
          expandable={{ renderExpansion: (r) => <EntryExpansion row={r} onOpen={onOpen} /> }}
          statusSummary={(visible) => <span data-testid="journal-summary">
            {visible.length} {visible.length === 1 ? "entry" : "entries"}
          </span>}
        />
      </ListPageShell>
    </>}
  </div>;
}

/** The row's one expansion job: its lines. */
function EntryExpansion({ row, onOpen }: { row: LedgerEntryRow; onOpen: (entryNo: string) => void }) {
  const detail = useLedgerEntry(row.id);
  return <div className="p-4 text-body" data-testid={`journal-expansion-${row.entry_no}`}>
    {detail.isError ? <p>These lines could not be loaded. Try again.</p>
      : detail.data ? <EntryLinesTable lines={detail.data.lines} />
      : <p>Loading lines…</p>}
    <button className="btn-secondary mt-3" onClick={() => onOpen(row.entry_no)}>Open entry</button>
  </div>;
}

function EntryPage({ entryRef, search, onClose }: {
  entryRef: string;
  search: URLSearchParams;
  onClose: () => void;
}) {
  const detail = useLedgerEntry(entryRef);
  const notFound = (detail.error as { status?: number } | null)?.status === 404;
  const entry = detail.data?.entry;
  return <div className="flex h-full min-h-0 flex-col">
    <SalesOrderTabs identity={entry?.entry_no ?? entryRef.toUpperCase()} backLabel="Journal" backTo="?"
      onBack={(event) => { event.preventDefault(); onClose(); }}
      status={entry ? <ReversalPill row={entry} /> : undefined}
      navigation={entry ? <span className="text-body">{ledgerSourceWord(entry.source_type)} · {ledgerDocWord(entry.source_doc_no)}</span> : undefined}
    />
    {detail.data ? <div className="flex-1 overflow-auto p-4" data-testid="ledger-entry-scroll">
      <EntryObject detail={detail.data} search={search} />
    </div> : <div className="p-6 text-body" role={detail.isError ? "alert" : undefined}>
      <p>{notFound ? "No entry has that number. Check it and try again."
        : detail.isError ? "This entry could not be loaded. Try again."
        : "Loading entry…"}</p>
      {detail.isError && !notFound
        ? <button className="btn-secondary mt-3" onClick={() => void detail.refetch()}>Try again</button>
        : <button className="btn-secondary mt-3" onClick={onClose}>Back to Journal</button>}
    </div>}
  </div>;
}
