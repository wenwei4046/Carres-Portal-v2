/**
 * SalesOrdersRegister — SO-1 FINAL, upgraded by SO-3, re-engined by SO-4
 * (Loo, 2026-08-09: *"Register = 2990 grid engine, full-bleed"*).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⭐ THE REGISTER LAW STILL RULES THE GRID
 *
 *   "Forget web applications. Build this page as if you were building Microsoft
 *    Excel. Every order is exactly ONE row. Every column is exactly ONE fact.
 *    A row may NEVER be taller than another row. The register never expands and
 *    never explains."
 *
 * SO-4 re-bases the grid on 2990's OWN shipped mechanics
 * (`2990s/apps/backend/src/components/DataGrid.tsx`, 1,551 lines, measured):
 *
 * ```
 * ✗ the permanent filter-input row   an invention — 2990 never had one
 * ✗ Refresh                          the query refetches itself
 * ✗ the standalone date pickers      dates filter through their column's ▼
 * + header ▼ per column              checklist · date presets+range · min/max
 * + Gmail chips under the toolbar    exist ONLY while a filter narrows
 * + density dense                    28px rows · 12px body · 2990's numbers
 * + windowed rows                    the DOM holds the window, not the list
 * + full-bleed                       the grid OWNS the workspace — no card
 * + Record x of y                    the status bar, under the grid
 * ```
 *
 * **The page therefore does not render `PageShell`.** The shell's list variant
 * is a padded canvas with a floating toolbar card — the exact chrome the card
 * deletes ("no card/rounded container, full width, full height"). The bands it
 * would have provided are three flat strips this file lays out itself:
 * toolbar · chips (conditional) · status bar. 2990's `.root` made the same
 * move for the same reason (Wei Siang 2026-06-04: *"no border, no radius — a
 * flat full-bleed panel, not a 框框"*).
 *
 * **AND THE CUSTOMER CELL IS ONE LINE AGAIN.** SO-3 stacked the phone under the
 * name inside a 34px row; SO-4's density is 28, and 28 cannot hold 34px of ink
 * — the two-line cell dies with the density that carried it. The phone is not
 * lost: it rides the SAME cell as `Name · phone` (the catalog's own `text`, so
 * the cell, the filter, the sort and the export finally agree), it is still a
 * column of its own in the chooser, the global search still matches it, and the
 * panel header now says it out loud.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE PANEL IS AN OVERLAY NOW (≤40% of the workspace) — the grid keeps its full
 * width underneath and the two FROZEN columns keep every row named while it is
 * open. `↑`/`↓` walk the register from anywhere but a form field; `Esc` closes.
 *
 * SEARCH IS STILL CLIENT-SIDE, AND IT IS STILL ONE DEBT WITH THE 200-ROW CAP.
 * See `docs/MIGRATION-MAP.md` D-A · D-B.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
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
  REGISTER_FIELDS,
  toCsv,
  type ColumnFilterState,
  type DatePreset,
  type RegisterRow,
} from "./sales-order-columns";

/** ONE cell, ONE fact. A money state is a number or a sentence, never nothing. */
function moneyCell(state: MoneyState) {
  if (state.kind === "amount") return <Money value={state.value} />;
  return state.kind === "settled" ? "Paid in full" : "No price yet";
}

