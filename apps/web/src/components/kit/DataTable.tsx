/**
 * DataTable — the ONE list table (UI-KIT §7, card D0.5c).
 *
 * **Extracted from the Orders table, not designed fresh** — §7 says so by name,
 * because a `DataTable` designed in the abstract will not fit the one table the
 * portal actually depends on, and D6 would rebuild it. Everything below is a
 * property `OperationOrdersControl` already has, moved into a component:
 *
 *   · `table-fixed` + a PERCENTAGE colgroup, so the table is always exactly the
 *     container width and NEVER scrolls horizontally on any screen — long
 *     content ellipsis-truncates instead (Loo, 2026-07-09);
 *   · rows 40px FIXED, `whitespace-nowrap`, each cell clipping its own overflow
 *     — content adapts to the row, never the reverse (SIZING LAW §3);
 *   · a sticky head at §4.4's layer 1, taken from `overlay-layer.ts` rather than
 *     typed as a number;
 *   · whole-row selection with a select-all that shows the indeterminate DASH on
 *     a partial tick;
 *   · §3.5's washes — one faint blue tint on hover, the stronger `blue-3` on the
 *     selected row, never grey.
 *
 * **Columns are DATA, and the header word comes from the column def.** That is
 * not tidiness: C1 found `Manage` surviving in a hand-written `<th>` while the
 * Columns popover already read the def — one column, two words, because the
 * header was typed twice. Here there is only one place it can be typed.
 *
 * **This file spells no word.** Every label is the caller's, from
 * COPY-STANDARD.
 *
 * **What it deliberately does NOT do.** It does not format a value: money is
 * `Money`/`.t-num` and a date is `fmtDate()` (§2.3 · §2.4), and a table that
 * formatted them would be a second date spelling. It offers `align` and
 * `numeric` — where the value sits and whether its figures line up — and stops.
 *
 * **Nothing is migrated onto this in D0.5c.** The Orders table keeps its own
 * markup until **D6**, which is the card that re-lays that page out.
 */
import { useState, type ReactNode } from "react";
import Button from "./Button";
import Checkbox from "./Checkbox";
import EmptyState from "./EmptyState";
import Icon from "./Icon";
import Loading from "./Loading";
import Popover from "./Popover";
import SearchInput from "./SearchInput";
import { Z_TABLE_HEADER } from "./overlay-layer";

/**
 * A column's Excel filter (Jess, 2026-08-01 — the AutoCount workspace: every
 * column sorts by header click and filters by its ▼). The kit renders the
 * popover — a value checklist with an optional search — and NOTHING more: the
 * page owns which rows survive, exactly as it owns formatting. Option LABELS
 * are the caller's (COPY-STANDARD speaks business — `Not Ordered`, never
 * `(Blanks)`).
 */
export interface ColumnFilter {
  options: readonly { value: string; label: string }[];
  /** Empty set = no filter — every row passes. */
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  /** What the popover is, for a screen reader — e.g. `Filter Model`. */
  label: string;
  /** The clear action's word — the CALLER's, this file spells nothing. */
  clearLabel: string;
  /** Present = a search box above the checklist. The placeholder is the word. */
  searchPlaceholder?: string;
}

export interface Column<Row> {
  key: string;
  /** The header word — typed ONCE, here. COPY-STANDARD owns it. */
  label: string;
  /** Percentage of the table width. The set should sum to 100. */
  width: number;
  align?: "left" | "right";
  /** Tabular figures, so a column of numbers lines up (§2.3). */
  numeric?: boolean;
  /** A tooltip on the header only — never the only copy of a rule. */
  headerTitle?: string;
  /** Header click sorts (asc ⇄ desc). Needs the table's `sort`/`onSortChange`. */
  sortable?: boolean;
  filter?: ColumnFilter;
  cell: (row: Row) => ReactNode;
}

export interface TableSort {
  key: string;
  dir: "asc" | "desc";
}

