/**
 * SalesOrdersRegister — SO-1 FINAL, upgraded by SO-3, re-engined by SO-4,
 * FROZEN by SO-5 (Loo, 2026-08-09: *"After this card passes acceptance, the
 * Sales Orders Blueprint is FROZEN: no UI redesign accepted, bug fixes and
 * minor usability only."*)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE REGISTER LAW STILL RULES THE GRID
 *
 *   "The register never owns workflow. A register may: Search · Filter · Sort ·
 *    Select · Inspect. It never executes business workflow — workflow always
 *    belongs to its owning module. Bulk selection may only be used for
 *    view-oriented actions (print / export / copy), never operational
 *    workflow."                     (verbatim home: docs/MIGRATION-MAP.md)
 *
 * SO-5's shape, and why each piece is what it is:
 *
 * ```
 * SIDE PANE       the Detail Panel is a FIXED 35% pane, never an overlay —
 *                 opening it REFLOWS the grid: every column kept,
 *                 proportionally narrowed, SO No + Customer frozen, Items
 *                 ellipsising. No resizing (deferred by owner ruling).
 * NO DEAD ZONE    the grid runs `fill` sizing: columns spend the whole width,
 *                 pane open AND closed. SO-4's `content` + filler died here —
 *                 the filler WAS the dead white zone.
 * SELECTION       checkboxes serve Export ONLY (the REGISTER LAW's own
 *                 clause). The Export button says what it will do:
 *                 `Export current view` / `Export N selected`. No Actions menu.
 * URL FILTERS     every narrowing ▼ + the search + the scope live on the URL,
 *                 so a narrowed register is a SHAREABLE VIEW.
 * COLUMNS         the chooser is remembered per user (auto-remember, not a
 *                 layout manager) and lists EVERY column in four groups:
 *                 Order · Customer · Money · Dates. `Reset columns` puts the
 *                 five defaults back.
 * STATUS BAR      `{n} orders` — and `{x} of {n} · Filters active` while
 *                 anything narrows, so a short list is never mistaken for a
 *                 short business.
 * ```
 *
 * **The page does not render `PageShell`** — the shell's list variant is a
 * padded canvas with a floating toolbar card, the exact chrome SO-4 deleted
 * ("no card/rounded container, full width, full height"). The bands are three
 * flat strips this file lays out itself: toolbar · chips (conditional) ·
 * status bar.
 *
 * SEARCH IS STILL CLIENT-SIDE, AND IT IS STILL ONE DEBT WITH THE 200-ROW CAP.
 * See `docs/MIGRATION-MAP.md` D-A · D-B.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import DataTable, {
  type Column,
  type ColumnFilter,
  type TableSort,
} from "@/components/kit/DataTable";
import SearchInput from "@/components/kit/SearchInput";
import Button from "@/components/kit/Button";
import Popover from "@/components/kit/Popover";
import Checkbox from "@/components/kit/Checkbox";
import Select from "@/components/kit/Select";
import EmptyState from "@/components/kit/EmptyState";
import Icon from "@/components/kit/Icon";
import Money from "@/components/Money";
import { useOperationOrders } from "@/lib/queries";
import ModuleHeader from "./components/ModuleHeader";
import SalesOrderDocument from "./SalesOrderDocument";
import SalesOrderPanel from "./SalesOrderPanel";
import { digits, isDelivered, isRental, type MoneyState } from "./sales-order-facts";
import {
  buildRegisterRow,
  DATE_PRESETS,
  DEFAULT_COLUMNS,
  FIELD_GROUPS,
  fieldByKey,
  filterChipText,
  filterIsActive,
  FROZEN_COLUMNS,
  passesColumnFilters,
  readFiltersFromParams,
  REGISTER_FIELDS,
  sanitizeShownColumns,
  toCsv,
  writeFiltersToParams,
  type ColumnFilterState,
  type DatePreset,
  type RegisterRow,
} from "./sales-order-columns";

/**
 * SO-5 — the chooser survives a reload (*"auto-remember; NOT a layout
 * manager"*). ONE key, holding only which columns are on: no widths, no
 * order, no filters — those have their own homes (the catalog, the URL).
 */
