/**
 * Reports → Delivery return lines. Follows Houzs
 * frontend/src/pages/scm-v2/DeliveryReturnDetailListing.tsx:32-153 per Weisiang's
 * ruling (2026-10-22): clear Carres rules, implement Houzs. Every Houzs column is
 * shown; Unit Price, Line Refund, Condition and Received are stored on the return
 * by 0716 (Houzs delivery-returns.ts:733-760,950-957).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ListPageShell from "@/components/ListPageShell";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import { apiFetch } from "@/lib/api";
import { fmtDate } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";
import { LoadFailed } from "@/pages/finance/other-money-in/parts";
import ModuleHeader from "./components/ModuleHeader";
import { skuKey, useCatalogNames } from "./sales-order-register-readings";
import { deliveryReturnLinesOf, type DeliveryReturnRow, type ReturnLine } from "./delivery-return-lines";
import { refundLabel } from "./DeliveryReturns";

export const CONDITION_WORD: Record<string, string> = { NEW: "New", OPENED: "Opened", DAMAGED: "Damaged", DEFECTIVE: "Defective" };
const PAGE = "Delivery return lines";
const NOTE = "Every recorded return is listed.";
const day = (v: string | null) => v?.slice(0, 10) ?? "";
const sumOf = (rows: ReturnLine[], f: (r: ReturnLine) => number | null) => rm(rows.reduce((t, r) => t + (f(r) ?? 0), 0));
const NO_PRICE = "No price recorded";
const priceText = (v: number | null) => (v === null ? NO_PRICE : rm(v));

const COLUMNS: DataGridColumn<ReturnLine>[] = [
  { key: "doc", label: "Return No", width: 150, filterType: "numbering", filterValue: (r) => r.docNo, exportValue: (r) => r.docNo, accessor: (r) => r.docNo },
  { key: "date", label: "Return date", width: 120, accessor: (r) => fmtDate(r.date), filterType: "date", dateValue: (r) => r.date,
    sortFn: (a, b) => a.date.localeCompare(b.date), exportValue: (r) => day(r.date) },
  { key: "do", label: "DO No", width: 140, accessor: (r) => r.doNo },
  { key: "so", label: "SO no.", width: 110, accessor: (r) => (r.so ? `SO-${r.so}` : ""), exportValue: (r) => (r.so ? `SO-${r.so}` : "") },
  { key: "customer", label: "Customer", width: 180, accessor: (r) => r.customer },
  { key: "reason", label: "Reason", width: 200, accessor: (r) => r.reason },
  { key: "sku", label: "Item code", width: 130, accessor: (r) => r.sku },
  { key: "item", label: "Item", width: 200, accessor: (r) => r.item },
  { key: "units", label: "Units", width: 180, accessor: (r) => r.units.join(", "), exportValue: (r) => r.units.join(", ") },
  { key: "condition", label: "Condition", width: 110, accessor: (r) => CONDITION_WORD[r.condition] ?? r.condition, filterType: "enum" },
  { key: "qty", label: "Qty", width: 80, align: "right", accessor: (r) => r.qty, numberValue: (r) => r.qty, exportValue: (r) => r.qty,
    footerTotal: (v) => v.reduce((t, r) => t + r.qty, 0) },
  { key: "unitPrice", label: "Unit price", width: 120, align: "right", accessor: (r) => priceText(r.unitPrice), numberValue: (r) => r.unitPrice,
    sortFn: (a, b) => (a.unitPrice ?? -1) - (b.unitPrice ?? -1), exportValue: (r) => r.unitPrice ?? NO_PRICE },
  { key: "lineRefund", label: "Line refund", width: 130, align: "right", accessor: (r) => priceText(r.lineRefund), numberValue: (r) => r.lineRefund,
    sortFn: (a, b) => (a.lineRefund ?? -1) - (b.lineRefund ?? -1), exportValue: (r) => r.lineRefund ?? NO_PRICE, footerTotal: (v) => sumOf(v, (r) => r.lineRefund) },
  { key: "site", label: "Site", width: 140, accessor: (r) => r.site, filterType: "enum" },
  { key: "received", label: "Received", width: 120, accessor: (r) => fmtDate(r.receivedAt), filterType: "date", dateValue: (r) => r.receivedAt,
    exportValue: (r) => day(r.receivedAt) },
  { key: "refunded", label: "Refunded", width: 120, accessor: (r) => fmtDate(r.refundedAt), filterType: "date", dateValue: (r) => r.refundedAt,
    exportValue: (r) => day(r.refundedAt) },
  /* Houzs repeats the return's pending refund on each of its lines (reports.ts:660-666),
     so this column has no footer total: summing it would count a return once per line. */
  { key: "pending", label: "Pending refund", width: 130, align: "right", accessor: (r) => rm(r.pendingRefund), numberValue: (r) => r.pendingRefund,
    sortFn: (a, b) => a.pendingRefund - b.pendingRefund, exportValue: (r) => r.pendingRefund },
  { key: "refund", label: "Refund status", width: 130, accessor: (r) => refundLabel(r.refundStatus), exportValue: (r) => refundLabel(r.refundStatus), filterType: "enum" },
];

export function DeliveryReturnLinesReport() {
  const q = useQuery({
    queryKey: ["delivery-returns"],
    queryFn: () => apiFetch<{ returns: DeliveryReturnRow[] }>("/api/operation/delivery-returns"),
  });
  const names = useCatalogNames();
  const nameOf = useMemo(() => (sku: string) => names.get(skuKey(sku))?.name, [names]);
  const rows = useMemo(() => deliveryReturnLinesOf(q.data?.returns ?? [], nameOf), [q.data, nameOf]);
  const returns = new Set(rows.map((r) => r.docNo)).size;
  return <div className="flex h-full min-h-0 flex-col" data-testid="dr-lines-report">
    <ModuleHeader destinationHeader testId="dr-lines-header" word={PAGE} docTitle={`${PAGE} · Carres`} />
    <ListPageShell register>
      <DataGrid rows={rows} columns={COLUMNS} rowKey={(r) => r.key} storageKey="carres.reports.dr-lines.v2"
        appearance="reference" exportName={PAGE} groupBanner={false} leadingColumns={{ date: "date", identity: "doc" }}
        sortDefault={{ key: "date", dir: "desc" }} isLoading={q.isPending}
        errorState={q.isError ? <LoadFailed what={PAGE} onRetry={() => void q.refetch()} /> : undefined}
        emptyMessage={`No lines yet. ${NOTE}`}
        statusSummary={(visible) => <span data-testid="dr-lines-summary">{visible.length} of {rows.length} lines · {returns} returns</span>} />
    </ListPageShell>
  </div>;
}