export interface DataTableProps<Row> {
  rows: readonly Row[];
  columns: readonly Column<Row>[];
  /** Stable identity — selection and React keys both read it. */
  rowId: (row: Row) => string;
  /** §8.2: clicking a row opens its record on the FIRST tab. */
  onRowOpen?: (row: Row) => void;
  /** Present = the table is selectable. Absent = no checkbox column at all. */
  selection?: {
    selected: ReadonlySet<string>;
    onToggleRow: (id: string) => void;
    onToggleAll: () => void;
    /** What the select-all box is called for a screen reader. */
    label: string;
    /**
     * Rows that can be picked at all. A row failing this renders an EMPTY
     * cell (not a disabled box) and leaves the select-all arithmetic — a
     * done row is not "unselected", it is out of the question.
     */
    selectable?: (row: Row) => boolean;
  };
  /** Shown INSTEAD of rows. §9: an empty state is an answer, not an apology. */
  empty: ReactNode;
  loading?: boolean;
  /** What the table is, for a screen reader. */
  label: string;
  /** The active sort. The PAGE sorts the rows; the kit only shows the arrow.
   *  A third click on the same header CLEARS it (`null`) — back to the
   *  page's own default order. */
  sort?: TableSort | null;
  onSortChange?: (next: TableSort | null) => void;
}

/**
 * One column's ▼ — an Excel AutoFilter as a checkbox popover. Lit blue while
 * it is narrowing, because a filter you cannot see is a lie the table tells.
 */
function HeaderFilter({ colKey, filter }: { colKey: string; filter: ColumnFilter }) {
  const [needle, setNeedle] = useState("");
  const shown = needle.trim()
    ? filter.options.filter((o) => o.label.toLowerCase().includes(needle.trim().toLowerCase()))
    : filter.options;
  const active = filter.selected.size > 0;
  return (
    <Popover
      label={filter.label}
      trigger={
        <Button
          size="sm"
          variant="ghost"
          icon="filter"
          aria-label={filter.label}
          data-testid={`table-filter-${colKey}`}
          data-active={active || undefined}
        />
      }
    >
      <div className="flex w-56 flex-col gap-2" data-kit="table-filter">
        {filter.searchPlaceholder != null ? (
          <SearchInput
            id={`table-filter-search-${colKey}`}
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            placeholder={filter.searchPlaceholder}
            aria-label={filter.label}
          />
        ) : null}
        <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
          {shown.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-body text-kit-slate-12">
              <Checkbox
                id={`table-filter-${colKey}-${o.value.replace(/[^\w-]/g, "_")}`}
                ariaLabel={o.label}
                checked={filter.selected.has(o.value)}
                onCheckedChange={() => {
                  const next = new Set(filter.selected);
                  if (next.has(o.value)) next.delete(o.value);
                  else next.add(o.value);
                  filter.onChange(next);
                }}
              />
              <span className="truncate">{o.label}</span>
            </label>
          ))}
        </div>
        {active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => filter.onChange(new Set())}
            data-testid={`table-filter-clear-${colKey}`}
          >
            {filter.clearLabel}
          </Button>
        ) : null}
      </div>
    </Popover>
  );
}

