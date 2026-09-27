/**
 * THE WORK SHELL — inbox · this order · communication (owner ruling, Jess
 * 2026-09-27: "left like Gmail's inbox, the middle is the working panel, the
 * right is WhatsApp and communication, a full pane").
 *
 * ```
 *   ┌ inbox 280 ┬ this order (rest, ≥560) ┬ communication 340 ┐
 *   │ calendar  │ header + Order Route    │ To · Template     │
 *   │ the list  │ the step cards          │ message · doors   │
 *   └───────────┴─────────────────────────┴───────────────────┘
 * ```
 *
 *   three  ≥1040px of page — all three columns (260 · ≥420 · 300 below 1280)
 *   two    760–1039px      — inbox and order; communication slides over the
 *                            order from the right when asked for
 *   one    <760px          — one stage at a time: the inbox, or the order with
 *                            its communication beneath it
 *
 * Geometry only: no border, fill, radius or shadow of its own. The inbox and
 * the communication pane are flat white columns; the order is the one canvas
 * region with 16px around its cards.
 */
import type { ReactNode } from "react";

export type WorkLayout = "three" | "two" | "one";
export type WorkPanel = "list" | "detail";

const COLUMN = "flex min-h-0 min-w-0 flex-col";

export default function WorkSplitShell({
  layout,
  activePanel = "list",
  list,
  detail,
  comm = null,
  commOpen = false,
  wide = true,
}: {
  layout: WorkLayout;
  activePanel?: WorkPanel;
  list: ReactNode;
  detail: ReactNode;
  /** The communication pane of the selected order; null when nothing is selected. */
  comm?: ReactNode;
  /** Only read at `two`: the pane slid over the order. */
  commOpen?: boolean;
  /** Canvas ≥1280px: 280 · ≥560 · 340; narrower three-column: 260 · ≥420 · 300. */
  wide?: boolean;
}) {
  if (layout === "one") {
    return (
      <div data-testid="work-split-shell" data-layout="one" className={`${COLUMN} flex-1`}>
        {activePanel === "detail" ? (
          <section aria-label="Selected work" className={`${COLUMN} flex-1 gap-2 overflow-y-auto`}>
            {detail}
            {comm}
          </section>
        ) : (
          <section aria-label="Work actions" className={`${COLUMN} flex-1`}>{list}</section>
        )}
      </div>
    );
  }
  const three = layout === "three";
  const inbox = three ? (wide ? "280px" : "260px") : "300px";
  const columns = three && comm
    ? wide ? "grid-cols-[280px_minmax(560px,1fr)_340px]" : "grid-cols-[260px_minmax(420px,1fr)_300px]"
    : three ? (wide ? "grid-cols-[280px_minmax(0,1fr)]" : "grid-cols-[260px_minmax(0,1fr)]") : "grid-cols-[300px_minmax(0,1fr)]";
  void inbox;
  return (
    <div data-testid="work-split-shell" data-layout={layout} className={`relative grid min-h-0 flex-1 ${columns}`}>
      <section aria-label="Work actions" className={COLUMN}>{list}</section>
      <section aria-label="Selected work" className={`${COLUMN} gap-2 overflow-y-auto ${wide ? "p-4" : "p-3"}`}>{detail}</section>
      {comm && three ? <aside aria-label="Communication" className={`${COLUMN} overflow-y-auto border-l border-kit-slate-5 bg-white`}>{comm}</aside> : null}
      {comm && !three && commOpen ? (
        <aside aria-label="Communication" className={`${COLUMN} absolute inset-y-0 right-0 z-20 w-[340px] max-w-full overflow-y-auto border-l border-kit-slate-5 bg-white shadow-lg`}>{comm}</aside>
      ) : null}
    </div>
  );
}
