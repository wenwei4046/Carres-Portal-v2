/**
 * PageHeader — the ONE shared page header bar (Jess, 2026-07-12).
 *
 * Before this, every page hand-rolled its own title row at a slightly different
 * height (h-12 / h-14 / bare `t-h1` blocks). This component converges them to a
 * single 56px (`h-14`) bar — the recommended `LAYOUT.headerHeight` in
 * `lib/design-standard.ts` — with a consistent title size (`t-h2`, 24px), a
 * bottom hairline, and an optional right-side action cluster.
 *
 * It does NOT change colours or introduce new visuals — it only standardises the
 * geometry that used to be re-typed inline. Hero-style pages (multi-line marketing
 * copy, e.g. OperationDashboard) intentionally do NOT use this — they are not a
 * header bar.
 *
 * Usage:
 *   <PageHeader title="Orders" actions={<button className="btn-hero">…</button>} />
 *   <PageHeader kicker="operation" title="Warehouse" />
 */
import type { ReactNode } from "react";

interface Props {
  /** Page title. String or node (node lets a caller add an inline count/badge). */
  title: ReactNode;
  /** Optional uppercase kicker above the title (role / section label). */
  kicker?: ReactNode;
  /** Right-aligned action cluster — search, buttons, filters. */
  actions?: ReactNode;
  /** Drop the bottom hairline when the header sits directly above its own
   *  bordered toolbar (avoids a double line). Default: hairline shown. */
  noBorder?: boolean;
  /** Extra classes appended to the bar (e.g. `mb-3` spacing to taste). */
  className?: string;
}

export default function PageHeader({
  title,
  kicker,
  actions,
  noBorder = false,
  className = "",
}: Props) {
  return (
    <header
      className={`h-14 shrink-0 flex items-center justify-between gap-4 ${
        noBorder ? "" : "border-b border-base-100"
      } ${className}`}
    >
      <div className="min-w-0">
        {kicker && <div className="kicker">{kicker}</div>}
        <h1 className="text-page font-display truncate">{title}</h1>
      </div>
      {actions && (
        <div className="flex items-center gap-2.5 shrink-0">{actions}</div>
      )}
    </header>
  );
}
