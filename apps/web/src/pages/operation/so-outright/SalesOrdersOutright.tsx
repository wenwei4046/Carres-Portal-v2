/**
 * Sales Orders → Outright — the list (owner-confirmed handoff, Jess 2026-10-08).
 * Current kit: docs/01-design-tokens.md §5 and docs/03-page-patterns.md §2 (v12,
 * 11 Oct 2026). The list is the one listing engine (`register/DataGrid`, UI
 * MASTER §6.2): sort, header filters, Columns, Group by, ticks, the row menu
 * `View · Print · Cancel SO`, keyboard and the opened row's frame are the
 * engine's; this page keeps its own v12 toolbar row, selection bar, Summary
 * and footer words.
 *
 *   [Summary 240] [ Open Delivered All · Sales Order view  chips ····· ▥ ⋮ Tasks 5 ]
 *                 [ ┌ table card: sticky head · 54px rows · footer 44 ───────────┐ ]
 *
 * Data is the Sales Order register's real read (every proceeded order, the
 * catalogue names, the server's stock / payment / case facts). Nothing here
 * writes. A row click opens the order; Ctrl/⌘-click opens it in a new tab.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { REGISTER_DELIVERY_CONDITIONS, registerDeliveryConditionOf } from "@carres/shared";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { goodsCategoryWordOf } from "@carres/shared";
import MIcon from "@/components/carres/MIcon";
import CPopover, { CMenuGroup, CMenuItem } from "@/components/carres/CPopover";
import { CListCell, trackFloor } from "@/components/carres/CCell";
import { CListFooter } from "@/components/carres/CListFooter";
import { DataGrid, type DataGridColumn } from "@/components/register/DataGrid";
import ItemRows from "@/components/register/ItemRows";
import PoNumberLinks from "@/components/register/PoNumberLinks";
import { poNumberLinks, poNumberLinksText, poObjectPath } from "@/components/register/po-number-links";
import { documentRowMenu } from "@/components/register/row-menu";
import CancelSalesOrderDialog from "../CancelSalesOrderDialog";
import CSidePanel from "@/components/carres/CSidePanel";
import { CChip, CIconButton, CShowPanelButton, CViewButton } from "@/components/carres/CToolbar";
import Button from "@/components/kit/Button";
import { useAuth } from "@/lib/auth";
import { appTodayIso } from "@/lib/fmt-date";
import { useSalesOrderRegisterFacts, useSalesOrderRegisterOrders } from "@/lib/queries";
import { buildRegisterRow, type RegisterRow } from "../sales-order-columns";
import { isRental, lineName } from "../sales-order-facts";
import { PAYMENT_STATUSES, STOCK_STATUSES, paymentStatusOf, skuKey, stockStatusOf, useCatalogNames } from "../sales-order-register-readings";
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
type ListSort = { key: string; dir: "asc" | "desc" } | null;
type ListContext = { user: string; query: string; sort: ListSort; pageSize: number; page: number; selected: Set<string> };
/* Tab-lifetime presentation state only, scoped to the signed-in person. The
   URL still owns criteria; the shared grid owns expansion, focus and scroll. */
const listContexts = new Map<string, ListContext>();
function listContextFor(user: string, query: string): ListContext {
  const previous = listContexts.get(user);
  return previous ? { ...previous, query, page: previous.query === query ? previous.page : 1 }
    : { user, query, sort: null, pageSize: 20, page: 1, selected: new Set() };
}
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

/** What a column sorts by: dates and money by their values, the rest by the
 *  cell's words. A missing value goes last either way. */
function sortValueOf(key: string, r: RegisterRow, ctx: CellContext): string | number | null {
  switch (key) {
    case "proceed":
      return r.proceeded ?? null;
    case "order":
      return r.so;
    case "reqDate":
      return r.customerDelivery ?? null;
    case "items":
      return pcsOf(r);
    case "value":
      return r.total.kind === "amount" ? r.total.value : null;
    case "paid":
      return r.paid.kind === "amount" ? r.paid.value : null;
    case "balance":
      return r.balance.kind === "settled" ? 0 : r.balance.kind === "amount" ? r.balance.value : null;
    default:
      return COLUMNS[key]?.cell(r, ctx).t ?? null;
  }
}

