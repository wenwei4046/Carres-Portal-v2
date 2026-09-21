/**
 * ⭐ THE EXPANSION CONNECTOR IS ANCHORED TO THE CARET CELL (ui MASTER §6.9,
 * Card 12 review 2026-09-21).
 *
 * The line from an expanded row down to its child box used to be drawn inside
 * the expansion cell at a fixed 10px, which is not where the `▸` is: the caret
 * lives in the grid's `__expand__` gutter, so the line started 26px to the right
 * of the caret on every listing (measured on SO Batch and Sales Orders alike).
 *
 * Only the grid knows where its caret cell is, so the grid draws the part that
 * starts there — measured from nothing, positioned by CSS at 50% of that cell:
 *
 * ```
 *   ▸            parent row · caret cell      the drop, beneath the caret
 *   │
 *   ╰───────     expansion row · same column  the elbow, to that cell's edge
 *        ──┬──▢  ConnectedSections            the run, to the first child box
 * ```
 *
 * The engine shows its part ONLY when the expansion actually contains the
 * shared `ConnectedSections` (a CSS `:has()` test on `data-connected-sections`),
 * so a grid whose expansion is a plain table is byte-identical to before.
 */
import { createContext, useContext } from "react";

/**
 * Where the line meets the first child, measured down from the top of the
 * expansion row: the section stack's 8px of top air plus the 13px middle of a
 * ruled table header — exactly where the first elbow landed before. Stated,
 * never measured: a line that re-measures moves when a table loads.
 */
export const EXPANSION_JOIN_Y = 21;

/** True inside a grid expansion whose engine draws the caret-anchored line. */
export const ExpansionJoinContext = createContext(false);

export function useExpansionJoined(): boolean {
  return useContext(ExpansionJoinContext);
}
