// DataGrid — THE REGISTER ENGINE (Law 13: one engine for every Carres
// register — Sales Orders · Delivery Orders · Purchase Orders · Receiving ·
// Claims · Payments. A module may configure columns · filters · exports ·
// detail panel. It may NOT fork or modify the engine).
//
// COPIED from 2990s/apps/backend/src/components/DataGrid.tsx (1,551 lines,
// verified 2026-08-09: zero business imports) per card RG-2. Adapted ONLY:
//   · import paths (Carres aliases; Carres' own useDebouncedValue)
//   · styling tokens (DataGrid.module.css aliases 2990's vars to Carres values)
//   · toolbar order — search sits LEFT at 200px (REGISTER LAW 2; 2990 kept it
//     right of the caller's toolbar children)
//   · ONE engine extension, done once so every register gets it (Law 13):
//     a `selectable` grid shows a selection bar — "N selected · Clear ·
//     Export Excel (N)" — and that export writes the SELECTED rows only.
//     The toolbar's own Export Excel stays the current view (Law 9).
//   · when a page wires `onRowClick` (detail panel), row click no longer ALSO
//     toggles selection — the checkbox column owns selection. Pages without
//     `onRowClick` keep 2990's row-click-selects behaviour unchanged.
//
// Original feature notes (2990, kept verbatim):
// Built for high-density ERP list views (Sales Orders, Purchase Orders, etc.).
// Features:
//   - Drag column headers to reorder
//   - Right-click header → context menu (hide / pin left / auto-fit width)
//   - Resize columns via right-edge drag handle
//   - Sort: click sort arrow per column (asc / desc / off)
//   - Global search across all string-coercible cells
//   - Group-by zone: drag a column header onto the banner to group rows;
//     multiple group levels supported; rows collapse with caret
//   - Layout persisted to localStorage[storageKey]:
//       { order, hidden, widths, groupBy, sort }
//   - Sticky header. Density: row height ~28px, body fs-12, header fs-10
//     uppercase letter-spacing 0.06em.
//
// Pure React + HTML5 drag-and-drop.
//
// The toolbar (New / Edit / View / etc.) is rendered by the calling page —
// DataGrid accepts arbitrary toolbar children beside its own search box.

import {
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  type MouseEvent,
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, Columns3, RotateCcw, Filter, Download, ChevronDown, Printer } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { SkeletonRows } from "./Skeleton";
import { DateField } from "./DateField";
import styles from "./DataGrid.module.css";

const ICON = { size: 14, strokeWidth: 1.75 } as const;

export type DataGridColumn<T> = {
  key: string;
  label: string;
  accessor: (row: T) => ReactNode;
  /** default width in px */
  width?: number;
  minWidth?: number;
  align?: "left" | "right";
  sortable?: boolean;
  groupable?: boolean;
  sortFn?: (a: T, b: T) => number;
  /** value used when grouping (defaults to String(accessor(row))) */
  groupValue?: (row: T) => string;
  /** value used by global search (defaults to String(accessor(row))) */
  searchValue?: (row: T) => string;
  /** Text value written to Excel by the toolbar "Export Excel" button. Lets a
      caller override the exported cell when the cell renders JSX or when the
      search/filter value bundles extra tokens. Falls back, in order, to
      searchValue → filterValue → groupValue → '' (cells are ReactNode, so we
      never read the rendered node). */
  exportValue?: (row: T) => string | number;
  /** Header text written to Excel for this column. Defaults to `label`. Use this
      ONLY when the on-screen `label` is intentionally blank (a pure icon /
      checkbox / indicator column) so the exported sheet still gets a real,
      non-empty header cell instead of a blank one (Wei Siang 2026-06-23). */
  exportLabel?: string;
  /** Clean single value shown in (and matched by) the per-column filter
      dropdown. Use this when `searchValue` deliberately bundles several
      tokens (e.g. "SO-2605-001 CONFIRMED") so the funnel still lists the one
      value the operator sees in the cell. Falls back to groupValue, then the
      cell text — never to searchValue. */
  filterValue?: (row: T) => string;
  /** Per-column filter UX (Commander 2026-06-18 — one unified filter spec):
      - 'date'      → quick presets (Today/This week/This month/…) + a custom
                      from→to range. `dateValue` returns the row's RAW ISO date.
      - 'number'    → min/max range inputs. `numberValue` returns the raw number.
      - 'numbering' → searchable distinct-value list (type-to-find over doc
                      codes like PO-2606-001), backed by `filterValue`.
      - 'enum' | 'text' | undefined → the classic checkbox value list. */
  filterType?: "date" | "number" | "numbering" | "enum" | "text";
  dateValue?: (row: T) => string | null | undefined;
  /** Raw numeric value for `filterType: 'number'` min/max matching. */
  numberValue?: (row: T) => number | null | undefined;
  /**
   * HOUZS port (so-list-houzs-port) — when true and the user hasn't manually
   * hidden/shown anything yet (no persisted `layout.hidden` for this key),
   * the column is hidden by default. User can show it via right-click "Show
   * column" menu; the choice persists in localStorage from then on.
   * Used to match Houzs "19 of 25 columns visible by default" semantics.
   */
  defaultHidden?: boolean;
  /**
   * STAGE 1 engine extension (Law 13 — extended ONCE so every register gets
   * it): the GROUPED Columns chooser, one of the two approved Carres
   * improvements over 2990. When ANY column declares a `chooserGroup`, the
   * Columns popover stacks its checkboxes under these headers, in first-
   * appearance order; columns without one fall under "Other". With no
   * groups declared the popover renders 2990's flat list unchanged.
   */
  chooserGroup?: string;
  /**
   * STAGE 1 engine extension (Law 13): FOOTER TOTALS, AutoCount's power.
   * When any visible column declares `footerTotal`, the grid renders one
   * sticky totals row at the bottom of the table. The rows handed in are
   * the FILTERED list (post search + ▽ filters + sort) — never the visible
   * window, so virtualization cannot shrink a total.
   */
  footerTotal?: (rows: T[]) => ReactNode;
};

/** A single entry in a row's right-click context menu. `divider: true`
    renders a horizontal rule (the other fields are then ignored). */
export type DataGridContextMenuItem = {
  label?: string;
  onClick?: () => void;
  /** Renders with the danger colour and a danger hover state. */
  danger?: boolean;
  /** When true, this entry renders as a `<hr>` divider between groups. */
  divider?: boolean;
};

export type DataGridProps<T> = {
  rows: T[];
  columns: DataGridColumn<T>[];
  /** localStorage key for column layout persistence */
  storageKey: string;
  /** row id accessor — required for selection + key */
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  /** Human filename stem for the "Export Excel" button, e.g. "Purchase Orders".
      Falls back to a cleaned storageKey when omitted. A YYYY-MM-DD date is
      appended automatically. (Wei Siang 2026-06-20 — storageKey filenames like
      "pr-g-so-list-layout-v1" read like junk.) */
  exportName?: string;
  onRowDoubleClick?: (row: T) => void;
  /** Commander 2026-05-28 — single-click anywhere on a row fires this (in
      addition to the highlight). Cells that stopPropagation (checkboxes,
      inline inputs) won't trigger it. Used by PO-from-SO to toggle a pick. */
  onRowClick?: (row: T) => void;
  /** Commander 2026-05-29 — optional per-row inline style. Used by PO-from-SO
      to grey out rows whose supplier conflicts with the locked one. Returns
      undefined for the default look. */
  rowStyle?: (row: T) => CSSProperties | undefined;
  onSelectionChange?: (rows: T[]) => void;
  /** Fires with the rows currently visible after search + column filters
      (post-sort) — lets a parent print/export exactly what's filtered, no
      row-ticking. Pass a STABLE setter (e.g. a useState dispatch). (2026-06-16) */
  onFilteredRowsChange?: (rows: T[]) => void;
  /**
   * STAGE 1 FIX 1 — fires with the DEBOUNCED, TRIMMED search term whenever it
   * changes, so the page can re-ask the SERVER with the same words the
   * operator typed. The engine keeps filtering the rows it holds (instant
   * feedback); the server narrows the population behind them. Pass a STABLE
   * setter.
   */
  onSearchChange?: (q: string) => void;
  /** Optional destination composition. `reference` changes geometry/chrome
      only; all grid behaviour remains in this same engine. */
  appearance?: "default" | "reference";
  toolbar?: ReactNode;
  /** Reference-toolbar slots. Start renders before Search; End renders after
      Filters / Export / Columns. The legacy `toolbar` slot is unchanged. */
  toolbarStart?: ReactNode;
  /** Outputs valid ONLY for the exact selection — MASTER.md:588. The label
   *  receives the count so the button prints the truthful number. */
  selectionActions?: Array<{ label: (n: number) => string; onClick: (rows: never[]) => void }>;
  toolbarEnd?: ReactNode;
  /** Fixed informational footer. Receives the filtered result and, when
      present, the selected rows that remain in that result. */
  statusSummary?: (filteredRows: T[], selectedRows: T[]) => ReactNode;
  /** Additional read-only outputs shown beside the built-in Excel export. */
  outputActions?: Array<{ label: string; onClick: () => void }>;
  /** controlled focus for the "Find" button — bump to focus the search box */
  focusSearchNonce?: number;
  /** bump to collapse every expanded drill-down row ("Collapse all") */
  collapseAllNonce?: number;
  /**
   * ⭐ STICKY IDENTITY — owner ruling 2026-08-15 (Chai). OPTIONAL, default OFF.
   *
   * When optional columns widen the sheet past its frame, the grid scrolls
   * sideways and the row loses the only thing that says WHICH record it is.
   * With this on, the control gutter (selection + expand) and the FIRST data
   * column pin to the left edge and the rest of the sheet slides under them.
   *
   * It is an ENGINE capability, not a page hack: any register that scrolls
   * horizontally has the same problem, and one implementation is the only way
   * two of them cannot disagree. The default stays OFF so no signature moved
   * and no unwired page changed — an unwired power's absence is asserted by a
   * test (`docs/ui/MASTER.md` §4).
   *
   * The FIRST data column is pinned, not a named one: the engine does not know
   * what a `SO No` is, and the identity column is whatever the page put first.
   */
  stickyIdentity?: boolean;
  /** show "Drag a column header here to group by that column" banner */
  groupBanner?: boolean;
  emptyMessage?: string;
  isLoading?: boolean;
  /**
   * Right-click row menu. Receives the row and returns the items to show.
   * Opening selects the row (single-row select). `null`/empty array
   * suppresses the menu (browser default also suppressed).
   */
  contextMenu?: (row: T) => DataGridContextMenuItem[];
  /**
   * Optional inline-expand row support (HOUZS SO Listing pattern).
   *   - prepends a 32px chevron column at the left
   *   - clicking the chevron toggles an inline sub-row below the parent
   *     (rendered by `renderExpansion(row)` spanning all visible columns)
   *   - chevron rotates 90deg when expanded
   * Pass `undefined` (default) to keep the legacy chevron-less layout
   * untouched — existing callers require no changes.
   */
  expandable?: {
    /** Render the sub-row body. Return null to render an empty row. */
    renderExpansion: (row: T) => ReactNode;
    /** Optional: derive a stable row id for expansion state. Defaults to rowKey. */
    rowExpansionKey?: (row: T) => string;
  };
  /**
   * First-class multi-select (Commander 2026-06-19). Prepends a synthetic
   * `__select__` checkbox column (mirrors `__expand__`); the header checkbox
   * selects/clears all currently-visible rows. Selection state lives in the
   * parent so it survives re-render + drives batch actions.
   */
  selectable?: {
    selectedKeys: Set<string>;
    onToggle: (key: string) => void;
    /** Toggle all visible rows. `keys` = the keys currently shown; `allSelected`
        = whether they are all already selected (so the parent clears vs selects). */
    onToggleAll: (keys: string[], allSelected: boolean) => void;
  };
  /**
   * STAGE 1 engine extension (Law 13, with `chooserGroup`): the order the
   * grouped Columns chooser lists its sections in. Groups not named here
   * append in first-appearance order; omitted entirely = first-appearance.
   */
  chooserGroupOrder?: readonly string[];
  /**
   * Compact mode for grids embedded inside another grid's expansion row
   * (the SO drill-down). Suppresses the search box and the bottom
   * "N of M rows / Reset layout" status line — both read as heavy chrome
   * inside a small sub-table. The Columns popover button, header drag-
   * reorder, resize and right-click menu stay, so add/remove/reorder
   * columns still work. Pair with `groupBanner={false}`.
   */
  embedded?: boolean;
};

