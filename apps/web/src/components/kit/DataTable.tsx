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
 * are the caller's (COPY-STANDARD speaks business — `Yet to Order`, never
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
  /**
   * Excel's `Custom Date Range…` (Jess, 2026-08-02 — the PO Issued ▼). The kit
   * renders two date fields + an apply button under the checklist and reports
   * the pair; the PAGE owns what the pair means (it stores the range as one of
   * its own filter values, so chips and Clear keep working unchanged).
   */
  range?: {
    /** The section's word — the caller's (e.g. `Custom Date Range…`). */
    label: string;
    from: string | null;
    to: string | null;
    onApply: (from: string, to: string) => void;
    /** The apply action's word — the caller's. */
    applyLabel: string;
  };
}

export interface Column<Row> {
  key: string;
  /** The header word — typed ONCE, here. COPY-STANDARD owns it. */
  label: string;
  /**
   * A number = percentage of the table width. A string = raw CSS width —
   * fixed `"150px"` interior columns + one `"auto"` tail is the
   * international recipe: content columns hug their content on ANY screen
   * and the LAST column absorbs the slack (Jess, 2026-08-01 — percentage
   * columns inflate on wide monitors and open holes between neighbours).
   */
  width: number | string;
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
  /**
   * A 2px bar down the left edge of a row: THIS ROW IS LATE.
   *
   * It exists because a page can know a row is late for a reason that never
   * reaches a cell. To Order is the case that asked for it (Loo, 2026-08-03):
   * its rail lights `Overdue` in red while every visible date on the row is
   * still comfortably in the future — because "overdue" means the ORDER-BY
   * date has passed, and the order-by date deliberately never renders. The
   * row therefore stated its urgency nowhere.
   *
   * ONE tone on purpose. Red already has exactly one job in this portal
   * (late · act now); a second tone here would turn the accent into
   * decoration, which `01-design-tokens.md` §2.2 bans.
   *
   * Rows without it get a TRANSPARENT bar of the same width, so nothing on
   * the table shifts when one row is late and its neighbour is not.
   */
  rowLate?: (row: Row) => boolean;
  /**
   * A row that is over — cancelled, dead — renders washed out (2990s' own
   * recipe: the row stays on the register, greyed, so it reads as history
   * without a word). The PAGE owns which rows qualify.
   *
   * `rowLate` and `rowMuted` arrived on the same day from two different pages
   * and are deliberately BOTH kept: one says *act now*, the other says *this
   * is history*. They are opposite ends of the same axis and no row can
   * honestly be both, but the kit does not police that — the page knows.
   */
  rowMuted?: (row: Row) => boolean;
}

/**
 * One column's ▼ — an Excel AutoFilter as a checkbox popover. Lit blue while
 * it is narrowing, because a filter you cannot see is a lie the table tells.
 */