/**
 * The only cells that are not their own `text` string: the three money columns
 * render `Money`, which owns the `RM ` and the grouping. Everything else —
 * the Customer cell included, since SO-4 — prints the catalog's string, so a
 * column's filter and its cell can never disagree.
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
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"live" | "all">("live");
  const [shown, setShown] = useState<readonly string[]>(DEFAULT_COLUMNS);
  const [filters, setFilters] = useState<ReadonlyMap<string, ColumnFilterState>>(
    new Map(),
  );
  const [sort, setSort] = useState<TableSort | null>(null);

  /* `?order=<id>` opens the PANEL over the register's right edge;
     `?view=document` swaps to the full-page printable Sales Order. Both are on
     the URL, so Back works and Service Cases' existing `?order=` deep link (J2)
     still lands on this order. */
  const [params, setParams] = useSearchParams();
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

  const { data, isLoading, isError, error, refetch } = useOperationOrders({});

  const all = useMemo<RegisterRow[]>(
    () => (data?.orders ?? []).filter((o) => !isRental(o)).map(buildRegisterRow),
    [data],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digits(q);
    return all.filter((r) => {
      if (scope === "live" && isDelivered(r.o)) return false;
      if (!passesColumnFilters(r, filters)) return false;
      if (!q) return true;
      if (r.needle.includes(q)) return true;
      if (qDigits.length >= 3 && r.phoneDigits.includes(qDigits)) return true;
      return false;
    });
  }, [all, search, scope, filters]);

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

  const columns = useMemo<readonly Column<RegisterRow>[]>(
    () =>
      shown
        .map(fieldByKey)
        .filter((f): f is NonNullable<typeof f> => f != null)
        .map((f) => {
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
            width: f.width,
            align: f.align,
            numeric: f.numeric,
            sortable: true,
            filter,
            cell: CELL[f.key] ?? ((r: RegisterRow) => f.text(r)),
          };
        }),
    [shown, filters, valueOptions, patchFilter, clearFilter],
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

  const position = openOrderId ? rows.findIndex((r) => r.id === openOrderId) : -1;
  const step = useCallback(
    (delta: -1 | 1) => {
      if (position < 0) return;
      const next = rows[position + delta];
      if (next) setOpen(next.id);
    },
    [position, rows, setOpen],
  );

  /* ↑ ↓ walk the register and Esc closes the panel FROM ANYWHERE on the page
     while the panel is open — except inside a form field, whose keystrokes are
     the operator's own. The grid's focused handler still works; this one means
     an operator reading the PANEL never has to click back into the grid first. */
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
    const csv = toCsv(shown, rows);
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

      {/* ── ONE toolbar row — flat, full width, no card (SO-4) ────────────── */}
      <div
        data-testid="register-toolbar"
        className="flex shrink-0 items-center gap-2 border-b border-kit-slate-5 bg-white px-3 py-1.5"
      >
        <span className="w-64 shrink-0">
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
              Columns
            </Button>
          }
        >
          <div className="flex max-h-96 w-64 flex-col gap-3 overflow-y-auto">
            <p className="text-label text-base-500">
              Extra facts. Cleared on reload.
            </p>
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
          Export
        </Button>
      </div>

      {/* ── The chips row EXISTS only while a ▼ narrows (SO-4: "DOM 里也不存在") */}
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

      {/* ── The grid OWNS the workspace; the panel OVERLAYS its right edge ── */}
      <div className="relative flex min-h-0 flex-1">
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
          /* While the panel is open the grid column steps back by EXACTLY the
             panel's width — the same `min(420px,40%)`, so the two always agree.
             No column is ever buried under the panel: the sheet scrolls
             sideways instead, with SO No + Customer frozen, which is the one
             situation freeze exists for. Panel closed = no margin = the grid
             owns the full workspace (SO-4). */
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-col [container-type:inline-size] ${
              openOrderId ? "mr-[min(420px,40%)]" : ""
            }`}
          >
            <DataTable
              rows={rows}
              columns={columns}
              rowId={(r) => r.id}
              testId="sales-orders-table"
              rowTestId="sales-order-row"
              label="Sales orders"
              loading={isLoading}
              sizing="content"
              density="dense"
              virtual
              freeze={FROZEN_COLUMNS}
              sort={sort}
              onSortChange={setSort}
              layout={{
                resizeLabel: "Drag to resize",
                reorderLabel: "Drag to reorder",
              }}
              activeRow={{
                id: openOrderId,
                label: "Sales orders",
                /* ↑ ↓ CHANGE THE PANEL. There is no second press: the row
                   the operator is on IS the order the panel shows. */
                onChange: (id) => setOpen(id),
                onOpen: (id) => setOpen(id, "document"),
              }}
              onRowOpen={(r) => setOpen(r.id)}
              empty={
                <div className="w-[100cqi]">
                  <EmptyState
                    title={
                      search.trim() || filters.size > 0
                        ? "No order matches this search"
                        : "No orders yet"
                    }
                  />
                </div>
              }
            />
            {/* ── The status bar — 2990's own last line, under the grid ── */}
            <div
              data-testid="register-count"
              className="flex h-7 shrink-0 items-center border-t border-kit-slate-5 bg-white px-3 text-meta text-kit-slate-11"
            >
              Record {rows.length === 0 ? 0 : position >= 0 ? position + 1 : 1} of{" "}
              {rows.length}
            </div>
          </div>
        )}

        {openOrderId && (
          /* ≤40% of the workspace, capped at the panel's own 420px — the grid
             keeps its full width underneath, and the frozen SO No + Customer
             stay in the uncovered left. */
          <div className="absolute inset-y-0 right-0 z-10 w-[min(420px,40%)]">
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
