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
import MIcon from "@/components/carres/MIcon";
import { useShellHeader } from "@/pages/operation/components/shell-header-context";

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
  /* v4 page area (01 §4): inside the Operations shell the ground already has
   * its 12px padding, so the frame adds none from 768px; the phone shell and
   * any page outside it get the same 12px here. */
  const inShell = useShellHeader() != null;

  return (
    <div
      data-kit="page-shell"
      data-variant={variant}
      className={`flex h-full min-h-0 flex-col gap-3 ${inShell ? "max-[767px]:p-3" : "p-3"}`}
    >
      {/* The page's name lives in the shell header; this row is a card-title
       *  sized label with its actions, on the ground — never a second band. */}
      {hasTitleBand && (
        <div className="flex min-h-9 shrink-0 items-center justify-between gap-3">
          <div className="min-w-0 truncate text-strong text-c-ink">{title}</div>
          {titleRight && <div className="flex shrink-0 items-center gap-2">{titleRight}</div>}
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3">
        {hasFacet && facetOpen && (
          <aside
            data-kit="page-facet"
            aria-label="Filters"
            /* The rail is ONE white card: 1px card border, radius 8, no shadow. */
            className="no-scrollbar flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto rounded-lg border border-c-card-border bg-c-card p-1.5"
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
            <div data-kit="page-bulkbar" className="mb-2.5 shrink-0">
              {bulkBar}
            </div>
          ) : (
            (toolbar || toolbarRight || (hasFacet && !facetOpen)) && (
              /* v4: the toolbar row sits on the ground above the table card. */
              <div
                data-kit="page-toolbar"
                className="mb-2.5 flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {hasFacet && !facetOpen && (
                    <button
                      type="button"
                      onClick={onFacetToggle}
                      aria-label="Show filters"
                      data-kit="page-facet-toggle"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-c-body hover:bg-c-hover"
                    >
                      <MIcon name="left_panel_open" size={18} />
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
                  /* The v4 filter chip: pad 4 × 10 · 12/600 · grey fill · `Label ×`. */
                  className="inline-flex items-center gap-1 rounded-lg border border-c-input-border bg-c-search-bg px-2.5 py-1 text-meta font-semibold text-c-body hover:bg-c-hover"
                >
                  {c.label}
                  <MIcon name="close" size={16} className="text-c-muted" />
                </button>
              ))}
            </div>
          )}

          {children}

          {footer && (
            <div
              data-kit="page-footer"
              /* The v4 status footer: 44 · 13 secondary · closes the card above. */
              className="flex h-11 shrink-0 items-center justify-between gap-3 rounded-b-lg border border-t-0 border-c-card-border bg-c-card px-3.5 text-body text-c-secondary"
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
