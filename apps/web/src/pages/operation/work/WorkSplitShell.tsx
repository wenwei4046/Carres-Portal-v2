/**
 * THE WORK SHELL — owner correction 2026-09-24.
 *
 * ```
 *   grey canvas · 16px padding
 *   ┌ toolbar (one white section) ─────────────────────────────────┐
 *   └──────────────────────────────────────────────────────────────┘
 *                            16px
 *   ┌ Date ──┐   Heading                 ┌ detail section ─────────┐
 *   └────────┘   [To do|Waiting|Done]    └─────────────────────────┘
 *     16px       ┌ card 124 ┐   8px      ┌ detail section ─────────┐
 *   ┌ Module ┐   ┌ card 124 ┐            └─────────────────────────┘
 *   └────────┘
 *    240px   16   420px               16   remaining (≥480px)
 * ```
 *
 * The workspace is an UNFRAMED grid: no border, fill, radius or shadow
 * around it. Every white surface is its own section. The three columns
 * scroll independently.
 *
 *   three  ≥1280px of page — rail · list · detail
 *   two    960–1279px      — the rail collapses (a toolbar control reopens
 *                            it); the list stays 360–400px and can never be
 *                            collapsed
 *   one    <960px          — Date and Module open from compact controls; the
 *                            list and the detail share ONE stage
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
  list,
  detail,
}: {
  layout: WorkLayout;
  activePanel?: WorkPanel;
  /** Only read at `two`: whether the collapsible rail is showing. */
  railOpen?: boolean;
  rail: ReactNode;
  list: ReactNode;
  detail: ReactNode;
}) {
  if (layout === "one") {
    return (
      <div data-testid="work-split-shell" data-layout="one" className={`${COLUMN} flex-1`}>
        {activePanel === "detail" ? (
          <section aria-label="Selected work" className={`${COLUMN} flex-1 gap-4 overflow-y-auto`}>{detail}</section>
        ) : (
          <section aria-label="Work actions" className={`${COLUMN} flex-1`}>{list}</section>
        )}
      </div>
    );
  }

  const showRail = layout === "three" || railOpen;
  const columns = layout === "three"
    ? "grid-cols-[240px_420px_minmax(480px,1fr)]"
    : showRail
      ? "grid-cols-[240px_minmax(360px,400px)_minmax(0,1fr)]"
      : "grid-cols-[minmax(360px,400px)_minmax(0,1fr)]";
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
      <section aria-label="Selected work" className={`${COLUMN} gap-4 overflow-y-auto`}>
        {detail}
      </section>
    </div>
  );
}
