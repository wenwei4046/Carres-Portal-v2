/**
 * Purchasing scheduling rules.
 *
 * Procurement policy: 人分单,货合买 — every PIC owns their customers, but
 * purchase orders are consolidated COMPANY-WIDE. The current PO Duty person
 * is resolved by Workspace Staff & Duties, outside this scheduling module.
 *
 * Cadence: the PO days and the urgent-bypass window are both SETTINGS since
 * P1 (`purchasing_settings`, Purchasing → Settings). PO Days do not create a
 * second reminder task. URGENT BYPASS: any
 * order whose deadline falls inside the production window for goods that are
 * not secured flags red on ANY day and must not wait for a PO day.
 */

/**
 * PO days (MYT weekday). **P1 (2026-07-28): the days are a SETTING now** —
 * `purchasing_settings.po_days`, edited on Purchasing → Settings. There is
 * deliberately no default parameter: a caller that cannot supply the setting
 * would otherwise quietly go on using a literal, and the whole point of P1 is
 * that a screen and the engine can never hold different cadences.
 * (The constant that used to live here read Mon+Thu for months after Jess
 * moved to Mon/Wed/Fri — that is what a second home costs.)
 */
export function isPoDayMYT(now: Date, poDays: readonly number[]): boolean {
  const myt = new Date(now.getTime() + 8 * 3_600_000);
  return poDays.includes(myt.getUTCDay());
}

/**
 * Urgent bypass — the deadline sits inside the production window (or has
 * passed) for goods that are not secured yet, so waiting for the next PO day
 * risks missing the delivery.
 *
 * `windowDays` is the production working days for the categories that are
 * actually short — resolved from the settings by the caller
 * (`purchasingUrgentWindowDays`). It used to be a per-category constant here
 * (mattress 7 · bedframe 7 · **sofa 5**), which was the THIRD live copy of the
 * sofa number and the one Jess's card calls out as wrong.
 *
 * `windowDays` 0 or below = nothing to compare against, never urgent. No
 * deadline = never urgent (nothing to miss). Date-only compare in MYT.
 */
export function poUrgentBypass(
  deliveryDateIso: string | null | undefined,
  windowDays: number,
  now: Date = new Date(),
): boolean {
  if (!deliveryDateIso) return false;
  if (!Number.isFinite(windowDays) || windowDays <= 0) return false;
  const deadline = new Date(`${deliveryDateIso.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(deadline.getTime())) return false;
  const dayMYT = (d: Date) => Math.floor((d.getTime() + 8 * 3_600_000) / 86_400_000);
  const daysLeft = dayMYT(deadline) - dayMYT(now);
  return daysLeft <= windowDays;
}

/** Next PO day as an ISO date — TODAY if today is one. Feeds the DUTY board
 *  footer ("next: Fri 24 Jul 26"). Returns "" when no day is configured. */
export function nextPoDayMYT(now: Date, poDays: readonly number[]): string {
  if (poDays.length === 0) return "";
  const myt = new Date(now.getTime() + 8 * 3_600_000);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(myt.getTime() + i * 86_400_000);
    if (poDays.includes(d.getUTCDay())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  return ""; // unreachable while at least one weekday is configured
}
