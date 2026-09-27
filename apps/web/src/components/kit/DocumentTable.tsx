/**
 * DocumentTable — TABLE RECIPE 3 (UI MASTER, owner ruling 2026-09-27).
 *
 * The table a document draws inside a card: a Sales Order's `Items`, a
 * `Payment` ledger, Monthly demand's month table.
 *
 *   header   11/500 slate-11 over a 1px slate-5 line
 *   rows     13px · 8px cell insets · a 1px slate-5 line beneath each
 *   columns  NO vertical lines (tokens §5.1: numbers under distinct words)
 *   numbers  right-aligned · tabular · never wrap
 *   weight   only the closing total is 600
 *
 * The class strings are the ONE recipe `so-document-table.ts` already wrote
 * for the Sales Order page; they are imported, never retyped, so the pages
 * that read them directly and this component cannot drift apart.
 *
 * A ROW MAY BE A DOOR. Its first cell is then a real button with its own
 * accessible name; the row itself only carries the hover. An empty cell prints
 * nothing: an absence is a word the caller chose, never a dash drawn here.
 *
 * The table sits in its own horizontal scroller, so a table wider than its
 * card scrolls inside the card and the page never scrolls sideways.
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
          <tr className={SO_HEAD_ROW}>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${SO_TH} font-medium ${column.numeric ? SO_AMOUNT : "whitespace-nowrap text-left"}`}
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
                SO_ROW,
                row.total ? "font-semibold text-kit-slate-12" : "text-kit-slate-12",
                row.onOpen ? "hover:bg-kit-slate-3" : "",
              ].join(" ")}
            >
              {columns.map((column, index) => {
                const value = row.cells[column.key];
                const content = isEmpty(value) ? null : value;
                const door = index === 0 && row.onOpen;
                return (
                  <td
                    key={column.key}
                    className={`${SO_TD} ${column.numeric ? SO_AMOUNT : "whitespace-nowrap text-left"}`}
                  >
                    {door ? (
                      <button
                        type="button"
                        aria-label={row.openLabel}
                        onClick={row.onOpen}
                        className="inline-flex items-center rounded-control text-left font-medium text-kit-blue-11 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-kit-blue-9 max-md:min-h-10"
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
