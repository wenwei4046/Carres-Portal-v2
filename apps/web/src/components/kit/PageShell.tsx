/**
 * PageShell — the frame every page renders through (UI-KIT §8.1, card D0.5c).
 *
 * **EXTRACTED from `ListPageShell`, which was itself extracted from Orders.**
 * Not one pixel is designed here: the bands, their order, the 240px facet
 * aside, the white control strip, the chips row and the footer are the live
 * shell's, moved. What is NEW is the TYPE, and that is the whole point of the
 * card — §1.3 and §8.3 are rules a chat currently has to remember, and this
 * turns both into something that does not compile.
 *
 * **§1.3 — a list page cannot add a KPI band.** `variant="list"` has no `kpi`
 * prop; `variant="dashboard"` does. An eighth band is not forbidden by a
 * sentence, it has nowhere to go.
 *
 * **§8.3 — a module-tabbed page has no breadcrumb and no title.** That was an
 * exception somebody had to know about (Purchasing's tabs ARE the title, and
 * repeating it burns ~80px of a 760px viewport). `variant="module"` has no
 * `title` and no `breadcrumb` prop, so the exception stops being a rule and
 * becomes a shape.
 *
 * **Two variants ship, not four.** §8.1 names list · dashboard · detail ·
 * settings; only the list frame EXISTS in the codebase to extract, and
 * `variant="module"` is its live sibling (Purchasing renders the same shell
 * with the header suppressed). Building `dashboard`, `detail` and `settings`
 * here would be designing three frames from nothing, which this card forbids —
 * reported to the kit instead. They arrive when a page needs one.
 */
import type { ReactNode } from "react";
import Icon from "./Icon";

export interface ActiveChip {
  /** e.g. "Region: KV". */
  label: ReactNode;
  /** Remove this ONE filter. */
  onClear: () => void;
}

/** Every band both variants share. */
interface CommonProps {
  /** Facet rail content. Omit for a facet-less list. */
  facet?: ReactNode;
  facetOpen?: boolean;
  onFacetToggle?: () => void;
  facetToggleTitle?: string;
  /** Rail width in px; 240 unless a page's own tree needs more (Purchasing 320). */
  facetWidthPx?: number;
  /** The control band — usually the status tabs. */
  toolbar?: ReactNode;
  /** Right of the same band — search, the page's own actions. */
  toolbarRight?: ReactNode;
  /** A thin second control row — the count and the Columns picker. */
  toolbarSecondary?: ReactNode;
  /** The bulk band. When present it REPLACES the control band in place, so
   *  nothing on the page jumps as rows are selected. */
  bulkBar?: ReactNode;
  /** Active filters. The row has height 0 when the list is empty. */
  activeChips?: ActiveChip[];
  /** Under the table — the count and a Reset. */
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
}

interface ListProps extends CommonProps {
  /** A stand-alone page: Orders, Stock, Payments. Keeps the two-row header. */
  variant: "list";
  title: ReactNode;
  breadcrumb?: ReactNode;
  /** Freshness stamp / refresh, beside the title. */
  meta?: ReactNode;
  /** Ambient chips in the title row's dead space — never a banner row. */
  titleRight?: ReactNode;
  /** Search · alerts · help · the ONE hero action. */
  actions?: ReactNode;
}

interface ModuleProps extends CommonProps {
  /** A page under a module tab bar. §8.3: the tab IS the title. */
  variant: "module";
}

export type PageShellProps = ListProps | ModuleProps;

export default function PageShell(props: PageShellProps) {
  const {
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
    testId,
  } = props;
  const hasFacet = facet != null && onFacetToggle != null;

  return (
    <div className="h-full flex flex-col bg-background" data-kit="page-shell" data-variant={props.variant} data-testid={testId}>
      {/* Header — two rows, and ONLY on a stand-alone page (§8.3). Row 1 is the
          breadcrumb with the utility cluster on the same line; row 2 is the
          title with the freshness stamp. */}
      {props.variant === "list" && (
        <div className="shrink-0 bg-white border-b border-base-200 px-6 pt-2 pb-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex items-center gap-1.5 text-[12px] text-base-400">
              {props.breadcrumb}
            </div>
            {props.actions && <div className="shrink-0 flex items-center gap-1">{props.actions}</div>}
          </div>
          <div className="flex items-baseline gap-2.5 min-w-0">
            <div className="min-w-0 truncate t-h2 text-base-900">{props.title}</div>
            {props.meta && (
              <div className="shrink-0 flex items-center gap-1 text-[12px] text-base-400">{props.meta}</div>
            )}
            {props.titleRight && (
              <div className="shrink-0 ml-auto self-center flex items-center gap-1.5 min-w-0">
                {props.titleRight}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body — facet aside + the right column. The control strip lives INSIDE
          the right column, so it never spans above the rail. */}
      <div className="flex-1 flex gap-4 min-h-0 px-6 pt-4 pb-5">
        {hasFacet && facetOpen && (
          <aside
            style={facetWidthPx ? { width: `${facetWidthPx}px` } : undefined}
            className={`${facetWidthPx ? "" : "w-[240px]"} shrink-0 flex flex-col gap-2 overflow-y-auto no-scrollbar pb-2`}
            data-testid="listshell-facet"
          >
            {facet}
          </aside>
        )}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
          {bulkBar ? (
            <div className="shrink-0 mb-3">{bulkBar}</div>
          ) : (
            /* The strip is skipped entirely when it would render empty — a
               facet alone is not content. */
            (toolbar || toolbarRight || toolbarSecondary || (hasFacet && !facetOpen)) && (
              <div className="shrink-0 mb-3 bg-white border border-base-200 rounded-[12px] shadow-sm px-3 py-2.5">
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
                        <Icon name="filter" size={16} />
                      </button>
                    )}
                    {toolbar}
                  </div>
                  {toolbarRight && <div className="flex items-center gap-2.5 shrink-0">{toolbarRight}</div>}
                </div>
                {toolbarSecondary && (
                  <div className="mt-2 pt-2 border-t border-base-100 flex items-center justify-end gap-2.5">
                    {toolbarSecondary}
                  </div>
                )}
              </div>
            )
          )}

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
                  <Icon name="close" size={14} />
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
