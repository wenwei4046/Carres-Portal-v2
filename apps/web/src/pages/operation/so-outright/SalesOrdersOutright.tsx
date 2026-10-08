/**
 * Sales Orders → Outright — the list (owner-confirmed handoff, Jess 2026-10-08:
 * `screenshots/1-list.png`, UI Kit "Table (list page)", v8 list markup).
 *
 *   [Summary 240] [ Open Delivered All · Sales Order view  chips ····· ▥ ⋮ Tasks 5 ]
 *                 [ ┌ table card: sticky head · 54px rows · footer 44 ───────────┐ ]
 *
 * Data is the Sales Order register's real read (every proceeded order, the
 * catalogue names, the server's stock / payment / case facts). Nothing here
 * writes. A row click opens the order; Ctrl/⌘-click opens it in a new tab.
 */
import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { goodsCategoryWordOf } from "@carres/shared";
import MIcon from "@/components/carres/MIcon";
import CPill from "@/components/carres/CPill";
import CPopover, { CMenuGroup, CMenuItem } from "@/components/carres/CPopover";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import { useSalesOrderRegisterFacts, useSalesOrderRegisterOrders } from "@/lib/queries";
import { buildRegisterRow, type RegisterRow } from "../sales-order-columns";
import { isRental, lineName } from "../sales-order-facts";
import { paymentStatusOf, skuKey, useCatalogNames } from "../SalesOrdersRegister";
import SalesOrderReadFailure from "../SalesOrderReadFailure";
import { printSalesOrdersOrSay } from "../record-print";
import ModuleHeader from "../components/ModuleHeader";
import { TasksPill } from "../components/ShellTasks";
import {
  COLUMNS,
  LAYOUTS,
  isDelivered,
  pcsOf,
  rm,
  type Cell,
  type CellContext,
  type LayoutKey,
} from "./outright-columns";

type Tab = "open" | "delivered" | "all";
const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "delivered", label: "Delivered" },
  { key: "all", label: "All" },
];
const PAGE_SIZES = [20, 50, 100] as const;
const SUMMARY_KEY = "carres.outright.summary";
const VIEW_KEY = (user: string) => `carres.outright.view.${user}`;

/* The summary's goods words — v8 ITEMS. `Bed frame` is the design's word. */
const SUMMARY_CATS = ["Mattress", "Bed frame", "Sofa", "Pillow", "Mattress protector", "Others"] as const;
function summaryCat(line: Parameters<typeof goodsCategoryWordOf>[0]): (typeof SUMMARY_CATS)[number] | null {
  const word = goodsCategoryWordOf(line);
  if (word === "Service") return null;
  if (word === "Bedframe") return "Bed frame";
  if (word === "Mattress" || word === "Sofa" || word === "Pillow" || word === "Mattress protector") return word;
  return "Others";
}

const monthKey = (iso: string) => {
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(d);
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}`;
};
const shiftMonth = (key: string, by: number) => {
  const [y, m] = key.split("-").map(Number);
  const at = y! * 12 + (m! - 1) + by;
  return `${Math.floor(at / 12)}-${String((at % 12) + 1).padStart(2, "0")}`;
};
const monthWord = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m! - 1]} ${y}`;
};
const time12 = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", minute: "2-digit" });

function readStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* a blocked storage may not break the list */
  }
}

