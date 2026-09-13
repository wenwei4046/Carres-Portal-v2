/**
 * Finance → Journal → New journal entry, at `/finance/ledger?entry=new`.
 *
 * The principal's one write to the ledger (ruling M): an opening balance, a
 * correction — an entry with no document behind it. Only the principal sees
 * the door, and the API and `gl_manual_journal` both refuse anyone else.
 *
 * The account list is the chart less its headings, its retired accounts and
 * its control accounts: customer, supplier and other party balances move only
 * through their own documents, and the database refuses them here anyway.
 *
 * The totals are live. `Record journal entry` stays disabled, naming what is
 * missing, until debits equal credits. It asks first; the entry gets its JE
 * and MJ numbers when it is recorded and then opens on its own page.
 *
 * A recorded entry cannot be changed, and there is no reversal door (0468
 * took `gl_reverse` away from signed-in users) — a mistake is corrected by
 * recording another entry. The function has no idempotency key, so the confirm
 * button is busy while the call is out and a second press cannot reach it.
 */
import { useMemo, useState, type ReactNode } from "react";
import type { LedgerAccount } from "@carres/shared/finance-ledger";
import { parseTypedAmount } from "@carres/shared/other-money-in";
import {
  MANUAL_JOURNAL_MAX_LINES,
  MANUAL_JOURNAL_MAX_MONEY,
  manualJournalInput,
  manualJournalTotals,
} from "@carres/shared/schemas/finance-manual-journal";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Input from "@/components/kit/Input";
import Modal from "@/components/kit/Modal";
import Select from "@/components/kit/Select";
import Textarea from "@/components/kit/Textarea";
import { SectionCard } from "@/components/SectionPanel";
import { ApiError } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import SalesOrderTabs from "@/pages/operation/SalesOrderTabs";
import { toast } from "sonner";
import { useLedgerChart } from "./ledger-queries";
import { useRecordManualJournal } from "./manual-journal-queries";

/* ── the lines a person types ──────────────────────────────────────────────── */

interface TypedLine {
  key: string;
  account_code: string;
  debit: string;
  credit: string;
  memo: string;
}

let lineSeq = 0;
function blankLine(): TypedLine {
  lineSeq += 1;
  return { key: `journal-line-${lineSeq}`, account_code: "", debit: "", credit: "", memo: "" };
}

const twoDecimals = (n: number) => Math.round(n * 100) / 100 === n;

const DROPPED = "The connection dropped. Check the Journal for this entry before you record it again.";

/** The server answered and said no, in its own words: a 4xx whose JSON body
 *  carries a `message`. */
function isRefusal(e: unknown): e is ApiError {
  if (!(e instanceof ApiError) || e.status < 400 || e.status > 499) return false;
  const body = e.body as { message?: unknown } | null;
  return typeof body === "object" && body !== null && typeof body.message === "string";
}

/** A typed amount → a number, nothing (left blank), or the reason it cannot
 *  be read. A trailing point (`12.`) is read as the number typed so far. */
function readAmount(typed: string): { value: number | null; error?: string } {
  const n = parseTypedAmount(typed.replace(/\.\s*$/, ""));
  if (n === null) return { value: null };
  if (Number.isNaN(n)) return { value: null, error: "Type the amount in numbers, like 1500.00." };
  if (n <= 0) return { value: null, error: "The amount must be more than RM 0.00." };
  if (!twoDecimals(n)) return { value: null, error: "An amount has at most two decimals." };
  if (n > MANUAL_JOURNAL_MAX_MONEY) return { value: null, error: "The amount is larger than the ledger can hold." };
  return { value: n };
}

interface ReadLine {
  line: TypedLine;
  /** Nothing typed at all — left out of the entry. */
  blank: boolean;
  debit: number | null;
  credit: number | null;
  /** Shown under the field as soon as it is typed: a figure that cannot be
   *  read, or a line with both sides. A MISSING value is not an error here —
   *  the disabled button names it. */
  errors: { debit?: string; credit?: string };
}

function readLine(line: TypedLine): ReadLine {
  const blank = !line.account_code && !line.debit.trim() && !line.credit.trim() && !line.memo.trim();
  const debit = readAmount(line.debit);
  const credit = readAmount(line.credit);
  const errors: ReadLine["errors"] = {};
  if (debit.error) errors.debit = debit.error;
  if (credit.error) errors.credit = credit.error;
  if (debit.value !== null && credit.value !== null) errors.credit = "A line takes a debit or a credit, not both.";
  return { line, blank, debit: debit.value, credit: credit.value, errors };
}