type Layout = {
  order: string[];
  hidden: string[];
  widths: Record<string, number>;
  groupBy: string[];
  pinned: string[];
  sort: { key: string; dir: "asc" | "desc" } | null;
};

const DEFAULT_LAYOUT: Layout = {
  order: [],
  hidden: [],
  widths: {},
  groupBy: [],
  pinned: [],
  sort: null,
};

function readLayout(key: string): Layout {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<Layout>;
    return { ...DEFAULT_LAYOUT, ...parsed };
  } catch {
    return DEFAULT_LAYOUT;
  }
}
function writeLayout(key: string, layout: Layout) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(layout));
  } catch {
    /* quota */
  }
}

const coerceSearchString = (v: ReactNode): string => {
  if (v == null || v === false) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  // for ReactNode (e.g., a span with a pill), best-effort: skip — caller can supply searchValue
  return "";
};

/* Date-filter quick presets for `filterType: 'date'` columns (Commander
   2026-06-16). Evaluated in MYT (UTC+8) to match the rest of the app — a Date
   shifted by +8h has its UTC fields equal to the MYT wall clock, so date-only
   math via the getUTCDate / setUTCDate family is correct. */
export type DatePreset = "today" | "tomorrow" | "thisWeek" | "thisMonth" | "lastMonth" | "overdue";
const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "thisWeek", label: "This week" },
  { key: "thisMonth", label: "This month" },
  { key: "lastMonth", label: "Last month" },
  { key: "overdue", label: "Overdue" },
];
const dateMatchesPreset = (iso: string | null | undefined, preset: DatePreset): boolean => {
  if (!iso) return false;
  const d = String(iso).slice(0, 10);
  if (d.length < 10) return false;
  const nowMyt = new Date(Date.now() + 8 * 3600 * 1000);
  const today = nowMyt.toISOString().slice(0, 10);
  switch (preset) {
    case "today":
      return d === today;
    case "overdue":
      return d < today;
    case "tomorrow": {
      const t = new Date(nowMyt);
      t.setUTCDate(t.getUTCDate() + 1);
      return d === t.toISOString().slice(0, 10);
    }
    case "thisWeek": {
      const dow = (nowMyt.getUTCDay() + 6) % 7; // 0 = Monday
      const mon = new Date(nowMyt);
      mon.setUTCDate(mon.getUTCDate() - dow);
      const sun = new Date(mon);
      sun.setUTCDate(sun.getUTCDate() + 6);
      return d >= mon.toISOString().slice(0, 10) && d <= sun.toISOString().slice(0, 10);
    }
    case "thisMonth":
      return d.slice(0, 7) === today.slice(0, 7);
    case "lastMonth": {
      const lm = new Date(nowMyt);
      lm.setUTCDate(1);
      lm.setUTCMonth(lm.getUTCMonth() - 1);
      return d.slice(0, 7) === lm.toISOString().slice(0, 7);
    }
    default:
      return false;
  }
};

/* Task #99 (UI perf) — Inner implementation, kept generic. Exported
   `DataGrid` below is the same function wrapped in React.memo so a parent
   re-render with unchanged props (rows, columns, etc.) skips the whole
   sort/filter/group recompute pipeline. Each list page now memoizes its
   `columns` array + handlers so the memo actually hits. */
