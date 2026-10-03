/**
 * Finance → Bank & Cards → Daily Bank, at `/finance/daily-bank` (migration
 * 0637; Chew 2026-10-03, docs/finance/MASTER.md §3.4).
 *
 * Every money account on one day: what it held the day before, what came in
 * and went out that day, what it holds at the end of it, the checked payment
 * vouchers waiting to pay out of it, and what is left to pay with. A card and
 * online holding account is money waiting for its card payout, so it never
 * counts as money that can pay.
 *
 * It is a Register (§6.7), so there is no KPI strip: the totals are the grid's
 * own footer row. Opening a row lists the documents behind its figures — the
 * day's entries on the account and the vouchers waiting — and nothing else.
 *
 * Every figure is the shared daily-bank arithmetic's (Law D); this page only
 * prints it. The ledger holds no opening balances until Finance enters them,
 * so the toolbar says the figures count from the ledger's start.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  dailyBankRow,
  dailyBankShows,
  dailyBankTotals,
  sen,
  type DailyBankAccount,
  type DailyBankDay,
  type DailyBankRow,
} from "@carres/shared/daily-bank";
import { ledgerAccountHref, ledgerDocWord, ledgerPartyWord, ledgerSourceWord } from "@carres/shared/finance-ledger";
import { MONEY_ACCOUNT_KIND_WORD } from "@carres/shared/money-accounts";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { DateField } from "@/components/register/DateField";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import { addDaysIso } from "@/lib/excel-date-filter";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { useDailyBank } from "../ledger/ledger-queries";
import { VOUCHER_PURPOSE_WORD } from "../payables/payables-words";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = REGISTER_FIELD_WIDTH.amount;
const link = "text-kit-blue-11 underline underline-offset-2";

/** A day's flow prints nothing when nothing moved; a balance always prints. */
const flow = (n: number) => (sen(n) === 0 ? "" : rm(n));
const total = (rows: DailyBankRow[], pick: (r: DailyBankRow) => number | null) =>
  rm(rows.reduce((s, r) => s + sen(pick(r) ?? 0), 0) / 100);

/** One line under an opened account: a posted entry, or a voucher waiting. */
export interface DailyBankDetail {
  key: string;
  entryNo: string | null;
  source: string;
  document: { text: string; to: string | null };
  party: string;
  description: string;
  inflow: number;
  outflow: number;
  waiting: number;
}

/** The documents behind one account's figures, in the order they add up:
 *  the day's entries, then the vouchers waiting. */
export function dailyBankDetails(a: DailyBankAccount): DailyBankDetail[] {
  const lines = a.lines.map((l, i): DailyBankDetail => ({
    key: `line:${l.entry_no}:${i}`,
    entryNo: l.entry_no,
    source: ledgerSourceWord(l.source_type),
    document: { text: ledgerDocWord(l.source_doc_no), to: null },
    party: l.party_type ? `${ledgerPartyWord(l.party_type)} · ${l.party_name ?? "Name not available"}` : "No party",
    description: l.description ?? "No memo",
    inflow: sen(l.received) / 100,
    outflow: sen(l.paid) / 100,
    waiting: 0,
  }));
  const waiting = a.money_kind === "HOLDING" ? [] : a.pending_vouchers.map((v): DailyBankDetail => ({
    key: `voucher:${v.voucher_id}`,
    entryNo: null,
    source: "Payment voucher",
    document: { text: v.voucher_no ?? "Draft, no number yet", to: `/finance/payment-vouchers/${v.voucher_id}` },
    party: v.supplier_id ? `Supplier · ${v.payee_name}` : v.payee_name,
    description: v.narration ?? VOUCHER_PURPOSE_WORD[v.purpose ?? ""] ?? "No memo",
    inflow: 0,
    outflow: 0,
    waiting: sen(v.amount) / 100,
  }));
  return [...lines, ...waiting];
}

/* Fixed interior columns and one auto tail (the kit DataTable recipe). The
   amounts sit last so they line up under each other at any width. */
