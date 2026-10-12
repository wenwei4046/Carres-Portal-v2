/**
 * Finance → Reports → AR Aging, at `/finance/reports/ar-aging` (migration
 * 0686; Chew 2026-10-03 and 2026-10-12, docs/finance/MASTER.md §3.6:
 * 「就根据开了invoice还没还的就出现…包括普通顾客」).
 *
 * What each customer and other debtor owed on a day, by how old its invoices
 * were: this month, then whole months back (or 30-day steps), by the invoice's
 * date or its due date. A customer's invoices are Payment's sales and storage
 * invoices, the order's money filling its earliest invoice first; an other
 * debtor's are Finance's own, less the receipts allocated to them. What a
 * debtor's balance holds beyond its open invoices sits in `Not tied to an
 * invoice`: a deposit paid ahead of the invoice reads below zero. So each row
 * adds up to the debtor's balance in the books, and the rows add up to the
 * debtor control accounts; the footer prints both and the difference.
 *
 * Every figure is the shared AR-aging arithmetic's (Law D), on AP Aging's
 * columns; this page only prints it. Opening a row lists its open invoices.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AGING_COLUMN_COUNT, type AgingColumns } from "@carres/shared/ap-aging";
import {
  arAgingReport,
  type ArAgingAnswer,
  type ArAgingBasis,
  type ArAgingReport,
  type ArAgingRow,
  type ArInvoiceKind,
} from "@carres/shared/ar-aging";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Select from "@/components/kit/Select";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { DateField } from "@/components/register/DateField";
import { REGISTER_FIELD_WIDTH } from "@/components/register/register-field-widths";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { departmentWord, encodeDepartment, useDepartments, type DepartmentRow } from "../department";
import { ReadFailed } from "../payables/PayablesParts";
import { AGING_COLUMN_WORDS } from "./ApAging";
import { readDay } from "./period";

const AMOUNT = REGISTER_FIELD_WIDTH.amount;
const link = "text-kit-blue-11 underline underline-offset-2";
const money = (n: number) => (Math.round(n * 100) === 0 ? "" : rm(n));
const sum = (rows: ArAgingRow[], pick: (r: ArAgingRow) => number) => rm(rows.reduce((t, r) => t + Math.round(pick(r) * 100), 0) / 100);

// PROPOSAL - PENDING APPROVAL (docs/COPY-STANDARD.md, Finance (Chew), 0686).
const KIND_WORD: Record<ArInvoiceKind, string> = {
  sales: "Sales Invoice",
  storage: "Storage Invoice",
  additional_storage: "Additional Storage Invoice",
  other: "Other debtor invoice",
};
export const debtorTypeWord = (r: Pick<ArAgingRow, "partyType">) => (r.partyType === "CUSTOMER" ? "Customer" : "Other debtor");

/** The one channel a debtor's balance sits in (0690: money paid ahead too), in
 *  words; `Several channels`; or nothing. */
export function channelWord(r: Pick<ArAgingRow, "channel">, departments: readonly DepartmentRow[]): string {
  if (r.channel === null) return "";
  if (r.channel === "several") return "Several channels";
  return departmentWord(encodeDepartment(r.channel.type, r.channel.id), departments) ?? "";
}

