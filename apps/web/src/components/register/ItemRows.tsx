/**
 * ItemRows — the item rows inside an opened row of the shared listing (01 §5:
 * group rows 54, item rows 44). The listing engine draws the group rows; this
 * draws what opens under one, so every page's item rows are the same part and
 * no page draws its own table (owner 11 and 13 Oct 2026).
 *
 * The opened row starts at the first data column, so the block steps back over
 * the tick and arrow columns: an item's tick sits under its row's tick.
 * The caller gives each row the same column template as the list above it.
 */
import type { ReactNode } from "react";

export default function ItemRows({ label, stepBack = 72, testId, children }: {
  /** What the rows are, for a screen reader. */
  label: string;
  /** The width of the tick and arrow columns above, as the list drew them. */
  stepBack?: number;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div role="table" aria-label={label} className="bg-white" style={{ marginLeft: -stepBack }} data-carres-table="item-rows" data-testid={testId}>
      {children}
    </div>
  );
}