const DETAIL_COLUMNS: readonly Column<DailyBankDetail>[] = [
  { key: "entry", label: "Entry No", width: "130px",
    cell: (d) => (d.entryNo
      ? <Link className={link} to={`/finance/ledger?${new URLSearchParams({ entry: d.entryNo }).toString()}`}>{d.entryNo}</Link>
      : "") },
  { key: "document", label: "Document", width: "140px",
    cell: (d) => (d.document.to ? <Link className={link} to={d.document.to}>{d.document.text}</Link> : d.document.text) },
  { key: "source", label: "Source", width: "140px", cell: (d) => d.source },
  { key: "party", label: "Party", width: "200px", cell: (d) => d.party },
  { key: "description", label: "Description", width: "180px", cell: (d) => d.description },
  { key: "inflow", label: "Inflow", width: "110px", align: "right", numeric: true, cell: (d) => flow(d.inflow) },
  { key: "outflow", label: "Outflow", width: "110px", align: "right", numeric: true, cell: (d) => flow(d.outflow) },
  { key: "waiting", label: "Waiting for approval", width: "auto", align: "right", numeric: true, cell: (d) => flow(d.waiting) },
];

function AccountDay({ row, day }: { row: DailyBankRow; day: string }) {
  const details = useMemo(() => dailyBankDetails(row.account), [row.account]);
  return (
    <div className="p-4 text-body" data-testid={`daily-bank-expansion-${row.account.account_code}`}>
      <DataTable
        label={`${row.account.account_code} ${row.account.name} on ${fmtDate(day)}`}
        testId="daily-bank-details"
        rows={details}
        columns={DETAIL_COLUMNS}
        rowId={(d) => d.key}
        empty={`Nothing moved on this account on ${fmtDate(day)}, and no voucher is waiting to pay from it.`}
        totals={{
          label: "Total",
          cell: (c, rows) => c.key === "entry" ? "Total"
            : c.key === "inflow" ? rm(rows.reduce((s, d) => s + sen(d.inflow), 0) / 100)
            : c.key === "outflow" ? rm(rows.reduce((s, d) => s + sen(d.outflow), 0) / 100)
            : c.key === "waiting" ? rm(rows.reduce((s, d) => s + sen(d.waiting), 0) / 100)
            : null,
        }}
      />
    </div>
  );
}

/** The rows the board prints, or null when an answer cannot be read whole. */
function boardRows(data: DailyBankDay | undefined): DailyBankRow[] | null {
  if (!data) return [];
  try {
    return data.accounts.map(dailyBankRow).filter(dailyBankShows);
  } catch {
    return null;
  }
}