function HeaderFilter({ colKey, filter }: { colKey: string; filter: ColumnFilter }) {
  const [needle, setNeedle] = useState("");
  const [rangeFrom, setRangeFrom] = useState(filter.range?.from ?? "");
  const [rangeTo, setRangeTo] = useState(filter.range?.to ?? "");
  const shown = needle.trim()
    ? filter.options.filter((o) => o.label.toLowerCase().includes(needle.trim().toLowerCase()))
    : filter.options;
  const active = filter.selected.size > 0;
  return (
    <Popover
      label={filter.label}
      trigger={
        /* A COMPACT 24px trigger, not a padded Button — on a narrow column
         * the button's own padding is what pushed the header word off the
         * numbers' edge (Jess, 2026-08-01). Excel's vocabulary stands: a
         * quiet ▼ on the column, the funnel only while it is narrowing. */
        <button
          type="button"
          aria-label={filter.label}
          data-testid={`table-filter-${colKey}`}
          data-active={active || undefined}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
        >
          <Icon name={active ? "filter" : "columnFilter"} size={14} />
        </button>
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
        {filter.range ? (
          /* Excel's own tail item: presets first, the custom pair last. Native
           * date fields on purpose — a DatePicker popover inside this popover
           * would stack two floating layers for a two-field form. */
          <div
            className="flex flex-col gap-1.5 border-t border-kit-slate-5 pt-2"
            data-kit="table-filter-range"
          >
            <span className="text-label text-kit-slate-11">{filter.range.label}</span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                aria-label={`${filter.range.label} from`}
                data-testid={`table-filter-range-from-${colKey}`}
                className="h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
              />
              <input
                type="date"
                value={rangeTo}
                onChange={(e) => setRangeTo(e.target.value)}
                aria-label={`${filter.range.label} to`}
                data-testid={`table-filter-range-to-${colKey}`}
                className="h-8 w-full rounded-control border border-kit-slate-5 bg-white px-2 text-body text-kit-slate-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
              />
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={rangeFrom === "" || rangeTo === "" || rangeTo < rangeFrom}
              onClick={() => filter.range?.onApply(rangeFrom, rangeTo)}
              data-testid={`table-filter-range-apply-${colKey}`}
            >
              {filter.range.applyLabel}
            </Button>
          </div>
        ) : null}
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
  rowLate,
  rowMuted,
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
        className="w-full table-fixed border-separate border-spacing-0 text-body [&_td]:h-10 [&_td]:overflow-hidden [&_td]:whitespace-nowrap [&_td]:align-middle"
      >
        {/* PERCENTAGE widths + `table-fixed` → the table is always exactly the
         *  container width, so it never scrolls sideways on a laptop. */}
        <colgroup>
          {selection && <col style={{ width: "4%" }} />}
          {columns.map((c) => (
            <col
              key={c.key}
              style={{ width: typeof c.width === "number" ? `${c.width}%` : c.width }}
            />
          ))}
        </colgroup>

        <thead className={`sticky top-0 ${Z_TABLE_HEADER}`}>
          {/* border-separate + cell-level wash: with border-collapse, Chrome
              refuses to stick a thead's backgrounds at all — the classic
              see-through header (Jess caught it live, 2026-08-01). */}
          <tr className="h-10">
            {/* Header wash = slate-3 (Jess, 2026-08-02 surface law): one step
                above the near-white strip, always lighter than the data. */}
            {selection && (
              <th className="px-2 bg-kit-slate-3 border-b border-kit-slate-6">
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
                className={`px-2 bg-kit-slate-3 border-b border-kit-slate-6 text-label font-medium text-kit-slate-12 ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {/* The word first, its controls after — `Qty ▼`, never
                 * `▼ Qty` (Jess, 2026-08-01), whatever the alignment. A
                 * right-aligned column's cluster hugs the column edge so the
                 * numbers line up under it. */}
                <span
                  className={
                    c.align === "right"
                      ? "flex w-full items-center justify-end gap-0.5"
                      : "inline-flex items-center gap-0.5"
                  }
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
                      className="group inline-flex items-center gap-0.5"
                    >
                      {c.label}
                      {sort?.key === c.key ? (
                        <Icon name={sort.dir === "asc" ? "collapse" : "expand"} size={14} />
                      ) : (
                        /* GitHub's whisper: the arrow appears on hover, so a
                         * sortable header announces itself before the click. */
                        <span className="hidden group-hover:inline-flex opacity-60">
                          <Icon name="expand" size={14} />
                        </span>
                      )}
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
              const late = rowLate?.(row) ?? false;
              return (
                <tr
                  key={id}
                  data-kit="data-row"
                  data-selected={isSelected || undefined}
                  onClick={onRowOpen ? () => onRowOpen(row) : undefined}
                  /* HOVER IS GREY, SELECTION IS BLUE (Loo, 2026-08-03).
                   * Hover says "the mouse is here" — one second long, no
                   * meaning — so it may not spend the accent. Selection is a
                   * lasting state with a consequence, and keeps blue-3.
                   * (This row was still blue-2 after the portal-wide sweep,
                   * because the sweep looked for blue-3 — found by reading
                   * this file, not by the lint.) */
                  data-muted={rowMuted?.(row) || undefined}
                  className={`border-b border-kit-slate-5 ${
                    isSelected ? "bg-kit-blue-3" : "hover:bg-kit-slate-3"
                  } ${onRowOpen ? "cursor-pointer" : ""} ${
                    rowMuted?.(row) ? "opacity-50 grayscale" : ""
                  }`}
                >
                  {selection && (
                    /* The checkbox must not open the record it is ticking. */
                    <td
                      className={`px-2 border-l-2 ${late ? "border-kit-red-9" : "border-transparent"}`}
                      onClick={(e) => e.stopPropagation()}
                    >
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
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={`px-2 text-kit-slate-12 ${
                        !selection && i === 0
                          ? `border-l-2 ${late ? "border-kit-red-9" : "border-transparent"}`
                          : ""
                      } ${c.align === "right" ? "text-right" : ""} ${
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