export default function DataTable<Row>({
  rows,
  columns,
  rowId,
  onRowOpen,
  selection,
  empty,
  loading = false,
  label,
  sort = null,
  onSortChange,
}: DataTableProps<Row>) {
  const selectableRows = selection
    ? rows.filter((r) => selection.selectable?.(r) ?? true)
    : [];
  const selectedCount = selection
    ? selectableRows.filter((r) => selection.selected.has(rowId(r))).length
    : 0;
  const allSelected =
    selection != null && selectableRows.length > 0 && selectedCount === selectableRows.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const colSpan = columns.length + (selection ? 1 : 0);

  return (
    <div
      data-kit="data-table"
      className="min-h-0 flex-1 overflow-auto rounded-t-card border border-kit-slate-5 bg-white"
    >
      <table
        aria-label={label}
        /* 40px FIXED rows. `whitespace-nowrap` kills the silent row-growers —
         * text WRAPPING inside a narrow fixed column is what makes one row
         * taller than the rest and the whole list stop being scannable. */
        className="w-full table-fixed border-collapse text-body [&_td]:h-10 [&_td]:overflow-hidden [&_td]:whitespace-nowrap [&_td]:align-middle"
      >
        {/* PERCENTAGE widths + `table-fixed` → the table is always exactly the
         *  container width, so it never scrolls sideways on a laptop. */}
        <colgroup>
          {selection && <col style={{ width: "4%" }} />}
          {columns.map((c) => (
            <col key={c.key} style={{ width: `${c.width}%` }} />
          ))}
        </colgroup>

        <thead className={`sticky top-0 ${Z_TABLE_HEADER}`}>
          <tr className="h-10 border-b border-kit-slate-5 bg-kit-slate-3">
            {selection && (
              <th className="px-2">
                <Checkbox
                  id="kit-table-select-all"
                  ariaLabel={selection.label}
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={selection.onToggleAll}
                />
              </th>
            )}
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.headerTitle}
                aria-sort={
                  sort?.key === c.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
                className={`px-2 text-label font-medium text-kit-slate-11 ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                <span
                  className={`inline-flex items-center gap-0.5 ${
                    c.align === "right" ? "flex-row-reverse" : ""
                  }`}
                >
                  {c.sortable && onSortChange ? (
                    /* Header click = sort, asc ⇄ desc — the Excel reflex.
                     * The kit shows the arrow; the PAGE reorders the rows. */
                    <button
                      type="button"
                      onClick={() =>
                        onSortChange(
                          sort?.key !== c.key
                            ? { key: c.key, dir: "asc" }
                            : sort.dir === "asc"
                              ? { key: c.key, dir: "desc" }
                              : null,
                        )
                      }
                      aria-label={c.label}
                      data-testid={`table-sort-${c.key}`}
                      className="inline-flex items-center gap-0.5 hover:text-kit-slate-12"
                    >
                      {c.label}
                      {sort?.key === c.key ? (
                        <Icon name={sort.dir === "asc" ? "collapse" : "expand"} size={14} />
                      ) : null}
                    </button>
                  ) : (
                    c.label
                  )}
                  {c.filter ? <HeaderFilter colKey={c.key} filter={c.filter} /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading && (
            <tr>
              <td colSpan={colSpan} className="p-8">
                <Loading variant="skeleton" label={`Loading ${label}`} />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="p-0">
                {typeof empty === "string" ? <EmptyState title={empty} /> : empty}
              </td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => {
              const id = rowId(row);
              const isSelected = selection?.selected.has(id) ?? false;
              return (
                <tr
                  key={id}
                  data-kit="data-row"
                  data-selected={isSelected || undefined}
                  onClick={onRowOpen ? () => onRowOpen(row) : undefined}
                  /* §3.5 — one faint blue tint on hover, the stronger wash when
                   * selected. Never grey: grey reads as structure. */
                  className={`border-b border-kit-slate-5 ${
                    isSelected ? "bg-kit-blue-3" : "hover:bg-kit-blue-3"
                  } ${onRowOpen ? "cursor-pointer" : ""}`}
                >
                  {selection && (
                    /* The checkbox must not open the record it is ticking. */
                    <td className="px-2" onClick={(e) => e.stopPropagation()}>
                      {(selection.selectable?.(row) ?? true) ? (
                        <Checkbox
                          id={`kit-table-row-${id}`}
                          ariaLabel={`Select ${id}`}
                          checked={isSelected}
                          onCheckedChange={() => selection.onToggleRow(id)}
                        />
                      ) : null}
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`px-2 text-kit-slate-12 ${c.align === "right" ? "text-right" : ""} ${
                        c.numeric ? "tabular-nums" : ""
                      }`}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
