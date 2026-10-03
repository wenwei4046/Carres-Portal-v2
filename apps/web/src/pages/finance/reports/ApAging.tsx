/**
 * Finance → Reports → AP Aging, at `/finance/reports/ap-aging` (migration
 * 0640; Chew 2026-10-03, docs/finance/MASTER.md §3.6, after Houzs Part 10 §9).
 *
 * What was owed to each supplier on a day, by how old its bills were: this
 * month, then whole months back (or 30-day steps), by the bill's date or its
 * due date. What a supplier's balance holds beyond its open bills sits in
 * `Not tied to a bill`: money paid ahead of a bill reads below zero, money
 * owed with no bill behind it (an opening balance) above. So each row adds up
 * to the supplier's balance in the books, and the rows add up to the payables
 * control accounts; the footer prints both and the difference.
 *
 * Every figure is the shared AP-aging arithmetic's (Law D); this page only
 * prints it. Opening a row lists the supplier's open bills.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AGING_COLUMN_COUNT,
  apAgingReport,
  type AgingBasis,
  type AgingColumns,
  type ApAgingAnswer,
  type ApAgingReport,
  type ApAgingRow,
} from "@carres/shared/ap-aging";
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
import { creditorKindWord } from "../payables/payables-words";
import { ReadFailed } from "../payables/PayablesParts";
import { readDay } from "./period";

export const AGING_COLUMN_WORDS: Record<AgingColumns, readonly string[]> = {
  month: ["This month", "1 month", "2 months", "3 months", "4 months and over"],
  day: ["0 to 30 days", "31 to 60 days", "61 to 90 days", "91 to 120 days", "Over 120 days"],
};
const AMOUNT = REGISTER_FIELD_WIDTH.amount;
const link = "text-kit-blue-11 underline underline-offset-2";
const money = (n: number) => (Math.round(n * 100) === 0 ? "" : rm(n));
const sum = (rows: ApAgingRow[], pick: (r: ApAgingRow) => number) => rm(rows.reduce((t, r) => t + Math.round(pick(r) * 100), 0) / 100);

function Bills({ row, columns }: { row: ApAgingRow; columns: AgingColumns }) {
  const cols: readonly Column<ApAgingRow["bills"][number]>[] = [
    { key: "bill", label: "Bill No", width: "150px", cell: (b) => <Link className={link} to={`/finance/bills/${b.billId}`}>{b.billNo}</Link> },
    { key: "invoice", label: "Supplier invoice", width: "150px", cell: (b) => b.supplierInvoiceNo ?? "" },
    { key: "date", label: "Bill date", width: "120px", cell: (b) => fmtDate(b.billDate) },
    { key: "due", label: "Due date", width: "120px", cell: (b) => (b.dueDate ? fmtDate(b.dueDate) : "") },
    { key: "total", label: "Bill total", width: "130px", align: "right", numeric: true, cell: (b) => rm(b.total) },
    { key: "open", label: "Still owed", width: "130px", align: "right", numeric: true, cell: (b) => rm(b.open) },
    { key: "column", label: "Age", width: "auto", cell: (b) => AGING_COLUMN_WORDS[columns][b.column] },
  ];
  return <div className="p-4 text-body" data-testid={`ap-aging-bills-${row.supplierId}`}>
    <DataTable label={`${row.name} open bills`} testId="ap-aging-bills" rows={row.bills} columns={cols} rowId={(b) => b.billId}
      empty="No bill is open. The balance is money not tied to a bill." />
  </div>;
}

export default function ApAging() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const asAt = readDay(params.get("asAt")) ?? today;
  const basis: AgingBasis = params.get("by") === "due" ? "due" : "bill";
  const columns: AgingColumns = params.get("columns") === "day" ? "day" : "month";
  const set = (key: string, value: string | null) => setParams((before) => {
    const next = new URLSearchParams(before);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  });

  const query = useQuery({
    queryKey: ["finance", "payables", "aging", asAt],
    queryFn: () => apiFetch<ApAgingAnswer>(`/api/finance/payables/aging?${new URLSearchParams({ asAt }).toString()}`),
    retry: (count: number, error: unknown) => ![409, 422].includes((error as { status?: number }).status ?? 0) && count < 2,
  });
  const report = useMemo((): ApAgingReport | "unreadable" | null => {
    if (!query.data) return null;
    try {
      return apAgingReport(query.data, basis, columns);
    } catch {
      return "unreadable";
    }
  }, [query.data, basis, columns]);
  const notStarted = (query.error as { status?: number } | null)?.status === 409;

  const gridColumns = useMemo<DataGridColumn<ApAgingRow>[]>(() => [
    { key: "supplier", label: "Supplier", width: 240, accessor: (r) => r.name,
      searchValue: (r) => r.name, exportValue: (r) => r.name },
    { key: "kind", label: "Creditor Type", width: 140, accessor: (r) => creditorKindWord(r.kind),
      filterValue: (r) => creditorKindWord(r.kind), filterType: "enum", defaultHidden: true },
    { key: "balance", label: "Balance", width: AMOUNT, align: "right", accessor: (r) => rm(r.balance),
      numberValue: (r) => r.balance, exportValue: (r) => r.balance, footerTotal: (v) => sum(v, (r) => r.balance) },
    ...Array.from({ length: AGING_COLUMN_COUNT }, (_, i): DataGridColumn<ApAgingRow> => {
      const word = AGING_COLUMN_WORDS[columns][i]!;
      const lines = word.split(" ");
      return {
        key: `c${i}`, label: word, width: AMOUNT, align: "right",
        headerLines: lines.length > 2 ? [lines.slice(0, 2).join(" "), lines.slice(2).join(" ")] as const : undefined,
        accessor: (r) => money(r.cells[i]!), numberValue: (r) => r.cells[i]!, exportValue: (r) => r.cells[i]!,
        footerTotal: (v) => sum(v, (r) => r.cells[i]!),
      };
    }),
    { key: "notTied", label: "Not tied to a bill", headerLines: ["Not tied", "to a bill"], width: AMOUNT, align: "right",
      accessor: (r) => money(r.notTied), numberValue: (r) => r.notTied, exportValue: (r) => r.notTied,
      footerTotal: (v) => sum(v, (r) => r.notTied) },
  ], [columns]);

  const ready = report !== null && report !== "unreadable" ? report : null;
  const controls = ready?.controls.map((c) => c.code).join(" + ") ?? "";

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="ap-aging-destination-header" word="AP Aging" docTitle="AP Aging · Carres" />
    {notStarted ? <div role="alert" className="p-6 text-body"><p>The ledger has no start date yet. Nothing can be totalled.</p></div>
    : query.isError || report === "unreadable" ? <ReadFailed what="AP aging" onRetry={() => void query.refetch()} />
    : <>
      {ready && ready.difference !== 0 && <div role="status" data-testid="ap-aging-differs"
        className="flex h-10 shrink-0 items-center gap-2 bg-kit-amber-3 px-4 text-body text-kit-amber-11">
        ⚠ The suppliers differ from the books by {rm(Math.abs(ready.difference))}.
        <Link className="underline underline-offset-2" to="/finance/ledger/self-check">Open Self-check</Link>
      </div>}
      <ListPageShell register>
        <DataGrid rows={ready?.rows ?? []} columns={gridColumns} rowKey={(r) => r.supplierId}
          rowTestId={(r) => `ap-aging-row-${r.supplierId}`}
          storageKey="carres.finance.ap-aging.v1" appearance="reference" exportName={`AP Aging ${asAt}`}
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess} wrapToolbar
          searchPlaceholder="Search suppliers…" expandTitle="Show bills"
          expandable={{ renderExpansion: (r) => <Bills row={r} columns={columns} /> }}
          toolbarStart={<div className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <span className="block text-label text-kit-slate-11">As of</span>
              <DateField value={asAt} onChange={(iso) => set("asAt", iso && iso !== today ? iso : null)} aria-label="As of" />
            </div>
            <div className="w-40"><Select id="ap-aging-by" label="Age by" value={basis}
              onValueChange={(v) => set("by", v === "due" ? "due" : null)}
              options={[{ value: "bill", label: "Bill date" }, { value: "due", label: "Due date" }]} /></div>
            <div className="w-40"><Select id="ap-aging-columns" label="Columns" value={columns}
              onValueChange={(v) => set("columns", v === "day" ? "day" : null)}
              options={[{ value: "month", label: "By month" }, { value: "day", label: "By days" }]} /></div>
          </div>}
          emptyMessage={`Nothing was owed to a supplier on ${fmtDate(asAt)}.`}
          statusSummary={(visible) => <span data-testid="ap-aging-summary">
            {visible.length} {visible.length === 1 ? "supplier" : "suppliers"}
            {ready ? ` · In the books (${controls}) on ${fmtDate(asAt)}: ${rm(ready.controlsTotal)} · Difference ${rm(Math.abs(ready.difference))}` : ""}
          </span>} />
      </ListPageShell>
    </>}
  </div>;
}
