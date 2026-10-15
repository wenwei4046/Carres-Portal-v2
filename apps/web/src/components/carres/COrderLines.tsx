/**
 * COrderLines — the order-line table in a card (01 §5.1 "Order-line table in a
 * card"; item text, 01 §5). The one part every record page uses for its goods
 * and services, so no page draws its own table (owner 11 Oct 2026).
 *
 *   header   40 on the header band, 12 / 500 grey, line under it
 *   rows     44: the item on two lines, model (13 / 400 ink) then spec
 *            (12 / 400 grey); neither line wraps
 *   columns  # 20 · item · Qty 32 · Unit price 80 · Amount 80, gap 10, 14 at
 *            the row's edges; a number column widens to its longest value,
 *            never cuts it; the item column takes the spare width
 *   narrow   the card scrolls sideways inside itself (`data-list-scroll`),
 *            the page never does
 *
 * Every number cell keeps the model's line, so a second line never lifts it.
 * An exception note under a line (a free item, a cancelled line, the edit
 * doors) wraps inside the item column and never widens it; only that row
 * grows. An editor that opens under a line spans the whole table. Totals
 * close the table on the same columns.
 */
import type { ReactNode, TableHTMLAttributes } from "react";

export interface COrderLine {
  key: string;
  /** Line 1: the model. */
  model: ReactNode;
  /** Line 2: the spec and the code. The slot stays when empty, so every row
   *  is 44 and every first line sits level. */
  spec?: ReactNode;
  /** Words under the two lines when the line is an exception. */
  notes?: ReactNode;
  qty: ReactNode;
  unitPrice: ReactNode;
  amount: ReactNode;
  /** The line is cancelled when the change is approved: struck through. */
  struck?: boolean;
  /** An editor opened under the line, across the whole table. */
  below?: ReactNode;
  /** The line's test id (row and editor together). */
  testId?: string;
  /** Extra data attributes on the line (row and editor together). */
  data?: Record<`data-${string}`, string>;
}

export interface COrderTotal {
  key: string;
  label: ReactNode;
  qty?: ReactNode;
  amount: ReactNode;
  /** The label reads 500 (Total, Balance due). */
  strong?: boolean;
  /** Something is owed: the one amber row fill (01 §1). */
  warn?: boolean;
}

/* The header label's own width is the column's floor (01 §5.1). */
const HEAD = "h-10 whitespace-nowrap border-b border-c-head-line bg-c-band px-[5px] align-middle text-[12px] font-medium text-c-secondary";
const CELL = "whitespace-nowrap px-[5px] pb-[4px] pt-[5px] align-top";
const FIRST = "pl-[14px]";
const LAST = "pr-[14px]";
const STRUCK = "line-through text-c-muted";

export default function COrderLines({
  label,
  lines,
  totals = [],
  ...table
}: {
  /** The table's accessible name. */
  label: string;
  lines: ReadonlyArray<COrderLine>;
  totals?: ReadonlyArray<COrderTotal>;
} & Omit<TableHTMLAttributes<HTMLTableElement>, "children">) {
  return (
    <div className="min-w-0 overflow-x-auto" data-list-scroll data-carres-table="order-lines">
      <table
        {...table}
        role="table"
        aria-label={label}
        className="w-full border-separate border-spacing-0 text-left text-[13px] leading-[18px] tabular-nums"
      >
        <thead>
          <tr role="row" style={{ height: 40 }}>
            <th scope="col" className={`${HEAD} ${FIRST}`} style={{ width: 39 }}>
              <span className="block min-w-[20px]">#</span>
            </th>
            <th scope="col" className={HEAD}>Item</th>
            <th scope="col" className={`${HEAD} text-right`} style={{ width: 42 }}>
              <span className="block min-w-[32px]">Qty</span>
            </th>
            <th scope="col" className={`${HEAD} text-right`} style={{ width: 90 }}>
              <span className="block min-w-[80px]">Unit price</span>
            </th>
            <th scope="col" className={`${HEAD} ${LAST} text-right`} style={{ width: 99 }}>
              <span className="block min-w-[80px]">Amount</span>
            </th>
          </tr>
        </thead>
        {lines.map((l, i) => {
          const strike = l.struck ? STRUCK : "";
          const line = l.below ? "" : "border-b border-c-row-line";
          return (
            <tbody key={l.key} data-testid={l.testId} {...l.data}>
              <tr role="row" style={{ height: 44 }}>
                <td className={`${CELL} ${FIRST} ${line} text-c-secondary`}>{i + 1}</td>
                <td className={`${CELL} ${line}`}>
                  <span className={`block text-c-ink ${strike}`}>{l.model}</span>
                  <span className={`block text-[12px] leading-4 text-c-secondary ${strike}`}>{l.spec || " "}</span>
                  {l.notes && <span className="flex w-0 min-w-full flex-col gap-0.5 whitespace-normal pb-1 pt-0.5">{l.notes}</span>}
                </td>
                <td className={`${CELL} ${line} text-right text-c-ink ${strike}`}>{l.qty}</td>
                <td className={`${CELL} ${line} text-right text-c-secondary ${strike}`}>{l.unitPrice}</td>
                <td className={`${CELL} ${LAST} ${line} text-right text-c-ink ${strike}`}>{l.amount}</td>
              </tr>
              {l.below && (
                <tr>
                  <td colSpan={5} className="border-b border-c-row-line p-0">{l.below}</td>
                </tr>
              )}
            </tbody>
          );
        })}
        {totals.length > 0 && (
          <tbody>
            {totals.map((t) => {
              const cell = `whitespace-nowrap border-b border-c-footer-line px-[5px] align-middle ${t.warn ? "bg-c-warn-bg" : ""}`;
              return (
                <tr key={t.key} role="row" style={{ height: 44 }}>
                  <td className={`${cell} ${FIRST}`} />
                  <td className={`${cell} text-c-secondary ${t.strong ? "font-medium" : ""}`}>{t.label}</td>
                  <td className={`${cell} text-right text-c-ink`}>{t.qty}</td>
                  <td className={cell} />
                  <td className={`${cell} ${LAST} text-right ${t.strong ? "font-medium" : ""} ${t.warn ? "text-c-warn-fg" : "text-c-ink"}`}>{t.amount}</td>
                </tr>
              );
            })}
          </tbody>
        )}
      </table>
    </div>
  );
}
