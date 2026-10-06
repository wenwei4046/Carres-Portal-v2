/**
 * THE MIGRATION NUMBER IS THE APPLY ORDER (red line 7).
 *
 * Extracted from `check-migrations.mjs` so it can be TESTED. The gate that
 * missed the 2026-08-24 collision missed it partly because nothing could
 * exercise it: the script does its work at import time, so a test could only
 * run the whole thing or nothing.
 */

/**
 * Group migration filenames by their numeric prefix.
 * `0376_a.sql` and `0376_b.sql` collide; `0376_a.sql` and `0376a_b.sql` do not
 * — the suffix letter exists precisely so a follow-up can sit behind a number
 * without taking it.
 */
export function groupByNumber(files) {
  const byNumber = new Map();
  for (const file of files) {
    const m = file.match(/^(\d{4}[a-z]?)_/);
    if (!m) continue;
    byNumber.set(m[1], [...(byNumber.get(m[1]) ?? []), file]);
  }
  return byNumber;
}

/** Collisions that are NOT in the baseline, newest-first by number. */
export function findCollisions(files, baseline = new Set()) {
  return [...groupByNumber(files).entries()]
    .filter(([, group]) => group.length > 1)
    .filter(([key]) => !baseline.has(key))
    .map(([number, group]) => ({ number, files: [...group].sort() }))
    .sort((a, b) => b.number.localeCompare(a.number));
}

/**
 * A baselined pair that stopped colliding must LEAVE the list, or the list
 * starts excusing collisions nobody has looked at.
 */
export function staleBaselineEntries(files, baseline = new Set()) {
  const byNumber = groupByNumber(files);
  return [...baseline].filter((key) => (byNumber.get(key) ?? []).length < 2).sort();
}

export function collisionMessage(collisions) {
  return (
    "Two migrations share one number — the apply order would be undefined:\n" +
    collisions.map((c) => `  ${c.number}: ${c.files.join(", ")}`).join("\n") +
    "\nRenumber the one that has NOT reached main, behind the one that has."
  );
}
