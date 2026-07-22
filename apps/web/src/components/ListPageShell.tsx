/**
 * ListPageShell — the ONE frame every List page renders through (Jess, 2026-07-12).
 * See docs/UI-KIT.md §A9 for the contract; values in lib/design-standard.ts.
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

export interface ActiveChip {
  /** Chip label, e.g. "Region: KV". */
  label: ReactNode;
  /** Remove this one filter. */
  onClear: () => void;
}

interface Props {
  /** Page title → the 56px PageHeader bar (t-h2). Optional: when both `title`
   *  and `breadcrumb` are omitted the whole white header row is skipped — used
   *  by module-tab pages (Purchasing's To Order / Purchase Orders / Receiving)
   *  where the tab bar above IS the title. See UI-KIT §A0 "Module-tab law". */
  title?: ReactNode;
  /** Right-side header cluster: search · Alerts · Help · the ONE hero action. */
  actions?: ReactNode;
  /** Optional breadcrumb (left) shown on a thin row above the header. */
  breadcrumb?: ReactNode;
  /** Optional right-aligned meta on the breadcrumb row (freshness stamp / refresh). */
  meta?: ReactNode;
  /** Right-aligned cluster on the TITLE row (Jess 2026-07-19) — ambient status
   *  chips / announcements in the title row's dead space (no banner row). */
  titleRight?: ReactNode;
  /** Facet-panel content (240px aside). Omit for a facet-less list. */
  facet?: ReactNode;
  /** Facet collapse state (owned by the page so it can persist). */
  facetOpen?: boolean;
  onFacetToggle?: () => void;
  facetToggleTitle?: string;
  /** Control-bar content beside the facet toggle — typically the status tabs. */
  toolbar?: ReactNode;
  /** Right-aligned content on the SAME row as the tabs — typically search + the
   *  page's import / create actions (moved off the header per the list template). */
  toolbarRight?: ReactNode;
  /** A thin, right-aligned SECOND control row under the tabs — typically the
   *  "N of M" count + the Columns picker. Auto-hidden while a bulkBar is active. */
  toolbarSecondary?: ReactNode;
  /** Gmail-style bulk band. When supplied (≥1 row selected) it REPLACES the whole
   *  control area in place — the tabs row turns into the selection actions. */
  bulkBar?: ReactNode;
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
  titleRight,
  facet,
  facetOpen = true,
  onFacetToggle,
  facetToggleTitle,
  toolbar,
  toolbarRight,
  toolbarSecondary,
  bulkBar,
  activeChips,
  footer,
  children,
  className = "",
  testId,
}: Props) {
  const hasFacet = facet != null && onFacetToggle != null;
  const hasHeader =
    title != null || breadcrumb != null || meta != null || titleRight != null || actions != null;
  return (
    <div
      className={`h-full flex flex-col bg-background ${className}`}
      data-testid={testId}
    >
      {/* Header — TWO rows (Jess 2026-07-18 round-3): row 1 = breadcrumb with
          the search/utility cluster on the SAME line (her round-2 ask); row 2 =
          the page title + freshness stamp, KEPT (round-3: "i never ask you
          removed my 2row header — Order + synced"). Module-tab pages skip the
          whole block (Jess 2026-07-22, UI-KIT §A0 "Module-tab law"). */}
      {hasHeader && (
        <div className="shrink-0 bg-white border-b border-base-200 px-6 pt-2 pb-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-1.5 text-[12px] text-base-400">
              {breadcrumb}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
          </div>
          <div className="flex items-baseline gap-2.5 min-w-0">
            <div className="min-w-0 truncate t-h2 text-base-900">{title}</div>
            {meta && (
              <div className="shrink-0 flex items-center gap-1 text-[12px] text-base-400">
                {meta}
              </div>
            )}
            {/* Right cluster on the TITLE row (Jess 2026-07-19): ambient status
                chips / announcements live in the title row's dead space instead
                of a dedicated banner row — saves a full row on a MacBook. */}
            {titleRight && (
              <div className="shrink-0 ml-auto self-center flex items-center gap-1.5 min-w-0">
                {titleRight}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body split — facet aside (left) + right column (control strip + table),
          on the cream page bg. The strip lives INSIDE the right column, so it
          NEVER spans above the facet: the facet's Summary top sits on the same
          line as the strip top. */}
      <div className="flex-1 flex gap-4 min-h-0 px-6 pt-4 pb-5">
        {hasFacet && facetOpen && (
          <aside
            className="w-[240px] shrink-0 flex flex-col gap-2 overflow-y-auto no-scrollbar pb-2"
            data-testid="listshell-facet"
          >
            {facet}
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Control strip — the two-row control bar on ONE white surface panel
              (so the tabs + search + actions + count row don't sit naked on the
              cream page bg), OR (when a bulkBar is supplied because rows are
              selected) the bulk band IN PLACE of it, so nothing jumps. */}
          {bulkBar ? (
            <div className="shrink-0 mb-3">{bulkBar}</div>
          ) : (
            // Skip the whole strip when it would render empty (Jess 2026-07-22,
            // purchase cockpit §5.4). Facet-alone is not enough — a strip only
            // exists when there's real content (tabs / right actions / a second
            // row) OR the reopen toggle needs a home (facet closed).
            (toolbar || toolbarRight || toolbarSecondary || (hasFacet && !facetOpen)) && (
              <div className="shrink-0 mb-3 bg-white border border-base-200 rounded-[12px] shadow-sm px-3 py-2.5">
                {/* Row 1 — reopen toggle (only while collapsed; when open, the
                    facet's own control collapses it) + tabs · search + actions. */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {hasFacet && !facetOpen && (
                      <button
                        type="button"
                        onClick={onFacetToggle}
                        title={facetToggleTitle ?? "Show filters"}
                        aria-label="Show filters"
                        aria-pressed={false}
                        data-testid="listshell-facet-toggle"
                        className="shrink-0 p-1.5 rounded-lg border transition-colors bg-white border-base-200 text-base-500 hover:text-base-800"
                      >
                        <PanelLeft size={15} />
                      </button>
                    )}
                    {toolbar}
                  </div>
                  {toolbarRight && (
                    <div className="flex items-center gap-2.5 shrink-0">{toolbarRight}</div>
                  )}
                </div>
                {/* Row 2 — thin, right-aligned: count + the ⋮ overflow. */}
                {toolbarSecondary && (
                  <div className="mt-2 pt-2 border-t border-base-100 flex items-center justify-end gap-2.5">
                    {toolbarSecondary}
                  </div>
                )}
              </div>
            )
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

          {children}
          {footer && (
            <footer
              className="shrink-0 flex items-center justify-between gap-3 px-3 h-9 rounded-b-[12px] border border-t-0 border-base-200 bg-white text-[12px] text-base-500"
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
