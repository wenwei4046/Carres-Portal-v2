import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  MRP_WORDS as W,
  categoryLabel,
  mrpCsv,
  mrpRows,
  type MrpRow,
} from "@carres/shared";
import Button from "@/components/kit/Button";
import DataTable, { type Column } from "@/components/kit/DataTable";
import EmptyState from "@/components/kit/EmptyState";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import { useMrp } from "@/lib/queries";
import PurchasingTabs from "./PurchasingTabs";
import { RailGroup, RailItem } from "./components/workspace-rail";

/**
 * Purchasing → MRP (YH, 30 Oct 2026; Purchasing MASTER §5.1).
 *
 * One read-only table: what is Needed, In Stock, On PO and short, per SKU, with
 * the Sales Orders under each row. The numbers come whole from the server; this
 * page only filters and prints them. It has no action that writes anything.
 */

// design-standard: not-a-list-page — this is a REPORT (grouped figures), the
// same frame as OperationPurchasingReport.

const NO_DATE = "none";

function download(csv: string) {
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "mrp.csv";
  a.click();
  URL.revokeObjectURL(url);
}

const number = (key: keyof MrpRow & string, label: string, width: string): Column<MrpRow> => ({
  key,
  label,
  width,
  align: "right",
  numeric: true,
  cell: (r) => r[key] as number,
});

const COLUMNS: Column<MrpRow>[] = [
  { key: "sku", label: W.sku, width: "200px", cell: (r) => <span className="truncate">{r.sku}</span> },
  { key: "item", label: W.item, width: "220px", cell: (r) => <span className="truncate">{r.item}</span> },
  { key: "category", label: W.category, width: "90px", cell: (r) => categoryLabel(r.category) },
  { key: "supplier", label: W.supplier, width: "150px", cell: (r) => <span className="truncate">{r.supplierName ?? W.notRecorded}</span> },
  number("needed", W.needed, "72px"),
  number("inStock", W.inStock, "72px"),
  number("onPo", W.onPo, "64px"),
  number("shortage", W.shortage, "76px"),
  number("freeStock", W.freeStock, "84px"),
];

export default function OperationMrp() {
  const q = useMrp();
  const lines = useMemo(() => q.data?.lines ?? [], [q.data]);
  const free = useMemo(() => q.data?.freeStockBySku ?? {}, [q.data]);

  const [shortagesOnly, setShortagesOnly] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  const rows = useMemo(
    () => mrpRows(lines, free, { category, month, shortagesOnly }),
    [lines, free, category, month, shortagesOnly],
  );
  const categories = useMemo(() => [...new Set(lines.map((l) => l.category))].sort(), [lines]);
  const months = useMemo(
    () => [...new Set(lines.map((l) => l.delivery?.slice(0, 7) ?? NO_DATE))].sort(),
    [lines],
  );
  const shortageCount = useMemo(
    () => mrpRows(lines, free, { category: null, month: null, shortagesOnly: true }).length,
    [lines, free],
  );
  const filtering = shortagesOnly || category != null || month != null;
  const sum = (key: "needed" | "inStock" | "onPo" | "shortage") =>
    rows.reduce((n, r) => n + r[key], 0);

  return (
    <div className="h-full min-h-0 flex flex-col bg-kit-canvas" data-testid="mrp-page">
      <PurchasingTabs
        right={
          <Button variant="ghost" size="sm" disabled={rows.length === 0} onClick={() => download(mrpCsv(rows))} data-testid="mrp-export">
            {W.export}
          </Button>
        }
      />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <nav
          className="w-[200px] shrink-0 min-h-0 overflow-y-auto border-r border-kit-slate-5 px-3 py-3 flex flex-col gap-4 bg-white"
          aria-label={W.page}
          data-testid="mrp-nav"
        >
          <RailGroup title={W.show}>
            <RailItem label={W.all} active={!shortagesOnly} onClick={() => setShortagesOnly(false)} testId="mrp-show-all" />
            <RailItem label={W.shortages} count={shortageCount} active={shortagesOnly} onClick={() => setShortagesOnly(true)} testId="mrp-show-shortages" />
          </RailGroup>
          <RailGroup title={W.category}>
            <RailItem label={W.all} active={category == null} onClick={() => setCategory(null)} testId="mrp-category-all" />
            {categories.map((c) => (
              <RailItem key={c} label={categoryLabel(c)} active={category === c} onClick={() => setCategory(category === c ? null : c)} testId={`mrp-category-${c}`} />
            ))}
          </RailGroup>
          <RailGroup title={W.delivery}>
            <RailItem label={W.all} active={month == null} onClick={() => setMonth(null)} testId="mrp-month-all" />
            {months.map((m) => (
              <RailItem key={m} label={m === NO_DATE ? W.notRecorded : fmtMonth(m)} active={month === m} onClick={() => setMonth(month === m ? null : m)} testId={`mrp-month-${m}`} />
            ))}
          </RailGroup>
        </nav>

        <div className="flex-1 min-w-0 flex flex-col min-h-0 px-4 pt-3 pb-3">
          <DataTable<MrpRow>
            rows={rows}
            columns={COLUMNS}
            sizing="content"
            rowId={(r) => r.sku}
            label={W.page}
            loading={q.isLoading}
            empty={
              q.isError ? (
                <EmptyState
                  title={W.loadFailed}
                  action={<Button variant="ghost" size="sm" onClick={() => void q.refetch()}>{W.tryAgain}</Button>}
                />
              ) : (
                <EmptyState
                  title={W.empty}
                  action={
                    filtering ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShortagesOnly(false);
                          setCategory(null);
                          setMonth(null);
                        }}
                      >
                        {W.clearFilters}
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
            expansion={{
              expanded: open,
              onToggle: (id) =>
                setOpen((prev) => {
                  const n = new Set(prev);
                  if (n.has(id)) n.delete(id);
                  else n.add(id);
                  return n;
                }),
              label: (r) => r.sku,
              render: (r) => (
                <div className="flex flex-col gap-1" data-testid={`mrp-detail-${r.sku}`}>
                  {r.lines.map((l) => (
                    <Link
                      key={l.lineId}
                      to={`/operation/orders/so/${l.orderId}`}
                      className="flex items-center gap-3 rounded-control px-2 py-1 text-body hover:bg-kit-slate-3"
                    >
                      <span className="w-24 shrink-0 tabular-nums">{l.so != null ? `SO-${l.so}` : W.notRecorded}</span>
                      <span className="min-w-0 flex-1 truncate">{l.customer ?? W.notRecorded}</span>
                      <span className="w-24 shrink-0 tabular-nums">{l.delivery ? fmtDate(l.delivery) : W.notRecorded}</span>
                      <span className="w-16 shrink-0 text-right tabular-nums" title={W.needed}>{l.needed}</span>
                      <span className="w-16 shrink-0 text-right tabular-nums" title={W.inStock}>{l.inStock}</span>
                      <span className="w-16 shrink-0 text-right tabular-nums" title={W.onPo}>{l.onPo}</span>
                      <span className="w-16 shrink-0 text-right tabular-nums" title={W.shortage}>{l.shortage}</span>
                    </Link>
                  ))}
                </div>
              ),
            }}
            totals={{
              label: W.total,
              cell: (c) =>
                c.key === "sku"
                  ? W.total
                  : c.key === "needed" || c.key === "inStock" || c.key === "onPo" || c.key === "shortage"
                    ? sum(c.key)
                    : "",
            }}
          />
          <p className="pt-2 text-meta text-kit-slate-11" data-testid="mrp-note">{W.note}</p>
        </div>
      </div>
    </div>
  );
}
