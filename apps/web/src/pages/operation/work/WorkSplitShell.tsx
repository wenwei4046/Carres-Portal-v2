/**
 * THE WORK SHELL — owner correction 2026-09-24; density ruling 2026-09-25.
 *
 * ```
 *   grey canvas · 16px padding
 *   ┌ toolbar (one white section) ─────────────────────────────────┐
 *   └──────────────────────────────────────────────────────────────┘
 *                            16px
 *   ┌ Date ──┐   Heading                 ┌ detail section ─────────┐
 *   └────────┘   [To do|Waiting|Done]    └─────────────────────────┘
 *     16px       ┌ card 104 ┐   8px      ┌ detail section ─────────┐
 *   ┌ Module ┐   ┌ card 104 ┐            └─────────────────────────┘
 *   └────────┘
 *    240px   16   300px               16   remaining (≥480px)
 * ```
 *
 * The workspace is an UNFRAMED grid: no border, fill, radius or shadow
 * around it. Every white surface is its own section. The three columns
 * scroll independently.
 *
 *   three  ≥1280px of page — rail · list · detail
 *   two    768–1279px      — the rail collapses (a toolbar control reopens
 *                            it); the list is exactly 300px and can never
 *                            be collapsed
 *   one    <768px          — Date and Module open from compact controls; the
 *                            list (100% wide) and the detail share ONE stage
 */
import type { ReactNode } from "react";

export type WorkLayout = "three" | "two" | "one";
export type WorkPanel = "list" | "detail";

const COLUMN = "flex min-h-0 min-w-0 flex-col";

export default function WorkSplitShell({
  layout,
  activePanel = "list",
  railOpen = false,
  rail,
  railBeside = false,
  list,
  detail,
}: {
  layout: WorkLayout;
  activePanel?: WorkPanel;
  /** Only read at `two`: whether the collapsible rail is showing. */
  railOpen?: boolean;
  /** Absent since the §6.0 shell (owner ruling 2026-09-25): Date and Page are
   *  toolbar selects, so the list and the detail share the whole width. */
  rail?: ReactNode;
  /** At `two` the page's own rail (drawn beside this shell) is open: the
   *  list takes the width and the detail waits for a pick. */
  railBeside?: boolean;
  list: ReactNode;
  detail: ReactNode;
}) {
  if (layout === "one") {
    return (
      <div data-testid="work-split-shell" data-layout="one" className={`${COLUMN} flex-1`}>
        {activePanel === "detail" ? (
          <section aria-label="Selected work" className={`${COLUMN} flex-1 gap-2 overflow-y-auto`}>{detail}</section>
        ) : (
          <section aria-label="Work actions" className={`${COLUMN} flex-1`}>{list}</section>
        )}
      </div>
    );
  }

  const showRail = rail != null && (layout === "three" || railOpen);
  /* At `two` the rail and the detail never share the page (Jess, 2026-09-26:
     a 140px detail is no detail): the rail beside the list, or the list
     beside the detail. Choosing a card hides the rail. */
  const hideDetail = layout === "two" && (showRail || railBeside);
  /* THE LIST IS A PICKER, THE DETAIL IS THE WORK (Jess, 2026-09-26: "listing
     more important than working panel?"). The list is 300px — two lines per
     row — and the detail takes everything else. */
  const columns = layout === "three"
    ? showRail ? "grid-cols-[240px_300px_minmax(480px,1fr)]" : "grid-cols-[300px_minmax(480px,1fr)]"
    : showRail
      ? "grid-cols-[240px_minmax(0,1fr)]"
      : hideDetail
        ? "grid-cols-[minmax(0,1fr)]"
        : "grid-cols-[300px_minmax(0,1fr)]";
  return (
    <div data-testid="work-split-shell" data-layout={layout} className={`grid min-h-0 flex-1 gap-4 ${columns}`}>
      {showRail ? (
        <aside aria-label="Work filters" className={`${COLUMN} gap-4 overflow-y-auto`}>
          {rail}
        </aside>
      ) : null}
      <section aria-label="Work actions" className={COLUMN}>
        {list}
      </section>
      {hideDetail ? null : (
        <section aria-label="Selected work" className={`${COLUMN} gap-2 overflow-y-auto`}>
          {detail}
        </section>
      )}
    </div>
  );
}