const COLUMNS_STORE = "carres.salesOrders.columns";

function loadShownColumns(): readonly string[] {
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORE);
    return raw ? sanitizeShownColumns(JSON.parse(raw)) : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/** ONE cell, ONE fact. A money state is a number or a sentence, never nothing. */
function moneyCell(state: MoneyState) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return state.kind === "settled" ? "Paid in full" : "No price yet";
}

/**
 * The only cells that are not their own `text` string: the three money columns
 * render `Money`, which owns the `RM ` and the grouping. Every other cell
 * prints the catalog's string inside a `truncate` span with the full string on
 * `title` — SO-5's pane narrows every column proportionally, and a clipped
 * `Booqit · CNR ×…` must end in an ellipsis the eye can read, not half a glyph.
 */
const CELL: Record<string, (r: RegisterRow) => React.ReactNode> = {
  value: (r) => moneyCell(r.value),
  paid: (r) => moneyCell(r.paid),
  outstanding: (r) => moneyCell(r.outstanding),
};

/** Is this event already someone's typing? Then the register keeps its hands off. */
function inFormField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function SalesOrdersRegister() {
  /* `?order=<id>` opens the PANE beside the register; `?view=document` swaps
     to the full-page printable Sales Order; `?q=`, `?scope=` and every
     `?f_<column>=` are the view itself — SO-5: a narrowed register is a
     SHAREABLE LINK, and Back works. Service Cases' existing `?order=` deep
     link (J2) still lands on this order. */
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(() => params.get("q") ?? "");
  const [scope, setScope] = useState<"live" | "all">(() =>
    params.get("scope") === "all" ? "all" : "live",
  );
  const [filters, setFilters] = useState<ReadonlyMap<string, ColumnFilterState>>(
    () => readFiltersFromParams(params),
  );
  const [shown, setShown] = useState<readonly string[]>(loadShownColumns);
  const [sort, setSort] = useState<TableSort | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const openOrderId = params.get("order");
  const documentMode = params.get("view") === "document";
  const setOpen = useCallback(
    (id: string | null, view?: "document") => {
      const next = new URLSearchParams(params);
      if (id) next.set("order", id);
      else next.delete("order");
      if (view) next.set("view", view);
      else next.delete("view");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  /* STATE → URL, one way. The initial render read the URL once above; from
     here every change is written back (replace, so typing does not stack
     history). The ref keeps the effect off the params identity, which this
     same effect changes. */
  const paramsRef = useRef(params);
  paramsRef.current = params;
  useEffect(() => {
    const next = new URLSearchParams(paramsRef.current);
    if (search.trim()) next.set("q", search);
    else next.delete("q");
    if (scope === "all") next.set("scope", "all");
    else next.delete("scope");
    writeFiltersToParams(filters, next);
    if (next.toString() !== paramsRef.current.toString()) {
      setParams(next, { replace: true });
    }
  }, [search, scope, filters, setParams]);

  /* SHOWN COLUMNS → the per-user store, every change. */
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMNS_STORE, JSON.stringify(shown));
    } catch {
      /* a full or blocked store loses the memory, never the register */
    }
  }, [shown]);

  const { data, isLoading, isError, error, refetch } = useOperationOrders({});

  const all = useMemo<RegisterRow[]>(
    () => (data?.orders ?? []).filter((o) => !isRental(o)).map(buildRegisterRow),
    [data],
  );

  /* The scope is the register's population; search and the ▼s narrow WITHIN
     it. The status bar needs both counts, so they are computed apart. */
  const scoped = useMemo(
    () => all.filter((r) => scope !== "live" || !isDelivered(r.o)),
    [all, scope],
  );

  const narrowing = search.trim() !== "" || filters.size > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(q);
    return scoped.filter((r) => {
      if (!passesColumnFilters(r, filters)) return false;
      if (!q) return true;
      if (r.needle.includes(q)) return true;
      if (qDigits.length >= 3 && r.phoneDigits.includes(qDigits)) return true;
      return false;
    });
  }, [scoped, search, filters]);

  const rows = useMemo(() => {
    const out = [...filtered];
    const field = sort ? fieldByKey(sort.key) : undefined;
    if (!field) return out.sort((a, b) => b.ordered.localeCompare(a.ordered));
    const dir = sort?.dir === "asc" ? 1 : -1;
    const key = field.sortBy ?? field.text;
    return out.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y));
      return cmp * dir;
    });
  }, [filtered, sort]);

  /* ── One column's ▼ state, edited a member at a time ────────────────────── */
  const patchFilter = useCallback(
    (key: string, patch: Partial<ColumnFilterState>) => {
      setFilters((prev) => {
        const next = new Map(prev);
        const merged: ColumnFilterState = { ...next.get(key), ...patch };
        if (filterIsActive(merged)) next.set(key, merged);
        else next.delete(key);
        return next;
      });
    },
    [],
  );
  const clearFilter = useCallback((key: string) => {
    setFilters((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);
  const clearAllFilters = useCallback(() => setFilters(new Map()), []);
  /* The empty state's one button: release EVERYTHING that narrows, because
     the operator staring at an empty sheet wants their register back, not a
     lesson in which control did it. */
  const clearAllNarrowing = useCallback(() => {
    setFilters(new Map());
    setSearch("");
  }, []);

  /* Distinct values for a checklist column — what the cells actually print,
     over the WHOLE register (2990 lists values from `rows`, pre-filter, so an
     operator can widen a narrowed grid from inside the ▼). */
  const valueOptions = useCallback(
    (key: string): { value: string; label: string }[] => {
      const field = fieldByKey(key);
      if (!field) return [];
      const set = new Set<string>();
      for (const r of all) set.add(field.text(r));
      return [...set]
        .sort((a, b) => a.localeCompare(b))
        .map((v) => ({ value: v, label: v }));
    },
    [all],
  );

  /* SO-5 — the table spends EXACTLY the container, pane open and closed.
     In `table-fixed`, a px width is a FLOOR: five defaults + the select box
     measured 928px against an 870px pane-open container, so the sheet
     overflowed sideways and the pane became an overlay-by-scroll — the exact
     thing this card deletes. The card's clause decides who absorbs the loss:

       "all columns kept, proportionally narrowed, SO No + Customer frozen,
        Items ellipsizes"

     The FROZEN pair keeps its measured px — frozen means the operator never
     loses WHOSE row a cell belongs to, and a `SO-…` ellipsis is exactly that
     loss. Every other column takes a `calc()` share of whatever width is
     left after the frozen pair and the kit's 4% select box, in proportion to
     its measured px — so the flexible columns narrow together and `Items`,
     the widest, gives up the most and ellipsises. */
  const visibleFields = useMemo(
    () =>
      shown
        .map(fieldByKey)
        .filter((f): f is NonNullable<ReturnType<typeof fieldByKey>> => f != null),
    [shown],
  );
  /* The container is MEASURED, because CSS cannot say "the remaining width,
     shared by measured proportion": a `calc(% − px)` on a table `<col>` is
     quietly ignored by the fixed-layout algorithm (measured: three flexible
     columns rendered EQUAL at 291px each, the ratios discarded). A
     ResizeObserver keeps the measurement honest when the pane opens, the nav
     collapses or the window changes. */
  const [gridWidth, setGridWidth] = useState(0);
  const gridBoxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = gridBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setGridWidth(el.clientWidth));
    ro.observe(el);
    setGridWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const columnWidth = useMemo(() => {
    const frozenPx = visibleFields
      .slice(0, FROZEN_COLUMNS)
      .reduce((s, f) => s + parseFloat(f.width), 0);
    const flexPx = visibleFields
      .slice(FROZEN_COLUMNS)
      .reduce((s, f) => s + parseFloat(f.width), 0);
    return (f: (typeof visibleFields)[number], index: number): string => {
      /* No measurement yet (first paint, jsdom): the catalog's px stand. */
      if (index < FROZEN_COLUMNS || flexPx === 0 || gridWidth === 0) return f.width;
      const ratio = parseFloat(f.width) / flexPx;
      /* 96% = the table minus the kit's 4% select box; 2 = the wrapper's own
         left + right border. Floored so rounding can never overflow the
         container, and floored at the catalog px ÷ 3 so a pathological window
         cannot compute a negative column. */
      const free = gridWidth * 0.96 - 2 - frozenPx;
      const px = Math.max(parseFloat(f.width) / 3, Math.floor(free * ratio));
      return `${px}px`;
    };
  }, [visibleFields, gridWidth]);

  const columns = useMemo<readonly Column<RegisterRow>[]>(
    () =>
      visibleFields
        .map((f, index) => {
          const state = filters.get(f.key) ?? {};
          /* EVERY column sorts and EVERY column carries the ▼ — properties of
             the catalog, never of a hand list that can fall behind it. The ▼'s
             SHAPE is the column's `kind`: checklist, date, or number. */
          const filter: ColumnFilter = {
            options: f.kind ? [] : valueOptions(f.key),
            selected: state.values ?? new Set<string>(),
            onChange: (next) => patchFilter(f.key, { values: next }),
            label: `Filter ${f.label}`,
            clearLabel: "Clear",
            active: filterIsActive(state),
            onClear: () => clearFilter(f.key),
            ...(f.kind == null ? { searchPlaceholder: "Search" } : {}),
            ...(f.kind === "date"
              ? {
                  presets: {
                    options: DATE_PRESETS,
                    selected: state.preset ?? null,
                    onToggle: (v) =>
                      patchFilter(f.key, {
                        preset: state.preset === v ? undefined : (v as DatePreset),
                      }),
                  },
                  range: {
                    label: "Custom date range",
                    from: state.from ?? null,
                    to: state.to ?? null,
                    onFromChange: (v) => patchFilter(f.key, { from: v || undefined }),
                    onToChange: (v) => patchFilter(f.key, { to: v || undefined }),
                  },
                }
              : {}),
            ...(f.kind === "number"
              ? {
                  number: {
                    min: state.min ?? "",
                    max: state.max ?? "",
                    onMinChange: (v) => patchFilter(f.key, { min: v || undefined }),
                    onMaxChange: (v) => patchFilter(f.key, { max: v || undefined }),
                    minLabel: "At least",
                    maxLabel: "Up to",
                  },
                }
              : {}),
          };
          return {
            key: f.key,
            label: f.label,
            width: columnWidth(f, index),
            align: f.align,
            numeric: f.numeric,
            sortable: true,
            filter,
            cell:
              CELL[f.key] ??
              ((r: RegisterRow) => {
                const text = f.text(r);
                return (
                  <span className="block truncate" title={text}>
                    {text}
                  </span>
                );
              }),
          };
        }),
    [visibleFields, columnWidth, filters, valueOptions, patchFilter, clearFilter],
  );

  /* ── The chips: ONE per narrowing ▼, and the row does not exist without one.
     The toolbar's own controls (search, scope) are visible in themselves and
     get no chip — a chip restates a filter you would otherwise have to find. */
  const chips = useMemo(
    () =>
      [...filters]
        .filter(([, f]) => filterIsActive(f))
        .map(([key, f]) => {
          const field = fieldByKey(key);
          return field ? { key, label: filterChipText(field, f) } : null;
        })
        .filter((c): c is { key: string; label: string } => c != null),
    [filters],
  );

  /* ── SELECTION — the REGISTER LAW's clause, enforced in shape: the ONLY
     thing a ticked row feeds is Export. Ticks on rows a later filter hid do
     not count and do not export — the button must never claim three and
     deliver one. */
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected],
  );
  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allPicked = rows.length > 0 && rows.every((r) => prev.has(r.id));
      return allPicked ? new Set() : new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  const position = openOrderId ? rows.findIndex((r) => r.id === openOrderId) : -1;
  const step = useCallback(
    (delta: -1 | 1) => {
      if (position < 0) return;
      const next = rows[position + delta];
      if (next) setOpen(next.id);
    },
    [position, rows, setOpen],
  );

  /* ↑ ↓ walk the register and Esc closes the pane FROM ANYWHERE on the page
     while the pane is open — except inside a form field, whose keystrokes are
     the operator's own. The grid's focused handler still works; this one means
     an operator reading the PANE never has to click back into the grid first. */
  useEffect(() => {
    if (!openOrderId) return;
    const onKey = (e: KeyboardEvent) => {
      if (inFormField(e.target)) return;
      if (e.key === "Escape") {
        setOpen(null);
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        step(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openOrderId, step, setOpen]);

  const exportCsv = () => {
    const exportRows = selectedRows.length > 0 ? selectedRows : rows;
    const csv = toCsv(shown, exportRows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "sales-orders.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* THE FULL DOCUMENT IS ITS OWN SCREEN. It is the printable Sales Order and it
     is what `⤢` opens; the register is unmounted while it is open, exactly as
     SO-1 shipped it, because a document you print is not a panel. */
  if (openOrderId && documentMode) {
    return (
      <SalesOrderDocument
        orderId={openOrderId}
        onClose={() => setOpen(openOrderId)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ModuleHeader
        testId="sales-orders-header"
        icon={ClipboardList}
        word="Sales Orders"
        docTitle="Sales Orders — Carres"
        /* No Refresh. The query refetches itself on focus and after every
           mutation; a button that re-asks for what arrives by itself is a
           control that teaches operators to distrust the screen (SO-4). */
      />

      {/* ── REGISTER (left) + DETAIL PANE (right, fixed 35%) — SO-5. The pane
          REFLOWS the register: it is a flex sibling, never an overlay, so the
          grid narrows to 65% and every column narrows with it. The toolbar
          lives INSIDE the register column, so its popovers can never overlap
          the open pane. */}
      <div className="flex min-h-0 flex-1">
        <div ref={gridBoxRef} className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* ── ONE toolbar row — flat, full width, no card (SO-4) ────────── */}
          <div
            data-testid="register-toolbar"
            className="flex shrink-0 items-center gap-2 border-b border-kit-slate-5 bg-white px-3 py-1.5"
          >
            <span className="w-[200px] shrink-0">
              <SearchInput
                id="sales-orders-search"
                pill
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="SO number, customer, phone or item…"
              />
            </span>
            <span className="w-36 shrink-0">
              <Select
                id="sales-orders-scope"
                value={scope}
                onValueChange={(v) => setScope(v as "live" | "all")}
                options={[
                  { value: "live", label: "Not delivered" },
                  { value: "all", label: "All orders" },
                ]}
              />
            </span>
            <Button
              size="sm"
              variant="ghost"
              data-testid="clear-filters"
              disabled={chips.length === 0}
              onClick={clearAllFilters}
            >
              Clear filters
            </Button>
            <span className="flex-1" />
            <Popover
              label="Choose columns"
              align="end"
              trigger={
                <Button size="sm" variant="neutral" data-testid="columns-button">
                  {/* 2990's own `22/42` (Loo, 2026-08-09): the button says how
                      much of the catalog is on screen before it is opened. */}
                  {`Columns · ${shown.length}/${REGISTER_FIELDS.length}`}
                </Button>
              }
            >
              <div className="flex max-h-96 w-64 flex-col gap-3 overflow-y-auto">
                {FIELD_GROUPS.map((group) => (
                  <div key={group} className="flex flex-col gap-1.5">
                    <span className="text-label text-base-500">{group}</span>
                    {REGISTER_FIELDS.filter((f) => f.group === group).map((f) => (
                      <Checkbox
                        key={f.key}
                        id={`column-${f.key}`}
                        label={f.label}
                        checked={shown.includes(f.key)}
                        onCheckedChange={(on) =>
                          setShown((prev) => {
                            if (on) {
                              /* A column re-appears where the CATALOG puts it,
                                 never at the end — otherwise ticking Phone twice
                                 moves it. */
                              const next = new Set([...prev, f.key]);
                              return REGISTER_FIELDS.filter((x) =>
                                next.has(x.key),
                              ).map((x) => x.key);
                            }
                            clearFilter(f.key);
                            return prev.filter((k) => k !== f.key);
                          })
                        }
                      />
                    ))}
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="columns-reset"
                  onClick={() => {
                    setShown(DEFAULT_COLUMNS);
                    clearAllFilters();
                  }}
                >
                  Reset columns
                </Button>
              </div>
            </Popover>
            <Button
              size="sm"
              variant="neutral"
              data-testid="export-button"
              disabled={rows.length === 0}
              onClick={exportCsv}
            >
              {/* The label answers BOTH questions a bare `Export` dodges —
                  which rows, and which format (Loo, 2026-08-09: "Export 什么？").
                  One format today, so a word, not a menu; `Export ▾` waits for
                  a real second format. */}
              {selectedRows.length > 0
                ? `Export CSV · ${selectedRows.length} selected`
                : "Export CSV · current view"}
            </Button>
          </div>

          {/* ── The chips row EXISTS only while a ▼ narrows (SO-4) ────────── */}
          {chips.length > 0 && (
            <div
              data-testid="register-chips"
              className="flex shrink-0 flex-wrap items-center gap-2 border-b border-kit-slate-5 bg-white px-3 py-1.5"
            >
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => clearFilter(c.key)}
                  data-testid={`chip-${c.key}`}
                  className="inline-flex items-center gap-1 rounded-pill border border-kit-slate-5 bg-kit-blue-3 py-0.5 pl-2 pr-1 text-label text-kit-blue-11 hover:border-kit-slate-6"
                >
                  {c.label}
                  <Icon name="close" size={14} />
                </button>
              ))}
              <Button size="sm" variant="ghost" data-testid="chips-clear-all" onClick={clearAllFilters}>
                Clear all
              </Button>
            </div>
          )}

          {isError ? (
            <div className="flex min-h-0 flex-1 flex-col bg-white">
              <EmptyState
                title="The register could not be loaded"
                detail={(error as Error | undefined)?.message}
                action={
                  <Button variant="neutral" onClick={() => void refetch()}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              <DataTable
                rows={rows}
                columns={columns}
                rowId={(r) => r.id}
                testId="sales-orders-table"
                rowTestId="sales-order-row"
                label="Sales orders"
                loading={isLoading}
                density="dense"
                virtual
                freeze={FROZEN_COLUMNS}
                sort={sort}
                onSortChange={setSort}
                layout={{
                  resizeLabel: "Drag to resize",
                  reorderLabel: "Drag to reorder",
                }}
                selection={{
                  selected,
                  onToggleRow: toggleRow,
                  onToggleAll: toggleAll,
                  label: "Select all sales orders",
                  rowLabel: (r) => `Select SO-${r.so}`,
                }}
                activeRow={{
                  id: openOrderId,
                  label: "Sales orders",
                  /* ↑ ↓ CHANGE THE PANE. There is no second press: the row
                     the operator is on IS the order the pane shows. */
                  onChange: (id) => setOpen(id),
                  onOpen: (id) => setOpen(id, "document"),
                }}
                onRowOpen={(r) => setOpen(r.id)}
                empty={
                  /* SO-5 — never a blank table. A narrowed register that finds
                     nothing SAYS so and hands back the one control that undoes
                     it; an empty business says the other thing. */
                  <EmptyState
                    title={
                      narrowing ? "No matching sales orders." : "No orders yet"
                    }
                    action={
                      narrowing ? (
                        <Button
                          variant="neutral"
                          data-testid="empty-clear-filters"
                          onClick={clearAllNarrowing}
                        >
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                }
              />
              {/* ── The status bar — the register's own count, under the grid.
                  `{n} orders` plain; `{x} of {n} · Filters active` while the
                  search or any ▼ narrows (SO-5). */}
              <div
                data-testid="register-count"
                className="flex h-7 shrink-0 items-center border-t border-kit-slate-5 bg-white px-3 text-meta text-kit-slate-11"
              >
                {narrowing
                  ? `${rows.length} of ${scoped.length} · Filters active`
                  : `${scoped.length} orders`}
              </div>
            </>
          )}
        </div>

        {openOrderId && (
          /* SO-5 — a FIXED 35% side pane. No resizing (deferred by owner
             ruling); no overlay: the register column above already gave up
             this width, so nothing is ever covered. */
          <div className="w-[35%] min-w-0 shrink-0" data-testid="detail-pane">
            <SalesOrderPanel
              orderId={openOrderId}
              position={position >= 0 ? position + 1 : 0}
              total={rows.length}
              onStep={step}
              onOpenDocument={() => setOpen(openOrderId, "document")}
              onClose={() => setOpen(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
