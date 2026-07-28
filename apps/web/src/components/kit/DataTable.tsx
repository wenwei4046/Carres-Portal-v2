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
import type { ReactNode } from "react";
import Checkbox from "./Checkbox";
import EmptyState from "./EmptyState";
import Loading from "./Loading";
import { Z_TABLE_HEADER } from "./overlay-layer";

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
  cell: (row: Row) => ReactNode;
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
  };
  /** Shown INSTEAD of rows. §9: an empty state is an answer, not an apology. */
  empty: ReactNode;
  loading?: boolean;
  /** What the table is, for a screen reader. */
  label: string;
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
}: DataTableProps<Row>) {
  const selectedCount = selection
    ? rows.filter((r) => selection.selected.has(rowId(r))).length
    : 0;
  const allSelected = selection != null && rows.length > 0 && selectedCount === rows.length;
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
                className={`px-2 text-label font-medium text-kit-slate-11 ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.label}
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
                      <Checkbox
                        id={`kit-table-row-${id}`}
                        ariaLabel={`Select ${id}`}
                        checked={isSelected}
                        onCheckedChange={() => selection.onToggleRow(id)}
                      />
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