function DataGridInner<T>({
  rows,
  columns,
  storageKey,
  rowKey,
  searchPlaceholder = "Search…",
  exportName,
  onRowDoubleClick,
  onRowClick,
  rowStyle,
  onSelectionChange,
  onFilteredRowsChange,
  onSearchChange,
  appearance = "default",
  toolbar,
  toolbarStart,
  toolbarEnd,
  selectionActions,
  statusSummary,
  outputActions,
  focusSearchNonce,
  collapseAllNonce,
  stickyIdentity = false,
  groupBanner = true,
  emptyMessage = "No data.",
  isLoading = false,
  contextMenu,
  expandable,
  selectable,
  chooserGroupOrder,
  embedded = false,
}: DataGridProps<T>) {
  /* HOUZS-style inline expansion (PR so-list-houzs-port). Tracks the set of
     expanded row ids; rendering inserts a colSpan sub-<tr> directly under
     each expanded parent. Stored as a Set so the chevron column accessor
     can read state in O(1). */
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const expansionId = expandable?.rowExpansionKey ?? rowKey;
  const toggleExpand = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);
  const [layout, setLayoutRaw] = useState<Layout>(() => readLayout(storageKey));
  const setLayout = useCallback(
    (updater: (l: Layout) => Layout) => {
      setLayoutRaw((prev) => {
        const next = updater(prev);
        writeLayout(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<{ x: number; y: number; colKey: string } | null>(null);
  /** Right-click row menu — anchor point + the menu items resolved at open time. */
  const [rowCtx, setRowCtx] = useState<{
    x: number;
    y: number;
    items: DataGridContextMenuItem[];
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [groupZoneActive, setGroupZoneActive] = useState(false);
  /* HOUZS-parity Columns popover — commander 2026-05-27: "为什么不是跟houzs的一样".
     The right-click header menu still works (backwards compat); this adds a
     discoverable toolbar button + popover with a per-column checkbox + Reset
     link, matching houzs-erp/src/pages/SalesOrderPage.tsx lines 576-624. */
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [outputMenuOpen, setOutputMenuOpen] = useState(false);
  /* The Columns popover is fixed-positioned (not absolute) so it escapes the
     grid card's `overflow: hidden`, which otherwise clips the dropdown when the
     card is short (few rows). Anchor it to the toolbar button's live rect. */
  const columnsBtnRef = useRef<HTMLButtonElement>(null);
  /* Ref on the popover panel so the scroll-to-close guard can tell an INSIDE
     scroll (the operator scrolling the column list) from an OUTSIDE scroll
     (the page/grid moving, which should dismiss the detached fixed popover). */
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const outputBtnRef = useRef<HTMLButtonElement>(null);
  const [outputMenuPos, setOutputMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [columnsMenuPos, setColumnsMenuPos] = useState<{ top: number; right: number } | null>(
    null,
  );
  /* Per-column value filter (Commander 2026-05-29 — "没有 drop-down 菜单让我
     去做选择"). filters[colKey] = the set of allowed values; absent / empty =
     no filter on that column. filterMenu anchors the open dropdown. */
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  // Date-preset filters for `filterType: 'date'` columns (colKey → preset).
  const [dateFilters, setDateFilters] = useState<Record<string, DatePreset>>({});
  // Number range filters (`filterType: 'number'`): colKey → {min?, max?}.
  const [numberFilters, setNumberFilters] = useState<
    Record<string, { min?: number; max?: number }>
  >({});
  // Custom date range (`filterType: 'date'`): colKey → {from?, to?} ISO. Sits
  // alongside the preset (if both set, they AND together).
  const [dateRangeFilters, setDateRangeFilters] = useState<
    Record<string, { from?: string; to?: string }>
  >({});
  const [filterMenu, setFilterMenu] = useState<{ colKey: string; x: number; y: number } | null>(
    null,
  );
  // Type-to-find text for `filterType: 'numbering'` (filters the value list).
  const [filterSearch, setFilterSearch] = useState("");
  /* Same inside-vs-outside scroll guard as the Columns popover — the filter
     dropdown has its own scrollable value list (maxHeight 320 / overflow auto). */
  const filterMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Refocus search when parent bumps focusSearchNonce ("Find" button).
  useEffect(() => {
    if (focusSearchNonce != null) searchRef.current?.focus();
  }, [focusSearchNonce]);

  // Collapse every expanded drill-down when the parent bumps collapseAllNonce.
  useEffect(() => {
    if (collapseAllNonce != null) setExpandedRows(new Set());
  }, [collapseAllNonce]);

  // Close context menu on outside click.
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [ctx]);

  /* Close the row context menu on outside click, scroll, or Escape — same
     UX as the header context menu but rendered at a higher z-index so it
     clears the sticky <thead>. */
  useEffect(() => {
    if (!rowCtx) return;
    const close = () => setRowCtx(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [rowCtx]);

  /* Close the Columns popover on outside click — mirrors the `ctx` pattern.
     The popover itself stops propagation on its container so clicks inside
     don't dismiss it. Escape also closes for keyboard parity. */
  useEffect(() => {
    if (!columnsMenuOpen) return;
    const close = () => setColumnsMenuOpen(false);
    /* Scrolling the menu's OWN list must not close the menu. We listen on the
       capture phase so we still catch scrolls of any outer page container, but
       skip the event when it originates inside the menu itself. */
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && columnsMenuRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [columnsMenuOpen]);

  /* Close the per-column filter dropdown on outside click / Escape. */
  useEffect(() => {
    if (!filterMenu) return;
    const close = () => setFilterMenu(null);
    /* Same inside-scroll guard as the Columns menu: scrolling the filter
       dropdown's own list shouldn't dismiss it. */
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && filterMenuRef.current?.contains(e.target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [filterMenu]);

  // Reset the numbering type-to-find when the open column changes / closes.
  useEffect(() => {
    setFilterSearch("");
  }, [filterMenu?.colKey]);

  // Value a column reports for grouping/sorting (groupValue → searchValue → text).
  const colValue = useCallback((c: DataGridColumn<T>, row: T): string => {
    if (c.groupValue) return c.groupValue(row);
    if (c.searchValue) return c.searchValue(row);
    return coerceSearchString(c.accessor(row));
  }, []);

  // Clean value the per-column filter dropdown shows + matches on. Prefers the
  // value the operator sees in the cell (filterValue → groupValue → cell text)
  // and only falls back to searchValue — a broad multi-token blob — when the
  // cell is JSX with no clean value to offer, so the funnel is never blank.
  const filterColValue = useCallback((c: DataGridColumn<T>, row: T): string => {
    // Always coerce to a string — a column callback may hand back undefined/null
    // for some rows, and a non-string here can crash downstream string ops.
    if (c.filterValue) return String(c.filterValue(row) ?? "");
    if (c.groupValue) return String(c.groupValue(row) ?? "");
    const text = coerceSearchString(c.accessor(row));
    if (text) return text;
    return String((c.searchValue ? c.searchValue(row) : "") ?? "");
  }, []);

  const toggleFilterValue = useCallback((colKey: string, val: string) => {
    setFilters((prev) => {
      const cur = prev[colKey] ?? [];
      const next = cur.includes(val) ? cur.filter((v) => v !== val) : [...cur, val];
      const out = { ...prev };
      if (next.length === 0) delete out[colKey];
      else out[colKey] = next;
      return out;
    });
  }, []);
  // Bulk select / invert for the per-column value checkbox list (Commander
  // 2026-06-18). `vals` is the column's full distinct-value list (filterValues).
  const selectAllFilterValues = useCallback((colKey: string, vals: string[]) => {
    setFilters((prev) => (vals.length === 0 ? prev : { ...prev, [colKey]: [...vals] }));
  }, []);
  const invertFilterValues = useCallback((colKey: string, vals: string[]) => {
    setFilters((prev) => {
      const cur = prev[colKey] ?? [];
      const next = vals.filter((v) => !cur.includes(v));
      const out = { ...prev };
      if (next.length === 0) delete out[colKey];
      else out[colKey] = next;
      return out;
    });
  }, []);
  const clearFilter = useCallback((colKey: string) => {
    setFilters((prev) => {
      const o = { ...prev };
      delete o[colKey];
      return o;
    });
    setDateFilters((prev) => {
      const o = { ...prev };
      delete o[colKey];
      return o;
    });
    setNumberFilters((prev) => {
      const o = { ...prev };
      delete o[colKey];
      return o;
    });
    setDateRangeFilters((prev) => {
      const o = { ...prev };
      delete o[colKey];
      return o;
    });
  }, []);
  // Number-range bound setter — '' / NaN clears that bound; both empty drops the filter.
  const setNumberBound = useCallback((colKey: string, bound: "min" | "max", value: string) => {
    setNumberFilters((prev) => {
      const cur = { ...(prev[colKey] ?? {}) };
      if (value.trim() === "" || Number.isNaN(Number(value))) delete cur[bound];
      else cur[bound] = Number(value);
      const out = { ...prev };
      if (cur.min == null && cur.max == null) delete out[colKey];
      else out[colKey] = cur;
      return out;
    });
  }, []);
  // Custom date-range bound setter — '' clears that bound; both empty drops the filter.
  const setDateBound = useCallback((colKey: string, bound: "from" | "to", value: string) => {
    setDateRangeFilters((prev) => {
      const cur = { ...(prev[colKey] ?? {}) };
      if (value === "") delete cur[bound];
      else cur[bound] = value;
      const out = { ...prev };
      if (!cur.from && !cur.to) delete out[colKey];
      else out[colKey] = cur;
      return out;
    });
  }, []);
  // Date-preset toggle: clicking the active preset again clears it.
  const toggleDatePreset = useCallback((colKey: string, preset: DatePreset) => {
    setDateFilters((prev) => {
      const out = { ...prev };
      if (out[colKey] === preset) delete out[colKey];
      else out[colKey] = preset;
      return out;
    });
  }, []);

  /* HOUZS-parity column show/hide actions for the Columns popover. Reset
     clears hidden + order + widths (preserving groupBy + sort so search
     state survives). toggleColumn flips a column's presence in `hidden`. */
  const resetColumns = useCallback(() => {
    setLayout((l) => ({ ...l, hidden: [], order: [], widths: {} }));
    setColumnsMenuOpen(false);
  }, [setLayout]);
  const toggleColumn = useCallback(
    (colKey: string) => {
      setLayout((l) => {
        /* If we're still on the pristine-defaults overlay (no explicit
         choices yet) materialize the current set of hidden keys before
         toggling, so the first interaction doesn't silently un-hide every
         defaultHidden column. */
        const pristine = l.order.length === 0 && l.hidden.length === 0;
        const baseHidden = pristine
          ? columns.filter((c) => c.defaultHidden).map((c) => c.key)
          : l.hidden;
        const hidden = baseHidden.includes(colKey)
          ? baseHidden.filter((k) => k !== colKey)
          : [...baseHidden, colKey];
        return { ...l, hidden };
      });
    },
    [columns, setLayout],
  );

  // ── Resolve visible/ordered columns ───────────────────────────────
  // If `expandable` is set, prepend a synthetic 32px chevron column that
  // can't be reordered/hidden via the layout (filtered out of order /
  // hidden persistence on read). The accessor is built per-row inside
  // the tbody render so it can read expandedRows + call toggleExpand.
  /* HOUZS port — when the persisted layout is pristine (no order +
     no hidden customisations yet) apply `defaultHidden: true` from the
     column spec so the grid starts with Houzs's 19-of-25 / 34-of-44
     visible-by-default semantics. Once the user shows/hides anything,
     the persisted `hidden` array takes precedence and we stop overlaying
     defaults (their explicit choice wins). Lifted out of the visibleColumns
     memo so the Columns popover can read the same set without recomputing. */
  const effectiveHidden = useMemo(() => {
    const pristineLayout = layout.order.length === 0 && layout.hidden.length === 0;
    return pristineLayout
      ? new Set(columns.filter((c) => c.defaultHidden).map((c) => c.key))
      : new Set(layout.hidden);
  }, [columns, layout.order, layout.hidden]);

  const visibleColumns = useMemo(() => {
    const byKey = new Map(columns.map((c) => [c.key, c]));
    const order = layout.order.length
      ? [
          ...layout.order.filter((k) => byKey.has(k)),
          ...columns.filter((c) => !layout.order.includes(c.key)).map((c) => c.key),
        ]
      : columns.map((c) => c.key);
    const base = order
      .filter((k) => !effectiveHidden.has(k))
      .map((k) => byKey.get(k)!)
      .filter(Boolean);
    const synthetic: DataGridColumn<T>[] = [];
    /* Synthetic select column — checkbox rendered in a dedicated <td>/<th>. */
    if (selectable) {
      synthetic.push({
        key: "__select__",
        label: "",
        width: 30,
        minWidth: 30,
        sortable: false,
        groupable: false,
        accessor: () => null,
        searchValue: () => "",
      });
    }
    /* Synthetic chevron column — accessor is a placeholder; the actual chevron
       is rendered in a dedicated <td> in the tbody so it can wire click handlers
       without leaking `toggleExpand` into the column spec. */
    if (expandable) {
      synthetic.push({
        key: "__expand__",
        label: "",
        width: 32,
        minWidth: 32,
        sortable: false,
        groupable: false,
        accessor: () => null,
        searchValue: () => "",
      });
    }
    return synthetic.length ? [...synthetic, ...base] : base;
  }, [columns, layout.order, effectiveHidden, expandable, selectable]);

  /**
   * ⭐ STICKY IDENTITY — which columns pin, and how far from the left edge.
   *
   * The pinned block is the control gutter plus the FIRST data column. Its
   * offsets are cumulative and read the SAME width source the cells do
   * (`layout.widths` first, the column's own width second), so a resized or
   * reordered identity column keeps the block correct instead of leaving a
   * gap the rows slide through. Empty when the capability is off, which is
   * what keeps every other register byte-identical.
   */
  const pinnedLefts = useMemo(() => {
    const m = new Map<string, number>();
    if (!stickyIdentity) return m;
    let left = 0;
    for (const col of visibleColumns) {
      m.set(col.key, left);
      left += Number(layout.widths[col.key] ?? col.width ?? 140);
      // Stop AFTER the first real data column — the identity, not the record.
      if (!col.key.startsWith("__")) break;
    }
    return m;
  }, [stickyIdentity, visibleColumns, layout.widths]);
  /** The last pinned column carries the edge that says where the block ends. */
  const pinnedEdgeKey = useMemo(() => {
    const keys = [...pinnedLefts.keys()];
    return keys.length ? keys[keys.length - 1] : null;
  }, [pinnedLefts]);
  /** Both a `<th>` and a `<td>` need the same two decisions — one helper. */
  const pinStyle = (key: string): CSSProperties =>
    pinnedLefts.has(key) ? { left: pinnedLefts.get(key) } : {};
  const pinClass = (key: string): string =>
    pinnedLefts.has(key)
      ? ` ${styles.stickyCell}${key === pinnedEdgeKey ? ` ${styles.stickyEdge}` : ""}`
      : "";

  /**
   * ⭐ THE CHILD BOX BEGINS WHERE THE RECORD BEGINS — owner ruling 2026-08-15.
   *
   * An expansion used to start at whatever padding the calling page happened
   * to write, which on Sales Orders was 40px against a 62px gutter: the child
   * table's left edge landed inside the `▸` column, two pixels of nothing on
   * either side of nowhere. The indent is not decoration — the EMPTY ☐ and ▸
   * cells beside the child rows are the parent-child link, and they only read
   * as one when the box starts exactly at the first data column.
   *
   * SO THE TABLE ALIGNS IT, NOT A NUMBER. The expansion row now carries one
   * REAL empty cell per gutter column and spans the data columns with the
   * rest; the browser's own column layout then puts the box's left edge on the
   * first data column's left edge exactly. A computed `padding-left` cannot:
   * `width` on a `<td>` is a HINT, and this grid's columns stretch to fill the
   * frame — measured live at 1440, the 30px ☐ and 32px ▸ render 41px and 43px,
   * so a 62px padding lands 22px short of `SO No`. Nothing is measured here,
   * so nothing can drift when a column is resized, hidden or reordered.
   *
   * (Law 13: an alignment every register needs is an engine capability, never
   * a page-local hack — `docs/ui/MASTER.md` §4.)
   */
  const expansionGutter = useMemo(
    () => visibleColumns.filter((c) => c.key.startsWith("__")).map((c) => c.key),
    [visibleColumns],
  );

  /* The Columns pill counts DATA columns only — the synthetic __select__ /
     __expand__ columns are chrome, not catalog (2990 subtracted only the
     chevron; a selectable grid was off by one). */
  const visibleDataColumnCount = useMemo(
    () => visibleColumns.filter((c) => !c.key.startsWith("__")).length,
    [visibleColumns],
  );

  // ── Filtered + sorted + grouped rows ──────────────────────────────
  /* Precompute one lowercased search blob per row (once per rows/columns
     change) so a keystroke is a single substring test instead of
     rows × columns work that re-builds each cell's search value (and, for
     JSX cells, constructs React nodes) on every character. */
  const searchBlobs = useMemo(() => {
    const m = new Map<T, string>();
    for (const row of rows) {
      let blob = "";
      for (const c of columns) {
        const sv = c.searchValue ? c.searchValue(row) : coerceSearchString(c.accessor(row));
        // Coerce defensively: a custom `searchValue` may return undefined/null or
        // a non-string for some rows — that must NEVER crash the whole grid (it
        // took the page down with "Cannot read properties of undefined (reading
        // 'toLowerCase')"). '\n' separator so adjacent columns can't form a false
        // cross-boundary match.
        blob += `${String(sv ?? "").toLowerCase()}\n`;
      }
      m.set(row, blob);
    }
    return m;
  }, [rows, columns]);

  /* Debounce the value that drives filtering (the input itself stays bound to
     `search`, so typing is instant) — keeps large lists responsive while
     typing. Separate from the autocomplete debounce elsewhere. */
  const debouncedSearch = useDebouncedValue(search, 150);

  /* STAGE 1 FIX 1 — hand the debounced trimmed term to the page so it can ask
     the SERVER. Client filtering below is unchanged: it narrows the rows
     already here while the server round-trip is in flight. */
  useEffect(() => {
    onSearchChange?.(debouncedSearch.trim());
  }, [debouncedSearch, onSearchChange]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const active = Object.entries(filters).filter(([, vals]) => vals.length > 0);
    const activeDates = Object.entries(dateFilters);
    const activeNumbers = Object.entries(numberFilters);
    const activeDateRanges = Object.entries(dateRangeFilters);
    if (
      !q &&
      active.length === 0 &&
      activeDates.length === 0 &&
      activeNumbers.length === 0 &&
      activeDateRanges.length === 0
    )
      return rows;
    return rows.filter((row) => {
      if (q && !(searchBlobs.get(row) ?? "").includes(q)) return false;
      for (const [colKey, vals] of active) {
        const c = columns.find((cc) => cc.key === colKey);
        if (!c) continue;
        if (!vals.includes(filterColValue(c, row))) return false;
      }
      // Date-preset filters — match on the column's raw ISO dateValue (falls
      // back to the displayed value if a date column didn't supply one).
      for (const [colKey, preset] of activeDates) {
        const c = columns.find((cc) => cc.key === colKey);
        if (!c) continue;
        const iso = c.dateValue ? c.dateValue(row) : filterColValue(c, row);
        if (!dateMatchesPreset(iso, preset)) return false;
      }
      // Custom date range (from/to inclusive, ISO YYYY-MM-DD string compare).
      for (const [colKey, range] of activeDateRanges) {
        const c = columns.find((cc) => cc.key === colKey);
        if (!c) continue;
        const raw = c.dateValue ? c.dateValue(row) : filterColValue(c, row);
        const d = String(raw ?? "").slice(0, 10);
        if (!d) return false;
        if (range.from && d < range.from) return false;
        if (range.to && d > range.to) return false;
      }
      // Number range (min/max inclusive).
      for (const [colKey, range] of activeNumbers) {
        const c = columns.find((cc) => cc.key === colKey);
        if (!c) continue;
        const n = c.numberValue ? c.numberValue(row) : Number(filterColValue(c, row));
        if (n == null || Number.isNaN(n)) return false;
        if (range.min != null && n < range.min) return false;
        if (range.max != null && n > range.max) return false;
      }
      return true;
    });
  }, [
    rows,
    columns,
    debouncedSearch,
    filters,
    dateFilters,
    numberFilters,
    dateRangeFilters,
    filterColValue,
    searchBlobs,
  ]);

  // Distinct values for the currently-open filter dropdown.
  const filterValues = useMemo(() => {
    if (!filterMenu) return [];
    const c = columns.find((cc) => cc.key === filterMenu.colKey);
    if (!c) return [];
    const set = new Set<string>();
    for (const row of rows) set.add(filterColValue(c, row));
    return [...set].sort((a, b) => (a || "~").localeCompare(b || "~"));
  }, [filterMenu, columns, rows, filterColValue]);

  const sortedRows = useMemo(() => {
    if (!layout.sort) return filteredRows;
    const col = columns.find((c) => c.key === layout.sort!.key);
    if (!col) return filteredRows;
    const cmp =
      col.sortFn ??
      ((a: T, b: T) => {
        // Fall back to the column's group/search value when the cell is JSX
        // (accessor text is empty for a ReactNode) so columns without an
        // explicit sortFn — e.g. Doc No — still sort instead of silently no-op.
        const va = coerceSearchString(col.accessor(a)) || colValue(col, a);
        const vb = coerceSearchString(col.accessor(b)) || colValue(col, b);
        // numeric-aware
        const na = Number(va),
          nb = Number(vb);
        if (Number.isFinite(na) && Number.isFinite(nb) && va !== "" && vb !== "") return na - nb;
        return va.localeCompare(vb);
      });
    const dir = layout.sort.dir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => cmp(a, b) * dir);
  }, [filteredRows, columns, layout.sort, colValue]);

  // Selection callback when row changes.
  useEffect(() => {
    if (!onSelectionChange) return;
    if (selectedKey == null) {
      onSelectionChange([]);
      return;
    }
    const found = rows.find((r) => rowKey(r) === selectedKey);
    onSelectionChange(found ? [found] : []);
  }, [selectedKey, rows, rowKey, onSelectionChange]);

  /* Filtered-rows callback (Commander 2026-06-16) — hand the parent exactly the
     rows visible after search + column filters (post-sort), so a "Print all
     (filtered)" button prints what the operator sees with no row-ticking. */
  useEffect(() => {
    onFilteredRowsChange?.(sortedRows);
  }, [sortedRows, onFilteredRowsChange]);

  /* RG-2 engine extension (Law 13 — extended ONCE so every register gets it):
     the selected rows still visible under the current filters, in on-screen
     order. The selection bar counts THESE — a tick a later filter hid does not
     count and does not export (the bar must never claim three and deliver one). */
  const selectedVisibleRows = useMemo(() => {
    if (!selectable || selectable.selectedKeys.size === 0) return [];
    return sortedRows.filter((r) => selectable.selectedKeys.has(rowKey(r)));
  }, [selectable, sortedRows, rowKey]);

  // ── Group rendering ───────────────────────────────────────────────
  // Multi-level groups produced as a flat list of render instructions.
  type Render =
    | { kind: "group"; level: number; path: string; label: string; count: number; collapsed: boolean }
    | { kind: "row"; row: T };

  const renderList: Render[] = useMemo(() => {
    if (layout.groupBy.length === 0) return sortedRows.map((row) => ({ kind: "row" as const, row }));

    const out: Render[] = [];
    const groupKeys = layout.groupBy
      .map((k) => columns.find((c) => c.key === k))
      .filter((c): c is DataGridColumn<T> => Boolean(c));

    const buildGroupValue = (col: DataGridColumn<T>, row: T): string => {
      if (col.groupValue) return col.groupValue(row);
      return coerceSearchString(col.accessor(row)) || "(blank)";
    };

    // Tree-style traversal
    type Node = { value: string; rows: T[]; children: Map<string, Node> };
    const root: Node = { value: "", rows: [], children: new Map() };
    for (const row of sortedRows) {
      let node = root;
      for (const col of groupKeys) {
        const v = buildGroupValue(col, row);
        if (!node.children.has(v)) node.children.set(v, { value: v, rows: [], children: new Map() });
        node = node.children.get(v)!;
      }
      node.rows.push(row);
    }

    // Recursive row count — sum direct rows + all descendants
    const collectRows = (n: Node): T[] => {
      const acc: T[] = [...n.rows];
      for (const c of n.children.values()) acc.push(...collectRows(c));
      return acc;
    };

    const walk = (node: Node, level: number, parentPath: string) => {
      for (const child of node.children.values()) {
        const path = parentPath ? `${parentPath}${child.value}` : child.value;
        const totalRows = collectRows(child).length;
        const collapsed = collapsedGroups.has(path);
        out.push({
          kind: "group",
          level,
          path,
          label: `${groupKeys[level]?.label ?? ""}: ${child.value}`,
          count: totalRows,
          collapsed,
        });
        if (!collapsed) {
          if (level + 1 < groupKeys.length) walk(child, level + 1, path);
          else for (const row of child.rows) out.push({ kind: "row", row });
        }
      }
    };
    walk(root, 0, "");
    return out;
  }, [sortedRows, layout.groupBy, columns, collapsedGroups]);

  // ── Column DnD (reorder) ──────────────────────────────────────────
  const onDragStartHeader = (e: DragEvent<HTMLTableCellElement>, key: string) => {
    e.dataTransfer.setData("text/x-datagrid-col", key);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOverHeader = (e: DragEvent<HTMLTableCellElement>, key: string) => {
    e.preventDefault();
    setDropTarget(key);
  };
  const onDropHeader = (e: DragEvent<HTMLTableCellElement>, targetKey: string) => {
    e.preventDefault();
    setDropTarget(null);
    const sourceKey = e.dataTransfer.getData("text/x-datagrid-col");
    if (!sourceKey || sourceKey === targetKey) return;
    setLayout((l) => {
      /* Commander 2026-05-28: dragging a column left/right used to "invert"
         (it always inserted BEFORE the target, so a rightward drag landed on
         the wrong side). Fix: resolve the FULL current order first, then do a
         direction-aware move — drag right ⇒ land AFTER the target, drag left ⇒
         land BEFORE it. Inserting at the target's ORIGINAL index (after
         removing the source) yields exactly that in both directions. */
      const full = l.order.length
        ? [
            ...l.order.filter((k) => columns.some((c) => c.key === k)),
            ...columns.filter((c) => !l.order.includes(c.key)).map((c) => c.key),
          ]
        : columns.map((c) => c.key);
      const to = full.indexOf(targetKey);
      if (to === -1) return l;
      const next = full.filter((k) => k !== sourceKey);
      next.splice(to, 0, sourceKey);
      return { ...l, order: next };
    });
  };

  // ── Group-by drop zone ───────────────────────────────────────────
  const onGroupZoneDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setGroupZoneActive(true);
  };
  const onGroupZoneDragLeave = () => setGroupZoneActive(false);
  const onGroupZoneDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setGroupZoneActive(false);
    const sourceKey = e.dataTransfer.getData("text/x-datagrid-col");
    if (!sourceKey) return;
    const col = columns.find((c) => c.key === sourceKey);
    if (!col || col.groupable === false) return;
    setLayout((l) =>
      l.groupBy.includes(sourceKey) ? l : { ...l, groupBy: [...l.groupBy, sourceKey] },
    );
  };
  const removeGroup = (key: string) =>
    setLayout((l) => ({ ...l, groupBy: l.groupBy.filter((k) => k !== key) }));

  // ── Column resize ────────────────────────────────────────────────
  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const onResizeStart = (e: MouseEvent<HTMLDivElement>, key: string, currentW: number) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = { key, startX: e.clientX, startW: currentW };
    const onMove = (ev: globalThis.MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const delta = ev.clientX - r.startX;
      const next = Math.max(40, r.startW + delta);
      setLayoutRaw((prev) => ({ ...prev, widths: { ...prev.widths, [r.key]: next } }));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // persist final widths
      setLayoutRaw((prev) => {
        writeLayout(storageKey, prev);
        return prev;
      });
      resizingRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── Header context menu actions ──────────────────────────────────
  const hideColumn = (key: string) =>
    setLayout((l) => ({ ...l, hidden: l.hidden.includes(key) ? l.hidden : [...l.hidden, key] }));
  const showColumn = (key: string) =>
    setLayout((l) => ({ ...l, hidden: l.hidden.filter((k) => k !== key) }));
  const pinLeft = (key: string) =>
    setLayout((l) => {
      // pin = move to front of order
      const orderNow = (l.order.length ? l.order : columns.map((c) => c.key)).filter(
        (k) => k !== key,
      );
      orderNow.unshift(key);
      return { ...l, order: orderNow };
    });
  const autoFit = (key: string) => {
    // ~8.5px per character heuristic — good enough without measuring DOM.
    const col = columns.find((c) => c.key === key);
    if (!col) return;
    let max = col.label.length;
    for (const row of rows) {
      const s = coerceSearchString(col.accessor(row));
      if (s.length > max) max = s.length;
    }
    const w = Math.max(60, Math.min(420, Math.round(max * 7.5 + 20)));
    setLayout((l) => ({ ...l, widths: { ...l.widths, [key]: w } }));
  };

  /* ── Export to Excel (system-wide via DataGrid) ───────────────────────
     Exports exactly what the operator sees: the post-filter + post-search +
     post-sort rows, across the visible DATA columns in their on-screen order
     (the synthetic __select__ / __expand__ columns are skipped). RG-2: the
     rows to write are a PARAMETER — the toolbar button passes the current
     view, the selection bar passes the selected rows. Cells render ReactNode,
     so we derive a text value per cell. xlsx is dynamic-imported (mirrors the
     pdf generators) to keep it out of the main bundle. */
  /* One derivation, two outputs. Excel and PDF disagreeing about a cell is the
     defect this shape exists to make impossible. */
  const deriveTable = useCallback(
    (whichRows: T[]): { headers: string[]; rows: string[][]; stem: string } => {
      const cols =
        whichRows.length === 0 ? [] : visibleColumns.filter((c) => !c.key.startsWith("__"));
      // Header for a column in the sheet: an explicit exportLabel (used by pure
      // icon/checkbox columns whose on-screen label is blank) else the on-screen
      // label. Falls back to the column key so a blank header never leaves an
      // unnamed/duplicate-'' column in Excel (Wei Siang 2026-06-23).
      const header = (c: DataGridColumn<T>): string =>
        (c.exportLabel && c.exportLabel.trim()) || (c.label && c.label.trim()) || c.key;
      const cellText = (c: DataGridColumn<T>, row: T): string | number => {
        // Export the CLEAN display value — NOT the global-search blob. searchValue
        // is built for the search box and often concatenates several
        // representations of one cell (doc-no + status, raw + formatted phone,
        // label + value); dumping it made every cell look duplicated/merged
        // ("SO-2606-031 CONFIRMED", "Installment installment", doubled phone —
        // Wei Siang 2026-06-20). Prefer an explicit exportValue, then the single
        // filterValue, then the text the cell actually renders. searchValue is
        // NEVER exported.
        if (c.exportValue) return c.exportValue(row);
        if (c.filterValue) return c.filterValue(row);
        const rendered = coerceSearchString(c.accessor(row)).trim();
        if (rendered) return rendered;
        if (c.groupValue) return c.groupValue(row);
        return "";
      };
      const data = whichRows.map((row) => {
        const o: Record<string, string | number> = {};
        for (const c of cols) o[header(c)] = cellText(c, row);
        return o;
      });
      const stem =
        (exportName && exportName.trim()) ||
        (storageKey || "export")
          .replace(/[:.]/g, "-")
          .replace(/-?v\d+$/i, "")
          .replace(/-?(grid|layout|columns|list|table|datagrid)$/i, "")
          .replace(/^(dg|pr-g)-/i, "")
          .replace(/[_-]+/g, " ")
          .replace(/\s+/g, " ")
          .trim() ||
        `export-${whichRows.length}`;
      return {
        headers: cols.map((c) => header(c)),
        rows: data.map((o) => cols.map((c) => String(o[header(c)] ?? ""))),
        stem,
      };
    },
    [visibleColumns, storageKey, exportName],
  );

  const exportRows = useCallback(
    async (whichRows: T[]) => {
      if (whichRows.length === 0) return;
      const { headers, rows, stem } = deriveTable(whichRows);
      if (headers.length === 0) return;
      const data = rows.map((r) => {
        const o: Record<string, string> = {};
        headers.forEach((h, i) => { o[h] = r[i] ?? ""; });
        return o;
      });
      const cols = headers;
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(data, { header: cols });
      // Auto-size each column to its widest cell (header included) so the sheet is
      // legible instead of squished into one default width (Wei Siang 2026-06-20
      // "很乱很难看"). Capped so a stray long value can't blow a column out.
      ws["!cols"] = cols.map((h) => {
        let w = h.length;
        for (const o of data) w = Math.max(w, String(o[h] ?? "").length);
        return { wch: Math.min(60, Math.max(8, w + 2)) };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      // Filename: prefer the caller's human exportName ("Purchase Orders"); else
      // clean the storageKey down to something legible (strip dg-/pr-g- prefixes,
      // -v1 / layout suffixes, dashes→spaces). A YYYY-MM-DD date is appended so
      // repeated exports are self-dating and don't silently overwrite.
      const stamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `${stem} ${stamp}.xlsx`);
    },
    [deriveTable],
  );

  /** The current view as a PDF — same derived cells, opened in a new tab so the
   *  operator can read it before deciding to save or print it. */
  const exportPdfRows = useCallback(
    async (whichRows: T[]) => {
      if (whichRows.length === 0) return;
      const { headers, rows, stem } = deriveTable(whichRows);
      if (headers.length === 0) return;
      const { renderRegisterListPdf } = await import("@/lib/pdf/render");
      const blob = await renderRegisterListPdf({
        title: stem,
        headers,
        rows,
        printedAt: new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
      });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    [deriveTable],
  );

  // ── Sort handlers ─────────────────────────────────────────────────
  const toggleSort = (key: string) => {
    setLayout((l) => {
      if (!l.sort || l.sort.key !== key) return { ...l, sort: { key, dir: "asc" } };
      if (l.sort.dir === "asc") return { ...l, sort: { key, dir: "desc" } };
      return { ...l, sort: null };
    });
  };

  // ── Group toggle ─────────────────────────────────────────────────
  const toggleGroup = (path: string) =>
    setCollapsedGroups((prev) => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });

  // ── Render ────────────────────────────────────────────────────────
  const totalCols = visibleColumns.length;
  const groupedCount = layout.groupBy.length;
  const isReference = appearance === "reference";

  /* Windowed rendering for large FLAT lists only. Skipped when grouped or
     expandable (variable row heights) or when the list is small — in those
     cases the normal full map renders, byte-identical to before. So at today's
     list sizes this is a no-op; it only kicks in past VIRTUAL_THRESHOLD rows. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const VIRTUAL_THRESHOLD = 25;
  const canVirtualize =
    !isLoading && !embedded && groupedCount === 0 && !expandable && renderList.length > VIRTUAL_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: canVirtualize ? renderList.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 14,
  });
  const virtualItems = canVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const padTop = virtualItems.length ? virtualItems[0]!.start : 0;
  const padBottom = virtualItems.length
    ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1]!.end
    : 0;

  /* One grid row (group banner OR data row + optional expansion). Extracted so
     the normal path and the virtualized window render through the same code. */
  const renderGridRow = (item: Render, idx: number) => {
    if (item.kind === "group") {
      return (
        <tr key={`g-${item.path}`} className={styles.groupRow} onClick={() => toggleGroup(item.path)}>
          <td
            className={styles.groupRowCell}
            colSpan={totalCols || 1}
            style={{ paddingLeft: 8 + item.level * 16 }}
          >
            <span className={styles.groupCaret}>{item.collapsed ? ">" : "v"}</span>
            {item.label}
            <span className={styles.groupCount}>({item.count})</span>
          </td>
        </tr>
      );
    }
    const row = item.row;
    const key = rowKey(row);
    const expandKey = expandable ? expansionId(row) : null;
    const isExpanded = expandKey != null && expandedRows.has(expandKey);
    return (
      <Fragment key={`f-${key}-${idx}`}>
        <tr
          data-testid={isReference ? "grid-parent-row" : undefined}
          className={`${styles.tr} ${selectedKey === key ? styles.trSelected : ""}`}
          style={{
            ...rowStyle?.(row),
            ...(selectable || onRowClick || expandKey != null ? { cursor: "pointer" } : {}),
          }}
          /* Row-click: when the page wired `onRowClick` (a detail panel), that
             IS the click — selection stays on the checkbox column (RG-2).
             Without `onRowClick`, 2990's rule holds: 点行 = multi-select. L2
             drill-down opens ONLY via the left ▸ chevron (its own handler below,
             with stopPropagation). Row-click never expands. */
          onClick={() => {
            setSelectedKey(key);
            if (onRowClick) onRowClick(row);
            else if (selectable) selectable.onToggle(key);
          }}
          onDoubleClick={() => onRowDoubleClick?.(row)}
          onContextMenu={(e) => {
            if (!contextMenu) return;
            const items = contextMenu(row);
            if (!items || items.length === 0) return;
            e.preventDefault();
            setSelectedKey(key);
            setRowCtx({ x: e.clientX, y: e.clientY, items });
          }}
        >
          {visibleColumns.map((col) => {
            const w = layout.widths[col.key] ?? col.width ?? 140;
            if (col.key === "__select__" && selectable) {
              return (
                <td
                  key={col.key}
                  className={`${styles.td}${pinClass(col.key)}`}
                  style={{ width: w, maxWidth: w, padding: "4px 6px", textAlign: "center", ...pinStyle(col.key) }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    aria-label="Select row"
                    checked={selectable.selectedKeys.has(key)}
                    onChange={() => selectable.onToggle(key)}
                  />
                </td>
              );
            }
            if (col.key === "__expand__" && expandable && expandKey) {
              return (
                <td
                  key={col.key}
                  className={`${styles.td}${pinClass(col.key)}`}
                  style={{ width: w, maxWidth: w, padding: "4px 6px", textAlign: "center", ...pinStyle(col.key) }}
                >
                  <button
                    type="button"
                    aria-label={isExpanded ? "Collapse row" : "Expand row"}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(expandKey);
                    }}
                    style={{
                      background: "transparent",
                      border: 0,
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--c-burnt)",
                      fontSize: 12,
                      lineHeight: 1,
                      display: "inline-block",
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 120ms ease",
                    }}
                  >
                    &#9656;
                  </button>
                </td>
              );
            }
            /* Empty-cell standard (Commander 2026-06-18) — render an em-dash
               for a primitive-empty cell (null / undefined / '') so the whole
               system stops mixing blanks and dashes. 0 / false / JSX elements
               are preserved (a real 0 must show as 0); synthetic columns
               (__expand__ / __select__) render nothing, not a dash. */
            const content = col.accessor(row);
            const isEmpty = content == null || content === "";
            return (
              <td
                key={col.key}
                className={`${styles.td} ${col.align === "right" ? styles.tdAlignRight : ""}${pinClass(col.key)}`}
                style={{ width: w, maxWidth: w, ...pinStyle(col.key) }}
              >
                {isEmpty ? (col.key.startsWith("__") ? null : "—") : content}
              </td>
            );
          })}
        </tr>
        {isExpanded && expandable && (
          <tr className={styles.tr} style={{ background: "var(--c-cream)" }}>
            {/* The gutter, kept EMPTY beside the child rows — the indent IS
                the parent-child link (owner ruling 2026-08-15). */}
            {expansionGutter.map((key) => (
              <td
                key={key}
                data-testid={`grid-expansion-gutter-${key}`}
                style={{ padding: 0, borderTop: "1px solid var(--line)" }}
              />
            ))}
            <td
              colSpan={visibleColumns.length - expansionGutter.length}
              data-testid="grid-expansion-cell"
              /* No padding at all: the left edge is the first data column's,
                 the right edge is the parent table's. */
              style={{ padding: 0, borderTop: "1px solid var(--line)" }}
            >
              {expandable.renderExpansion(row)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div
      className={`${styles.root} ${embedded ? styles.rootEmbedded : ""} ${
        isReference ? styles.rootReference : ""
      }`}
      data-testid={isReference ? "sales-orders-grid" : undefined}
    >
      {/* Toolbar — search LEFT (REGISTER LAW 2: always left, compact ~200px;
          2990 kept it right — that is the one composition change the laws
          mandate), then the caller's actions, then Export + Columns pinned
          right (LAWS 3 + 4). */}
      {!(selectable && selectedVisibleRows.length > 0) ? (
      <div className={styles.toolbar} data-testid={isReference ? "work-toolbar" : undefined}>
        {isReference && toolbarStart}
        {isReference && <div className={styles.toolbarSpacer} />}
        {!embedded && (
          isReference && !searchOpen && !search ? (
            <button
              type="button"
              aria-label="Search"
              title="Search"
              data-testid="search-icon"
              className={styles.toolbarIcon}
              onClick={() => setSearchOpen(true)}
            >
              <Search {...ICON} aria-hidden />
            </button>
          ) : (
            <div className={styles.searchWrap}>
              <Search {...ICON} aria-hidden />
              <input
                ref={searchRef}
                className={styles.searchInput}
                type="search"
                placeholder={searchPlaceholder}
                value={search}
                autoFocus={isReference && searchOpen}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSearch("");
                    setSearchOpen(false);
                  }
                }}
                onBlur={() => { if (!search) setSearchOpen(false); }}
              />
            </div>
          )
        )}
        {isReference ? null : toolbar}
        {!isReference && <div className={styles.toolbarSpacer} />}
        {/* Clear-all-filters — appears only when ≥1 column filter is active.
            Per-column funnels already highlight; this is the one-click
            reset for the whole grid. Wei Siang 2026-06-04. */}
        {!isReference && (Object.values(filters).some((v) => v.length > 0) ||
          Object.keys(dateFilters).length > 0 ||
          Object.keys(numberFilters).length > 0 ||
          Object.keys(dateRangeFilters).length > 0) && (
          <button
            type="button"
            className={styles.toolbarPill}
            onClick={() => {
              setFilters({});
              setDateFilters({});
              setNumberFilters({});
              setDateRangeFilters({});
            }}
            title="Clear all column filters"
          >
            <Filter size={14} strokeWidth={1.75} aria-hidden style={{ color: "var(--c-orange)" }} />
            <span>Clear filters</span>
            <span className={styles.toolbarPillBadge}>
              {Object.values(filters).filter((v) => v.length > 0).length}
            </span>
          </button>
        )}
        {/* Export Excel — exports the currently visible rows (post search +
            filter + sort) across the visible data columns. System-wide: every
            list rendered through DataGrid gets it for free (Wei Siang
            2026-06-19). Wording says the scope out loud (REGISTER LAW 3). */}
        <div className={styles.columnsAnchor}>
          <button
            ref={outputBtnRef}
            type="button"
            aria-label="Export"
            title="Export"
            className={`${styles.toolbarPill} ${isReference ? styles.toolbarPillIconCaret : ""} ${outputMenuOpen ? styles.toolbarPillOn : ""}`}
            onClick={() => setOutputMenuOpen((open) => {
              const next = !open;
              if (next && outputBtnRef.current) {
                const r = outputBtnRef.current.getBoundingClientRect();
                setOutputMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
              }
              return next;
            })}
            disabled={sortedRows.length === 0}
            aria-haspopup="menu"
            aria-expanded={outputMenuOpen}
          >
            <Download size={14} strokeWidth={1.75} aria-hidden />
            {!isReference && (
              <>
                <span>Export</span>
                <ChevronDown size={12} strokeWidth={2} aria-hidden />
              </>
            )}
          </button>
          {outputMenuOpen && (
            <div
              className={styles.columnsMenu}
              role="menu"
              style={
                outputMenuPos
                  ? { position: "fixed", top: outputMenuPos.top, right: outputMenuPos.right }
                  : undefined
              }
            >
              <button
                type="button"
                className={styles.filterLauncherItem}
                role="menuitem"
                onClick={() => {
                  setOutputMenuOpen(false);
                  void exportRows(sortedRows);
                }}
              >
                Excel
              </button>
              <button
                type="button"
                className={styles.filterLauncherItem}
                role="menuitem"
                onClick={() => {
                  setOutputMenuOpen(false);
                  void exportPdfRows(sortedRows);
                }}
              >
                PDF
              </button>
              {(outputActions ?? []).map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={styles.filterLauncherItem}
                  role="menuitem"
                  onClick={() => {
                    setOutputMenuOpen(false);
                    action.onClick();
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={styles.columnsAnchor}>
          <button
            ref={columnsBtnRef}
            type="button"
            aria-label="Columns"
            title="Columns"
            className={`${styles.toolbarPill} ${isReference ? styles.toolbarPillIconOnly : ""} ${columnsMenuOpen ? styles.toolbarPillOn : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setColumnsMenuOpen((v) => {
                const next = !v;
                if (next && columnsBtnRef.current) {
                  const r = columnsBtnRef.current.getBoundingClientRect();
                  setColumnsMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                }
                return next;
              });
            }}
          >
            <Columns3 size={14} strokeWidth={1.75} aria-hidden />
            {!isReference && <span>Columns</span>}
          </button>
          {columnsMenuOpen && (
            <>
              <div className={styles.columnsMenuBackdrop} onClick={() => setColumnsMenuOpen(false)} />
              <div
                ref={columnsMenuRef}
                className={styles.columnsMenu}
                style={
                  columnsMenuPos
                    ? { position: "fixed", top: columnsMenuPos.top, right: columnsMenuPos.right }
                    : undefined
                }
                onClick={(e) => e.stopPropagation()}
              >
                <header className={styles.columnsMenuHeader}>
                  <span>Columns ({visibleDataColumnCount})</span>
                  <button
                    type="button"
                    className={styles.columnsMenuReset}
                    onClick={resetColumns}
                    title="Reset to defaults"
                  >
                    <RotateCcw size={12} strokeWidth={1.75} aria-hidden />
                    <span>Reset</span>
                  </button>
                </header>
                <div className={styles.columnsMenuBody}>
                  {(() => {
                    /* STAGE 1 engine extension (Law 13) — the GROUPED chooser.
                       Groups appear in first-appearance order; a column with
                       no group falls under "Other"; no groups at all = 2990's
                       flat list, byte-identical. */
                    const item = (c: DataGridColumn<T>) => (
                      <label key={c.key} className={styles.columnsMenuItem}>
                        <input
                          type="checkbox"
                          checked={!effectiveHidden.has(c.key)}
                          onChange={() => toggleColumn(c.key)}
                        />
                        <span>{c.label || c.key}</span>
                      </label>
                    );
                    if (!columns.some((c) => c.chooserGroup)) return columns.map(item);
                    const order: string[] = [...(chooserGroupOrder ?? [])];
                    const byGroup = new Map<string, DataGridColumn<T>[]>();
                    for (const c of columns) {
                      const g = c.chooserGroup ?? "Other";
                      if (!byGroup.has(g)) {
                        byGroup.set(g, []);
                        if (!order.includes(g)) order.push(g);
                      }
                      byGroup.get(g)!.push(c);
                    }
                    return order.filter((g) => byGroup.has(g)).map((g) => (
                      <div key={g}>
                        <div className={styles.columnsMenuGroup}>{g}</div>
                        {byGroup.get(g)!.map(item)}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </>
          )}
        </div>
        {isReference && toolbarEnd}
      </div>
      ) : (
        <div className={`${styles.toolbar} ${styles.selectionBar}`} data-testid="selection-bar">
          <span className={styles.selectionCount}>{selectedVisibleRows.length} selected</span>
          <button
            type="button"
            className={styles.tbarBtn}
            onClick={() => selectable.onToggleAll(sortedRows.map(rowKey), true)}
          >
            Clear
          </button>
          <button
            type="button"
            className={styles.toolbarPill}
            onClick={() => {
              void exportRows(selectedVisibleRows);
            }}
          >
            <Download size={14} strokeWidth={1.75} aria-hidden />
            <span>Export Excel ({selectedVisibleRows.length})</span>
          </button>
          {(selectionActions ?? []).map((a) => (
            <button
              key={a.label(0)}
              type="button"
              className={styles.toolbarPill}
              onClick={() => a.onClick(selectedVisibleRows as never[])}
            >
              <Printer size={14} strokeWidth={1.75} aria-hidden />
              <span>{a.label(selectedVisibleRows.length)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Group-by zone */}
      {groupBanner && (
        <div
          className={`${styles.groupZone} ${groupZoneActive ? styles.groupZoneActive : ""}`}
          onDragOver={onGroupZoneDragOver}
          onDragLeave={onGroupZoneDragLeave}
          onDrop={onGroupZoneDrop}
        >
          {groupedCount === 0 ? (
            <span>Drag a column header here to group by that column.</span>
          ) : (
            <>
              <span>Grouped by:</span>
              {layout.groupBy.map((k) => {
                const c = columns.find((cc) => cc.key === k);
                return (
                  <span key={k} className={styles.groupChip}>
                    {c?.label ?? k}
                    <button className={styles.groupChipRemove} onClick={() => removeGroup(k)} title="Remove group">
                      x
                    </button>
                  </span>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div
        ref={scrollRef}
        className={`${styles.scroll} ${embedded ? styles.scrollEmbedded : ""}`}
        data-testid={isReference ? "grid-scroll" : undefined}
      >
        <table className={styles.table}>
          <thead
            className={`${styles.thead} ${embedded ? styles.theadEmbedded : ""}`}
            data-testid={isReference ? "grid-header" : undefined}
          >
            <tr>
              {visibleColumns.map((col) => {
                const w = layout.widths[col.key] ?? col.width ?? 140;
                const style: CSSProperties = {
                  width: w,
                  minWidth: col.minWidth ?? 40,
                  ...pinStyle(col.key),
                };
                const isSorted = layout.sort?.key === col.key;
                const arrow = isSorted ? (layout.sort!.dir === "asc" ? "A" : "V") : "";
                if (col.key === "__select__" && selectable) {
                  const keys = sortedRows.map(rowKey);
                  const allSel = keys.length > 0 && keys.every((k) => selectable.selectedKeys.has(k));
                  const someSel = !allSel && keys.some((k) => selectable.selectedKeys.has(k));
                  return (
                    <th key={col.key} className={`${styles.th}${pinClass(col.key)}`} style={style}>
                      <span className={styles.thInner}>
                        <input
                          type="checkbox"
                          aria-label="Select all rows"
                          checked={allSel}
                          ref={(el) => {
                            if (el) el.indeterminate = someSel;
                          }}
                          onChange={() => selectable.onToggleAll(keys, allSel)}
                        />
                      </span>
                    </th>
                  );
                }
                return (
                  <th
                    key={col.key}
                    className={`${styles.th} ${col.align === "right" ? styles.thAlignRight : ""} ${
                      dropTarget === col.key ? styles.thDragOver : ""
                    }${pinClass(col.key)}`}
                    style={style}
                    draggable
                    onDragStart={(e) => onDragStartHeader(e, col.key)}
                    onDragOver={(e) => onDragOverHeader(e, col.key)}
                    onDragLeave={() => setDropTarget(null)}
                    onDrop={(e) => onDropHeader(e, col.key)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtx({ x: e.clientX, y: e.clientY, colKey: col.key });
                    }}
                    title={col.label}
                  >
                    <span className={styles.thInner}>
                      {col.sortable !== false ? (
                        <button
                          type="button"
                          className={styles.sortBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSort(col.key);
                          }}
                        >
                          {col.label}
                          {arrow && <span className={styles.sortArrow}>{arrow === "A" ? "^" : "v"}</span>}
                        </button>
                      ) : (
                        col.label
                      )}
                      {col.key !== "__expand__" && col.key !== "__select__" && (
                        <button
                          type="button"
                          title="Filter this column"
                          aria-label={`Filter ${col.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setFilterMenu({ colKey: col.key, x: e.clientX, y: e.clientY });
                          }}
                          style={{
                            background: "transparent",
                            border: 0,
                            padding: "0 2px",
                            marginLeft: 2,
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            color:
                              (filters[col.key]?.length ?? 0) > 0 ||
                              dateFilters[col.key] ||
                              numberFilters[col.key] ||
                              dateRangeFilters[col.key]
                                ? "var(--c-orange)"
                                : "var(--fg-soft)",
                          }}
                        >
                          <Filter size={11} strokeWidth={2} aria-hidden />
                        </button>
                      )}
                    </span>
                    <div className={styles.resizeHandle} onMouseDown={(e) => onResizeStart(e, col.key, w)} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={styles.tbody}>
            {isLoading && <SkeletonRows cols={totalCols || 1} rows={12} />}
            {!isLoading && renderList.length === 0 && (
              <tr>
                <td className={styles.empty} colSpan={totalCols || 1}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {/* Small / grouped / expandable lists: render every row (unchanged). */}
            {!isLoading && !canVirtualize && renderList.map((item, idx) => renderGridRow(item, idx))}
            {/* Large flat lists: windowed — only the visible slice is in the DOM,
               with spacer rows reserving the scroll height above and below. */}
            {!isLoading && canVirtualize && (
              <>
                {padTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={totalCols || 1} style={{ height: padTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualItems.map((vi) => renderGridRow(renderList[vi.index]!, vi.index))}
                {padBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={totalCols || 1} style={{ height: padBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
          {/* STAGE 1 engine extension (Law 13) — FOOTER TOTALS over the
              FILTERED list (`sortedRows`), never the visible window. Sticky
              to the scroll container's bottom so it stays on screen however
              far the operator has scrolled. */}
          {!isLoading &&
            renderList.length > 0 &&
            visibleColumns.some((c) => c.footerTotal) && (
              <tfoot className={styles.tfoot} data-testid="footer-totals">
                <tr>
                  {visibleColumns.map((col) => {
                    const w = layout.widths[col.key] ?? col.width ?? 140;
                    return (
                      <td
                        key={col.key}
                        className={`${styles.tfootTd} ${col.align === "right" ? styles.tdAlignRight : ""}`}
                        style={{ width: w, maxWidth: w }}
                      >
                        {col.footerTotal ? col.footerTotal(sortedRows) : null}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
        </table>
      </div>

      {/* Status / footer — hidden in embedded (drill-down) mode where the
          "N of M rows / Reset layout" line reads as heavy chrome. */}
      {!embedded && (
        <div className={styles.statusLine} data-testid={isReference ? "grid-footer" : undefined}>
          {isLoading
            ? <span>Loading…</span>
            : statusSummary
              ? statusSummary(sortedRows, selectedVisibleRows)
              : <span>{`${filteredRows.length} of ${rows.length} rows`}</span>}
        </div>
      )}

      {/* Context menu */}
      {ctx &&
        (() => {
          const col = columns.find((c) => c.key === ctx.colKey);
          const hidden = layout.hidden.includes(ctx.colKey);
          const grouped = layout.groupBy.includes(ctx.colKey);
          return (
            <div className={styles.ctxMenu} style={{ top: ctx.y, left: ctx.x }} onClick={(e) => e.stopPropagation()}>
              <button
                className={styles.ctxItem}
                onClick={() => {
                  hideColumn(ctx.colKey);
                  setCtx(null);
                }}
              >
                Hide column
              </button>
              <button
                className={styles.ctxItem}
                onClick={() => {
                  pinLeft(ctx.colKey);
                  setCtx(null);
                }}
              >
                Pin left
              </button>
              <button
                className={styles.ctxItem}
                onClick={() => {
                  autoFit(ctx.colKey);
                  setCtx(null);
                }}
              >
                Auto-fit width
              </button>
              {col?.groupable !== false && (
                <button
                  className={styles.ctxItem}
                  onClick={() => {
                    if (!grouped) setLayout((l) => ({ ...l, groupBy: [...l.groupBy, ctx.colKey] }));
                    setCtx(null);
                  }}
                >
                  {grouped ? "Already grouped" : "Group by this column"}
                </button>
              )}
              {(() => {
                /* HOUZS port — surface BOTH explicitly hidden columns and
                 the pristine-default-hidden set so the user can reveal
                 the optional columns shipped hidden by default. */
                const pristine = layout.order.length === 0 && layout.hidden.length === 0;
                const hiddenKeys = pristine
                  ? columns.filter((c) => c.defaultHidden).map((c) => c.key)
                  : layout.hidden;
                if (hiddenKeys.length === 0) return null;
                return (
                  <>
                    <div className={styles.ctxDivider} />
                    <div style={{ padding: "4px 10px", color: "var(--fg-muted)", fontSize: "var(--fs-11)" }}>
                      Hidden:
                    </div>
                    {hiddenKeys.map((k) => {
                      const c = columns.find((cc) => cc.key === k);
                      return (
                        <button
                          key={k}
                          className={styles.ctxItem}
                          onClick={() => {
                            showColumn(k);
                            setCtx(null);
                          }}
                        >
                          Show {c?.label ?? k}
                        </button>
                      );
                    })}
                  </>
                );
              })()}
              {hidden && (
                <button
                  className={styles.ctxItem}
                  onClick={() => {
                    showColumn(ctx.colKey);
                    setCtx(null);
                  }}
                >
                  Show column
                </button>
              )}
            </div>
          );
        })()}

      {/* Per-column filter dropdown — pick which values to keep (Commander
          2026-05-29). Distinct values come from the column's groupValue /
          searchValue / text. */}
      {filterMenu &&
        (() => {
          const col = columns.find((c) => c.key === filterMenu.colKey);
          const sel = filters[filterMenu.colKey] ?? [];
          const q = filterSearch.trim().toLowerCase();
          const visibleFilterValues = q ? filterValues.filter((v) => v.toLowerCase().includes(q)) : filterValues;
          return (
            <div
              ref={filterMenuRef}
              data-testid={isReference ? "column-filter-menu" : undefined}
              className={styles.ctxMenu}
              style={{ top: filterMenu.y, left: filterMenu.x, maxHeight: 320, overflowY: "auto", minWidth: 200 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 10px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <strong style={{ fontSize: "var(--fs-11)" }}>Filter: {col?.label}</strong>
                {(sel.length > 0 ||
                  dateFilters[filterMenu.colKey] ||
                  numberFilters[filterMenu.colKey] ||
                  dateRangeFilters[filterMenu.colKey]) && (
                  <button
                    type="button"
                    onClick={() => clearFilter(filterMenu.colKey)}
                    style={{
                      background: "transparent",
                      border: 0,
                      color: "var(--c-orange)",
                      cursor: "pointer",
                      fontSize: "var(--fs-11)",
                      fontWeight: 600,
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {col?.filterType === "number" ? (
                /* ── Number: min / max range ── */
                <div style={{ display: "grid", gap: 8, padding: "10px" }}>
                  <label style={{ display: "grid", gap: 3, fontSize: "var(--fs-11)", color: "var(--fg-muted)" }}>
                    Min
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="–"
                      value={numberFilters[filterMenu.colKey]?.min ?? ""}
                      onChange={(e) => setNumberBound(filterMenu.colKey, "min", e.target.value)}
                      style={{
                        fontSize: "var(--fs-12)",
                        padding: "4px 8px",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm, 6px)",
                      }}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 3, fontSize: "var(--fs-11)", color: "var(--fg-muted)" }}>
                    Max
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="–"
                      value={numberFilters[filterMenu.colKey]?.max ?? ""}
                      onChange={(e) => setNumberBound(filterMenu.colKey, "max", e.target.value)}
                      style={{
                        fontSize: "var(--fs-12)",
                        padding: "4px 8px",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm, 6px)",
                      }}
                    />
                  </label>
                </div>
              ) : col?.filterType === "date" ? (
                /* ── Date: quick presets + custom from→to range ── */
                <div style={{ display: "grid", gap: 8, padding: "8px 10px" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {DATE_PRESETS.map((p) => {
                      const on = dateFilters[filterMenu.colKey] === p.key;
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => toggleDatePreset(filterMenu.colKey, p.key)}
                          style={{
                            fontSize: "var(--fs-11)",
                            fontWeight: 600,
                            padding: "3px 9px",
                            borderRadius: "999px",
                            cursor: "pointer",
                            border: `1px solid ${on ? "var(--c-orange)" : "var(--line)"}`,
                            background: on ? "var(--c-orange)" : "var(--c-paper)",
                            color: on ? "var(--c-paper)" : "var(--c-ink)",
                          }}
                        >
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                  <label style={{ display: "grid", gap: 3, fontSize: "var(--fs-11)", color: "var(--fg-muted)" }}>
                    From
                    <DateField
                      fullWidth
                      aria-label="From date"
                      value={dateRangeFilters[filterMenu.colKey]?.from ?? ""}
                      onChange={(iso) => setDateBound(filterMenu.colKey, "from", iso)}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 3, fontSize: "var(--fs-11)", color: "var(--fg-muted)" }}>
                    To
                    <DateField
                      fullWidth
                      aria-label="To date"
                      value={dateRangeFilters[filterMenu.colKey]?.to ?? ""}
                      onChange={(iso) => setDateBound(filterMenu.colKey, "to", iso)}
                    />
                  </label>
                </div>
              ) : (
                /* ── Numbering / enum / text: searchable value checkbox list. The
                 type-to-find box shows for 'numbering' and any long value list. */
                <>
                  {(col?.filterType === "numbering" || filterValues.length > 8) && (
                    <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--line)" }}>
                      <input
                        type="search"
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        placeholder="Find…"
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          fontSize: "var(--fs-12)",
                          padding: "4px 8px",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm, 6px)",
                        }}
                      />
                    </div>
                  )}
                  {visibleFilterValues.length > 0 && (
                    <div style={{ display: "flex", gap: 4, padding: "6px 10px", borderBottom: "1px solid var(--line)" }}>
                      <button
                        type="button"
                        onClick={() => selectAllFilterValues(filterMenu.colKey, visibleFilterValues)}
                        style={{
                          fontSize: "var(--fs-11)",
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: "999px",
                          cursor: "pointer",
                          border: "1px solid var(--line)",
                          background: "var(--c-paper)",
                          color: "var(--c-ink)",
                        }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => invertFilterValues(filterMenu.colKey, visibleFilterValues)}
                        style={{
                          fontSize: "var(--fs-11)",
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: "999px",
                          cursor: "pointer",
                          border: "1px solid var(--line)",
                          background: "var(--c-paper)",
                          color: "var(--c-ink)",
                        }}
                      >
                        Select invert
                      </button>
                    </div>
                  )}
                  {visibleFilterValues.length === 0 && (
                    <div style={{ padding: "6px 10px", color: "var(--fg-muted)", fontSize: "var(--fs-11)" }}>
                      No values.
                    </div>
                  )}
                  {visibleFilterValues.map((v) => (
                    <label
                      key={v}
                      className={styles.ctxItem}
                      style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        checked={sel.includes(v)}
                        onChange={() => toggleFilterValue(filterMenu.colKey, v)}
                      />
                      <span>{v || "(blank)"}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          );
        })()}

      {/* Row context menu — opened on right-click via the row's onContextMenu.
          Rendered after the header ctx menu so its z-index naturally wins
          if both ever opened simultaneously. */}
      {rowCtx && (
        <div
          className={styles.contextMenu}
          style={{ top: rowCtx.y, left: rowCtx.x }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          {rowCtx.items.map((it, i) => {
            if (it.divider) return <div key={`d-${i}`} className={styles.contextMenuDivider} />;
            return (
              <button
                key={`i-${i}-${it.label}`}
                className={`${styles.contextMenuItem} ${it.danger ? styles.contextMenuDanger : ""}`}
                onClick={() => {
                  // Close before firing — handlers may navigate or open
                  // dialogs, and we don't want a stale menu lingering.
                  setRowCtx(null);
                  it.onClick?.();
                }}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* Task #99 (UI perf) — `memo` strips the generic parameter from the function
   type, so we cast back to the original signature. Behaviour identical;
   the only difference is the default shallow-prop bail out. Pages calling
   <DataGrid> MUST pass a stable `columns` reference (define at module
   scope or wrap in useMemo) for the memo to actually hit — see the
   listing pages where columns are already memoized. */
export const DataGrid = memo(DataGridInner) as typeof DataGridInner;
