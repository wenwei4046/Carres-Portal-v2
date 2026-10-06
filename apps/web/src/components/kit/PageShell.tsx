/**
 * PageShell — the ONE frame a page renders through (UI-KIT §8.1, card D0.5c).
 *
 * **Extracted from `components/ListPageShell.tsx`, not designed fresh.** That
 * component is the live shell on 10 pages and already carries the geometry Jess
 * ruled through July — the two-row header, the facet aside, the control strip,
 * the bulk band that REPLACES the strip in place, the auto-hiding chip row, the
 * footer. This is that arrangement with the law's own slot names and, crucially,
 * with §1.3's height budget expressed as a TYPE instead of as a sentence.
 *
 * **The variant is the whole point.** §1.3 gives four page types four budgets,
 * and §1.3's own rule is that *"exceptions are expressed by TYPE, not by
 * prose"*: `variant="list"` has **no `kpi` slot in its props** and
 * `variant="dashboard"` does, so a chat cannot put a KPI band on a list page by
 * arguing for it. There is no `extraBand` and no slot above the table on any
 * variant — §8.1: *"An eighth band is not forbidden by a sentence — it has
 * nowhere to go."*
 *
 * **No `className`, no `style`** (§6.0), which is the one thing `ListPageShell`
 * still allows and the reason it could not simply be moved into the kit.
 *
 * **Nothing is migrated onto this in D0.5c.** The 10 `ListPageShell` pages keep
 * that component until **D6** (Orders) and **D7+** (the rest) move them one card
 * at a time; migrating them here would be re-laying out ten pages inside a card
 * whose acceptance criterion is zero visual change.
 */
import type { ReactNode } from "react";
import Icon from "./Icon";

/** §1.3's four page types, with the fixed-chrome budget each one gets. */
export type PageVariant = "list" | "dashboard" | "detail" | "settings";

/** The budget in px. `null` = no band budget (§1.3 states it for two of them). */
export const CHROME_BUDGET: Record<PageVariant, number | null> = {
  list: 200,
  dashboard: 280,
  detail: null,
  settings: null,
};

/**
 * §8.1's band table, in px. Read by `/ui` and by the Build Guard's H rule when
 * D1 wires it, so the budget arithmetic has ONE home.
 */
export const BAND_HEIGHT = {
  title: 40,
  toolbar: 40,
  chips: 28,
  tableHeader: 40,
  footer: 36,
  padding: 24,
} as const;

export interface ActiveChip {
  /** e.g. "Region: KV". The word is COPY-STANDARD's, never this file's. */
  label: ReactNode;
  onClear: () => void;
}

interface CommonProps {
  /** Title + tabs + search — ONE band. Omitted on a module-tabbed page (§8.3). */
  title?: ReactNode;
  /** Right-hand cluster on the title band. */
  titleRight?: ReactNode;
  /** One band. A bulk bar REPLACES it in place, so the page never jumps. */
  toolbar?: ReactNode;
  toolbarRight?: ReactNode;
  /** Supplied only while rows are selected; it takes the toolbar's place. */
  bulkBar?: ReactNode;
  /** Active filters. The row has height 0 when empty — never a blank band. */
  chips?: ActiveChip[];
  /** The facet rail (§8.4 orders its groups; COPY-STANDARD names them). */
  facet?: ReactNode;
  facetOpen?: boolean;
  onFacetToggle?: () => void;
  /** Count + pagination. */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * A list page has NO `kpi`, and that is §1.3 enforced rather than remembered.
 * A dashboard has one. The two are separate members of the union, so the
 * compiler refuses `<PageShell variant="list" kpi={…}>`.
 */
export type PageShellProps =
  | ({ variant: "list" } & CommonProps)
  | ({ variant: "dashboard"; kpi?: ReactNode } & CommonProps)
  | ({ variant: "detail" } & CommonProps)
  | ({ variant: "settings" } & CommonProps);

export default function PageShell(props: PageShellProps) {
  const {
    variant,
    title,
    titleRight,
    toolbar,
    toolbarRight,
    bulkBar,
    chips,
    facet,
    facetOpen = true,
    onFacetToggle,
    footer,
    children,
  } = props;
  const kpi = variant === "dashboard" ? props.kpi : undefined;
  const hasFacet = facet != null && onFacetToggle != null;
  /* §8.3: a module-tabbed page renders no title band, because the active tab
   * already says where you are and the band costs ~80px of a 200px budget. */
  const hasTitleBand = title != null || titleRight != null;

  return (
    <div data-kit="page-shell" data-variant={variant} className="flex h-full min-h-0 flex-col bg-kit-slate-3">
      {hasTitleBand && (
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 py-2">
          <div className="min-w-0 truncate text-page text-kit-slate-12">{title}</div>
          {titleRight && <div className="flex shrink-0 items-center gap-2">{titleRight}</div>}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4 px-6 pb-6">
        {hasFacet && facetOpen && (
          <aside
            data-kit="page-facet"
            aria-label="Filters"
            className="no-scrollbar flex w-60 shrink-0 flex-col gap-2 overflow-y-auto"
          >
            {facet}
          </aside>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* A dashboard's KPI band. The list variant cannot reach this branch:
           *  its props have no `kpi` to pass. */}
          {kpi && (
            <div data-kit="page-kpi" className="mb-3 shrink-0">
              {kpi}
            </div>
          )}

          {/* One band, and the bulk bar takes its place rather than adding a
           *  second one — the behaviour `ListPageShell` already had. */}
          {bulkBar ? (
            <div data-kit="page-bulkbar" className="mb-3 shrink-0">
              {bulkBar}
            </div>
          ) : (
            (toolbar || toolbarRight || (hasFacet && !facetOpen)) && (
              <div
                data-kit="page-toolbar"
                className="mb-3 flex shrink-0 items-center justify-between gap-4 rounded-card border border-kit-slate-5 bg-white px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {hasFacet && !facetOpen && (
                    <button
                      type="button"
                      onClick={onFacetToggle}
                      aria-label="Show filters"
                      data-kit="page-facet-toggle"
                      className="rounded-control p-1 text-kit-slate-11 hover:bg-kit-slate-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kit-blue-9"
                    >
                      <Icon name="filter" size={16} />
                    </button>
                  )}
                  {toolbar}
                </div>
                {toolbarRight && <div className="flex shrink-0 items-center gap-2">{toolbarRight}</div>}
              </div>
            )
          )}

          {/* Height 0 when empty — §8.1's band table says so, and an empty
           *  chip row is 28px spent saying "no filters are on". */}
          {chips && chips.length > 0 && (
            <div data-kit="page-chips" className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
              {chips.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={c.onClear}
                  data-kit="page-chip"
                  className="inline-flex items-center gap-1 rounded-full border border-kit-slate-5 bg-white py-0.5 pl-2 pr-1 text-label text-kit-slate-11 hover:border-kit-slate-6"
                >
                  {c.label}
                  <Icon name="close" size={14} />
                </button>
              ))}
            </div>
          )}

          {children}

          {footer && (
            <div
              data-kit="page-footer"
              className="flex h-9 shrink-0 items-center justify-between gap-4 rounded-b-card border border-t-0 border-kit-slate-5 bg-white px-3 text-meta text-kit-slate-11"
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