export default function SalesOrdersOutright() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const userId = useAuth((s) => s.user?.id ?? "anon");

  /* ── the real read: every proceeded order, as the register reads it ── */
  const seededSearch = params.get("search") ?? "";
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useSalesOrderRegisterOrders(
    seededSearch ? { stage: "proceeded", search: seededSearch } : { stage: "proceeded" },
  );
  const catalogNames = useCatalogNames();
  const factsQ = useSalesOrderRegisterFacts(true);
  const facts = factsQ.data?.facts ?? null;
  const all = useMemo<RegisterRow[]>(
    () =>
      (data?.orders ?? [])
        .filter((o) => !isRental(o))
        .map((o) => ({
          ...buildRegisterRow(o, o.ops_delivery_orders ?? [], (sku) => catalogNames.get(skuKey(sku))?.name),
          stockFacts: facts?.[o.id]?.stock,
        }))
        .sort((a, b) => (b.proceeded ?? "").localeCompare(a.proceeded ?? "")),
    [data, catalogNames, facts],
  );
  const ctx: CellContext = useMemo(
    () => ({ payment: paymentStatusOf, cases: (r) => facts?.[r.id]?.cases ?? null }),
    [facts],
  );

  /* ── list state: tab · column view · header filters, in the URL ── */
  const saved = useMemo(() => {
    try {
      return JSON.parse(readStore(VIEW_KEY(userId)) ?? "null") as { tab?: Tab; cols?: LayoutKey } | null;
    } catch {
      return null;
    }
  }, [userId]);
  const tab: Tab = (["open", "delivered", "all"] as const).find((t) => t === params.get("tab")) ?? saved?.tab ?? "open";
  const layoutKey: LayoutKey = LAYOUTS.find((l) => l.key === params.get("cols"))?.key ?? saved?.cols ?? "so";
  const layout = LAYOUTS.find((l) => l.key === layoutKey)!;
  const filters = useMemo(() => {
    const out: Record<string, string> = {};
    params.forEach((value, key) => {
      if (key.startsWith("f.") && COLUMNS[key.slice(2)]) out[key.slice(2)] = value;
    });
    return out;
  }, [params]);
  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams((p) => {
        const next = new URLSearchParams(p);
        if (value == null) next.delete(key);
        else next.set(key, value);
        return next;
      }, { replace: true }),
    [setParams],
  );
  const chooseTab = (next: Tab) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("tab", next);
      return n;
    }, { replace: true });
  const chooseLayout = (next: LayoutKey) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set("cols", next);
      [...n.keys()].filter((k) => k.startsWith("f.")).forEach((k) => n.delete(k));
      return n;
    }, { replace: true });

  const inTab = useCallback(
    (r: RegisterRow) => (tab === "all" ? true : tab === "delivered" ? isDelivered(r) : !isDelivered(r)),
    [tab],
  );
  const list = useMemo(
    () => all.filter((r) => inTab(r) && Object.entries(filters).every(([k, v]) => COLUMNS[k]!.cell(r, ctx).t === v)),
    [all, inTab, filters, ctx],
  );

  /* ── paging · selection ── */
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  useEffect(() => setPage(1), [tab, layoutKey, filters, pageSize, seededSearch]);
  const shown = list.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectedRows = list.filter((r) => selected.has(r.id));
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allShownSelected) shown.forEach((r) => n.delete(r.id));
      else shown.forEach((r) => n.add(r.id));
      return n;
    });

  /* ── summary ── */
  /* Open on a wide screen unless the person hid it (v8: summary from 1250px). */
  const [summaryOpen, setSummaryOpenState] = useState(() => {
    const stored = readStore(SUMMARY_KEY);
    return stored ? stored === "1" : window.innerWidth >= 1250;
  });
  const setSummaryOpen = (open: boolean) => {
    writeStore(SUMMARY_KEY, open ? "1" : "0");
    setSummaryOpenState(open);
  };
  const thisMonth = appTodayIso().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);

  /* ── opening an order ── */
  const returnTo = `/operation/orders${params.toString() ? `?${params.toString()}` : ""}`;
  const open = (r: RegisterRow, e: MouseEvent) => {
    const picked = window.getSelection?.()?.toString() ?? "";
    if (picked.length > 1) return;
    const path = `/operation/orders/so/${r.id}`;
    if (e.metaKey || e.ctrlKey) {
      window.open(path, "_blank", "noopener");
      return;
    }
    navigate(path, { state: { salesOrderRegisterReturn: returnTo } });
  };

  /* ── export · save view · sync ── */
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const exportTable = (rows: RegisterRow[]) => ({
    headers: ["SO No.", ...layout.columns.filter((k) => k !== "order").map((k) => COLUMNS[k]!.label)],
    rows: rows.map((r) => [
      `SO-${r.so}`,
      ...layout.columns.filter((k) => k !== "order").map((k) => {
        const c = COLUMNS[k]!.cell(r, ctx);
        return c.sub ? `${c.t} · ${c.sub}` : c.t;
      }),
    ]),
  });
  const downloadExcel = async (rows: RegisterRow[]) => {
    try {
      const { headers, rows: body } = exportTable(rows);
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
      ws["!cols"] = headers.map((h, i) => ({
        wch: Math.min(60, Math.max(8, ...[h, ...body.map((r) => r[i] ?? "")].map((v) => String(v).length + 2))),
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sales Orders");
      XLSX.writeFile(wb, `Sales Orders Outright ${appTodayIso()}.xlsx`);
    } catch {
      toast.error("The list could not be exported. Try again.");
    }
  };
  const downloadPdf = async (rows: RegisterRow[]) => {
    try {
      const { headers, rows: body } = exportTable(rows);
      const { renderRegisterListPdf } = await import("@/lib/pdf/render");
      const blob = await renderRegisterListPdf({
        title: "Sales Orders Outright",
        headers,
        rows: body,
        printedAt: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Sales Orders Outright ${appTodayIso()}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error("The list could not be exported. Try again.");
    }
  };

  const chips = [
    ...(seededSearch ? [{ key: "search", label: `Search: ${seededSearch}`, clear: () => setParam("search", null) }] : []),
    ...Object.entries(filters).map(([k, v]) => ({ key: k, label: `${COLUMNS[k]!.label}: ${v}`, clear: () => setParam(`f.${k}`, null) })),
  ];
  const gcols = `24px ${layout.columns.map((k) => COLUMNS[k]!.width).join(" ")}`;
  const minWidth = layout.columns.length <= 6 ? 600 : 760;

  /* Footer: `n orders` · `Qty: Mattress 7 · Bed frame 4 …` (most first). */
  const qty = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of list) {
      for (const line of r.o.order_lines ?? []) {
        const word = summaryCat(line);
        if (word) c.set(word, (c.get(word) ?? 0) + (Number(line.qty) || 0));
      }
    }
    return [...c.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  }, [list]);
  const qtyLine = qty.length ? `· Qty: ${qty.map(([k, n]) => `${k} ${n}`).join(" · ")}` : "";
  const selPcs = selectedRows.reduce((s, r) => s + pcsOf(r), 0);
  const selTotal = selectedRows.reduce((s, r) => s + (r.total.kind === "amount" ? r.total.value : 0), 0);

  return (
    <div className="flex h-full min-h-0 min-w-0 gap-3" data-testid="sales-orders-outright">
      <ModuleHeader testId="sales-orders-destination-header" word="Sales Order" page="Outright" docTitle="Sales Orders · Carres" />
      {summaryOpen && (
        <SummaryPanel
          rows={all}
          facts={facts}
          month={month}
          canNext={month < thisMonth}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))}
          onNext={() => setMonth((m) => (m < thisMonth ? shiftMonth(m, 1) : m))}
          onHide={() => setSummaryOpen(false)}
          loading={isLoading}
        />
      )}
      <main className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2.5">
        {selectedRows.length > 0 ? (
          <div
            role="toolbar"
            aria-label="Selected orders"
            className="flex min-h-9 flex-wrap items-center gap-2.5 rounded-full bg-c-select-bg pl-3.5 pr-1.5"
            data-testid="outright-selection-bar"
          >
            <MIcon name="check_box" size={18} className="text-c-select-fg" fill />
            <span className="whitespace-nowrap text-[13px] font-semibold text-c-select-fg">{selectedRows.length} selected</span>
            <span className="whitespace-nowrap text-[13px] text-c-select-fg">
              · {selPcs} {selPcs === 1 ? "pc" : "pcs"} · Total {rm(selTotal)}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={() => void downloadExcel(selectedRows)} className="flex h-7 items-center gap-1 rounded-lg border border-c-btn-border bg-white px-3 text-[12px] font-semibold text-c-ink hover:bg-c-hover">
                <MIcon name="download" size={16} />Export
              </button>
              <button type="button" onClick={() => void printSalesOrdersOrSay(selectedRows)} className="flex h-7 items-center gap-1 rounded-lg border border-c-btn-border bg-white px-3 text-[12px] font-semibold text-c-ink hover:bg-c-hover">
                <MIcon name="print" size={16} />Print SO
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] font-semibold text-c-select-fg hover:bg-white/60">
                Clear<MIcon name="close" size={16} />
              </button>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2" data-testid="outright-toolbar">
            {!summaryOpen && (
              <button type="button" onClick={() => setSummaryOpen(true)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-c-btn-border bg-white px-3 text-[13px] font-medium text-c-ink hover:bg-c-hover">
                <MIcon name="left_panel_open" size={18} />Summary
              </button>
            )}
            <div role="tablist" aria-label="Views" className="flex gap-0.5 p-[3px]">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => chooseTab(t.key)}
                  className={`whitespace-nowrap rounded-lg px-3 py-[5px] text-[13px] ${
                    tab === t.key ? "bg-c-select-bg font-semibold text-c-select-fg" : "font-medium text-c-tab hover:bg-c-hover"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <span className="whitespace-nowrap text-[12px] text-c-muted">· {layout.label} view</span>
            {chips.map((c) => (
              <button key={c.key} type="button" onClick={c.clear} className="whitespace-nowrap rounded-lg border border-c-head-line bg-c-search-bg px-2.5 py-1 text-[12px] font-semibold text-c-body">
                {c.label} ×
              </button>
            ))}
            <span className="ml-auto flex items-center gap-1.5">
              <CPopover
                label="Views"
                role="menu"
                width={220}
                open={viewsOpen}
                onOpenChange={setViewsOpen}
                trigger={
                  <button type="button" aria-label={`View: ${layout.label}`} title={`View: ${layout.label}`} className={`grid h-9 w-9 place-items-center rounded-full text-c-body hover:bg-c-hover ${viewsOpen ? "bg-c-hover" : ""}`}>
                    <MIcon name="view_column" size={20} />
                  </button>
                }
              >
                <div className="px-2.5 py-1.5 text-[12px] text-c-secondary">Show columns for</div>
                {LAYOUTS.map((l) => (
                  <CMenuItem key={l.key} icon={l.icon} checked={l.key === layoutKey} strong={l.key === layoutKey} onSelect={() => { chooseLayout(l.key); setViewsOpen(false); }}>
                    {l.label}
                  </CMenuItem>
                ))}
              </CPopover>
              <CPopover
                label="More actions"
                role="menu"
                width={250}
                open={moreOpen}
                onOpenChange={setMoreOpen}
                trigger={
                  <button type="button" aria-label="More actions" title="More actions" className={`grid h-9 w-9 place-items-center rounded-full text-c-body hover:bg-c-hover ${moreOpen ? "bg-c-hover" : ""}`}>
                    <MIcon name="more_vert" size={20} />
                  </button>
                }
              >
                <CMenuGroup first>EXPORT · orders shown now</CMenuGroup>
                <CMenuItem icon="table_view" note=".xlsx" onSelect={() => { setMoreOpen(false); void downloadExcel(list); }}>Download Excel</CMenuItem>
                <CMenuItem icon="picture_as_pdf" onSelect={() => { setMoreOpen(false); void downloadPdf(list); }}>Download PDF</CMenuItem>
                <CMenuGroup>VIEW</CMenuGroup>
                <CMenuItem icon="bookmark_add" onSelect={() => { setMoreOpen(false); writeStore(VIEW_KEY(userId), JSON.stringify({ tab, cols: layoutKey })); toast.success(`Saved as your view: ${TABS.find((t) => t.key === tab)!.label} · ${layout.label}`); }}>Save as my view…</CMenuItem>
                <CMenuGroup>DATA</CMenuGroup>
                <CMenuItem icon="sync" note={dataUpdatedAt ? `Last ${time12(dataUpdatedAt)}` : undefined} onSelect={() => { setMoreOpen(false); void refetch(); }}>Sync from Sales Portal now</CMenuItem>
              </CPopover>
            </span>
            <TasksPill />
          </div>
        )}

        <section aria-label="Sales orders" className="grid min-h-0 grid-rows-[minmax(0,1fr)_44px] overflow-hidden rounded-lg border border-c-card-border bg-c-card">
          <div className="min-h-0 overflow-auto [scrollbar-width:thin]" data-list-scroll>
            {isError ? (
              <SalesOrderReadFailure error={error} surface="sales-orders-register" onRetry={() => void refetch()} />
            ) : (
              <div role="table" aria-label="Sales orders" style={{ minWidth }}>
                <div
                  role="row"
                  className="sticky top-0 z-10 mx-1.5 grid min-h-10 items-center gap-2.5 border-b border-c-head-line bg-c-card px-3.5 py-1.5 text-[12px] font-medium text-c-muted"
                  style={{ gridTemplateColumns: gcols }}
                >
                  <span className="flex items-center" role="columnheader">
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                      className="h-4 w-4 cursor-pointer accent-[var(--c-select-fg)]"
                    />
                  </span>
                  {layout.columns.map((k) => (
                    <HeaderCell key={k} col={k} rows={all.filter(inTab)} ctx={ctx} value={filters[k]} onPick={(v) => setParam(`f.${k}`, v)} />
                  ))}
                </div>
                {isLoading ? (
                  <div className="px-6 py-6 text-center text-[13px] text-c-secondary" role="status">Loading orders</div>
                ) : shown.length === 0 ? (
                  <div className="px-6 py-6 text-center text-[13px] text-c-secondary">
                    No orders match.{" "}
                    <button type="button" className="font-semibold text-c-body" onClick={() => setParams(new URLSearchParams({ tab: "all" }), { replace: true })}>
                      Clear filters
                    </button>
                  </div>
                ) : (
                  shown.map((r) => (
                    <div
                      key={r.id}
                      role="row"
                      onClick={(e) => open(r, e)}
                      title="Open order · Ctrl/⌘-click opens a new tab"
                      data-testid={`outright-row-${r.so}`}
                      className={`mx-1.5 grid min-h-[54px] cursor-pointer items-center gap-2.5 rounded-[10px] border-b border-c-row-line px-3.5 py-1.5 text-[13px] -outline-offset-2 hover:[outline:var(--c-focus)] ${
                        selected.has(r.id) ? "bg-c-select-bg" : "bg-c-card hover:bg-c-search-bg"
                      }`}
                      style={{ gridTemplateColumns: gcols }}
                    >
                      <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          aria-label={`Select SO-${r.so}`}
                          className="h-4 w-4 cursor-pointer accent-[var(--c-select-fg)]"
                        />
                      </span>
                      {layout.columns.map((k) => (
                        <BodyCell key={k} cell={COLUMNS[k]!.cell(r, ctx)} row={r} catalogNames={catalogNames} />
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 border-t border-c-footer-line px-3.5 text-[13px] text-c-secondary" data-testid="outright-footer">
            <span className="whitespace-nowrap">{isLoading ? "Loading orders" : `${list.length} orders`}</span>
            {!isLoading && qtyLine && (
              <span className="min-w-0 truncate" title={qtyLine}>{qtyLine}</span>
            )}
            <RowsMenu size={pageSize} onSize={setPageSize} />
            <span className="flex items-center gap-1 whitespace-nowrap text-c-ink">
              <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="grid place-items-center text-c-ink disabled:text-c-head-line">
                <MIcon name="chevron_left" size={18} />
              </button>
              {Math.min(page, pages)} / {pages}
              <button type="button" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="grid place-items-center text-c-ink disabled:text-c-head-line">
                <MIcon name="chevron_right" size={18} />
              </button>
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

/* ── the header cell: plain grey words; a filterable column opens its values ── */
function HeaderCell({
  col,
  rows,
  ctx,
  value,
  onPick,
}: {
  col: string;
  rows: RegisterRow[];
  ctx: CellContext;
  value: string | undefined;
  onPick: (v: string | null) => void;
}) {
  const c = COLUMNS[col]!;
  const [open, setOpen] = useState(false);
  const alignEnd = c.align === "end";
  const words = (
    <span className="text-left leading-[1.25]">{c.label}</span>
  );
  if (!c.filterable) {
    return (
      <div role="columnheader" className={`flex ${alignEnd ? "justify-end" : ""}`}>
        {words}
      </div>
    );
  }
  const counts = new Map<string, number>();
  for (const r of rows) {
    const t = c.cell(r, ctx).t;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return (
    <div role="columnheader" className="flex">
      <CPopover
        label={c.label}
        role="menu"
        align="start"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button type="button" className={`flex items-center gap-1 text-left font-medium ${value ? "text-c-body" : "text-c-secondary"}`}>
            {words}
            <MIcon name={value ? "filter_alt" : "arrow_drop_down"} size={16} className={value ? "text-c-body" : "text-c-muted"} />
          </button>
        }
      >
        <div className="min-w-[170px]">
          {[...counts.entries()].map(([v, n]) => (
            <CMenuItem key={v} note={n} checked={value === v ? true : undefined} onSelect={() => { onPick(value === v ? null : v); setOpen(false); }}>
              {v}
            </CMenuItem>
          ))}
        </div>
      </CPopover>
    </div>
  );
}

/* ── one body cell: plain words, a pill, or the Items pop-up; then a sub-line ── */
function BodyCell({
  cell,
  row,
  catalogNames,
}: {
  cell: Cell;
  row: RegisterRow;
  catalogNames: Map<string, { name: string; variant: string }>;
}) {
  const fg =
    cell.fg === "ink" ? "text-c-ink" : cell.fg === "muted" ? "text-c-muted" : cell.fg === "warn" ? "text-c-warn-fg" : cell.fw === 600 ? "text-c-ink" : "text-c-tab";
  const fw = cell.fw === 600 ? "font-semibold" : cell.fw === 500 ? "font-medium" : "font-normal";
  const subFg = cell.subTone === "muted" ? "text-c-muted" : cell.subTone === "ok" ? "text-c-ok-fg" : cell.subTone === "warn" ? "text-c-warn-fg" : "text-c-secondary";
  return (
    <span role="cell" className={`flex min-w-0 flex-col leading-[1.3] ${cell.align === "end" ? "items-end" : "items-start"}`}>
      {cell.pop ? (
        <ItemsButton row={row} label={cell.t} catalogNames={catalogNames} />
      ) : cell.pill ? (
        cell.tone === "none" ? (
          <span className="text-[13px] text-c-muted">{cell.t}</span>
        ) : (
          <CPill tone={cell.tone ?? "info"}>{cell.t}</CPill>
        )
      ) : (
        <span className={`max-w-full truncate tabular-nums ${fw} ${fg}`} title={cell.t}>
          {cell.t}
        </span>
      )}
      {cell.sub && <span className={`max-w-full truncate text-[12px] ${subFg}`}>{cell.sub}</span>}
    </span>
  );
}

/* ── Items: `› 2 pcs` opens what the order holds (v8 "Items in order") ── */
function ItemsButton({
  row,
  label,
  catalogNames,
}: {
  row: RegisterRow;
  label: string;
  catalogNames: Map<string, { name: string; variant: string }>;
}) {
  const [open, setOpen] = useState(false);
  const lines = (row.o.order_lines ?? []).filter((l) => Number(l.qty) > 0);
  return (
    <span onClick={(e) => e.stopPropagation()}>
      <CPopover
        label="Items in order"
        align="start"
        width={320}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button type="button" aria-expanded={open} className="-ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[13px] font-medium text-c-body hover:bg-c-search-bg">
            <MIcon name={open ? "expand_more" : "chevron_right"} size={18} className="text-c-muted" />
            {label}
          </button>
        }
      >
        <div className="-m-1.5 flex max-h-[360px] flex-col">
          <div className="flex items-center justify-between border-b border-c-row-line px-3 pb-2 pt-2.5">
            <span className="text-[13px] font-semibold">SO-{row.so}</span>
            <span className="text-[12px] text-c-secondary">{label}</span>
          </div>
          <div className="overflow-auto px-3 py-1">
            {lines.map((l, i) => {
              const named = catalogNames.get(skuKey(l.sku));
              return (
                <div key={l.id ?? `${l.sku}-${i}`} className="grid grid-cols-[minmax(0,1fr)_28px] gap-2.5 border-b border-c-row-line py-2 last:border-b-0">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="break-words text-[13px] font-semibold text-c-ink">{named?.name ?? lineName(l)}</span>
                    <span className="break-words text-[12px] leading-[1.35] text-c-secondary">
                      {[named?.variant, l.sku].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-right text-[13px] font-semibold tabular-nums">{Number(l.qty)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CPopover>
    </span>
  );
}

/* ── `Rows 20 ▾` ── */
function RowsMenu({ size, onSize }: { size: number; onSize: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="ml-auto">
      <CPopover
        label="Rows per page"
        role="menu"
        width={120}
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button type="button" className="flex items-center gap-0.5 whitespace-nowrap text-c-secondary">
            Rows {size}
            <MIcon name="arrow_drop_down" size={18} />
          </button>
        }
      >
        {PAGE_SIZES.map((n) => (
          <CMenuItem key={n} checked={n === size} onSelect={() => { onSize(n); setOpen(false); }}>
            {n}
          </CMenuItem>
        ))}
      </CPopover>
    </span>
  );
}

/* ── the Summary panel — v8 `sum`: one card, thin spacing, no box inside ── */
function SummaryPanel({
  rows,
  facts,
  month,
  canNext,
  onPrev,
  onNext,
  onHide,
  loading,
}: {
  rows: RegisterRow[];
  facts: Record<string, { cases?: string | null }> | null;
  month: string;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onHide: () => void;
  loading: boolean;
}) {
  const inMonth = rows.filter((r) => r.proceeded && monthKey(r.proceeded) === month);
  const prev = shiftMonth(month, -1);
  const inPrev = rows.filter((r) => r.proceeded && monthKey(r.proceeded) === prev);
  const value = inMonth.reduce((s, r) => s + (r.total.kind === "amount" ? r.total.value : 0), 0);
  const delta = inMonth.length - inPrev.length;
  const cats = new Map<string, number>(SUMMARY_CATS.map((c) => [c, 0]));
  for (const r of inMonth) {
    for (const line of r.o.order_lines ?? []) {
      const word = summaryCat(line);
      if (word) cats.set(word, (cats.get(word) ?? 0) + (Number(line.qty) || 0));
    }
  }
  const delivered = inMonth.filter(isDelivered);
  const days = delivered
    .filter((r) => r.o.delivered_at && r.proceeded)
    .map((r) => (Date.parse(r.o.delivered_at!) - Date.parse(r.proceeded!)) / 86_400_000);
  const avg = days.length ? `${Math.round(days.reduce((a, b) => a + b, 0) / days.length)} days` : "Not yet";
  const problems = inMonth.filter((r) => facts?.[r.id]?.cases === "open").length;
  const row = (k: string, v: string, strong = true) => (
    <div key={k} className="flex h-8 items-center justify-between text-[13px]">
      <span className="text-c-secondary">{k}</span>
      <span className={`tabular-nums ${strong ? "font-semibold text-c-ink" : "font-medium text-c-body"}`}>{v}</span>
    </div>
  );
  return (
    <aside aria-label="Summary" className="flex w-[240px] shrink-0 flex-col gap-3.5 overflow-auto rounded-lg border border-c-card-border bg-c-card px-3.5 py-3 [scrollbar-width:thin]" data-testid="outright-summary">
      <div className="flex items-center gap-1.5">
        <span className="flex-1 text-[17px] font-medium tracking-[-0.01em]">Summary</span>
        <button type="button" onClick={onHide} aria-label="Hide summary" className="flex text-c-muted">
          <MIcon name="chevron_left" size={20} />
        </button>
      </div>
      <div className="flex h-9 items-center justify-between rounded-[10px] border border-c-card-border px-1">
        <button type="button" onClick={onPrev} aria-label="Previous month" className="flex text-c-body">
          <MIcon name="chevron_left" size={20} />
        </button>
        <span className="text-[14px] font-semibold">{monthWord(month)}</span>
        <button type="button" onClick={onNext} aria-label="Next month" disabled={!canNext} className="flex text-c-body disabled:text-c-head-line">
          <MIcon name="chevron_right" size={20} />
        </button>
      </div>
      {loading ? (
        <span className="text-[13px] text-c-secondary" role="status">Loading orders</span>
      ) : (
        <>
          <div className="flex flex-col">
            {row("Proceeded orders", String(inMonth.length))}
            {row("Proceeded value", rm(value))}
            <span className={`pt-1.5 text-[12px] ${delta >= 0 ? "text-c-ok-fg" : "text-c-warn-fg"}`}>
              {delta >= 0 ? "+" : ""}
              {delta} orders vs {monthWord(prev).slice(0, 3)}
            </span>
          </div>
          <div className="flex flex-col">{SUMMARY_CATS.map((c) => row(c, String(cats.get(c) ?? 0), false))}</div>
          <div className="flex flex-col">
            {row("Delivered", `${delivered.length} of ${inMonth.length}`)}
            {row("Avg days to deliver", avg)}
            {row("Problems open", facts ? String(problems) : "Not set")}
          </div>
        </>
      )}
    </aside>
  );
}
