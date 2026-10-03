/**
 * Finance → Reports → Stock value, at `/finance/reports/stock-value`
 * (migration 0643; Chew 2026-10-03, docs/finance/MASTER.md §3.5).
 *
 * PROVISIONAL: what Carres's stock was worth at a month end, worked out from
 * Stock's own Units until Stock's Month-end Stock Confirmation exists (Stock
 * MASTER §12.10). Four groups — warehouse, showroom, in transit, sent for
 * repair — and the Units the database could not place. Each Unit is valued at
 * its PO line cost; a Unit with no cost recorded is counted, never valued as
 * zero, and its cells stay empty.
 *
 * Every total is the shared stock-value arithmetic's (Law D); this page only
 * prints it. Nothing is saved: Stock MASTER §9 keeps the month-end total
 * Stock's.
 */
import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { opsStockStatusLabel } from "@carres/shared/stock-hold";
import {
  lastDayOf,
  STOCK_BUCKET_WORD,
  stockValueReport,
  type StockBucketTotal,
  type StockValueAnswer,
  type StockValueReport,
  type StockValueUnit,
} from "@carres/shared/stock-value";
import DataTable, { type Column } from "@/components/kit/DataTable";
import Select from "@/components/kit/Select";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import { apiFetch } from "@/lib/api";
import { appTodayIso, fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { ReadFailed } from "../payables/PayablesParts";

/** The month before today's, as YYYY-MM: the last month that has ended. */
export function lastEndedMonth(today: string): string {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** This month and the 23 before it, newest first, plus the month on screen. */
export function stockMonths(today: string, shown: string | null): string[] {
  const out = new Set<string>();
  let [y, m] = today.split("-").map(Number) as [number, number];
  for (let i = 0; i < 24; i += 1) {
    out.add(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  if (shown) out.add(shown);
  return [...out].sort().reverse();
}

const amount = (sen: number) => rm(sen / 100);
const costOf = (u: StockValueUnit) => (u.unit_cost === null ? null : Number(u.unit_cost));
const valueOf = (u: StockValueUnit) => (u.value === null ? null : Number(u.value));

const SUMMARY: readonly Column<StockBucketTotal>[] = [
  { key: "bucket", label: "Group", width: "150px", cell: (b) => STOCK_BUCKET_WORD[b.bucket] },
  { key: "units", label: "Units", width: "80px", align: "right", numeric: true, cell: (b) => String(b.units) },
  { key: "value", label: "Value", width: "140px", align: "right", numeric: true, cell: (b) => amount(b.value) },
  { key: "noCost", label: "No cost recorded", width: "150px", align: "right", numeric: true,
    cell: (b) => (b.noCost === 0 ? "" : String(b.noCost)) },
];

export default function StockValue() {
  const [params, setParams] = useSearchParams();
  const today = appTodayIso();
  const asked = params.get("month");
  const month = asked && /^\d{4}-\d{2}$/.test(asked) ? asked : lastEndedMonth(today);
  const monthEnd = lastDayOf(month);
  const notEnded = monthEnd >= today;

  const query = useQuery({
    queryKey: ["finance", "ledger", "stock-value", monthEnd],
    queryFn: () => apiFetch<StockValueAnswer>(`/api/finance/ledger/stock-value?${new URLSearchParams({ monthEnd }).toString()}`),
  });
  const report = useMemo((): StockValueReport | "unreadable" | null => {
    if (!query.data) return null;
    try {
      return stockValueReport(query.data);
    } catch {
      return "unreadable";
    }
  }, [query.data]);
  const ready = report !== null && report !== "unreadable" ? report : null;

  const columns = useMemo<DataGridColumn<StockValueUnit>[]>(() => [
    { key: "unit", label: "Unit ID", width: W.unitId, accessor: (u) => u.unit_code,
      searchValue: (u) => u.unit_code, exportValue: (u) => u.unit_code },
    { key: "sku", label: "SKU", width: 170, accessor: (u) => u.sku, searchValue: (u) => u.sku },
    { key: "bucket", label: "Group", width: 130, accessor: (u) => STOCK_BUCKET_WORD[u.bucket],
      filterValue: (u) => STOCK_BUCKET_WORD[u.bucket], filterType: "enum" },
    { key: "status", label: "Status", width: 110, accessor: (u) => opsStockStatusLabel(u.status),
      filterValue: (u) => opsStockStatusLabel(u.status), filterType: "enum" },
    { key: "site", label: "Site", width: W.stockLocation, accessor: (u) => u.site_name ?? "",
      filterValue: (u) => u.site_name ?? "", filterType: "enum", searchValue: (u) => u.site_name ?? "" },
    { key: "holder", label: "Held by", width: 150, accessor: (u) => u.holder_name ?? "", defaultHidden: true },
    { key: "qty", label: "Qty", width: W.qty, align: "right", accessor: (u) => String(u.qty), numberValue: (u) => u.qty },
    { key: "cost", label: "Cost", width: W.amount, align: "right",
      accessor: (u) => { const c = costOf(u); return c === null ? "" : rm(c); },
      numberValue: costOf, exportValue: (u) => costOf(u) ?? "" },
    { key: "value", label: "Value", width: W.amount, align: "right",
      accessor: (u) => { const v = valueOf(u); return v === null ? "" : rm(v); },
      numberValue: valueOf, exportValue: (u) => valueOf(u) ?? "",
      footerTotal: (rows) => amount(rows.reduce((s, u) => s + Math.round((valueOf(u) ?? 0) * 100), 0)) },
    { key: "po", label: "PO No", width: W.documentNo, accessor: (u) => u.po_no ?? "", searchValue: (u) => u.po_no ?? "" },
  ], []);

  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="stock-value-destination-header" word="Stock value" docTitle="Stock value · Carres" />
    {query.isError || report === "unreadable" ? <ReadFailed what="The stock value" onRetry={() => void query.refetch()} /> : <>
      <div className="flex shrink-0 flex-col gap-3 px-4 pt-3" data-testid="stock-value-summary">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <Select id="stock-value-month" label="Month" value={month}
              onValueChange={(m) => setParams((before) => {
                const next = new URLSearchParams(before);
                if (m === lastEndedMonth(today)) next.delete("month"); else next.set("month", m);
                return next;
              })}
              options={stockMonths(today, month).map((m) => ({ value: m, label: fmtMonth(m) }))} />
          </div>
          <p className="pb-2 text-body text-kit-slate-11" data-testid="stock-value-note">
            Provisional. Worked out from Stock's Units, at the end of {fmtDate(monthEnd, { year: "always" })}, until Stock confirms its month-end count.
            {notEnded ? " This month has not ended, so the Units are as they are now." : ""}
            {query.data && query.data.left_out.consignment_units > 0
              ? ` ${query.data.left_out.consignment_units} consignment ${query.data.left_out.consignment_units === 1 ? "Unit is" : "Units are"} left out: they belong to their suppliers.`
              : ""}
          </p>
        </div>
        {/* Content decides the width (sizing "content"): five short groups and three figures. */}
        <DataTable label="Stock value by group" testId="stock-value-groups" rows={ready?.buckets ?? []} columns={SUMMARY}
          sizing="content" rowId={(b) => b.bucket} empty="Loading the stock value…"
          totals={ready ? { label: "Total", cell: (c) => (c.key === "bucket" ? "Total" : c.key === "units" ? String(ready.total.units)
            : c.key === "value" ? amount(ready.total.value) : c.key === "noCost" ? (ready.total.noCost === 0 ? "" : String(ready.total.noCost)) : null) } : undefined} />
      </div>
      <ListPageShell register>
        <DataGrid rows={query.data?.units ?? []} columns={columns} rowKey={(u) => u.id}
          rowTestId={(u) => `stock-value-row-${u.unit_code}`}
          storageKey="carres.finance.stock-value.v1" appearance="reference" exportName={`Stock value ${monthEnd}`}
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess} wrapToolbar
          searchPlaceholder="Search Units…"
          emptyMessage={`Carres held no Unit at the end of ${fmtDate(monthEnd, { year: "always" })}.`}
          statusSummary={(visible) => {
            const noCost = visible.filter((u) => u.unit_cost === null).length;
            const sen = visible.reduce((s, u) => s + Math.round((valueOf(u) ?? 0) * 100), 0);
            return <span data-testid="stock-value-footer">
              {visible.length} {visible.length === 1 ? "Unit" : "Units"} · {amount(sen)}
              {noCost > 0 ? ` · ${noCost} with no cost recorded` : ""}
            </span>;
          }} />
      </ListPageShell>
    </>}
  </div>;
}
