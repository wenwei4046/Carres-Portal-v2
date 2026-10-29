import { klDateOfIso } from "@carres/shared";

/**
 * Collect-by (Jess): ideal collect ≥ 7 days before delivery — but never before
 * the order was placed. SO-1372 (placed 29 Oct, delivery inside a week) read
 * "Collect by 23 Oct (passed)" on its first day because delivery − 7d was not
 * floored. Returns a KL calendar date (YYYY-MM-DD), or null when no delivery date.
 */
export function collectByIso(
  deliveryDate: string | null,
  deliveryTbd: boolean,
  placedAt: string | null | undefined,
): string | null {
  if (deliveryTbd || !deliveryDate) return null;
  const ideal = new Date(new Date(deliveryDate).getTime() - 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const placed = placedAt ? klDateOfIso(placedAt) : null;
  return placed && placed > ideal ? placed : ideal;
}

/** Passed only once the KL day is AFTER the collect-by day (the day itself is not late). */
export function collectByPassed(collectBy: string | null, now: Date = new Date()): boolean {
  return collectBy !== null && klDateOfIso(now.toISOString()) > collectBy;
}
