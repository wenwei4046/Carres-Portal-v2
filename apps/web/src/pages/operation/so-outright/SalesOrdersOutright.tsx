/**
 * Sales Orders → Outright — the list (owner-confirmed handoff, Jess 2026-10-08).
 * Current kit: docs/01-design-tokens.md §5 and docs/03-page-patterns.md §2 (v12,
 * 11 Oct 2026); this page is not migrated to it yet.
 *
 *   [Summary 240] [ Open Delivered All · Sales Order view  chips ····· ▥ ⋮ Tasks 5 ]
 *                 [ ┌ table card: sticky head · 54px rows · footer 44 ───────────┐ ]
 *
 * Data is the Sales Order register's real read (every proceeded order, the
 * catalogue names, the server's stock / payment / case facts). Nothing here
 * writes. A row click opens the order; Ctrl/⌘-click opens it in a new tab.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { goodsCategoryWordOf } from "@carres/shared";
import MIcon from "@/components/carres/MIcon";
import CPopover, { CMenuGroup, CMenuItem } from "@/components/carres/CPopover";
import CTable, { CTableCell, CTableFooter, CTableHead, CTableItems, type CTableGrid } from "@/components/carres/CTable";
import CSidePanel from "@/components/carres/CSidePanel";
import { CChip, CIconButton, CShowPanelButton, CViewButton } from "@/components/carres/CToolbar";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import { useSalesOrderRegisterFacts, useSalesOrderRegisterOrders } from "@/lib/queries";
import { buildRegisterRow, type RegisterRow } from "../sales-order-columns";
import { isRental, lineName } from "../sales-order-facts";
import { paymentStatusOf, skuKey, useCatalogNames } from "../SalesOrdersRegister";
import { inRequestedNarrowing, requestedNarrowingOf, requestedNarrowingWord } from "../requested-narrowing";
import SalesOrderReadFailure from "../SalesOrderReadFailure";
import { printSalesOrdersOrSay } from "../record-print";
import ModuleHeader from "../components/ModuleHeader";
import { SEGMENT, SEGMENT_OFF, SEGMENT_ON, SEGMENTED_TRACK } from "@/components/kit/Tabs";
import { TasksPill, useShellTasks } from "../components/ShellTasks";
import {
  CATEGORY_CODE,
  COLUMNS,
  LAYOUTS,
  isDelivered,
  pcsOf,
  rm,
  supplierCell,
  type CellContext,
  type LayoutKey,
} from "./outright-columns";
import { readStateOf, usePayBy } from "./pay-by";

type Tab = "open" | "delivered" | "all";
const TABS: { key: Tab; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "delivered", label: "Delivered" },
  { key: "all", label: "All" },
];
const SUMMARY_KEY = "carres.outright.summary";
/** Below this width only one side panel is open at a time (v12 Shell). */
const ONE_PANEL_BELOW = 1280;
const VIEW_KEY = (user: string) => `carres.outright.view.${user}`;