function Invoices({ row, columns }: { row: ArAgingRow; columns: AgingColumns }) {
  const cols: readonly Column<ArAgingRow["invoices"][number]>[] = [
    { key: "invoice", label: "Invoice No", width: "160px",
      cell: (i) => (i.kind === "other"
        ? <Link className={link} to={`/finance/other-debtors?invoice=${i.invoiceId}`}>{i.invoiceNo}</Link>
        : i.invoiceNo) },
    { key: "kind", label: "Invoice Type", width: "190px", cell: (i) => KIND_WORD[i.kind] },
    { key: "so", label: "SO No", width: "110px", cell: (i) => (i.so !== null ? `SO-${i.so}` : "") },
    { key: "date", label: "Invoice date", width: "120px", cell: (i) => fmtDate(i.invoiceDate) },
    { key: "due", label: "Due date", width: "120px", cell: (i) => (i.dueDate ? fmtDate(i.dueDate) : "") },
    { key: "total", label: "Invoice total", width: "130px", align: "right", numeric: true, cell: (i) => rm(i.total) },
    { key: "open", label: "Still owed", width: "130px", align: "right", numeric: true, cell: (i) => rm(i.open) },
    { key: "column", label: "Age", width: "auto", cell: (i) => AGING_COLUMN_WORDS[columns][i.column] },
  ];
  return <div className="p-4 text-body" data-testid={`ar-aging-invoices-${row.key}`}>
    <DataTable label={`${row.name} open invoices`} testId="ar-aging-invoices" rows={row.invoices} columns={cols} rowId={(i) => i.invoiceId}
      empty="No invoice is open. The balance is money not tied to an invoice." />
  </div>;
}