export default function SalesOrdersOutright() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const userId = useAuth((s) => s.user?.id ?? "anon");
  const latestParams = useRef(params);
  latestParams.current = params;
  /* Router setters do not queue functional updates like React state. A grid
     filter effect in the same clear event must not reintroduce the old search. */
  const updateParams = useCallback((update: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(latestParams.current);
    update(next);
    if (next.toString() === latestParams.current.toString()) return;
    latestParams.current = next;
    setParams(next, { replace: true });
  }, [setParams]);

  /* ── the real read: every proceeded order, as the register reads it ── */
  const seededSearch = params.get("search") ?? "";
  const { data, isLoading, isError, error, refetch, dataUpdatedAt, isPlaceholderData } = useSalesOrderRegisterOrders(
    seededSearch ? { stage: "proceeded", search: seededSearch } : { stage: "proceeded" },
  );
  /* The counter is unsearched and permission-scoped. If it is unavailable,
     only an empty searched answer needs the existing complete unsearched read. */
  const needsPopulation = Boolean(seededSearch) && !isLoading && !isError && !isPlaceholderData && data?.orders.length === 0 && data.salesOrderTotal == null;
  const population = useSalesOrderRegisterOrders({ stage: "proceeded" }, needsPopulation);
  const checkingPopulation = needsPopulation && population.isPending;
  const populationFailed = needsPopulation && population.isError;
  const loadingList = isLoading || (isPlaceholderData && data?.orders.length === 0) || checkingPopulation;
  const failedList = isError || populationFailed;
  const listError = isError ? error : population.error;
  const retryList = () => { void (populationFailed ? population.refetch() : refetch()); };
  const populationEmpty = data?.salesOrderTotal === 0 || (data?.salesOrderTotal == null &&
    (!seededSearch ? data?.orders.length === 0 : needsPopulation && population.data?.orders.length === 0));
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
  /* Header filters ride the URL (`f.{column}`, repeated for each value), so a
     chip, a link and the engine's filter menu read one answer. */
  const filters = useMemo(() => {
    const out: Record<string, string[]> = {};
    params.forEach((value, key) => {
      if (key.startsWith("f.") && COLUMNS[key.slice(2)]) (out[key.slice(2)] ??= []).push(value);
    });
    return out;
  }, [params]);
  const setParam = useCallback(
    (key: string, value: string | null) =>
      updateParams((next) => {
        if (value == null) next.delete(key);
        else next.set(key, value);
      }),
    [updateParams],
  );
  const chooseTab = (next: Tab) =>
    updateParams((n) => {
      n.set("tab", next);
    });
  const chooseLayout = (next: LayoutKey) =>
    updateParams((n) => {
      n.set("cols", next);
      [...n.keys()].filter((k) => k.startsWith("f.")).forEach((k) => n.delete(k));
    });

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
          Object.entries(filters).every(([k, v]) => v.includes(COLUMNS[k]!.cell(r, ctx).t)),
      ),
    [all, inTab, requested, filters, ctx],
  );

  /* ── sort (the engine's header) · Group by (⋮) · paging ── */
  const group = (["delivery", "stock", "payment"] as const).find((g) => g === params.get("group")) ?? null;
  const query = JSON.stringify([tab, layoutKey, Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)).map(([key, values]) => [key, [...values].sort()]), seededSearch, requestedParam, group]);
  const [listContext, setListContext] = useState(() => listContextFor(userId, query));
  /* A genuinely changed scope starts on page1. A remount after Back does not.
     Compare values, not new filter/sort object identities or mount effects. */
  if (listContext.user !== userId) setListContext(listContextFor(userId, query));
  else if (listContext.query !== query) setListContext({ ...listContext, query, page: 1 });
  useLayoutEffect(() => { listContexts.set(listContext.user, listContext); }, [listContext]);
  const { sort, pageSize, page, selected } = listContext;
  const setSort = useCallback((next: ListSort) => setListContext((was) =>
    was.sort?.key === next?.key && was.sort?.dir === next?.dir ? was : { ...was, sort: next, page: 1 }), []);
  const setPageSize = useCallback((next: number) => setListContext((was) =>
    was.pageSize === next ? was : { ...was, pageSize: next, page: 1 }), []);
  const setPage = useCallback((next: number) => setListContext((was) =>
    was.page === next ? was : { ...was, page: next }), []);
  const setSelected = useCallback((update: Set<string> | ((selected: Set<string>) => Set<string>)) =>
    setListContext((was) => ({ ...was, selected: typeof update === "function" ? update(was.selected) : update })), []);
  const sorted = useMemo(() => {
    if (!sort || !COLUMNS[sort.key]) return list;
    const col = COLUMNS[sort.key]!;
    const valueOf = (r: RegisterRow) => sortValueOf(col.key, r, ctx);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const x = valueOf(a), y = valueOf(b);
      if (x == null || y == null) return x === y ? 0 : x == null ? 1 : -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [list, sort, ctx]);
  const pages = group ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize));
  /* A grouped list shows every order under its group; paging cuts a group. */
  const shown = group ? sorted : sorted.slice((Math.min(page, pages) - 1) * pageSize, Math.min(page, pages) * pageSize);
  const selectedRows = list.filter((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = (keys: string[], all: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      if (all) keys.forEach((k) => n.delete(k));
      else keys.forEach((k) => n.add(k));
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
  const open = (r: RegisterRow, e?: MouseEvent) => {
    const picked = window.getSelection?.()?.toString() ?? "";
    if (picked.length > 1) return;
    const path = `/operation/orders/so/${r.id}`;
    if (e?.metaKey || e?.ctrlKey) {
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
    ...Object.entries(filters).map(([k, v]) => ({ key: k, label: `${COLUMNS[k]!.label}: ${v.join(", ")}`, clear: () => setParam(`f.${k}`, null) })),
  ];
  const clearFilters = () =>
    updateParams((n) => {
      [...n.keys()].filter((k) => k === "search" || k === "requested" || k.startsWith("f.")).forEach((k) => n.delete(k));
    });
  const emptyMessage = populationEmpty ? "No sales orders yet" : "No sales orders match these filters";
  const clearableEmpty = !populationEmpty && Boolean(seededSearch || requested || Object.keys(filters).length);

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
  /* ── the one listing engine ── */
  const [cancelTarget, setCancelTarget] = useState<{ id: string; so: number } | null>(null);
  const [columnsDoor, setColumnsDoor] = useState<{ nonce: number; top: number; right: number } | undefined>(undefined);
  const moreRef = useRef<HTMLButtonElement>(null);
  const openColumnsChooser = () => {
    const r = moreRef.current?.getBoundingClientRect();
    setColumnsDoor((was) => ({ nonce: (was?.nonce ?? 0) + 1, top: (r?.bottom ?? 120) + 4, right: window.innerWidth - (r?.right ?? window.innerWidth - 16) }));
  };
  /* The item rows sit on the list's own measured columns (as SO Batch does). */
  const gridBox = useRef<HTMLElement>(null);
  const [drawn, setDrawn] = useState<number[]>([]);
  useEffect(() => {
    const el = gridBox.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const widths = [...el.querySelectorAll("thead th")].map((th) => Math.round(th.getBoundingClientRect().width * 10) / 10);
      setDrawn((was) => (was.join() === widths.join() ? was : widths));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    const table = el.querySelector("table");
    if (table) observer.observe(table);
    measure();
    return () => observer.disconnect();
  });
  const documentLinksOf = useCallback(
    (key: string, r: RegisterRow): { numbers: { poId: string; display: string }[]; open: (id: string) => void } | null => {
      if (key === "po" && r.poNumbers.length > 0) {
        return { numbers: poNumberLinks(r.poNumbers.map((poId) => ({ poId }))), open: (poId) => navigate(poObjectPath(poId)) };
      }
      if (key === "doNo") {
        const numbers = r.deliveryOrders.filter((d) => d.do_number).map((d) => ({ poId: d.do_number!, display: d.do_number! }));
        return numbers.length ? { numbers, open: (no) => navigate(`/operation/delivery-orders/${encodeURIComponent(no)}`) } : null;
      }
      if (key === "rcpt" && r.receipts) {
        const numbers = r.receipts.filter((x) => x.receipt_no).map((x) => ({ poId: x.id, display: x.receipt_no! }));
        return numbers.length ? { numbers, open: (id) => navigate(`/finance/payments?payment=${encodeURIComponent(id)}`) } : null;
      }
      return null;
    },
    [navigate],
  );
  const gridColumns = useMemo<DataGridColumn<RegisterRow>[]>(
    () =>
      layout.columns.map((k) => {
        const c = COLUMNS[k]!;
        /* The track is the words' room; the engine's cell keeps 5 each side
           inside it (10 between columns), so the column is the track plus 10. */
        const floor = trackFloor(c.width) + 10;
        const textOf = (r: RegisterRow) => c.cell(r, ctx).t;
        return {
          key: c.key,
          /* A two-line header keeps its second line grey 12/400 (owner 14 Oct 2026). */
          label: c.head ? c.head[0] : c.label,
          ...(c.head ? { headerSub: c.head[1] } : {}),
          exportLabel: c.label,
          width: floor,
          minWidth: floor,
          ...(c.align === "end" ? { align: "right" as const } : {}),
          accessor: (r: RegisterRow) => {
            /* A document number opens its own record (UI MASTER §6.0 rule 2):
               every PO (owner ruling 2026-10-06), Delivery Order and Receipt. */
            const links = documentLinksOf(k, r);
            if (links) return <PoNumberLinks wrap numbers={links.numbers} onOpen={links.open} />;
            return (
              <span className={`flex min-w-0 flex-col leading-[1.3] ${c.align === "end" ? "items-end" : "items-start"}`}>
                <CListCell cell={c.cell(r, ctx)} />
              </span>
            );
          },
          sortable: true,
          filterable: Boolean(c.filterable),
          filterValue: textOf,
          searchValue: textOf,
          exportValue: (r: RegisterRow) => {
            if (k === "po") return poNumberLinksText(poNumberLinks(r.poNumbers.map((poId) => ({ poId }))));
            const x = c.cell(r, ctx);
            return x.sub ? `${x.t} · ${x.sub}` : x.t;
          },
        };
      }),
    [layout, ctx, documentLinksOf],
  );
  /* The filter menus list the values of the orders in this tab. */
  const filterValues = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const k of layout.columns) {
      const c = COLUMNS[k]!;
      if (!c.filterable) continue;
      out[k] = [...new Set(all.filter(inTab).map((r) => c.cell(r, ctx).t))].sort((a, b) => a.localeCompare(b));
    }
    return out;
  }, [layout, all, inTab, ctx]);
  const onColumnQuery = useCallback(
    (q: { filters: Record<string, string[]>; sort: { key: string; dir: "asc" | "desc" } | null }) => {
      setSort(q.sort);
      updateParams((next) => {
        [...next.keys()].filter((key) => key.startsWith("f.")).forEach((key) => next.delete(key));
        for (const [key, values] of Object.entries(q.filters)) for (const v of values) next.append(`f.${key}`, v);
      });
    },
    [updateParams, setSort],
  );
  const fixedGroups =
    group === "delivery"
      ? {
          groups: [...REGISTER_DELIVERY_CONDITIONS, { key: "not_applicable", label: "Not applicable" }],
          groupOf: (r: RegisterRow) => registerDeliveryConditionOf(r.o.order_lines ?? [], r.o.allocated_units ?? []) ?? "not_applicable",
        }
      : group === "stock"
        ? { groups: STOCK_STATUSES.map((c) => ({ key: c.key, label: c.label })), groupOf: (r: RegisterRow) => stockStatusOf(r) }
        : group === "payment"
          ? { groups: PAYMENT_STATUSES.map((c) => ({ key: c.key, label: c.label })), groupOf: paymentStatusOf }
          : undefined;
  const GROUPS = [
    { key: null, label: "Group by: None" },
    { key: "delivery", label: "Group by: Delivery Status" },
    { key: "stock", label: "Group by: Stock Status" },
    { key: "payment", label: "Group by: Payment Status" },
  ] as const;

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
          loading={loadingList}
          failure={failedList ? <SalesOrderReadFailure error={listError} surface="sales-orders-register" onRetry={retryList} /> : undefined}
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
            className={`flex h-9 min-w-0 flex-nowrap items-center max-md:h-auto max-md:min-h-9 max-md:flex-wrap ${compact >= 3 ? "gap-1" : "gap-2"}`}
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
              {/* OVERTURNED 2026-10-22 by Weisiang (Mr Lim): office staff may
                  create Sales Orders (Houzs way). Jess's 2026-09-27 ruling is
                  kept for history in docs/orders/MASTER.md. */}
              <Button variant="primary" size="md" icon="add" data-testid="new-sales-order" onClick={() => navigate("/operation/orders/so/new")}>
                New Sales Order
              </Button>
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
                trigger={<CIconButton ref={moreRef} icon="more_vert" label="More actions" pressed={moreOpen} />}
              >
                <CMenuGroup first>EXPORT · orders shown now</CMenuGroup>
                <CMenuItem icon="table_view" note=".xlsx" onSelect={() => { setMoreOpen(false); void downloadExcel(list); }}>Download Excel</CMenuItem>
                <CMenuItem icon="picture_as_pdf" onSelect={() => { setMoreOpen(false); void downloadPdf(list); }}>Download PDF</CMenuItem>
                <CMenuGroup>VIEW</CMenuGroup>
                <CMenuItem icon="view_column" onSelect={() => { setMoreOpen(false); openColumnsChooser(); }}>Columns</CMenuItem>
                {GROUPS.map((g) => (
                  <CMenuItem key={g.label} checked={group === g.key} onSelect={() => { setMoreOpen(false); setParam("group", g.key); }}>{g.label}</CMenuItem>
                ))}
                <CMenuItem icon="bookmark_add" onSelect={() => { setMoreOpen(false); writeStore(VIEW_KEY(userId), JSON.stringify({ tab, cols: layoutKey })); toast.success(`Saved as your view: ${TABS.find((t) => t.key === tab)!.label} · ${layout.label}`); }}>Save as my view…</CMenuItem>
                <CMenuGroup>DATA</CMenuGroup>
                <CMenuItem icon="sync" note={dataUpdatedAt ? `Last ${time12(dataUpdatedAt)}` : undefined} onSelect={() => { setMoreOpen(false); void refetch(); }}>Sync from Sales Portal now</CMenuItem>
              </CPopover>
            </span>
            <TasksPill />
          </div>
        )}

        <section ref={gridBox} aria-label="Sales orders" className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]" data-carres-table="list">
          <DataGrid<RegisterRow>
            rows={shown}
            columns={gridColumns}
            storageKey={`carres.outright.grid.${layoutKey}.v1`}
            sessionKey={`carres.outright.${userId}`}
            presentationKey={JSON.stringify([query, pageSize, page, sort])}
            rowKey={(r) => r.id}
            rowTestId={(r) => `outright-row-${r.so}`}
            rowHeight={54}
            appearance="reference"
            palette="slate"
            hideToolbar
            openColumns={columnsDoor}
            searchPresentation="none"
            fitContent
            allowColumnGrouping={false}
            groupBanner={false}
            {...(fixedGroups ? { fixedGroups } : {})}
            stickyIdentity={{ columnKey: "order" }}
            serverColumns={{ values: filterValues, selected: filters, onChange: onColumnQuery }}
            onRowClick={(r, e) => open(r, e)}
            contextMenu={(r) =>
              documentRowMenu({
                view: () => open(r),
                print: () => void printSalesOrdersOrSay([r]),
                more: [{ label: "Cancel SO", danger: true, onClick: () => setCancelTarget({ id: r.id, so: r.so }) }],
              })
            }
            selectable={{
              selectedKeys: selected,
              onToggle: toggle,
              onToggleAll: toggleAll,
              rowLabel: (r: RegisterRow) => `Select SO-${r.so}`,
            }}
            expandable={{
              flush: true,
              frame: true,
              label: (_r, isOpen) => (isOpen ? "Hide items" : "Show items"),
              renderExpansion: (r) => <OrderItems row={r} catalogNames={catalogNames} ctx={ctx} drawn={drawn} />,
            }}
            isLoading={loadingList}
            errorState={failedList ? <SalesOrderReadFailure error={listError} surface="sales-orders-register" onRetry={retryList} /> : undefined}
            emptyMessage={emptyMessage}
            noMatchMessage={clearableEmpty ? emptyMessage : undefined}
            onClearConditions={clearFilters}
            clearConditionsInToolbar={selected.size === 0 && compact >= 3 && chips.length > 1}
            statusSummary={() => (
              <CListFooter
                testId="outright-footer"
                count={loadingList ? "Loading orders" : `${list.length} ${list.length === 1 ? "order" : "orders"}`}
                {...(loadingList || totals.parts.length === 0 ? {} : { totals })}
                pageSize={pageSize}
                onPageSize={setPageSize}
                page={Math.min(page, pages)}
                pages={pages}
                onPage={setPage}
              />
            )}
          />
        </section>
        {cancelTarget && (
          <CancelSalesOrderDialog
            orderId={cancelTarget.id}
            so={cancelTarget.so}
            open
            onOpenChange={(isOpen) => { if (!isOpen) setCancelTarget(null); }}
            onCancelled={() => void refetch()}
          />
        )}
      </main>
    </div>
  );
}

