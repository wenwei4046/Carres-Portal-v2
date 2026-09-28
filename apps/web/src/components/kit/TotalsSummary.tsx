/**
 * TotalsSummary — TABLE RECIPE 4 (UI MASTER, owner ruling 2026-09-27).
 *
 * The tail of recipe 3: two columns, the label left in slate-11 and the value
 * right in slate-12, tabular. 13px, 8px insets, a 1px slate-5 line BETWEEN
 * rows. No outer frame and no box per cell. A row marked `strong` is the one
 * weight 600 (`Total payable`, `Balance due`).
 *
 * A missing value is a word the caller passes, never a dash drawn here.
 */
import type { ReactNode } from "react";

export interface TotalsSummaryRow {
  key: string;
  label: string;
  value: ReactNode;
  strong?: boolean;
}

export default function TotalsSummary({
  label,
  rows,
}: {
  /** The block's accessible name. */
  label: string;
  rows: ReadonlyArray<TotalsSummaryRow>;
}) {
  return (
    <dl data-kit="totals-summary" aria-label={label} className="w-full text-body">
      {rows.map((row, index) => (
        <div
          key={row.key}
          data-row={row.key}
          className={[
            "flex items-baseline justify-between gap-4 px-2 py-2",
            index > 0 ? "border-t border-kit-slate-5" : "",
            row.strong ? "font-semibold" : "",
          ].join(" ")}
        >
          <dt className="min-w-0 text-kit-slate-11">{row.label}</dt>
          <dd className="whitespace-nowrap text-right tabular-nums text-kit-slate-12">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
