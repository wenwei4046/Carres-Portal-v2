import { z } from "zod";

/**
 * ops_order_control — the editable "Master Sheet, live" overlay on an order
 * (migration 0159; P2 of memory: project-orders-control-spec).
 *
 * 1:1 with `orders`, created lazily on first edit. Holds the operational
 * control fields the order drawer edits and that don't belong on core `orders`:
 * stock location(s) + ETA, four operator remark fields, payment-follow-up
 * status. delivery_date + logistic stay on `orders` (edited via their own
 * RPCs); the Before-7-Days flag is computed client-side, never stored.
 *
 * snake_case throughout — mirrors the raw-row passthrough the operation order
 * endpoints already use (no adapter layer; see delivery-chain.ts precedent).
 *
 * One schema, two consumers — apps/api validates writes, apps/web validates
 * what it renders + reuses the field lists for the drawer's dropdowns.
 */

/** Suggested stock-location chips for the drawer multi-select. Stored as free
 *  text[] so Carres can add locations without a migration — these are just the
 *  known set the UI offers first. */
export const STOCK_LOCATIONS = [
  "Carres Klang",
  "Balakong",
  "at-supplier",
] as const;

/** Suggested payment-follow-up states for the drawer dropdown. Stored as free
 *  text (column is `text`) so the operator isn't boxed in. */
export const PAYMENT_STATUSES = [
  "Paid",
  "Partial",
  "Follow Up",
  "Unpaid",
] as const;

/** Suggested delivery time-slot windows for the drawer dropdown (the spec's
 *  "delivery date + time slot"). Stored as free text (column is `text`) so the
 *  operator can record a bespoke window via the remark fields if needed. */
export const DELIVERY_TIME_SLOTS = [
  "Morning (9am–12pm)",
  "Afternoon (12pm–3pm)",
  "Late afternoon (3pm–6pm)",
  "Evening (after 6pm)",
  "Anytime",
] as const;

/** ISO yyyy-mm-dd (no time) — matches the DB `date` column for stock_eta. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected yyyy-mm-dd");

/** PostgREST returns `numeric` columns as JSON strings (precision-safe). Read
 *  them as number|string|null → number|null. */
const dbNumeric = z
  .union([z.number(), z.string()])
  .nullable()
  .transform((v) => (v == null || v === "" ? null : Number(v)));

/** The overlay row as returned by GET /:id/control (raw DB row, snake_case). */
export const opsOrderControlSchema = z.object({
  order_id: z.string().uuid(),
  stock_location: z.array(z.string()).default([]),
  stock_eta: isoDate.nullable(),
  delivery_time_slot: z.string().nullable(),
  customer_request: z.string().nullable(),
  action_for_logistic: z.string().nullable(),
  carres_remark: z.string().nullable(),
  warehouse_remark: z.string().nullable(),
  payment_status: z.string().nullable(),
  /** Payments panel (migration 0165) — RM owing (from AutoCount Balance), the
   *  storage-fee start date (null → use the order ETA), and a manual override
   *  of the auto-computed storage fee. */
  balance: dbNumeric,
  storage_from: isoDate.nullable(),
  storage_fee_override: dbNumeric,
  /** Drawer Master-Sheet redesign (migration 0167): the logistic's committed
   *  delivery date (vs orders.delivery_date = customer deadline), the keyed
   *  amount paid (partial-payment support), and a storage-fee paid status. */
  logistic_eta: isoDate.nullable(),
  paid_amount: dbNumeric,
  storage_paid: z.string().nullable(),
  /** Per-line stock location { <sku>: string[] } + a call-first gate
   *  (migration 0168). */
  line_locations: z.record(z.string(), z.array(z.string())).nullable(),
  called_customer: z.boolean().default(false),
  updated_at: z.string().nullable(),
  updated_by: z.string().uuid().nullable(),
});
export type OpsOrderControl = z.infer<typeof opsOrderControlSchema>;

// ── Storage fees ───────────────────────────────────────────────────────────
/** Storage-fee rates (Jess 2026-06-12): mattress/bed frame RM150 per month,
 *  sofa RM200 per 2 weeks. Accrual starts at the order ETA (or a manual
 *  storage_from) and is charged per COMMENCED period. */
export const STORAGE_RATES = {
  msbf: { amount: 150, periodDays: 30, label: "RM150 / month" },
  sof: { amount: 200, periodDays: 14, label: "RM200 / 2 weeks" },
} as const;

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Storage fee accrued from `startDate` (ETA, or a manual storage_from) to
 * `asOf`, charged per commenced period — mattress/bed frame RM150 per 30 days,
 * sofa RM200 per 14 days. An order can carry both (the Master Sheet has
 * separate MS/BF + SOF columns), so they sum. 0 before the start date.
 */
export function computeStorageFee(opts: {
  startDate: string | null;
  asOf: string;
  hasMsbf: boolean;
  hasSof: boolean;
}): { msbf: number; sof: number; total: number; days: number } {
  const { startDate, asOf, hasMsbf, hasSof } = opts;
  if (!startDate) return { msbf: 0, sof: 0, total: 0, days: 0 };
  const days = daysBetween(startDate, asOf);
  if (days <= 0) return { msbf: 0, sof: 0, total: 0, days: 0 };
  const periods = (p: number) => Math.ceil(days / p);
  const msbf = hasMsbf ? periods(STORAGE_RATES.msbf.periodDays) * STORAGE_RATES.msbf.amount : 0;
  const sof = hasSof ? periods(STORAGE_RATES.sof.periodDays) * STORAGE_RATES.sof.amount : 0;
  return { msbf, sof, total: msbf + sof, days };
}

/**
 * Request body for PUT /:id/control — sparse upsert. The drawer sends only the
 * fields it changed; omitted fields are left untouched on the existing row (or
 * take their column default on first insert). `.strict()` rejects typos so a
 * misspelled key can't silently no-op.
 */
export const updateOpsOrderControlInput = z
  .object({
    stock_location: z.array(z.string().trim().min(1)).max(10),
    stock_eta: isoDate.nullable(),
    delivery_time_slot: z.string().max(100).nullable(),
    customer_request: z.string().max(2000).nullable(),
    action_for_logistic: z.string().max(2000).nullable(),
    carres_remark: z.string().max(2000).nullable(),
    warehouse_remark: z.string().max(2000).nullable(),
    payment_status: z.string().max(100).nullable(),
    // Payments panel (migration 0165).
    balance: z.number().min(0).max(99_999_999).nullable(),
    storage_from: isoDate.nullable(),
    storage_fee_override: z.number().min(0).max(99_999_999).nullable(),
    logistic_eta: isoDate.nullable(),
    paid_amount: z.number().min(0).max(99_999_999).nullable(),
    storage_paid: z.string().max(100).nullable(),
    line_locations: z.record(z.string(), z.array(z.string())).nullable(),
    called_customer: z.boolean(),
  })
  .partial()
  .strict();
export type UpdateOpsOrderControlInput = z.infer<
  typeof updateOpsOrderControlInput
>;

/** Response shape for both GET + PUT — the full overlay (or null when no row
 *  exists yet, i.e. all-default). */
export const opsOrderControlResponseSchema = z.object({
  control: opsOrderControlSchema.nullable(),
});
export type OpsOrderControlResponse = z.infer<
  typeof opsOrderControlResponseSchema
>;
