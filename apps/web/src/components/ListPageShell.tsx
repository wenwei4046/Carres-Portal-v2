/**
 * ListPageShell — the ONE frame every List page renders through (Jess, 2026-07-12).
 * See docs/03-page-patterns.md and docs/ui/MASTER.md for the contract; values in lib/design-standard.ts.
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
 * v4 UI kit (owner 9 Oct 2026, `01-design-tokens.md` §§3–4): the frame draws no
 * band and no border of its own. Content regions are white cards on the theme
 * ground, 12px apart; the toolbar row sits on the ground above the table card;
 * the footer is the 44px status line that closes that card.
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
import MIcon from "@/components/carres/MIcon";
import { useShellHeader } from "@/pages/operation/components/shell-header-context";

export interface ActiveChip {
  /** Chip label, e.g. "Region: KV". */
  label: ReactNode;
  /** Remove this one filter. */
  onClear: () => void;
}

interface Props {
  /** The Register engine owns its toolbar and footer; the shell supplies only spacing. */
  register?: boolean;
  /** A workspace page (Work) draws its own toolbar and unframed columns; the
   *  frame supplies a one-row header only (the Operations shell owns the
   *  12px page padding). */
  workspace?: boolean;
  /** Page title → a quiet card-title row on the ground (the page's own name
   *  lives in the shell header). Optional: when both `title` and
   *  `breadcrumb` are omitted the whole header row is skipped — used
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
  /** Facet-panel content (240px aside by default). Omit for a facet-less list. */
  facet?: ReactNode;
  /** Facet collapse state (owned by the page so it can persist). */
  facetOpen?: boolean;
  onFacetToggle?: () => void;
  facetToggleTitle?: string;
  /** Optional facet aside width in px (default 240). Jess 2026-07-23:
   *  Purchase v2 uses 320 to fit the nested Send POs → category → PO tree. */
  facetWidthPx?: number;
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
  register = false,
  workspace = false,
  title,
  actions,
  breadcrumb,
  meta,
  titleRight,
  facet,
  facetOpen = true,
  onFacetToggle,
  facetToggleTitle,
  facetWidthPx,
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
  /* v4 page area (01 §4): inside the Operations shell the ground already has
   * its 12px padding and 12px gaps, so from 768px the frame adds NO padding of
   * its own; the phone shell (no padding) and a page outside the shell keep a
   * gutter here. */
  const inShell = useShellHeader() != null;
  const registerPad = inShell ? "max-[767px]:p-2" : "p-2";
  const pagePad = inShell ? "max-[767px]:p-3" : "p-3";
  const headerPad = inShell ? "max-[767px]:px-3 max-[767px]:pt-3" : "px-3 pt-3";
  /* The page's name lives in the shell header. A frame's own header is a
   *  quiet row on the ground: card-title type, no band, no border. */
  const titleType = "text-[15px] font-semibold leading-[22px] text-c-ink";
  return (
    <div
      className={`h-full flex flex-col ${className}`}
      data-testid={testId}
    >
      {/* A workspace page (Work): ONE title row, nothing above it. */}
      {hasHeader && workspace && (
        <div
          className={`shrink-0 flex min-h-11 items-center gap-3 ${headerPad}`}
          data-testid="workspace-header"
        >
          {/* The title never truncates; when the row is too narrow (390px,
              with the top-bar icons) the count wraps beneath it. */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
            <h1 className={`shrink-0 ${titleType}`}>
              {title}
            </h1>
            {titleRight && <div className="ml-auto flex min-w-0 max-w-full items-center gap-1.5">{titleRight}</div>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
        </div>
      )}
      {hasHeader && !workspace && (
        <div className={`shrink-0 ${headerPad}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-1.5 text-[12px] leading-4 text-c-secondary">
              {breadcrumb}
            </div>
            {actions && <div className="shrink-0 flex items-center gap-1">{actions}</div>}
          </div>
          <div className="flex items-baseline gap-2.5 min-w-0">
            <div className={`min-w-0 truncate ${titleType}`}>{title}</div>
            {meta && (
              <div className="shrink-0 flex items-center gap-1 text-[12px] leading-4 text-c-secondary">
                {meta}
              </div>
            )}
            {/* Right cluster on the TITLE row (Jess 2026-07-19): ambient status
                chips / announcements live in the title row's dead space. */}
            {titleRight && (
              <div className="shrink-0 ml-auto self-center flex items-center gap-1.5 min-w-0">
                {titleRight}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body split — facet aside (left) + right column (toolbar row + table),
          on the theme ground, 12px apart. The toolbar lives INSIDE the right
          column, so it NEVER spans above the facet: the facet's top sits on
          the same line as the toolbar top. */}
      <div className={`flex-1 flex gap-3 min-h-0 ${register ? registerPad : pagePad}`}>
        {hasFacet && facetOpen && (
          <aside
            style={
              facetWidthPx ? { width: `${facetWidthPx}px` } : undefined
            }
            className={`${
              facetWidthPx ? "" : "w-[240px]"
            } shrink-0 flex flex-col gap-3 overflow-y-auto no-scrollbar`}
            data-testid="listshell-facet"
          >
            {facet}
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {/* Toolbar row — v4: on the ground above the table card, no panel of
              its own; OR (rows selected) the bulk band IN PLACE of it, so
              nothing jumps. */}
          {bulkBar ? (
            <div className="shrink-0 mb-2.5">{bulkBar}</div>
          ) : (
            // Skip the whole strip when it would render empty (Jess 2026-07-22,
            // purchase cockpit §5.4). Facet-alone is not enough — a strip only
            // exists when there's real content (tabs / right actions / a second
            // row) OR the reopen toggle needs a home (facet closed).
            (toolbar || toolbarRight || toolbarSecondary || (hasFacet && !facetOpen)) && (
              <div className="shrink-0 mb-2.5">
                {/* Row 1 — reopen toggle (only while collapsed; when open, the
                    facet's own control collapses it) + tabs · search + actions. */}
                <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {hasFacet && !facetOpen && (
                      <button
                        type="button"
                        onClick={onFacetToggle}
                        title={facetToggleTitle ?? "Show filters"}
                        aria-label="Show filters"
                        aria-pressed={false}
                        data-testid="listshell-facet-toggle"
                        /* The v4 toolbar icon button: 36 round, no border. */
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-c-body hover:bg-c-hover"
                      >
                        <MIcon name="left_panel_open" size={20} />
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
                  <div className="mt-1.5 flex items-center justify-end gap-2.5">
                    {toolbarSecondary}
                  </div>
                )}
              </div>
            )
          )}

          {/* Active-filter chips — auto-hidden when empty. The v4 filter chip:
              pad 4 × 10 · 12/600 · grey fill · `Label ×`. */}
          {activeChips && activeChips.length > 0 && (
            <div className="shrink-0 mb-2 flex items-center gap-1.5 flex-wrap" data-testid="listshell-active-chips">
              {activeChips.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={c.onClear}
                  className="inline-flex items-center gap-1 rounded-lg border border-c-input-border bg-c-search-bg px-2.5 py-1 text-[12px] font-semibold leading-4 text-c-body hover:bg-c-hover"
                >
                  {c.label}
                  <MIcon name="close" size={16} className="text-c-muted" />
                </button>
              ))}
            </div>
          )}

          {children}
          {footer && (
            <footer
              /* The v4 status footer: 44 · 13 secondary · closes the card above. */
              className="shrink-0 flex items-center justify-between gap-3 px-3.5 h-11 rounded-b-lg border border-t-0 border-c-card-border bg-c-card text-[13px] text-c-secondary"
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
