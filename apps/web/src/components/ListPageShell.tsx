/**
 * ListPageShell — the ONE frame every List page renders through (Jess, 2026-07-12).
 * See docs/DESIGN-STANDARD.md §4 for the contract; values in lib/design-standard.ts.
 *
 * WHY: ~80% of portal pages are "a table you scan, filter, and act on". Before this
 * they each hand-rolled the same chrome (header bar, facet panel, white sticky table,
 * control bar, footer) at slightly different geometry. This component bakes the
 * geometry in ONCE so a new List page fills slots instead of re-typing magic px, and
 * every list looks + behaves identically. It standardises the FRAME, not the contents:
 * a page keeps its own row/cell renderers, bulk-select head, filters, drawers.
 *
 * List-first: no oversized title, no KPI cards above the table. The list is the hero;
 * any summary lives in the facet panel's own Summary block.
 *
 * Usage (see OperationOrdersControl for the reference implementation):
 *   <ListPageShell
 *     breadcrumb={<Crumbs/>} meta={<SyncStamp/>}
 *     title="Orders" actions={<><Search/><ImportBtn/></>}
 *     facet={<FacetGroups/>} facetOpen={open} onFacetToggle={() => setOpen(v => !v)}
 *     toolbar={<StatusTabs/>} toolbarRight={<span>12 of 158</span>}
 *     activeChips={[{ label: "Region: KV", onClear: () => setRegion(null) }]}
 *     footer={<><span>158 orders</span><ResetBtn/></>}
 *   >
 *     <TableScrollBox>…</TableScrollBox>
 *   </ListPageShell>
 */
import type { ReactNode } from "react";
import { PanelLeft, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";

export interface ActiveChip {
  /** Chip label, e.g. "Region: KV". */
  label: ReactNode;
  /** Remove this one filter. */
  onClear: () => void;
}

interface Props {
  /** Page title → the 56px PageHeader bar (t-h2). */
  title: ReactNode;
  /** Right-side header cluster: search · Alerts · Help · the ONE hero action. */
  actions?: ReactNode;
  /** Optional breadcrumb (left) shown on a thin row above the header. */
  breadcrumb?: ReactNode;
  /** Optional right-aligned meta on the breadcrumb row (freshness stamp / refresh). */
  meta?: ReactNode;
  /** Facet-panel content (240px aside). Omit for a facet-less list. */
  facet?: ReactNode;
  /** Facet collapse state (owned by the page so it can persist). */
  facetOpen?: boolean;
  onFacetToggle?: () => void;
  facetToggleTitle?: string;
  /** Control-bar content beside the facet toggle — typically the status tabs. */
  toolbar?: ReactNode;
  /** Right-aligned control-bar content — typically the "N of M" row count. */
  toolbarRight?: ReactNode;
  /** Active-filter chips; the row auto-hides when empty. */
  activeChips?: ActiveChip[];
  /** Footer content under the table — row count + a Reset affordance. */
  footer?: ReactNode;
  /** The list column body — the white table scroll box. */
  children: ReactNode;
  className?: string;
  testId?: string;
}

export default function ListPageShell({
  title,
  actions,
  breadcrumb,
  meta,
  facet,
  facetOpen = true,
  onFacetToggle,
  facetToggleTitle,
  toolbar,
  toolbarRight,
  activeChips,
  footer,
  children,
  className = "",
  testId,
}: Props) {
  const hasFacet = facet != null && onFacetToggle != null;
  return (
    <div
      className={`h-full flex flex-col px-6 pt-6 pb-5 bg-background ${className}`}
      data-testid={testId}
    >
      {/* Breadcrumb / freshness row (optional, thin) */}
      {(breadcrumb || meta) && (
        <div className="flex items-center justify-between gap-3 mb-1.5 shrink-0 text-[12px] text-base-400">
          <div className="min-w-0 flex items-center gap-1.5">{breadcrumb}</div>
          {meta && <div className="shrink-0 flex items-center gap-1">{meta}</div>}
        </div>
      )}

      {/* Header — fixed 56px, title left, actions right */}
      <PageHeader title={title} actions={actions} noBorder className="mb-3" />

      {/* Control bar — facet toggle + tabs (left) · count (right) */}
      {(toolbar || hasFacet || toolbarRight) && (
        <div className="shrink-0 mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {hasFacet && (
              <button
                type="button"
                onClick={onFacetToggle}
                title={facetToggleTitle ?? (facetOpen ? "Hide filters" : "Show filters")}
                aria-label={facetOpen ? "Hide filters" : "Show filters"}
                aria-pressed={facetOpen}
                data-testid="listshell-facet-toggle"
                className={`shrink-0 p-1.5 rounded-lg border transition-colors bg-white ${
                  facetOpen
                    ? "border-base-800 text-base-800"
                    : "border-base-200 text-base-500 hover:text-base-800"
                }`}
              >
                <PanelLeft size={15} />
              </button>
            )}
            {toolbar}
          </div>
          {toolbarRight}
        </div>
      )}

      {/* Active-filter chips — auto-hidden when empty */}
      {activeChips && activeChips.length > 0 && (
        <div className="shrink-0 mb-2 flex items-center gap-1.5 flex-wrap" data-testid="listshell-active-chips">
          {activeChips.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={c.onClear}
              className="inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full border border-base-200 bg-white text-[12px] text-base-700 hover:border-base-400"
            >
              {c.label}
              <X size={12} className="text-base-400" />
            </button>
          ))}
        </div>
      )}

      {/* Body split — facet aside (240px) + list column */}
      <div className="flex-1 flex gap-4 min-h-0">
        {hasFacet && facetOpen && (
          <aside
            className="w-[240px] shrink-0 flex flex-col gap-2 overflow-y-auto no-scrollbar pb-2"
            data-testid="listshell-facet"
          >
            {facet}
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {children}
          {footer && (
            <footer
              className="shrink-0 flex items-center justify-between gap-3 px-3 h-9 rounded-b-lg border border-t-0 border-base-200 bg-white text-[12px] text-base-500"
              data-testid="listshell-footer"
            >
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
