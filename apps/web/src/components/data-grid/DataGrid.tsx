import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Filter as FilterIcon } from "lucide-react";
import type { SoGridCellValue, SoGridColumnType } from "@carres/shared";

// ===========================================================================
// DataGrid — reusable AutoCount-style grid (2026-06-16).
//   • Resizable columns (drag the right border — uses a CSS var so dragging
//     never re-renders the rows).
//   • Per-column filter funnels (text "contains" / option checklist).
//   • Click-header sort (asc → desc → none).
//   • Global row search (driven by the `search` prop).
//   • Sticky header + row cap (avoids DOM bloat on big result sets).
// Rows are READ-ONLY. Width changes are emitted via onResize so the caller can
// persist them; filters + sort are local view state.
// ===========================================================================

export interface DataGridColumn {
  key: string;
  label: string;
  type: SoGridColumnType;
  width: number;
  align?: "left" | "right";
  option?: boolean;
  /** Curated + observed choice list for option-column filters. */
  options?: string[];
}

export type DataGridRow = Record<string, SoGridCellValue> & { rowId?: string };

export interface DataGridProps {
  columns: DataGridColumn[];
  rows: DataGridRow[];
  getRowId: (row: DataGridRow) => string;
  onResize?: (key: string, width: number) => void;
  /** Global free-text search across all visible columns. */
  search?: string;
  /** Max rows rendered to the DOM (rest hidden behind a "refine" message). */
  rowCap?: number;
  emptyHint?: string;
}

// --- formatting -------------------------------------------------------------
const MYR = new Intl.NumberFormat("en-MY", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCell(value: SoGridCellValue, type: SoGridColumnType): string {
  if (value === null || value === undefined || value === "") return "";
  switch (type) {
    case "money": {
      const n = Number(value);
      return Number.isFinite(n) ? `RM ${MYR.format(n)}` : String(value);
    }
    case "number":
      return String(value);
    case "bool":
      return value === true ? "Yes" : value === false ? "No" : "";
    case "date": {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime())
        ? String(value)
        : d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
    }
    case "datetime": {
      const d = new Date(String(value));
      return Number.isNaN(d.getTime())
        ? String(value)
        : d.toLocaleString("en-MY", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
    }
    default:
      return String(value);
  }
}

function compareValues(a: SoGridCellValue, b: SoGridCellValue, type: SoGridColumnType): number {
  const an = a === null || a === undefined || a === "";
  const bn = b === null || b === undefined || b === "";
  if (an && bn) return 0;
  if (an) return 1; // empties sort last
  if (bn) return -1;
  if (type === "money" || type === "number") {
    return Number(a) - Number(b);
  }
  if (type === "date" || type === "datetime") {
    return new Date(String(a)).getTime() - new Date(String(b)).getTime();
  }
  return String(a).localeCompare(String(b));
}

// --- filter state -----------------------------------------------------------
type ColFilter =
  | { kind: "text"; q: string }
  | { kind: "set"; values: string[] };

function rowPassesFilter(
  row: DataGridRow,
  col: DataGridColumn,
  filter: ColFilter,
): boolean {
  if (filter.kind === "text") {
    if (!filter.q) return true;
    return formatCell(row[col.key] ?? null, col.type)
      .toLowerCase()
      .includes(filter.q.toLowerCase());
  }
  // set filter
  if (filter.values.length === 0) return true;
  const raw = row[col.key];
  const asStr = raw === null || raw === undefined ? "" : String(raw);
  return filter.values.includes(asStr);
}

// --- click-outside ----------------------------------------------------------
function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

// --- per-column filter popover ---------------------------------------------
function FilterPopover({
  col,
  filter,
  onChange,
  onClose,
}: {
  col: DataGridColumn;
  filter: ColFilter | undefined;
  onChange: (f: ColFilter | undefined) => void;
  onClose: () => void;
}) {
  const ref = useClickOutside<HTMLDivElement>(onClose);
  const isSet = col.option || col.type === "bool";

  if (isSet) {
    const choices = col.type === "bool" ? ["Yes", "No"] : (col.options ?? []);
    // For bool the stored value is true/false; map the choice labels back.
    const current = filter && filter.kind === "set" ? new Set(filter.values) : new Set<string>();
    const toggle = (choice: string) => {
      const next = new Set(current);
      const stored = col.type === "bool" ? (choice === "Yes" ? "true" : "false") : choice;
      if (next.has(stored)) next.delete(stored);
      else next.add(stored);
      onChange(next.size ? { kind: "set", values: Array.from(next) } : undefined);
    };
    return (
      <div
        ref={ref}
        className="absolute z-30 mt-1 left-0 w-56 max-h-72 overflow-auto bg-card text-card-foreground border border-base-200 rounded-[4px] shadow-lg p-2"
      >
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className="text-label uppercase tracking-[0.05em] text-base-500">Filter {col.label}</span>
          <button
            type="button"
            className="text-meta text-primary hover:underline"
            onClick={() => onChange(undefined)}
          >
            Clear
          </button>
        </div>
        {choices.length === 0 && <div className="text-meta text-base-400 px-1 py-1">No values</div>}
        {choices.map((choice) => {
          const stored = col.type === "bool" ? (choice === "Yes" ? "true" : "false") : choice;
          return (
            <label
              key={choice}
              className="flex items-center gap-2 px-1 py-1 rounded hover:bg-base-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={current.has(stored)}
                onChange={() => toggle(choice)}
              />
              <span className="text-body text-base-700 truncate">{choice || "—"}</span>
            </label>
          );
        })}
      </div>
    );
  }

  const q = filter && filter.kind === "text" ? filter.q : "";
  return (
    <div
      ref={ref}
      className="absolute z-30 mt-1 left-0 w-56 bg-card text-card-foreground border border-base-200 rounded-[4px] shadow-lg p-2"
    >
      <div className="flex items-center justify-between mb-1.5 px-1">
        <span className="text-label uppercase tracking-[0.05em] text-base-500">Filter {col.label}</span>
        <button
          type="button"
          className="text-meta text-primary hover:underline"
          onClick={() => onChange(undefined)}
        >
          Clear
        </button>
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => onChange(e.target.value ? { kind: "text", q: e.target.value } : undefined)}
        placeholder={`Contains…`}
        className="w-full px-2 py-1.5 border border-base-300 rounded-[4px] text-body bg-white outline-none focus:border-base-500"
      />
    </div>
  );
}

