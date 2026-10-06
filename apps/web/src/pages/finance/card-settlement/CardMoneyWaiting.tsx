/**
 * Finance → Bank & Cards → Card money waiting, at
 * `/finance/card-money-waiting` (migration 0641; Chew 2026-10-03,
 * docs/finance/MASTER.md §3.4, after Houzs Part 7 §11 and §13).
 *
 * Each card and online payment whose money has not reached the bank yet, how
 * long it has waited, and where it is: no card company file shows it yet,
 * matched but the card payout is not prepared, or the card payout is waiting
 * for approval. A payment leaves the list when its day's card payout is
 * approved. The footer ties the list to the card and online holding accounts
 * in the books, so money moved by hand shows as a difference.
 *
 * Every figure is the shared card-money-waiting arithmetic's (Law D); this
 * page only prints it.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CARD_WAITING_AGES,
  cardMoneyWaiting,
  type CardWaitingAnswer,
  type CardWaitingReport,
  type CardWaitingRow,
} from "@carres/shared/card-money-waiting";
import { ledgerDocWord, ledgerSourceWord } from "@carres/shared/finance-ledger";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { ReadFailed } from "../payables/PayablesParts";

const link = "text-kit-blue-11 underline underline-offset-2";

/** Where a payment's money is, in words. */
export function whereItIs(r: CardWaitingRow): string {
  switch (r.wire.state) {
    case "NOT_ON_A_FILE": return "No card company file shows it yet";
    case "NOT_PREPARED": return "Matched · card payout not prepared";
    case "WAITING_APPROVAL":
      return r.wire.move_no ? `Card payout ${r.wire.move_no} waiting for approval` : "Card payout waiting for approval";
  }
}

const docOf = (r: CardWaitingRow) => r.wire.receipt_no ?? ledgerDocWord(r.wire.doc_no);

export default function CardMoneyWaiting() {
  const query = useQuery({
    queryKey: ["finance", "card-settlement", "waiting"],
    queryFn: () => apiFetch<CardWaitingAnswer>("/api/finance/card-settlement/waiting"),
  });
  const report = useMemo((): CardWaitingReport | "unreadable" | null => {
    if (!query.data) return null;
    try {
      return cardMoneyWaiting(query.data);
    } catch {
      return "unreadable";
    }
  }, [query.data]);
  const ready = report !== null && report !== "unreadable" ? report : null;

  const columns = useMemo<DataGridColumn<CardWaitingRow>[]>(() => [
    { key: "date", label: "Paid on", width: REGISTER_FIELD_WIDTH.date, accessor: (r) => fmtDate(r.wire.entry_date),
      dateValue: (r) => r.wire.entry_date, filterType: "date", exportValue: (r) => r.wire.entry_date },
    { key: "document", label: "Document", width: 160,
      accessor: (r) => (r.wire.payment_id
        ? <Link className={link} to={`/finance/payments?payment=${r.wire.payment_id}`}>{docOf(r)}</Link>
        : docOf(r)),
      searchValue: (r) => docOf(r), exportValue: (r) => docOf(r) },
    { key: "source", label: "Source", width: 150, accessor: (r) => ledgerSourceWord(r.wire.source_type),
      filterValue: (r) => ledgerSourceWord(r.wire.source_type), filterType: "enum", defaultHidden: true },
    { key: "so", label: "SO No", width: 110, accessor: (r) => (r.wire.so != null ? `SO-${r.wire.so}` : ""),
      searchValue: (r) => (r.wire.so != null ? `SO-${r.wire.so}` : "") },
    { key: "customer", label: "Customer", width: 180, accessor: (r) => r.wire.customer_name ?? "" },
    { key: "account", label: "Card account", width: 140, accessor: (r) => `${r.wire.account_code} ${r.holdingName}`,
      filterValue: (r) => r.holdingName, filterType: "enum" },
    { key: "amount", label: "Amount", width: REGISTER_FIELD_WIDTH.amount, align: "right", accessor: (r) => rm(r.amount),
      numberValue: (r) => r.amount, exportValue: (r) => r.amount,
      footerTotal: (v) => rm(v.reduce((t, r) => t + Math.round(r.amount * 100), 0) / 100) },
    { key: "days", label: "Days", width: 80, align: "right", accessor: (r) => String(r.days),
      numberValue: (r) => r.days, exportValue: (r) => r.days },
    // Hidden until asked for: Days says the same, to the day; the age is for filtering.
    { key: "age", label: "Waiting", width: 130, accessor: (r) => r.age, defaultHidden: true,
      filterValue: (r) => r.age, filterType: "enum",
      sortFn: (a, b) => CARD_WAITING_AGES.indexOf(a.age) - CARD_WAITING_AGES.indexOf(b.age) },
    { key: "where", label: "Where it is", width: 260,
      accessor: (r) => <Link className={link} to="/finance/card-settlement">{whereItIs(r)}</Link>,
      filterValue: whereItIs, filterType: "enum", exportValue: whereItIs },
  ], []);

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="card-money-waiting-destination-header" word="Card money waiting"
      docTitle="Card money waiting · Carres" />
    {query.isError || report === "unreadable" ? <ReadFailed what="Card money waiting" onRetry={() => void query.refetch()} />
    : <>
      {ready && Math.round(ready.difference * 100) !== 0 && <div role="status" data-testid="card-money-waiting-differs"
        className="flex h-10 shrink-0 items-center gap-2 bg-kit-amber-3 px-4 text-body text-kit-amber-11">
        ⚠ The card and online accounts hold {rm(Math.abs(ready.difference))} {ready.difference > 0 ? "more" : "less"} than these payments.
        <Link className="underline underline-offset-2" to="/finance/money-moves">Open Money moves</Link>
      </div>}
      <ListPageShell register>
        <DataGrid rows={ready?.rows ?? []} columns={columns} rowKey={(r) => r.key}
          rowTestId={(r) => `card-money-waiting-row-${r.wire.entry_no}`}
          storageKey="carres.finance.card-money-waiting.v1" appearance="reference" exportName="Card money waiting"
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess} wrapToolbar
          searchPlaceholder="Search payments…"
          emptyMessage="No card or online money is waiting. Every payment has reached the bank."
          statusSummary={(visible) => <span data-testid="card-money-waiting-summary">
            {visible.length} {visible.length === 1 ? "payment" : "payments"}
            {ready ? ` · ${rm(ready.total)} waiting · The card and online accounts hold ${rm(ready.booksTotal)} in the books` : ""}
          </span>} />
      </ListPageShell>
    </>}
  </div>;
}
