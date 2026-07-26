import { z } from "zod";

/**
 * PO duty rotation (Jess 2026-07-18 night, locked spec).
 *
 * Procurement policy: 人分单,货合买 — every PIC owns their customers, but
 * purchase orders are consolidated COMPANY-WIDE and controlled by ONE person
 * per calendar month, auto-rotating through the assignment pool
 * (Jul Shasha → Aug Yu Jun → Sep Khor Yee → …). Management (isOpsManager)
 * can always raise POs and can override the month's holder.
 *
 * Cadence: PO days are Monday, Wednesday, Friday (MYT · Jess 2026-07-24
 * correction — was Mon+Thu before). The daily cron drops a reminder task on
 * the duty holder each PO-day morning. URGENT BYPASS: any order whose
 * deadline falls inside the stock lead window (MS/BF 7d, sofa 5d) flags red
 * on ANY day and must not wait for PO day.
 */

/** Month key in MYT (UTC+8, no DST): '2026-07'. The duty calendar is a
 *  business-calendar concept, so it lives in Malaysia time, not UTC. */
export function monthKeyMYT(now: Date = new Date()): string {
  const myt = new Date(now.getTime() + 8 * 3_600_000);
  const y = myt.getUTCFullYear();
  const m = String(myt.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** PO days (MYT weekday): Monday + Wednesday + Friday — the Mon/Wed/Fri
 *  batching cadence (Jess 2026-07-24 correction, was Mon+Thu = [1, 4] before). */
export const PO_DUTY_DAYS_MYT: readonly number[] = [1, 3, 5]; // getUTCDay() on MYT-shifted date
export function isPoDayMYT(now: Date = new Date()): boolean {
  const myt = new Date(now.getTime() + 8 * 3_600_000);
  return PO_DUTY_DAYS_MYT.includes(myt.getUTCDay());
}

/** Stock lead window per category (days the supplier needs to produce +
 *  deliver goods to us). Distinct from DELIVERY_LEAD_DAYS (customer-promise
 *  lead): this one drives the URGENT BYPASS — once an order's deadline is
 *  inside this window and its stock isn't secured, waiting for the next PO
 *  day risks missing the delivery. MS/BF 7 · sofa 5 (Jess 2026-07-18). */
export const PO_STOCK_LEAD_DAYS: Record<string, number> = {
  mattress: 7,
  bedframe: 7,
  sofa: 5,
};
export const PO_STOCK_LEAD_DEFAULT_DAYS = 7;
export function poStockLeadDaysFor(category: string | null | undefined): number {
  if (!category) return PO_STOCK_LEAD_DEFAULT_DAYS;
  return PO_STOCK_LEAD_DAYS[category.toLowerCase()] ?? PO_STOCK_LEAD_DEFAULT_DAYS;
}

/** Urgent bypass — deadline sits inside the stock lead window (or is already
 *  past) for ANY of the given categories. `categories` should be the
 *  categories that are actually short on stock for the order; pass [] /
 *  unknown categories and the default window applies. No deadline = never
 *  urgent (nothing to miss). Date-only compare in MYT. */
export function poUrgentBypass(
  deliveryDateIso: string | null | undefined,
  categories: readonly (string | null | undefined)[],
  now: Date = new Date(),
): boolean {
  if (!deliveryDateIso) return false;
  const deadline = new Date(`${deliveryDateIso.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(deadline.getTime())) return false;
  const dayMYT = (d: Date) => Math.floor((d.getTime() + 8 * 3_600_000) / 86_400_000);
  const daysLeft = dayMYT(deadline) - dayMYT(now);
  const windows =
    categories.length === 0
      ? [PO_STOCK_LEAD_DEFAULT_DAYS]
      : categories.map((c) => poStockLeadDaysFor(c));
  return windows.some((w) => daysLeft <= w);
}

/** Next PO day (Mon/Thu MYT) as an ISO date — TODAY if today is one. Feeds
 *  the DUTY board footer ("next: Thu 23 Jul 26"). */
export function nextPoDayMYT(now: Date = new Date()): string {
  const myt = new Date(now.getTime() + 8 * 3_600_000);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(myt.getTime() + i * 86_400_000);
    if (PO_DUTY_DAYS_MYT.includes(d.getUTCDay())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }
  return ""; // unreachable — 7 consecutive days always contain a Mon
}

/** One month's duty row. assigned_by null = auto-rotation picked it. */
export const opsPoDutySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  user_id: z.string().uuid(),
  assigned_by: z.string().uuid().nullable(),
});
export type OpsPoDuty = z.infer<typeof opsPoDutySchema>;

/** GET /api/operation/po-duty — current month's holder (enriched), or
 *  holder:null while the pool is empty / feature dormant. `roster` = the
 *  DUTY board (Jess 2026-07-19 "duty roster clear on board"): this month +
 *  every future month already written (0236 seeds Jul/Aug/Sep). */
export const opsPoDutyRosterEntrySchema = z.object({
  month: z.string(),
  userId: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
});
export type OpsPoDutyRosterEntry = z.infer<typeof opsPoDutyRosterEntrySchema>;
export const opsPoDutyResponseSchema = z.object({
  month: z.string(),
  holder: z
    .object({
      userId: z.string().uuid(),
      email: z.string(),
      name: z.string().nullable(),
      assignedBy: z.string().uuid().nullable(),
    })
    .nullable(),
  roster: z.array(opsPoDutyRosterEntrySchema).optional(),
});
export type OpsPoDutyResponse = z.infer<typeof opsPoDutyResponseSchema>;

/** PUT /api/operation/po-duty — manager override of a month's holder.
 *  month omitted = current month. */
export const updateOpsPoDutyInput = z
  .object({
    userId: z.string().uuid(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  })
  .strict();
export type UpdateOpsPoDutyInput = z.infer<typeof updateOpsPoDutyInput>;

/**
 * Auto-rotation: pick the pool member who has served the FEWEST months, tie
 * broken by longest-ago last service (never-served first), then by userId —
 * deterministic, so two sessions lazily filling the same month converge.
 * `history` = every past duty row (any order); `poolIds` = current pool.
 */
export function pickNextDutyHolder(
  history: { month: string; user_id: string }[],
  poolIds: string[],
): string | null {
  if (poolIds.length === 0) return null;
  const served = new Map<string, { count: number; last: string }>();
  for (const h of history) {
    const cur = served.get(h.user_id);
    served.set(h.user_id, {
      count: (cur?.count ?? 0) + 1,
      last: cur && cur.last > h.month ? cur.last : h.month,
    });
  }
  const ranked = [...poolIds].sort((a, b) => {
    const sa = served.get(a);
    const sb = served.get(b);
    const byCount = (sa?.count ?? 0) - (sb?.count ?? 0);
    if (byCount !== 0) return byCount;
    const byLast = (sa?.last ?? "").localeCompare(sb?.last ?? "");
    if (byLast !== 0) return byLast; // longest-ago (or never = '') first
    return a.localeCompare(b);
  });
  return ranked[0] ?? null;
}

/** Who may EDIT the duty roster (Jess 2026-07-19: "can edit roster only
 *  me") — STRICTER than isOpsManager: the shared operation@ account is a
 *  manager for daily surfaces, but whoever holds its password must NOT be
 *  able to rewrite the rotation.
 *  HR-P2 (0260): this is now the `po_duty_editor` duty key, granted to the
 *  COO seat (Jess's actual position) and to the still-empty Operation Manager
 *  seat. Re-exported from `./org-duties` so existing importers keep working. */
export { isPoDutyEditor } from "./org-duties";

/** May this user press Raise PO / create POs right now?
 *  Managers always; the month's holder; and EVERYONE while the duty layer is
 *  dormant (no holder) — a missing feature must never block real work. */
export function canRaisePo(
  dutyUserId: string | null | undefined,
  userId: string | null | undefined,
  role: string | null | undefined,
  email: string | null | undefined,
  isManagerFn: (role: string | null | undefined, email: string | null | undefined) => boolean,
): boolean {
  if (isManagerFn(role, email)) return true;
  if (!dutyUserId) return true; // dormant — no gate
  return !!userId && userId === dutyUserId;
}
