// design-standard: not-a-list-page — a read-only document preview (kit Modal) opened from a Finance list.
/**
 * THE DOCUMENT PREVIEW — Chew 2026-10-21 (docs/finance/MASTER.md §4.2, COPY
 * "Row menu and preview"). A Finance exception to the kit's double-click: on a
 * Finance list, double-clicking a DOCUMENT row opens this preview instead of
 * the document's page. Chew tells Jess.
 *
 * It is the kit `Modal` at its `wide` width — the kit's surface for "a header
 * and a LINE LIST" — drawing nothing of its own: the document's header facts
 * (the page's own FactRow), its lines and the General Ledger entries it posted
 * (the kit DataTable in the Finance look), and ONE button, `View`, which opens
 * the full page the double-click used to open. Read only: nothing here writes,
 * and every act stays on the document's own page. Escape closes the top layer
 * only (Radix's dialog stack), so a preview over a preview closes one at a time.
 *
 * The document is read by its own detail endpoint and each ledger entry by the
 * Journal's (`/api/finance/ledger/entries/{JE No}`); no new read.
 */
import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import type { LedgerEntryDetail, LedgerEntryLine } from "@carres/shared/finance-ledger";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import { apiFetch } from "@/lib/api";
import { rm } from "@/lib/format-currency";
import { ledgerKeys } from "../ledger/ledger-queries";
import { FactRow, ReadFailed } from "../payables/PayablesParts";
import { amountCell, FINANCE_WIDTH } from "../finance-widths";
import look from "../finance-look.module.css";

/** One of the document's own lines, as its page lists it. */
export interface PreviewLine {
  key: string;
  description: string;
  /** `{code} {name}`; blank where the line is a bill paid, not an account. */
  account: string;
  amount: number;
}

export interface PreviewFact {
  label: string;
  value: ReactNode;
}

/** What one document's preview shows, built by its own page's adapter. */
export interface PreviewContent {
  facts: PreviewFact[];
  /** Absent for a journal entry: its lines ARE its ledger entry. */
  lines?: { rows: PreviewLine[]; empty: string };
  /** The entries the document posted (and its reversal), oldest first. */
  entryNos: string[];
  /** The page's own sentence for a document that has posted nothing yet. */
  noEntry: string;
}

export const PREVIEW_WORDS = { view: "View", lines: "Lines", ledger: "General Ledger" } as const;

const LINE_COLUMNS: readonly Column<PreviewLine>[] = [
  { key: "description", label: "Description", width: "auto", cell: (l) => <span className="whitespace-normal">{l.description}</span> },
  { key: "account", label: "Account", width: "200px", cell: (l) => <span className="whitespace-normal">{l.account}</span> },
  { key: "amount", label: "Amount", width: `${FINANCE_WIDTH.amount}px`, align: "right", numeric: true, cell: (l) => amountCell(l.amount) },
];

/* The preview is the kit's 600px wide Modal: two amounts keep their 128,
   the account wraps in 160, and Description takes what is left. */
const ENTRY_COLUMNS: readonly Column<LedgerEntryLine>[] = [
  { key: "account", label: "Account", width: "160px",
    cell: (l) => <span className="whitespace-normal">{l.account_code} {l.account_name ?? "Account name not available"}</span> },
  { key: "description", label: "Description", width: "auto",
    cell: (l) => <span className="whitespace-normal">{l.memo ?? "No memo"}</span> },
  { key: "debit", label: "Debit", width: `${FINANCE_WIDTH.amount}px`, align: "right", numeric: true, cell: (l) => amountCell(l.debit) },
  { key: "credit", label: "Credit", width: `${FINANCE_WIDTH.amount}px`, align: "right", numeric: true, cell: (l) => amountCell(l.credit) },
];

/** A kit table in the Finance look, filling the preview's width. */
function FinanceTable({ children }: { children: ReactNode }) {
  return <div className={look.statement} data-fin-fill="">{children}</div>;
}

/** The General Ledger entries the document posted: one table per entry. */
export function PreviewLedger({ entryNos, noEntry }: { entryNos: string[]; noEntry: string }) {
  const entries = useQueries({
    queries: entryNos.map((no) => ({
      queryKey: ledgerKeys.entry(no),
      queryFn: () => apiFetch<LedgerEntryDetail>(`/api/finance/ledger/entries/${encodeURIComponent(no)}`),
    })),
  });
  return (
    <section className="flex flex-col gap-2" data-testid="preview-ledger">
      <h3 className="text-strong">{PREVIEW_WORDS.ledger}</h3>
      {entryNos.length === 0 ? <p className="text-body">{noEntry}</p> : entryNos.map((no, i) => {
        const q = entries[i];
        return (
          <div key={no} className="flex flex-col gap-1" data-testid={`preview-entry-${no}`}>
            <p className="text-body">Ledger entry {no}</p>
            {q?.isError ? (
              <div role="alert" className="text-body">
                <p>This entry could not be loaded. Try again.</p>
                <button type="button" className="btn-secondary mt-3" onClick={() => void q.refetch()}>Try again</button>
              </div>
            ) : !q?.data ? <p className="text-body" role="status">Loading entry…</p> : (
              <FinanceTable>
                <DataTable label={`Ledger entry ${no}`} rows={q.data.lines} columns={ENTRY_COLUMNS}
                  rowId={(l) => String(l.line_no)} empty="This entry has no lines."
                  totals={{
                    label: "Total",
                    cell: (c, rows) => c.key === "account" ? "Total"
                      : c.key === "debit" ? rm(rows.reduce((s, l) => s + l.debit, 0))
                      : c.key === "credit" ? rm(rows.reduce((s, l) => s + l.credit, 0))
                      : null,
                  }} />
              </FinanceTable>
            )}
          </div>
        );
      })}
    </section>
  );
}

/**
 * The preview itself. `read` is the document's own detail query; `content`
 * is null until it has answered. `what` names it in the page's own failure
 * sentence (`This bill could not be loaded. Try again.`).
 */
export default function DocumentPreview({ open, onClose, title, onView, read, what, loadingWord, content }: {
  open: boolean;
  onClose: () => void;
  title: string;
  onView: () => void;
  read: { isError: boolean; refetch: () => unknown };
  what: string;
  loadingWord: string;
  content: PreviewContent | null;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={title}
      width="wide"
      footer={<Button variant="primary" onClick={onView}>{PREVIEW_WORDS.view}</Button>}
    >
      <div className="flex flex-col gap-4" data-testid="document-preview">
        {read.isError ? <ReadFailed what={what} onRetry={() => void read.refetch()} />
          : !content ? <p className="text-body" role="status">{loadingWord}</p>
          : <>
            <div className="text-body" data-testid="preview-facts">
              {content.facts.map((f) => <FactRow key={f.label} label={f.label}>{f.value}</FactRow>)}
            </div>
            {content.lines && (
              <section className="flex flex-col gap-2" data-testid="preview-lines">
                <h3 className="text-strong">{PREVIEW_WORDS.lines}</h3>
                <FinanceTable>
                  <DataTable label={PREVIEW_WORDS.lines} rows={content.lines.rows} columns={LINE_COLUMNS}
                    rowId={(l) => l.key} empty={content.lines.empty}
                    totals={{
                      label: "Total",
                      cell: (c, rows) => c.key === "description" ? "Total"
                        : c.key === "amount" ? rm(rows.reduce((s, l) => s + l.amount, 0)) : null,
                    }} />
                </FinanceTable>
              </section>
            )}
            <PreviewLedger entryNos={content.entryNos} noEntry={content.noEntry} />
          </>}
      </div>
    </Modal>
  );
}