/** `1 pc` · `2 pcs`; a sofa in sets, `1 set` · `2 sets` (COPY quantities). */
const qtyWords = (n: number, sofa: boolean) => (sofa ? `${n} ${n === 1 ? "set" : "sets"}` : `${n} ${n === 1 ? "pc" : "pcs"}`);

/* ── what ▸ opens: the order's items, on the list's own measured columns ──
   `Item` (the model, then its grey spec line) spans the first three columns,
   `Qty` sits under the fourth and `Supplier` under the fifth and sixth (v12);
   the ▸ and ☐ spaces stay empty. */
function OrderItems({
  row,
  catalogNames,
  ctx,
  drawn,
}: {
  row: RegisterRow;
  catalogNames: Map<string, { name: string; variant: string }>;
  ctx: CellContext;
  drawn: readonly number[];
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
  const columns = drawn.length >= 4 ? drawn.map((w) => `${w}px`).join(" ") : "32px 30px minmax(0,1fr) 120px 120px 120px";
  const stepBack = (drawn[0] ?? 32) + (drawn[1] ?? 30);
  const item = { gridColumn: "3 / span 3" };
  const qty = { gridColumn: "6 / span 1" };
  const supplier = { gridColumn: "7 / span 2" };
  const suppliers = items.some((it) => it.supplier);
  const keep = { left: stepBack + 5 };
  return (
    <ItemRows label={`SO-${row.so}`} stepBack={stepBack} testId={`outright-items-${row.so}`}>
      <div role="row" className="grid h-8 items-center bg-c-band text-meta font-medium text-c-secondary" style={{ gridTemplateColumns: columns }}>
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span role="columnheader" className="flex min-w-0 items-center self-stretch px-[5px]" style={item}>
          <span className="sticky z-[1] bg-c-band" style={keep}>Item</span>
        </span>
        <span role="columnheader" className="px-[5px]" style={qty}>Qty</span>
        {suppliers ? <span role="columnheader" className="px-[5px]" style={supplier}>Supplier</span> : null}
      </div>
      {items.length === 0 ? <div role="row" className="border-t border-c-row-line px-3.5 py-3 text-body text-c-secondary">No items on this order</div> : null}
      {items.map((it) => (
        <div key={it.key} role="row" className="grid min-h-[44px] items-center border-t border-c-row-line bg-c-card py-1" style={{ gridTemplateColumns: columns }}>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span role="cell" className="flex min-w-0 items-center self-stretch px-[5px]" style={item}>
            {/* The item's words stay in view when the list scrolls sideways. */}
            <span className="sticky z-[1] flex min-w-0 flex-col bg-c-card leading-[1.3]" style={keep}>
              <span className="break-words text-body text-c-ink">{it.name}</span>
              {it.detail ? <span className="break-words text-meta text-c-secondary">{it.detail}</span> : null}
            </span>
          </span>
          <span role="cell" className="whitespace-nowrap px-[5px] text-body tabular-nums text-c-ink" style={qty}>{it.qty}</span>
          {suppliers ? (
            <span role="cell" className="flex min-w-0 flex-col px-[5px] text-body" style={supplier}>
              {it.supplier ? <CListCell cell={it.supplier} /> : null}
            </span>
          ) : null}
        </div>
      ))}
    </ItemRows>
  );
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
  failure,
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
  failure?: ReactNode;
}) {
  if (failure) return <CSidePanel label="Summary" title="Summary" onHide={onHide} testId="outright-summary">{failure}</CSidePanel>;
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