/** The first thing between this form and a recordable entry, said as the
 *  second half of the button, or null when there is nothing left. */
function firstGap({ date, goLive, narration, lines }: {
  date: string | null;
  goLive: string | null;
  narration: string;
  lines: ReadLine[];
}): string | null {
  if (!date) return "choose the date";
  if (goLive && date < goLive) return `choose a day from ${fmtDate(goLive)} on`;
  if (!narration.trim()) return "type the narration";
  for (const [i, l] of lines.entries()) {
    if (l.blank) continue;
    if (l.errors.debit || l.errors.credit) return `check line ${i + 1}`;
    if (!l.line.account_code) return `choose an account on line ${i + 1}`;
    if (l.debit === null && l.credit === null) return `type a debit or a credit on line ${i + 1}`;
  }
  const filled = lines.filter((l) => !l.blank);
  if (filled.length < 2) return "add a second line";
  const totals = manualJournalTotals(filled);
  if (totals.debit > MANUAL_JOURNAL_MAX_MONEY) return "the total is larger than the ledger can hold";
  if (!totals.balanced) return "make debits equal credits";
  return null;
}

/* ── the form ──────────────────────────────────────────────────────────────── */

export default function ManualJournalForm({ onBack, onRecorded }: {
  onBack: () => void;
  /** Opens the entry just recorded, by its entry number (or its id). */
  onRecorded: (entryRef: string) => void;
}) {
  const chart = useLedgerChart();
  const record = useRecordManualJournal();

  const goLive = chart.data?.go_live_on ?? null;
  const today = appTodayIso();
  const [date, setDate] = useState<string | null>(today);
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<TypedLine[]>(() => [blankLine(), blankLine()]);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /* Before the ledger starts, the first day it can take is its start date. */
  const entryDate = date && goLive && date === today && today < goLive ? goLive : date;

  const accountOptions = useMemo(
    () => (chart.data?.accounts ?? [])
      .filter((a: LedgerAccount) => a.is_active && !a.is_header && !a.is_control)
      .map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })),
    [chart.data],
  );

  const read = lines.map(readLine);
  const filled = read.filter((l) => !l.blank);
  const totals = manualJournalTotals(filled);
  const gap = firstGap({ date: entryDate, goLive, narration, lines: read });

  const set = (key: string, patch: Partial<TypedLine>) =>
    setLines((all) => all.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const build = () => {
    const parsed = manualJournalInput.safeParse({
      entry_date: entryDate,
      narration: narration.trim(),
      lines: filled.map((l) => ({
        account_code: l.line.account_code,
        debit: l.debit,
        credit: l.credit,
        memo: l.line.memo.trim() || null,
      })),
    });
    if (!parsed.success) {
      setRefusal(parsed.error.issues[0]?.message ?? "Check the entry and try again.");
      return null;
    }
    return parsed.data;
  };

  // Blank rows are left out of the entry, so they leave the screen too:
  // otherwise the database's "Line 2" would point at the wrong row.
  const dropBlankLines = () => setLines((all) => all.filter((l) => !readLine(l).blank));

  const askFirst = () => {
    if (!build()) return;
    dropBlankLines();
    setConfirming(true);
  };

  const submit = () => {
    if (record.isPending) return;
    setRefusal(null);
    const input = build();
    if (!input) {
      setConfirming(false);
      return;
    }
    dropBlankLines();
    record.mutate(input, {
      onSuccess: (res) => {
        setConfirming(false);
        toast.success("Journal entry recorded.");
        onRecorded(res.entry_no ?? res.id);
      },
      onError: (e) => {
        setConfirming(false);
        // Only a 4xx that carries our own sentence is a refusal. Anything else
        // (no answer, a gateway page, a 5xx) leaves the outcome unknown: the
        // entry may already stand, and a second press is a second entry.
        setRefusal(isRefusal(e) ? e.message : DROPPED);
      },
    });
  };

  const header = <SalesOrderTabs identity="New journal entry" backLabel="Journal" backTo="?"
    docTitle="New journal entry — Carres"
    onBack={(event) => { event.preventDefault(); onBack(); }} />;

  if (chart.isError) {
    return <div className="flex h-full min-h-0 flex-col">
      {header}
      <div role="alert" className="flex flex-col items-start gap-3 p-6 text-body">
        <p>The chart of accounts could not be loaded. Try again.</p>
        <Button variant="neutral" onClick={() => void chart.refetch()}>Try again</Button>
      </div>
    </div>;
  }

  return <div className="flex h-full min-h-0 flex-col">
    {header}
    <div className="flex-1 overflow-auto p-4" data-testid="manual-journal-form">
      <div className="flex max-w-5xl flex-col gap-4">
        <Card title="Entry">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <DatePicker id="journal-date" label="Date" required value={entryDate} onChange={setDate}
              minDate={goLive ?? undefined}
              hint={goLive ? `The ledger started on ${fmtDate(goLive)}. Opening balances take that date.` : undefined} />
            <Textarea id="journal-narration" label="Narration" required rows={2} maxLength={500}
              value={narration} onChange={(e) => setNarration(e.target.value)} />
          </div>
        </Card>

        <Card title="Lines" testId="journal-lines">
          <p className="text-kit-slate-11">
            Customer, supplier and other party accounts are not listed. They move only through their own documents.
          </p>
          {read.map((l, i) => (
            <div key={l.line.key} data-testid={`journal-line-${i + 1}`}
              className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
              <Select id={`journal-account-${i + 1}`} label="Account" value={l.line.account_code || undefined}
                onValueChange={(v) => set(l.line.key, { account_code: v })} options={accountOptions}
                placeholder={chart.isLoading ? "Loading accounts…" : "Choose an account"} />
              <Input id={`journal-debit-${i + 1}`} label="Debit" inputMode="decimal" value={l.line.debit}
                error={l.errors.debit} onChange={(e) => set(l.line.key, { debit: e.target.value })} />
              <Input id={`journal-credit-${i + 1}`} label="Credit" inputMode="decimal" value={l.line.credit}
                error={l.errors.credit} onChange={(e) => set(l.line.key, { credit: e.target.value })} />
              <Input id={`journal-memo-${i + 1}`} label="Memo" maxLength={500} value={l.line.memo}
                onChange={(e) => set(l.line.key, { memo: e.target.value })} />
              <Button variant="ghost" aria-label={`Remove, line ${i + 1}`} disabled={lines.length <= 2}
                onClick={() => setLines((all) => all.filter((x) => x.key !== l.line.key))}>
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button variant="neutral" size="sm" icon="add" disabled={lines.length >= MANUAL_JOURNAL_MAX_LINES}
              onClick={() => setLines((all) => [...all, blankLine()])}>
              Add line
            </Button>
          </div>
        </Card>

        <p className="text-strong" data-testid="journal-totals">
          Total · Debit {rm(totals.debit)} · Credit {rm(totals.credit)} ·{" "}
          <span className={totals.difference === 0 ? undefined : "text-kit-red-11"} data-testid="journal-difference">
            Difference {rm(Math.abs(totals.difference))}
          </span>
        </p>
        {refusal && <p role="alert" className="text-body text-kit-red-11" data-testid="journal-refusal">{refusal}</p>}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={gap !== null} onClick={askFirst}>
            {gap ? `Record journal entry — ${gap}` : "Record journal entry"}
          </Button>
          <Button variant="ghost" onClick={onBack}>Back to Journal</Button>
        </div>
      </div>
    </div>

    <Modal open={confirming} onOpenChange={(open) => { if (!record.isPending) setConfirming(open); }}
      title="Record this journal entry?"
      description={`${rm(totals.debit)} debit and credit, dated ${fmtDate(entryDate)}. A recorded entry cannot be changed. To correct it, record another entry.`}
      footer={<>
        <Button variant="ghost" disabled={record.isPending} onClick={() => setConfirming(false)}>Cancel</Button>
        <Button variant="primary" loading={record.isPending} onClick={submit}>Record journal entry</Button>
      </>}>
      <p className="text-body">It gets its entry number now.</p>
    </Modal>
  </div>;
}

function Card({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return <SectionCard><div className="p-3" data-testid={testId}>
    <h2 className="mb-2 text-strong">{title}</h2>
    <div className="flex flex-col gap-3 text-body">{children}</div>
  </div></SectionCard>;
}
