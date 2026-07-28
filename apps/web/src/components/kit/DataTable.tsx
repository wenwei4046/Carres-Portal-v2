/**
 * DataTable — the ONE list table (UI-KIT §7, card D0.5c).
 *
 * **EXTRACTED from the Orders table, not designed fresh.** §7 says so in as
 * many words, and the reason is that Orders already carries every hard part:
 * `table-fixed` with a PERCENTAGE colgroup (so the table is always exactly the
 * container width and never scrolls sideways), a sticky head, 40px rows that
 * content adapts to, whole-row hover and selection, and an empty state. A
 * `DataTable` designed in the abstract would not have fitted it, and D6 would
 * have rebuilt it.
 *
 * Today **26 files hand-roll a `<table>`, in 7 header shapes, in two opposite
 * visual languages** (dark header + white text ×6, light grey header + grey
 * text ×5). This is the one that survives; the other language dies as pages
 * migrate.
 *
 * **The page keeps its own ROW.** `children` is the `<tr>` list, because a row
 * carries business rendering — the stage pill, the three dots, the action cell
 * — that belongs to the page and not to the kit. What the kit owns is the
 * FRAME: widths, the head, the scroll box, the row height, the empty state.
 *
 * **Row height is 40px and content adapts to it, never the reverse.** That is
 * the SIZING LAW the Orders table already enforced with `[&_td]:h-[40px]` and
 * `whitespace-nowrap`; a wrapping cell is how a list silently grows its rows
 * and loses a screenful of orders.
 */
import type { ReactNode, RefObject } from "react";
import { Z_TABLE_HEAD } from "./overlay-layer";

export interface DataTableColumn {
  key: string;
  /** Percentage of the table width. They should total 100. */
  widthPct: number;
  /** The header word. Omit for a marker column (select-all, the flag). */
  label?: string;
  /** Header content for a marker column — a checkbox, an icon. */
  head?: ReactNode;
  /** Hover explanation on the header cell. */
  title?: string;
  align?: "left" | "center";
}

export default function DataTable({
  columns,
  children,
  empty,
  after,
  scrollRef,
  ariaLabel,
}: {
  columns: DataTableColumn[];
  /** The rows. The page renders its own `<tr>`s. */
  children: ReactNode;
  /** Shown INSTEAD of the rows when there are none. A sentence, not "No data". */
  empty?: ReactNode;
  /** A trailing row inside `<tbody>` — the "loading more" line. */
  after?: ReactNode;
  /** The page owns the scroll box's ref (it restores scroll after a drawer). */
  scrollRef?: RefObject<HTMLDivElement>;
  ariaLabel?: string;
}) {
  const span = columns.length;
  return (
    <div
      ref={scrollRef}
      data-kit="data-table"
      /* The ONLY scroll area on a list page: the page stays put and the rows
         move under a head that does not. */
      className="flex-1 min-h-0 bg-white border border-base-200 rounded-t-[12px] rounded-b-none shadow-sm overflow-auto"
    >
      <table
        aria-label={ariaLabel}
        className="w-full border-collapse text-[13px] table-fixed [&_td]:h-[40px] [&_td]:py-1 [&_td]:align-middle [&_td]:overflow-hidden [&_td]:whitespace-nowrap"
      >
        {/* Percentage widths + `table-fixed` → the table is ALWAYS exactly the
            container width, so it never scrolls horizontally on any screen and
            long content ellipsis-truncates instead. */}
        <colgroup>
          {columns.map((c) => (
            <col key={c.key} style={{ width: `${c.widthPct.toFixed(2)}%` }} />
          ))}
        </colgroup>
        <thead className={`sticky top-0 ${Z_TABLE_HEAD}`}>
          <tr className="border-b h-10 bg-base-200 border-b-base-300">
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.title}
                /* The Orders header cell, moved: 12px/600 uppercase in the dark
                   cool ink, 0.04em tracking. It was two inline styles and a
                   hex there; the token classes are the same pixels. */
                className={`px-2 py-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-base-700 ${
                  c.align === "center" ? "text-center" : "text-left"
                }`}
              >
                {c.head ?? c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty !== undefined && (
            <tr>
              <td colSpan={span} className="p-12 text-center text-[12px] text-base-500">
                {empty}
              </td>
            </tr>
          )}
          {children}
          {after}
        </tbody>
      </table>
    </div>
  );
}