/* The summary's goods words — v12 CATS, the catalog's own `Bedframe` (one word). */
const SUMMARY_CATS = ["Mattress", "Bedframe", "Sofa", "Pillow", "Mattress protector", "Others"] as const;
function summaryCat(line: Parameters<typeof goodsCategoryWordOf>[0]): (typeof SUMMARY_CATS)[number] | null {
  const word = goodsCategoryWordOf(line);
  if (word === "Service") return null;
  if (word === "Mattress" || word === "Bedframe" || word === "Sofa" || word === "Pillow" || word === "Mattress protector") return word;
  return "Others";
}
/* The footer's goods words, in this fixed order (fix list 14 Oct, point 7). */
const FOOTER_CATS = ["Mattress", "Pillow", "Bedframe", "Mattress protector", "Sofa", "Service", "Others"] as const;
function footerCat(line: Parameters<typeof goodsCategoryWordOf>[0]): (typeof FOOTER_CATS)[number] {
  const word = goodsCategoryWordOf(line);
  return (FOOTER_CATS as readonly string[]).includes(word) ? (word as (typeof FOOTER_CATS)[number]) : "Others";
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
  /* Each owner's read keeps its own state: loading · refused · failed · answered. */
  const factsState = readStateOf([factsQ]);
  const factsFailed = factsQ.data?.failed;
  const payBy = usePayBy();
  const ctx: CellContext = useMemo(
    () => ({
      payment: paymentStatusOf,
      owned: (r) =>
        factsState !== "ok"
          ? { state: factsState }
          : {
              state: "ok",
              facts: facts?.[r.id]?.owned ?? null,
              cases: facts?.[r.id]?.cases ?? null,
              failed: { ...(factsFailed ?? {}), cases: factsFailed?.cases ?? false },
            },
      payBy: (r) => payBy(r.id),
    }),
    [facts, factsFailed, factsState, payBy],
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
  /* A door by the customer's original requested delivery (Purchasing's Monthly
     demand opens `?tab=all&requested=…`): the same narrowing the earlier
     register read, on version 1's preserved request. */
  const requestedParam = params.get("requested");
  const requested = useMemo(() => requestedNarrowingOf(requestedParam), [requestedParam]);
  const list = useMemo(
    () =>
      all.filter(
        (r) =>
          inTab(r) &&
          (!requested || inRequestedNarrowing(r.customerDelivery, requested, isDelivered(r))) &&
          Object.entries(filters).every(([k, v]) => COLUMNS[k]!.cell(r, ctx).t === v),
      ),
    [all, inTab, requested, filters, ctx],
  );

  /* ── paging · selection ── */
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  useEffect(() => setPage(1), [tab, layoutKey, filters, pageSize, seededSearch, requestedParam]);
  const shown = list.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
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
    /* Under 1280 wide the list keeps the room: opening one side panel closes
       the other (v12 Shell). */
    if (open && window.innerWidth < ONE_PANEL_BELOW) useShellTasks.getState().setOpen(false);
  };
  const tasksOpen = useShellTasks((s) => s.open);
  useEffect(() => {
    const narrow = () => {
      if (tasksOpen && window.innerWidth < ONE_PANEL_BELOW) setSummaryOpenState(false);
    };
    narrow();
    window.addEventListener("resize", narrow);
    return () => window.removeEventListener("resize", narrow);
  }, [tasksOpen]);
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
    headers: [COLUMNS.order!.label, ...layout.columns.filter((k) => k !== "order").map((k) => COLUMNS[k]!.label)],
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
    ...(requested ? [{ key: "requested", label: `Customer’s original requested delivery: ${requestedNarrowingWord(requested)}`, clear: () => setParam("requested", null) }] : []),
    ...Object.entries(filters).map(([k, v]) => ({ key: k, label: `${COLUMNS[k]!.label}: ${v}`, clear: () => setParam(`f.${k}`, null) })),
  ];
  const columns = layout.columns.map((k) => COLUMNS[k]!);
  const clearFilters = () =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      [...n.keys()].filter((k) => k === "search" || k === "requested" || k.startsWith("f.")).forEach((k) => n.delete(k));
      return n;
    }, { replace: true });

  /* No toolbar control is cut or overlaps (owner 14 Oct 2026); Summary may keep
     its icon only and the view button always keeps its name. On a short line the
     filter chips keep their icon, then become one `Clear filters` and the gaps
     close 8 → 4. (The two-row candidate is kept on branch preview/two-row-toolbar,
     pending review; it is not part of the release.) `need[n]` is the width the
     line needed at step n. */
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(0);
  const need = useRef<number[]>([]);
  useLayoutEffect(() => {
    const bar = toolbarRef.current;
    if (!bar) return;
    const most = chips.length > 0 ? 3 : 1;
    const fit = () => {
      if (bar.scrollWidth > bar.clientWidth + 1 && compact < most) {
        need.current[compact] = bar.scrollWidth;
        setCompact(compact + 1);
      } else if (compact > 0 && bar.clientWidth >= (need.current[compact - 1] ?? Infinity)) setCompact(compact - 1);
    };
    fit();
    const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    watch?.observe(bar);
    return () => watch?.disconnect();
  }, [compact, chips.length, layoutKey, tasksOpen, summaryOpen, selected.size]);
  useEffect(() => {
    need.current = [];
    setCompact(0);
  }, [chips.length, layoutKey]);
  /* SO No stays fixed on the left while the list scrolls (with ▸ and ☐). */
  const identifier = Math.max(0, layout.columns.indexOf("order"));

  /* Footer: `72 orders · Qty: Mattress 72 · Pillow 91 …` in the fixed order; the
     short forms (`MS 72 · BF 14 · M.P 4 · SOF 22 sets`) when two lines are not enough. */
  const totals = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of list) {
      for (const line of r.o.order_lines ?? []) {
        const word = footerCat(line);
        c.set(word, (c.get(word) ?? 0) + (Number(line.qty) || 0));
      }
    }
    const shown = FOOTER_CATS.filter((k) => (c.get(k) ?? 0) > 0);
    const part = (k: string, name: string) => {
      const n = c.get(k)!;
      return k === "Sofa" ? `${name} ${n} ${n === 1 ? "set" : "sets"}` : `${name} ${n}`;
    };
    return { lead: "Qty:", parts: shown.map((k) => part(k, k)), short: shown.map((k) => part(k, CATEGORY_CODE[k] ?? k)) };
  }, [list]);
  const selPcs = selectedRows.reduce((s, r) => s + pcsOf(r), 0);
  const selTotal = selectedRows.reduce((s, r) => s + (r.total.kind === "amount" ? r.total.value : 0), 0);

  return (
    <div className="flex h-full min-h-0 min-w-0 gap-3" data-testid="sales-orders-outright">
      <ModuleHeader testId="sales-orders-destination-header" word="Sales Order" page="Outright" docTitle="Sales Orders · Carres" />
      {summaryOpen && (
        <SummaryPanel
          rows={all}
          facts={facts}
          casesState={factsState === "ok" && factsFailed?.cases ? "failed" : factsState}
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
              <button type="button" onClick={() => void downloadExcel(selectedRows)} className="flex h-8 items-center gap-1 rounded-lg border border-c-btn-border bg-white px-3 text-[13px] font-medium text-c-ink hover:bg-c-hover">
                <MIcon name="download" size={16} />Export
              </button>
              <button type="button" onClick={() => void printSalesOrdersOrSay(selectedRows)} className="flex h-8 items-center gap-1 rounded-lg border border-c-btn-border bg-white px-3 text-[13px] font-medium text-c-ink hover:bg-c-hover">
                <MIcon name="print" size={16} />Print SO
              </button>
              <button type="button" onClick={() => setSelected(new Set())} className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-c-select-fg hover:bg-white/60">
                Clear<MIcon name="close" size={16} />
              </button>
            </span>
          </div>
        ) : (
          <div
            ref={toolbarRef}
            className={`flex h-9 min-w-0 flex-nowrap items-center ${compact >= 3 ? "gap-1" : "gap-2"}`}
            data-testid="outright-toolbar"
          >
            {!summaryOpen && <CShowPanelButton label="Summary" compact={compact >= 1} onShow={() => setSummaryOpen(true)} />}
            <div role="tablist" aria-label="Views" className={SEGMENTED_TRACK}>
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => chooseTab(t.key)}
                  className={`${SEGMENT} ${tab === t.key ? SEGMENT_ON : SEGMENT_OFF}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {chips.length > 0 && (
              <span className="flex shrink-0 items-center gap-1.5">
                {compact >= 3 && chips.length > 1 ? (
                  <CChip compact title={chips.map((c) => c.label).join(" · ")} onClear={clearFilters}>Clear filters</CChip>
                ) : (
                  chips.map((c) => (
                    <CChip key={c.key} onClear={c.clear} compact={compact >= 2}>{c.label}</CChip>
                  ))
                )}
              </span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              <CPopover
                label="Views"
                role="menu"
                width={220}
                open={viewsOpen}
                onOpenChange={setViewsOpen}
                trigger={<CViewButton icon={layout.icon} name={layout.label} open={viewsOpen} />}
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
                trigger={<CIconButton icon="more_vert" label="More actions" pressed={moreOpen} />}
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

        <CTable
          label="Sales orders"
          columns={columns}
          rows={shown}
          rowKey={(r) => r.id}
          rowTestId={(r) => `outright-row-${r.so}`}
          rowTitle="Open order · Ctrl/⌘-click opens a new tab"
          onRowClick={open}
          identifier={identifier}
          selection={{
            isSelected: (r) => selected.has(r.id),
            toggle: (r) => toggle(r.id),
            allSelected: allShownSelected,
            toggleAll,
            rowLabel: (r) => `Select SO-${r.so}`,
          }}
          renderHeader={(c) => <HeaderCell col={c.key} rows={all.filter(inTab)} ctx={ctx} value={filters[c.key]} onPick={(v) => setParam(`f.${c.key}`, v)} />}
          expand={{
            isOpen: (r) => opened.has(r.id),
            toggle: (r) =>
              setOpened((s) => {
                const n = new Set(s);
                if (n.has(r.id)) n.delete(r.id);
                else n.add(r.id);
                return n;
              }),
            label: (r) => (opened.has(r.id) ? "Hide items" : "Show items"),
            render: (r, grid) => <OrderItems row={r} catalogNames={catalogNames} grid={grid} ctx={ctx} />,
          }}
          renderCell={(r, c) => <CTableCell cell={COLUMNS[c.key]!.cell(r, ctx)} />}
          failure={isError ? <SalesOrderReadFailure error={error} surface="sales-orders-register" onRetry={() => void refetch()} /> : undefined}
          placeholder={
            isLoading ? (
              <div className="px-6 py-6 text-center text-[13px] text-c-secondary" role="status">Loading orders</div>
            ) : shown.length === 0 ? (
              <div className="px-6 py-6 text-center text-[13px] text-c-secondary">
                No orders match.{" "}
                <button type="button" className="font-semibold text-c-body" onClick={() => setParams(new URLSearchParams({ tab: "all" }), { replace: true })}>
                  Clear filters
                </button>
              </div>
            ) : undefined
          }
          footer={
            <CTableFooter
              testId="outright-footer"
              count={isLoading ? "Loading orders" : `${list.length} ${list.length === 1 ? "order" : "orders"}`}
              {...(isLoading || totals.parts.length === 0 ? {} : { totals })}
              pageSize={pageSize}
              onPageSize={setPageSize}
              page={Math.min(page, pages)}
              pages={pages}
              onPage={setPage}
            />
          }
        />
      </main>
    </div>
  );
}

/* ── the header words; a filterable column opens its values (CTable draws the box) ── */
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
  if (!c.filterable) return <CTableHead column={c} />;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const t = c.cell(r, ctx).t;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return (
    <CPopover
      label={c.label}
      role="menu"
      align="start"
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className={`flex items-center gap-1 text-left font-medium ${value ? "text-c-body" : "text-c-secondary"}`}>
          <CTableHead column={c} />
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
  );
}

/** `1 pc` · `2 pcs`; a sofa in sets, `1 set` · `2 sets` (COPY quantities). */
const qtyWords = (n: number, sofa: boolean) => (sofa ? `${n} ${n === 1 ? "set" : "sets"}` : `${n} ${n === 1 ? "pc" : "pcs"}`);

/* ── what ▸ opens: the order's items, as the kit's item rows ── */
function OrderItems({
  row,
  catalogNames,
  grid,
  ctx,
}: {
  row: RegisterRow;
  catalogNames: Map<string, { name: string; variant: string }>;
  grid: CTableGrid;
  ctx: CellContext;
}) {
  const items = (row.o.order_lines ?? [])
    .filter((l) => Number(l.qty) > 0)
    .map((l, i) => {
      const named = catalogNames.get(skuKey(l.sku));
      return {
        key: l.id ?? `${l.sku}-${i}`,
        name: named?.name ?? lineName(l),
        detail: [named?.variant, l.sku].filter(Boolean).join(" · "),
        qty: qtyWords(Number(l.qty), goodsCategoryWordOf(l) === "Sofa"),
        supplier: supplierCell(row, ctx, l.id),
      };
    });
  return <CTableItems label={`SO-${row.so}`} grid={grid} items={items} empty="No items on this order" testId={`outright-items-${row.so}`} />;
}

/* ── the Summary panel — v8 `sum` in the kit side panel frame ── */
function SummaryPanel({
  rows,
  facts,
  casesState,
  month,
  canNext,
  onPrev,
  onNext,
  onHide,
  loading,
}: {
  rows: RegisterRow[];
  facts: Record<string, { cases?: string | null }> | null;
  /** Service's read state — a failed read is never "0 problems". */
  casesState: "ok" | "loading" | "failed" | "denied";
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
    <CSidePanel label="Summary" title="Summary" onHide={onHide} testId="outright-summary">
      <div className="flex h-9 shrink-0 items-center justify-between rounded-[10px] border border-c-card-border px-1">
        <button type="button" onClick={onPrev} aria-label="Previous month" className="flex text-c-body">
          <MIcon name="chevron_left" size={20} />
        </button>
        <span className="text-body font-semibold">{monthWord(month)}</span>
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
            {row(
              "Problems open",
              casesState === "ok" ? String(problems) : casesState === "loading" ? "Loading" : casesState === "denied" ? "No access" : "Could not read",
            )}
          </div>
        </>
      )}
    </CSidePanel>
  );
}