// --- main component ---------------------------------------------------------
export default function DataGrid({
  columns,
  rows,
  getRowId,
  onResize,
  search = "",
  rowCap = 300,
  emptyHint = "No rows.",
}: DataGridProps) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState<Record<string, ColFilter>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const widthOf = useCallback(
    (col: DataGridColumn) => overrides[col.key] ?? col.width,
    [overrides],
  );

  const template = useMemo(
    () => columns.map((c) => `${widthOf(c)}px`).join(" "),
    [columns, widthOf],
  );
  const totalWidth = useMemo(
    () => columns.reduce((s, c) => s + widthOf(c), 0),
    [columns, widthOf],
  );

  // --- resize via CSS var (no re-render mid-drag) ---
  const onHandleDown = useCallback(
    (e: React.PointerEvent, col: DataGridColumn) => {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { key: col.key, startX: e.clientX, startWidth: widthOf(col) };
      const move = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d || !wrapperRef.current) return;
        const next = Math.min(Math.max(d.startWidth + (ev.clientX - d.startX), 48), 800);
        const liveTemplate = columns
          .map((c) => `${c.key === d.key ? next : widthOf(c)}px`)
          .join(" ");
        const liveTotal = columns.reduce(
          (s, c) => s + (c.key === d.key ? next : widthOf(c)),
          0,
        );
        wrapperRef.current.style.setProperty("--dg-cols", liveTemplate);
        wrapperRef.current.style.width = `${liveTotal}px`;
      };
      const up = (ev: PointerEvent) => {
        const d = dragRef.current;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        dragRef.current = null;
        if (!d) return;
        const next = Math.min(Math.max(d.startWidth + (ev.clientX - d.startX), 48), 800);
        setOverrides((prev) => ({ ...prev, [d.key]: next }));
        onResize?.(d.key, next);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    },
    [columns, widthOf, onResize],
  );

  const cycleSort = useCallback((key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }, []);

  const colByKey = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.key, c])),
    [columns],
  );

  // --- derive visible rows: filter → search → sort ---
  const processed = useMemo(() => {
    const activeFilters = Object.entries(filters);
    const q = search.trim().toLowerCase();
    let out = rows.filter((row) => {
      for (const [key, f] of activeFilters) {
        const col = colByKey[key];
        if (col && !rowPassesFilter(row, col, f)) return false;
      }
      if (q) {
        const hit = columns.some((c) =>
          formatCell(row[c.key] ?? null, c.type).toLowerCase().includes(q),
        );
        if (!hit) return false;
      }
      return true;
    });
    if (sort) {
      const col = colByKey[sort.key];
      if (col) {
        const dir = sort.dir === "asc" ? 1 : -1;
        out = [...out].sort((a, b) => dir * compareValues(a[col.key], b[col.key], col.type));
      }
    }
    return out;
  }, [rows, filters, search, sort, columns, colByKey]);

  const capped = processed.slice(0, rowCap);

  return (
    <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-260px)]">
        <div ref={wrapperRef} style={{ width: totalWidth, ["--dg-cols" as string]: template }}>
          {/* header */}
          <div
            className="grid sticky top-0 z-20 bg-base-50 border-b border-base-200"
            style={{ gridTemplateColumns: "var(--dg-cols)" }}
          >
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const hasFilter = !!filters[col.key];
              return (
                <div
                  key={col.key}
                  className="relative flex items-center gap-1 px-3 py-2 select-none"
                  style={{ justifyContent: col.align === "right" ? "flex-end" : "flex-start" }}
                >
                  <button
                    type="button"
                    onClick={() => cycleSort(col.key)}
                    className="label hover:text-base-800 flex items-center gap-1 truncate"
                    title={`Sort by ${col.label}`}
                  >
                    <span className="truncate">{col.label}</span>
                    {active ? (
                      sort?.dir === "asc" ? (
                        <ChevronUp className="w-3 h-3 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3 h-3 shrink-0" />
                      )
                    ) : (
                      <ChevronsUpDown className="w-3 h-3 shrink-0 opacity-30" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenFilter((k) => (k === col.key ? null : col.key))}
                    className={`shrink-0 p-0.5 rounded ${
                      hasFilter ? "text-primary" : "text-base-400 hover:text-base-700"
                    }`}
                    title={`Filter ${col.label}`}
                    aria-label={`Filter ${col.label}`}
                  >
                    <FilterIcon className="w-3 h-3" />
                  </button>
                  {openFilter === col.key && (
                    <FilterPopover
                      col={col}
                      filter={filters[col.key]}
                      onChange={(f) =>
                        setFilters((prev) => {
                          const next = { ...prev };
                          if (f) next[col.key] = f;
                          else delete next[col.key];
                          return next;
                        })
                      }
                      onClose={() => setOpenFilter(null)}
                    />
                  )}
                  {/* resize handle */}
                  <span
                    onPointerDown={(e) => onHandleDown(e, col)}
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40"
                    role="separator"
                    aria-orientation="vertical"
                  />
                </div>
              );
            })}
          </div>

          {/* body */}
          {capped.length === 0 ? (
            <div className="px-3 py-8 text-body text-base-400 text-center">{emptyHint}</div>
          ) : (
            capped.map((row) => (
              <div
                key={getRowId(row)}
                data-testid="dg-row"
                className="grid items-center border-b border-base-100 last:border-b-0 hover:bg-base-50/60"
                style={{ gridTemplateColumns: "var(--dg-cols)" }}
              >
                {columns.map((col) => {
                  const txt = formatCell(row[col.key] ?? null, col.type);
                  return (
                    <div
                      key={col.key}
                      className="px-3 py-1.5 text-body text-base-700 truncate"
                      style={{ textAlign: col.align === "right" ? "right" : "left" }}
                      title={txt}
                    >
                      {txt || <span className="text-base-300">—</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-base-200 bg-base-50/50">
        <span className="text-meta text-base-500">
          {processed.length === rows.length
            ? `${rows.length} rows`
            : `${processed.length} of ${rows.length} rows`}
        </span>
        {processed.length > rowCap && (
          <span className="text-meta text-base-400">
            Showing first {rowCap} — refine filters to see the rest
          </span>
        )}
      </div>
    </div>
  );
}