export default function ArAging() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const asAt = readDay(params.get("asAt")) ?? today;
  const basis: ArAgingBasis = params.get("by") === "due" ? "due" : "invoice";
  const columns: AgingColumns = params.get("columns") === "day" ? "day" : "month";
  const set = (key: string, value: string | null) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  });
  const { data: departments = [] } = useDepartments();

  const query = useQuery({
    queryKey: ["finance", "ledger", "ar-aging", asAt],
    queryFn: () => apiFetch<ArAgingAnswer>(`/api/finance/ledger/ar-aging?${new URLSearchParams({ asAt }).toString()}`),
    retry: (count: number, error: unknown) => ![409, 422].includes((error as { status?: number }).status ?? 0) && count < 2,
  });
  const report = useMemo((): ArAgingReport | "unreadable" | null => {
    if (!query.data) return null;
    try {
      return arAgingReport(query.data, basis, columns);
    } catch {
      return "unreadable";
    }
  }, [query.data, basis, columns]);
  const notStarted = (query.error as { status?: number } | null)?.status === 409;

  const gridColumns = useMemo<DataGridColumn<ArAgingRow>[]>(() => [
    // Hidden at first, as AP Aging's Creditor Type is, so every age column
    // and Not tied to an invoice fit a 1440 screen beside Channel.
    { key: "debtor", label: "Debtor", width: 204, accessor: (r) => r.name, overflowText: (r) => r.name,
      searchValue: (r) => r.name, exportValue: (r) => r.name },
    { key: "type", label: "Debtor Type", width: 130, accessor: debtorTypeWord,
      filterValue: debtorTypeWord, filterType: "enum", defaultHidden: true },
    { key: "channel", label: "Channel", width: 130, accessor: (r) => channelWord(r, departments),
      overflowText: (r) => channelWord(r, departments), filterValue: (r) => channelWord(r, departments), filterType: "enum",
      exportValue: (r) => channelWord(r, departments) },
    { key: "balance", label: "Balance", width: AMOUNT, align: "right", accessor: (r) => rm(r.balance),
      numberValue: (r) => r.balance, exportValue: (r) => r.balance, footerTotal: (v) => sum(v, (r) => r.balance) },
    ...Array.from({ length: AGING_COLUMN_COUNT }, (_, i): DataGridColumn<ArAgingRow> => {
      const word = AGING_COLUMN_WORDS[columns][i]!;
      const lines = word.split(" ");
      return {
        key: `c${i}`, label: word, width: AMOUNT, align: "right",
        headerLines: lines.length > 2 ? [lines.slice(0, 2).join(" "), lines.slice(2).join(" ")] as const : undefined,
        accessor: (r) => money(r.cells[i]!), numberValue: (r) => r.cells[i]!, exportValue: (r) => r.cells[i]!,
        footerTotal: (v) => sum(v, (r) => r.cells[i]!),
      };
    }),
    // Money paid ahead totals below zero, one character wider than an age
    // column's: the Debtor column gives up the 16px it needs.
    { key: "notTied", label: "Not tied to an invoice", headerLines: ["Not tied to", "an invoice"], width: AMOUNT + 16, align: "right",
      accessor: (r) => money(r.notTied), numberValue: (r) => r.notTied, exportValue: (r) => r.notTied,
      footerTotal: (v) => sum(v, (r) => r.notTied) },
  ], [columns, departments]);

  const ready = report !== null && report !== "unreadable" ? report : null;
  const controls = ready?.controls.map((c) => c.code).join(" + ") ?? "";

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="ar-aging-destination-header" word="AR Aging" docTitle="AR Aging · Carres" />
    {notStarted ? <div role="alert" className="p-6 text-body"><p>The ledger has no start date yet. Nothing can be totalled.</p></div>
    : query.isError || report === "unreadable" ? <ReadFailed what="AR aging" onRetry={() => void query.refetch()} />
    : <>
      {ready && ready.difference !== 0 && <div role="status" data-testid="ar-aging-differs"
        className="flex h-10 shrink-0 items-center gap-2 bg-kit-amber-3 px-4 text-body text-kit-amber-11">
        ⚠ The debtors differ from the books by {rm(Math.abs(ready.difference))}.
        <Link className="underline underline-offset-2" to="/finance/ledger/self-check">Open Self-check</Link>
      </div>}
      {ready && ready.beforeGoLive.count > 0 && <p data-testid="ar-aging-before-go-live"
        className="shrink-0 px-4 py-2 text-body text-kit-slate-11">
        {ready.beforeGoLive.count} {ready.beforeGoLive.count === 1 ? "invoice" : "invoices"} worth {rm(ready.beforeGoLive.amount)}{" "}
        {ready.beforeGoLive.count === 1 ? "was" : "were"} issued before the books started. The books do not hold {ready.beforeGoLive.count === 1 ? "it" : "them"}, so {ready.beforeGoLive.count === 1 ? "it is" : "they are"} not aged here.
      </p>}
      <ListPageShell register>
        <DataGrid rows={ready?.rows ?? []} columns={gridColumns} rowKey={(r) => r.key}
          rowTestId={(r) => `ar-aging-row-${r.key}`}
          storageKey="carres.finance.ar-aging.v1" appearance="reference" exportName={`AR Aging ${asAt}`}
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess} wrapToolbar
          searchPlaceholder="Search debtors…" expandTitle="Show invoices"
          expandable={{ renderExpansion: (r) => <Invoices row={r} columns={columns} /> }}
          toolbarStart={<div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <span className="block text-label text-kit-slate-11">As of</span>
              <DateField value={asAt} onChange={(iso) => set("asAt", iso && iso !== today ? iso : null)} aria-label="As of" />
            </div>
            <div className="w-40"><Select id="ar-aging-by" label="Age by" value={basis}
              onValueChange={(v) => set("by", v === "due" ? "due" : null)}
              options={[{ value: "invoice", label: "Invoice date" }, { value: "due", label: "Due date" }]} /></div>
            <div className="w-40"><Select id="ar-aging-columns" label="Columns" value={columns}
              onValueChange={(v) => set("columns", v === "day" ? "day" : null)}
              options={[{ value: "month", label: "By month" }, { value: "day", label: "By days" }]} /></div>
          </div>}
          emptyMessage={`No customer or other debtor owed money on ${fmtDate(asAt)}.`}
          statusSummary={(visible) => <span data-testid="ar-aging-summary">
            {visible.length} {visible.length === 1 ? "debtor" : "debtors"}
            {ready ? ` · In the books (${controls}) on ${fmtDate(asAt)}: ${rm(ready.controlsTotal)} · Difference ${rm(Math.abs(ready.difference))}` : ""}
          </span>} />
      </ListPageShell>
    </>}
  </div>;
}
