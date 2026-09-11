/**
 * The pieces of one journal entry that both the Journal's row expansion and
 * the entry's own page print: its lines, and the entry on the other side of a
 * reversed pair. Read-only.
 */
import { Link } from "react-router-dom";
import type { LedgerEntryDetail, LedgerEntryLine, LedgerEntryRow } from "@carres/shared/finance-ledger";
import {
  ledgerDocWord,
  ledgerPartyWord,
  ledgerReversalKind,
  ledgerReversalPartner,
  ledgerSourceWord,
} from "@carres/shared/finance-ledger";
import DataTable, { type Column } from "@/components/kit/DataTable";
import StatusPill from "@/components/kit/StatusPill";
import { SectionCard } from "@/components/SectionPanel";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";

/** `?entry=` added to whatever the Journal is already narrowed to, so opening
 *  an entry and coming back keeps the operator's scope. */
export function entrySearch(current: URLSearchParams, entryNo: string): string {
  const next = new URLSearchParams(current);
  next.set("entry", entryNo);
  return `?${next.toString()}`;
}

const cents = (n: number) => Math.round(n * 100);
const money = (n: number) => (cents(n) === 0 ? "" : rm(n));

function partyText(l: LedgerEntryLine): string {
  if (!l.party_type) return "No party";
  return `${ledgerPartyWord(l.party_type)} · ${l.party_name ?? "Name not available"}`;
}

const LINE_COLUMNS: readonly Column<LedgerEntryLine>[] = [
  { key: "account", label: "Account", width: "240px",
    cell: (l) => `${l.account_code} ${l.account_name ?? "Account name not available"}` },
  { key: "debit", label: "Debit", width: "130px", align: "right", numeric: true, cell: (l) => money(l.debit) },
  { key: "credit", label: "Credit", width: "130px", align: "right", numeric: true, cell: (l) => money(l.credit) },
  { key: "party", label: "Party", width: "220px", cell: partyText },
  { key: "memo", label: "Memo", width: "auto", cell: (l) => l.memo ?? "No memo" },
];

/** The entry's lines, debits and credits side by side, totalled. */
export function EntryLinesTable({ lines }: { lines: readonly LedgerEntryLine[] }) {
  return (
    <DataTable
      label="Entry lines"
      testId="ledger-entry-lines"
      rows={lines}
      columns={LINE_COLUMNS}
      rowId={(l) => String(l.line_no)}
      empty="This entry has no lines."
      totals={{
        label: "Total",
        cell: (c, rows) => c.key === "account" ? "Total"
          : c.key === "debit" ? rm(rows.reduce((s, l) => s + l.debit, 0))
          : c.key === "credit" ? rm(rows.reduce((s, l) => s + l.credit, 0))
          : null,
      }}
    />
  );
}

/** `Reversed by JE-…` / `Reverses JE-…` as a link to the other half. */
export function ReversalLink({ row, search }: {
  row: Pick<LedgerEntryRow, "reversed" | "reverses" | "reverses_entry_no" | "reversed_by_entry_no">;
  search: URLSearchParams;
}) {
  const partner = ledgerReversalPartner(row);
  if (!partner) return <span>Not reversed</span>;
  if (!partner.entryNo) return <span>{partner.word} an entry that could not be read</span>;
  return <span>{partner.word}{" "}
    <Link to={{ search: entrySearch(search, partner.entryNo) }} className="underline underline-offset-2"
      onClick={(e) => e.stopPropagation()}>{partner.entryNo}</Link>
  </span>;
}

/** The one derived state an entry has: which side of a reversed pair it is. */
export function ReversalPill({ row }: { row: Pick<LedgerEntryRow, "reversed" | "reverses"> }) {
  const kind = ledgerReversalKind(row);
  return kind === "Not reversed" ? null : <StatusPill tone="neutral">{kind}</StatusPill>;
}

function Facts({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return <SectionCard><div className="p-3" data-testid={testId}>
    <h2 className="text-strong mb-2">{title}</h2>
    <div className="text-body">{children}</div>
  </div></SectionCard>;
}

/** The whole entry on its own page: facts, lines, its reversal, and the rest
 *  of its document's story. */
export function EntryObject({ detail, search }: { detail: LedgerEntryDetail; search: URLSearchParams }) {
  const { entry, lines, related } = detail;
  return <div className="flex flex-col gap-4">
    <Facts title="Entry" testId="ledger-entry-facts">
      <p>{fmtDate(entry.entry_date)} · {ledgerSourceWord(entry.source_type)} · {ledgerDocWord(entry.source_doc_no)}</p>
      <p>{rm(entry.total_debit)}</p>
      <p>{entry.narration ?? "No narration"}</p>
    </Facts>
    <Facts title="Lines"><EntryLinesTable lines={lines} /></Facts>
    {ledgerReversalPartner(entry) && <Facts title="Reversal" testId="ledger-entry-reversal">
      <p><ReversalLink row={entry} search={search} /></p>
    </Facts>}
    {related.length > 0 && <Facts title="Same document" testId="ledger-entry-related">
      {related.map((r) => <p key={r.id}>
        <Link to={{ search: entrySearch(search, r.entry_no) }} className="underline underline-offset-2">{r.entry_no}</Link>
        {" · "}{fmtDate(r.entry_date)} · {ledgerSourceWord(r.source_type)}{r.reversed ? " · Reversed" : ""}
      </p>)}
    </Facts>}
  </div>;
}
