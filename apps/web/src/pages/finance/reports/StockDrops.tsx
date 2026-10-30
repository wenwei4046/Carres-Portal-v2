/**
 * Finance → Reports → Stock drops, at `/finance/reports/stock-drops`
 * (migration 0714; YH 2026-10-26: a write-off posts no journal, Finance gets a
 * read-only list instead).
 *
 * Every Unit Stock wrote off on a Stock Adjustment (a Stock Take's difference
 * included), newest first, each valued at its PO line cost the way Stock value
 * values stock (0643). A Unit with no cost recorded says so and is never
 * valued as zero; the total is the known value only. The value is worked out
 * by the shared stock-drops arithmetic (Law D); this page only prints it.
 * Nothing is posted and nothing is saved.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { StockDropRow, StockDropsTotal } from "@carres/shared/stock-drops";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { REGISTER_FIELD_WIDTH as W } from "@/components/register/register-field-widths";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import ModuleHeader from "@/pages/operation/components/ModuleHeader";
import { ReadFailed } from "../payables/PayablesParts";
import { FINANCE_WIDTH, amountCell } from "../finance-widths";
import { useFinancePersonalLayouts } from "../finance-layouts";

type Answer = { rows: StockDropRow[]; total: StockDropsTotal };

const NO_COST = "No cost recorded";
const money = (v: number | null) => (v === null ? NO_COST : rm(v));

export default function StockDrops() {
  const personalLayouts = useFinancePersonalLayouts("finance_stock_drops");
  const query = useQuery({
    queryKey: ["finance", "ledger", "stock-drops"],
    queryFn: () => apiFetch<Answer>("/api/finance/ledger/stock-drops"),
  });

  const columns = useMemo<DataGridColumn<StockDropRow>[]>(() => [
    { key: "adjustment", label: "Adjustment No", width: W.documentNo, accessor: (r) => r.adjustment_no,
      searchValue: (r) => r.adjustment_no },
    { key: "date", label: "Date", width: 120, accessor: (r) => fmtDate(r.dropped_at),
      sortFn: (a, b) => a.dropped_at.localeCompare(b.dropped_at) },
    { key: "site", label: "Site", width: W.stockLocation, accessor: (r) => r.site_name ?? "",
      filterValue: (r) => r.site_name ?? "", filterType: "enum", searchValue: (r) => r.site_name ?? "" },
    { key: "reason", label: "Reason", width: 220, accessor: (r) => r.reason, searchValue: (r) => r.reason },
    { key: "unit", label: "Unit ID", width: W.unitId, accessor: (r) => r.unit_code, searchValue: (r) => r.unit_code },
    { key: "sku", label: "SKU", width: 170, accessor: (r) => r.sku, searchValue: (r) => r.sku },
    { key: "qty", label: "Qty", width: W.qty, align: "right", accessor: (r) => String(r.qty), numberValue: (r) => r.qty },
    { key: "cost", label: "Cost", width: FINANCE_WIDTH.amount, align: "right", accessor: (r) => money(r.unit_cost),
      numberValue: (r) => r.unit_cost, exportValue: (r) => r.unit_cost ?? NO_COST },
    { key: "value", label: "Value deducted", width: FINANCE_WIDTH.amount, align: "right", accessor: (r) => money(r.value),
      numberValue: (r) => r.value, exportValue: (r) => r.value ?? NO_COST,
      footerTotal: (rows) => amountCell(rows.reduce((s, r) => s + Math.round((r.value ?? 0) * 100), 0) / 100) },
  ], []);

  const total = query.data?.total;
  return <div className="flex h-full min-h-0 flex-col">
    <ModuleHeader destinationHeader testId="stock-drops-destination-header" word="Stock drops" docTitle="Stock drops · Carres" />
    {query.isError ? <ReadFailed what="The stock drops" onRetry={() => void query.refetch()} /> : <>
      <p className="shrink-0 px-4 pt-3 text-body text-kit-slate-11" data-testid="stock-drops-note">
        The Units Stock wrote off, each at its PO line cost. Nothing is posted to the ledger.
        {total ? ` Known value ${rm(total.value / 100)}` : ""}
        {total && total.noCost > 0 ? ` · ${total.noCost} with no cost recorded` : ""}
        {total ? "." : ""}
      </p>
      <ListPageShell register>
        <DataGrid rows={query.data?.rows ?? []} columns={columns} rowKey={(r) => r.key}
          rowTestId={(r) => `stock-drops-row-${r.unit_code}`}
          storageKey="carres.finance.stock-drops.v1" appearance="reference" look="finance" personalLayouts={personalLayouts} fillColumn="reason" exportName="Stock drops"
          groupBanner={false} stickyIdentity isLoading={!query.isSuccess} wrapToolbar
          searchPlaceholder="Search adjustment, reason or Unit ID…"
          emptyMessage="Stock has written off no Unit."
          statusSummary={(visible) => {
            const noCost = visible.filter((r) => r.value === null).length;
            const sen = visible.reduce((s, r) => s + Math.round((r.value ?? 0) * 100), 0);
            return <span data-testid="stock-drops-footer">
              {visible.length} {visible.length === 1 ? "Unit" : "Units"} · {rm(sen / 100)}
              {noCost > 0 ? ` · ${noCost} with no cost recorded` : ""}
            </span>;
          }} />
      </ListPageShell>
    </>}
  </div>;
}
