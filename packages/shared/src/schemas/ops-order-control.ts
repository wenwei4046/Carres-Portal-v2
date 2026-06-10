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
  updated_at: z.string().nullable(),
  updated_by: z.string().uuid().nullable(),
});
export type OpsOrderControl = z.infer<typeof opsOrderControlSchema>;

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