export default function DailyBankPage() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const asked = params.get("day");
  const day = asked && ISO_DAY.test(asked) ? asked : today;
  const setDay = (iso: string) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (iso && iso !== today) next.set("day", iso); else next.delete("day");
    return next;
  });

  const query = useDailyBank(day);
  const rows = useMemo(() => boardRows(query.data), [query.data]);
  const goLive = query.data?.go_live_on ?? null;
  const beforeStart = goLive !== null && day < goLive;

  const columns = useMemo<DataGridColumn<DailyBankRow>[]>(() => [
    { key: "account", label: "Account", width: 220,
      accessor: (r) => (
        <Link className={link} to={ledgerAccountHref(r.account.account_code, day, day)}>
          {r.account.account_code} {r.account.name}
        </Link>
      ),
      searchValue: (r) => `${r.account.account_code} ${r.account.name}`,
      exportValue: (r) => `${r.account.account_code} ${r.account.name}` },
    // Hidden until asked for in Columns: the account's name and the column its
    // money sits in already say which kind it is, and without it every money
    // column fits a 1440px screen with the menu open.
    { key: "kind", label: "Kind", width: 170, accessor: (r) => MONEY_ACCOUNT_KIND_WORD[r.account.money_kind],
      filterValue: (r) => MONEY_ACCOUNT_KIND_WORD[r.account.money_kind], filterType: "enum", defaultHidden: true },
    { key: "broughtForward", label: "Brought forward", headerLines: ["Brought", "forward"], width: AMOUNT, align: "right",
      accessor: (r) => rm(r.broughtForward), numberValue: (r) => r.broughtForward, exportValue: (r) => r.broughtForward,
      footerTotal: (visible) => total(visible, (r) => r.broughtForward) },
    { key: "inflow", label: "Inflow", width: AMOUNT, align: "right",
      accessor: (r) => flow(r.received), numberValue: (r) => r.received, exportValue: (r) => r.received,
      footerTotal: (visible) => total(visible, (r) => r.received) },
    { key: "outflow", label: "Outflow", width: AMOUNT, align: "right",
      accessor: (r) => flow(r.paid), numberValue: (r) => r.paid, exportValue: (r) => r.paid,
      footerTotal: (visible) => total(visible, (r) => r.paid) },
    { key: "balance", label: "Balance", width: AMOUNT, align: "right",
      accessor: (r) => rm(r.closing), numberValue: (r) => r.closing, exportValue: (r) => r.closing,
      footerTotal: (visible) => total(visible, (r) => r.closing) },
    { key: "waiting", label: "Waiting for approval", headerLines: ["Waiting for", "approval"], width: AMOUNT, align: "right",
      accessor: (r) => (r.available === null ? "" : flow(r.pending)),
      numberValue: (r) => (r.available === null ? null : r.pending),
      exportValue: (r) => (r.available === null ? "" : r.pending),
      footerTotal: (visible) => rm(dailyBankTotals(visible).awaitingApproval) },
    { key: "available", label: "Available to pay", headerLines: ["Available", "to pay"], width: AMOUNT, align: "right",
      accessor: (r) => (r.available === null ? "" : rm(r.available)),
      numberValue: (r) => r.available, exportValue: (r) => r.available ?? "",
      footerTotal: (visible) => rm(dailyBankTotals(visible).canMove) },
    { key: "cardPayout", label: "Waiting for card payout", headerLines: ["Waiting for", "card payout"], width: AMOUNT, align: "right",
      accessor: (r) => (r.inTransit === null ? "" : rm(r.inTransit)),
      numberValue: (r) => r.inTransit, exportValue: (r) => r.inTransit ?? "",
      footerTotal: (visible) => rm(dailyBankTotals(visible).inTransit) },
  ], [day]);

  const notStarted = (query.error as { status?: number } | null)?.status === 409;
  const unreadable = query.isSuccess && rows === null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader destinationHeader testId="daily-bank-destination-header" word="Daily Bank" docTitle="Daily Bank · Carres" />
      {notStarted ? (
        <div role="alert" className="p-6 text-body"><p>The ledger has no start date yet. Nothing can be totalled.</p></div>
      ) : query.isError || unreadable ? (
        <div role="alert" className="p-6 text-body">
          <p>Daily Bank could not be loaded. Try again.</p>
          <div className="mt-3"><Button variant="neutral" onClick={() => void query.refetch()}>Try again</Button></div>
        </div>
      ) : (
        <ListPageShell register>
          <DataGrid
            rows={beforeStart ? [] : (rows ?? [])}
            columns={columns}
            rowKey={(r) => r.account.account_code}
            rowTestId={(r) => `daily-bank-row-${r.account.account_code}`}
            storageKey="carres.finance.daily-bank.v1"
            appearance="reference"
            exportName={`Daily Bank ${day}`}
            groupBanner={false}
            stickyIdentity
            isLoading={!query.isSuccess}
            searchPlaceholder="Search accounts…"
            wrapToolbar
            expandTitle="Show lines"
            expandable={{ renderExpansion: (r) => <AccountDay row={r} day={day} /> }}
            // The toolbar holds the day's controls only, and they wrap rather
            // than clip on a phone (wrapToolbar); what the figures mean is said
            // in the footer under them.
            toolbarStart={
              <span className="flex flex-wrap items-center gap-2 text-body">
                <Button iconOnly icon="previous" aria-label="Previous day" onClick={() => setDay(addDaysIso(day, -1))} />
                <span className="w-36"><DateField value={day} onChange={(iso) => setDay(iso || today)} aria-label="Day" /></span>
                <Button iconOnly icon="forward" aria-label="Next day" onClick={() => setDay(addDaysIso(day, 1))} />
                <Button variant="neutral" onClick={() => setDay(today)} disabled={day === today}>Today</Button>
              </span>
            }
            emptyMessage={beforeStart && goLive
              ? `The ledger started on ${fmtDate(goLive)}. Pick a day from then on.`
              : "No bank or cash account yet. Finance adds them in Settings."}
            statusSummary={(visible) => (
              <span data-testid="daily-bank-summary">
                {visible.length} {visible.length === 1 ? "account" : "accounts"} · {fmtDate(day)}
                {goLive && <span data-testid="daily-bank-go-live"> · Since {fmtDate(goLive)} · No opening balances</span>}
                {day < today && <span data-testid="daily-bank-waiting-now"> · Waiting for approval shows the vouchers still waiting now.</span>}
              </span>
            )}
          />
        </ListPageShell>
      )}
    </div>
  );
}
