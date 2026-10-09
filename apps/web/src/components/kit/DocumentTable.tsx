/**
 * DocumentTable — TABLE RECIPE 3 (UI MASTER, owner ruling 2026-09-27).
 *
 * The table a document draws inside a card: a Sales Order's `Items`, a
 * `Payment` ledger, Monthly demand's month table.
 *
 *   header   12/500 muted over the v4 header line (`--c-head-line`)
 *   rows     13px ink · 8px cell insets · the v4 row line (`--c-row-line`)
 *   columns  NO vertical lines (01 §5)
 *   numbers  right-aligned · tabular · never wrap
 *   weight   only the closing total is 600
 *
 * The geometry is the ONE recipe `so-document-table.ts` already wrote for the
 * Sales Order page; it is imported, never retyped. The v4 lines and header
 * type (01 §5) are swapped in here, by name, until that page recipe moves too.
 *
 * A ROW MAY BE A DOOR. Its first cell is then a real button with its own
 * accessible name; the row itself only carries the hover. An empty cell prints
 * nothing: an absence is a word the caller chose, never a dash drawn here.
 *
 * The table sits in its own horizontal scroller, so a table wider than its
 * card scrolls inside the card and the page never scrolls sideways. Its FIRST
 * column stays put while the rest scroll (the Register's rule), so a number
 * never loses the row it belongs to. Cells sit on one middle line: a door's
 * 40px phone target must not lift its row's numbers to the top.
 */
import type { ReactNode } from "react";
import {
  SO_AMOUNT,
  SO_HEAD_ROW,
  SO_ROW,
  SO_TABLE,
  SO_TD,
  SO_TH,
} from "@/pages/operation/components/so-document-table";

export interface DocumentTableColumn {
  key: string;
  label: string;
  /** A number column: right-aligned, tabular, never wrapping. */
  numeric?: boolean;
}

export interface DocumentTableRow {
  key: string;
  cells: Record<string, ReactNode>;
  /** Present = the row is a door, opened from its first cell. */
  onOpen?: () => void;
  /** The door's accessible name. */
  openLabel?: string;
  /** The closing total: the one row at weight 600. */
  total?: boolean;
}

/** The one cell alignment: the recipe's cell, on the row's middle line. */
const CELL = SO_TD.replace("align-top", "align-middle");
/** v4 lines (01 §5): the header line under the head, the row line under each
 *  row. */
const HEAD_ROW = SO_HEAD_ROW.replace("border-kit-slate-5", "border-c-head-line");
const ROW = SO_ROW.replace("border-kit-slate-5", "border-c-row-line");
/** v4 header type: 12 / 500 muted. */
const TH = SO_TH.replace("text-label text-base-500", "text-meta text-c-muted");
/** The first column stays while the rest scroll. A sticky cell already paints
 *  above the plain cells (no z-index: the kit names one ladder); it carries the row's own
 *  background so scrolled numbers pass under it, never through it. */
const PINNED = "sticky left-0 bg-c-card";

const isEmpty = (value: ReactNode) => value == null || value === false || value === "";

export default function DocumentTable({
  label,
  columns,
  rows,
}: {
  /** The table's accessible name. */
  label: string;
  columns: ReadonlyArray<DocumentTableColumn>;
  rows: ReadonlyArray<DocumentTableRow>;
}) {
  return (
    <div data-kit="document-table" className="w-full min-w-0 overflow-x-auto">
      <table aria-label={label} className={SO_TABLE}>
        <thead>
          <tr className={HEAD_ROW}>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${TH} font-medium ${column.numeric ? SO_AMOUNT : "whitespace-nowrap text-left"} ${
                  column === columns[0] ? PINNED : ""
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              data-row={row.key}
              data-total={row.total ? "true" : undefined}
              className={[
                ROW,
                row.total ? "font-semibold text-c-ink" : "text-c-ink",
                row.onOpen ? "group hover:bg-c-hover" : "",
              ].join(" ")}
            >
              {columns.map((column, index) => {
                const value = row.cells[column.key];
                const content = isEmpty(value) ? null : value;
                const door = index === 0 && row.onOpen;
                return (
                  <td
                    key={column.key}
                    className={`${CELL} ${column.numeric ? SO_AMOUNT : "whitespace-nowrap text-left"} ${
                      index === 0 ? `${PINNED} ${row.onOpen ? "group-hover:bg-c-hover" : ""}` : ""
                    }`}
                  >
                    {door ? (
                      <button
                        type="button"
                        aria-label={row.openLabel}
                        onClick={row.onOpen}
                        className="inline-flex items-center rounded-lg text-left font-semibold text-c-ink underline-offset-2 hover:underline focus-visible:[outline:var(--c-focus)] focus-visible:[outline-offset:2px] max-md:min-h-10"
                      >
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
