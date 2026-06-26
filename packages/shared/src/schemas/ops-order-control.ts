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
  "Houzs Balakong",
  "Nice Future",
  "Ohana",
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

/** Storage-waiver lifecycle (migration 0184). A storage fee can be waived
 *  instead of collected, but only once a PRINCIPAL approves: operator requests
 *  → 'requested', principal decides → 'approved' | 'rejected'. The delivery gate
 *  opens on 'approved' (or once collected). */
export const STORAGE_WAIVER_STATUSES = [
  "none",
  "requested",
  "approved",
  "rejected",
] as const;
export type StorageWaiverStatus = (typeof STORAGE_WAIVER_STATUSES)[number];

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
  /** Storage END date (migration 0169). null = still in storage → fee accrues to
   *  the logistic ETA (else today); set = freeze the window at that date. */
  storage_to: isoDate.nullable(),
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
  /** Per-line stock ETA { <sku>: "yyyy-mm-dd" } — products don't all arrive on
   *  the same date (migration 0170, Jess). */
  line_etas: z.record(z.string(), z.string()).nullable(),
  called_customer: z.boolean().default(false),
  /** Balance job (migration 0184) — when the customer's balance is due. Key-in;
   *  the Payments panel + drawer flag overdue (due < today AND outstanding > 0).
   *  NOT the delivery deadline — that's orders.delivery_date. */
  balance_due_date: isoDate.nullable().default(null),
  /** Storage collect-before-delivery gate (migration 0184). storage_collected_at
   *  is stamped when a `kind:'storage'` order_payments row is recorded; dispatch
   *  is blocked until storage is collected OR a principal approves a waiver. These
   *  are READ-only on the overlay — they're written by the dedicated collect /
   *  waiver endpoints, never the generic control PUT. */
  storage_collected_at: z.string().nullable().default(null),
  storage_waiver_status: z.enum(STORAGE_WAIVER_STATUSES).default("none"),
  storage_waiver_reason: z.string().nullable().default(null),
  storage_waiver_requested_by: z.string().uuid().nullable().default(null),
  storage_waiver_decided_by: z.string().uuid().nullable().default(null),
  storage_waiver_decided_at: z.string().nullable().default(null),
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
    storage_to: isoDate.nullable(),
    storage_fee_override: z.number().min(0).max(99_999_999).nullable(),
    logistic_eta: isoDate.nullable(),
    paid_amount: z.number().min(0).max(99_999_999).nullable(),
    storage_paid: z.string().max(100).nullable(),
    line_locations: z.record(z.string(), z.array(z.string())).nullable(),
    line_etas: z.record(z.string(), z.string()).nullable(),
    called_customer: z.boolean(),
    // Balance job (migration 0184) — payment due date. The storage_collected_at
    // / storage_waiver_* columns are intentionally NOT writable here: those go
    // through the dedicated collect / waiver endpoints (a waiver approval must
    // be principal-gated, so it can't ride the generic operator PUT).
    balance_due_date: isoDate.nullable(),
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

// ── Storage scope + collect-before-delivery gate ─────────────────────────────
/** Storage-fee scope of a SKU: mattress/bed frame bills at the MS/BF rate, sofa
 *  at the SOF rate, everything else is out of scope. Verbatim port of
 *  OperationPayments' `catOf` so the panel, the drawer, and the server-side
 *  delivery gate all categorise a line the SAME way (one definition, three
 *  consumers). */
export type StorageCategory = "msbf" | "sof" | "other";
export function storageCategoryForSku(sku: string): StorageCategory {
  const s = sku.trim().toLowerCase();
  if (
    s.startsWith("mattress:") ||
    s.startsWith("bedframe:") ||
    /^ms\d/.test(s) ||
    /^bf\d/.test(s)
  )
    return "msbf";
  if (s.startsWith("sofa:") || /^(sof|sf)\d/.test(s)) return "sof";
  return "other";
}

/** Whether an order's lines pull in the MS/BF and/or Sofa storage rate. */
export function orderStorageScope(skus: ReadonlyArray<string>): {
  hasMsbf: boolean;
  hasSof: boolean;
} {
  let hasMsbf = false;
  let hasSof = false;
  for (const sku of skus) {
    const cat = storageCategoryForSku(sku);
    if (cat === "msbf") hasMsbf = true;
    else if (cat === "sof") hasSof = true;
  }
  return { hasMsbf, hasSof };
}

/**
 * The single source of truth for "is a storage fee owed on this order?" — used
 * by the delivery gate. A fee is only owed once the OPERATOR has turned storage
 * on: accrual starts at the manual `storageFrom` (the drawer's "Storage? → Yes"
 * gate), and the effective amount is the manual `override` when set, else the
 * computed fee. `due` is amount > 0.
 *
 * Deliberately does NOT fall back to the order ETA: the Payments panel shows a
 * *potential* fee accruing from the ETA for awareness, but the delivery gate
 * must NOT block a normal dispatch just because an order is past its ETA — only
 * when storage has been explicitly declared. So an order with no `storageFrom`
 * (and no override) is never due, no matter how late it is.
 */
export function computeOrderStorage(opts: {
  storageFrom: string | null;
  override: number | null;
  skus: ReadonlyArray<string>;
  asOf: string;
}): {
  hasMsbf: boolean;
  hasSof: boolean;
  computed: number;
  amount: number;
  due: boolean;
} {
  const { hasMsbf, hasSof } = orderStorageScope(opts.skus);
  // No ETA fallback — storage is owed only when the operator set storageFrom.
  const fee = computeStorageFee({
    startDate: opts.storageFrom,
    asOf: opts.asOf,
    hasMsbf,
    hasSof,
  });
  const amount = opts.override != null ? opts.override : fee.total;
  return { hasMsbf, hasSof, computed: fee.total, amount, due: amount > 0 };
}

// ── Storage-waiver request / decide inputs ───────────────────────────────────
/** Operator requests a storage-fee waiver (a reason is mandatory — it's the
 *  justification the principal reviews). POST /:id/storage/waiver/request. */
export const requestStorageWaiverInput = z.object({
  reason: z.string().trim().min(3, "a reason is required").max(500),
});
export type RequestStorageWaiverInput = z.infer<typeof requestStorageWaiverInput>;

/** Principal decides a pending waiver. POST /:id/storage/waiver/decide —
 *  principal-only (enforced at the route). */
export const decideStorageWaiverInput = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(500).nullish(),
});
export type DecideStorageWaiverInput = z.infer<typeof decideStorageWaiverInput>;
