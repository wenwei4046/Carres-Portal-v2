/**
 * ⭐ THE CARRES CONNECTOR — ONE DRAWING, owner correction 2026-09-11.
 *
 * The portal's left navigation has drawn a parent→child relationship this way
 * since 2026-08-19: a trunk drops from the parent, and each child takes it in
 * on a small curved elbow. The owner asked for THAT line — the same subtle
 * curve, not a new one — between the sections inside an expanded SO Batch
 * Purchase row. So the drawing moves here and both surfaces call it, because
 * the second hand-rolled copy is where two connectors start to disagree
 * (UI-KIT §6.1).
 *
 * ── WHAT THE SHAPE SAYS, AND WHY IT IS SHAPED THAT WAY ──────────────────────
 *
 * ```
 *   parent
 *     │            ← the trunk: drawn by every child EXCEPT the last
 *     ├─ child     ← the elbow: down, then a 9px turn into the child
 *     │
 *     ╰─ child     ← the last child draws its elbow and NO trunk, so the
 *   next parent       line structurally ENDS here and cannot run past the
 *                     group into whatever follows
 * ```
 *
 * Each child draws its own elbow and its own continuation. Nothing measures
 * the group's height, so a child that wraps to two lines, a table that grows a
 * row, or a section that collapses cannot knock the arithmetic out — and the
 * line can never be drawn past the last child, because the last child is the
 * one that does not draw it.
 *
 * The colour is `border-kit-slate-6`, the token the navigation already uses;
 * there is no connector colour of its own to keep in step.
 */

/** The elbow's horizontal run, from the trunk to the child's left edge. */
export const CONNECTOR_ELBOW_W = 11;
/** The corner radius — the "subtle curve". */
export const CONNECTOR_ELBOW_R = 9;
/** The vertical air between two siblings that the trunk crosses. */
export const CONNECTOR_ROW_GAP = 2;

/**
 * The corner: down the trunk from `gapAbove` above this child's box, then a
 * turn to the right into it.
 *
 * `connectAt` is where the turn lands, measured from the child box's OWN top.
 * The navigation passes `"50%"` — a nav row's middle. A SECTION is not a row:
 * its middle is somewhere inside a table, so a section passes the pixel offset
 * of its own heading's middle and the line arrives at the heading, which is
 * the thing the elbow is pointing at.
 */
export function ConnectorElbow({
  left,
  gapAbove,
  connectAt,
  testId,
}: {
  left: number;
  gapAbove: number;
  connectAt: string;
  testId?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      className="pointer-events-none absolute border-kit-slate-6"
      style={{
        left: left - 0.5,
        top: -gapAbove,
        width: CONNECTOR_ELBOW_W,
        height: `calc(${connectAt} + ${gapAbove}px)`,
        borderLeftWidth: 1,
        borderBottomWidth: 1,
        borderBottomLeftRadius: CONNECTOR_ELBOW_R,
        /* Above the child's own wash: a selected child must still show which
           parent it hangs from, the way any tree keeps its indent guide. */
        zIndex: 1,
      }}
    />
  );
}

/**
 * The trunk carrying on to the NEXT child. Absent on the last one — which is
 * what makes the line END at the last elbow instead of running past the group
 * as one straight bar.
 */
export function ConnectorTrunk({
  left,
  from,
  gapBelow,
  testId,
}: {
  left: number;
  /** Where the trunk resumes below the elbow's turn — the same `connectAt`. */
  from: string;
  gapBelow: number;
  testId?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      className="pointer-events-none absolute border-kit-slate-6"
      style={{
        left: left - 0.5,
        top: from,
        bottom: -gapBelow,
        borderLeftWidth: 1,
        zIndex: 1,
      }}
    />
  );
}
