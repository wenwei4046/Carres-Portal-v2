/**
 * grid-layout — the arithmetic behind `DataTable`'s draggable grid (card D0.5d).
 * FOLLOWS: **UI-KIT 2026-07-27** (§0.3 — every kit artifact declares its edition).
 *
 * **Why this is a separate file and not three closures inside `DataTable`.**
 * Both operations are pure functions of numbers and keys, and both are things a
 * test must be able to assert exactly. `DataTable` runs in jsdom, where
 * `getBoundingClientRect()` returns zero for everything — a drag test in jsdom
 * therefore proves that a handler fired and nothing whatever about where the
 * column ended up. The measurable half lives here so it can be measured.
 *
 * **Neither function knows what a column IS.** They take numbers and keys and
 * return numbers and keys; every word, every width the caller declared and
 * every decision about what a column means stays in the page.
 */

/**
 * Resize by SPLITTER, not by growth — column `index` takes width from its right
 * neighbour and the total never changes.
 *
 * **This is the whole reason a resizable table can still obey §7.** The law's
 * first rule is *"a list table never scrolls sideways"*, enforced by
 * `table-fixed` + widths that always sum to the container. A grid that let a
 * column simply grow would push the sum past the container and hand the
 * operator a horizontal scrollbar — which is AutoCount's behaviour and is the
 * one thing §7 rules out by name. Taking from the neighbour keeps the sum
 * constant, so the table stays exactly the container width at every frame of
 * the drag.
 *
 * A pair that cannot move (either side is already at `min`) returns the input
 * unchanged rather than clamping to something the operator did not ask for.
 *
 * @param widths every column's CURRENT width, same unit throughout (px or %)
 * @param index  the column whose RIGHT edge is being dragged; must not be last
 * @param delta  how far the edge moved, in the same unit
 * @param min    the floor a column may not go under, same unit
 */
export function resizeColumnPair(
  widths: readonly number[],
  index: number,
  delta: number,
  min: number,
): number[] {
  const next = [...widths];
  if (index < 0 || index >= widths.length - 1) return next;
  const left = widths[index]!;
  const right = widths[index + 1]!;
  // Clamp the MOVEMENT, never the result: the largest step that keeps both
  // sides legal. Clamping the result instead is how a fast drag silently
  // teleports a neighbour to its minimum.
  const lo = min - left; // most we may shrink the dragged column by
  const hi = right - min; // most we may take from the neighbour
  const moved = Math.max(lo, Math.min(hi, delta));
  next[index] = left + moved;
  next[index + 1] = right - moved;
  return next;
}

/**
 * Move `fromKey` so that it sits where `toKey` is. Returns a NEW order.
 *
 * Dropping a column on itself, on a key that is not in the order, or from a
 * key that is not in the order all return the order unchanged — a reorder that
 * silently invented a position would be worse than one that refused.
 */
export function moveColumnOrder(
  order: readonly string[],
  fromKey: string,
  toKey: string,
): string[] {
  const from = order.indexOf(fromKey);
  const to = order.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, fromKey);
  return next;
}

/**
 * Apply a remembered order to the columns the caller passed TODAY.
 *
 * The two lists disagree constantly and both disagreements are ordinary: a
 * page hides a column behind a permission, or a card adds one. So a key the
 * caller no longer passes is dropped, and a column the order has never heard
 * of is APPENDED rather than refused — a new column must appear, or shipping a
 * column becomes invisible to every operator who has ever dragged that grid.
 */
export function applyColumnOrder<T extends { key: string }>(
  columns: readonly T[],
  order: readonly string[] | null,
): readonly T[] {
  if (order == null) return columns;
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const taken = new Set<string>();
  const out: T[] = [];
  for (const key of order) {
    const col = byKey.get(key);
    if (col && !taken.has(key)) {
      out.push(col);
      taken.add(key);
    }
  }
  for (const col of columns) if (!taken.has(col.key)) out.push(col);
  return out;
}
