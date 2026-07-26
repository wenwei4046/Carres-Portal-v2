import { z } from "zod";
import { DELIVERY_REASON_KEYS } from "../delivery-reasons";

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
  "AL",
  "Nice Future",
  "Ohana",
  "at-supplier",
] as const;

/** Carriers for a per-item transfer leg (Jess 2026-07-11 Route "Option D"). Free
 *  set — the UI offers these first + suggests one per leg. */
export const ROUTE_CARRIERS = [
  "Lalamove",
  "NETS",
  "HOUZS",
  "Supplier direct",
  "Keep at Klang",
] as const;

/** One hop of a per-item transfer route: `from → to` via a carrier, `done` when
 *  that leg has been completed. Stored per-line in ops_order_control.line_legs
 *  (jsonb { <sku>: OrderRouteLeg[] }) — mirrors line_locations / line_etas. */
export const orderRouteLegSchema = z.object({
  from: z.string().max(60),
  to: z.string().max(60),
  carrier: z.string().max(40).nullable(),
  done: z.boolean().default(false),
});
export type OrderRouteLeg = z.infer<typeof orderRouteLegSchema>;

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

// ── T6 delivery photo (migration 0280) ──────────────────────────────────────
/** One delivery-photo ledger entry as stored in
 *  ops_order_control.delivery_photos (jsonb array). `path` is the object key
 *  inside the private `proof-of-delivery` bucket (0069) under the
 *  `order/{order_id}/` prefix — the partner POD flow keys on `{thread_id}/`,
 *  so the two artifact families can never collide. Entries are SERVER-built
 *  (path from the sign-upload response, at/by stamped by the attach route). */
export const deliveryPhotoSchema = z.object({
  path: z.string(),
  /** When the photo was attached (ISO timestamp, server-stamped). */
  at: z.string(),
  /** Who attached it (app_users.id, server-stamped). */
  by: z.string().uuid().nullable().default(null),
});
export type DeliveryPhoto = z.infer<typeof deliveryPhotoSchema>;

// ── T8 delivery groups (migration 0282) ─────────────────────────────────────
/** The two things that can travel on their own trip. Mirrors
 *  `DELIVERY_GROUP_KEYS` in delivery-groups.ts — mattress + bed frame are ONE
 *  group ("bed"), which is how the never-split rule survives contact with any
 *  future caller. */
export const deliveryGroupKeySchema = z.enum(["bed", "sofa"]);

/** One archived trip in ops_order_control.delivery_trips — a confirmation that
 *  a later confirmation replaced. SERVER-built; nothing here is client input. */
export const deliveryTripSchema = z.object({
  /** Groups that trip carried; null = the whole order. */
  groups: z.array(deliveryGroupKeySchema).nullable().default(null),
  date: z.string().nullable().default(null),
  slot: z.string().nullable().default(null),
  /** When the replaced trip was confirmed. */
  at: z.string().nullable().default(null),
  by: z.string().uuid().nullable().default(null),
});
export type DeliveryTrip = z.infer<typeof deliveryTripSchema>;

/** Allowed upload types — photos only (the partner POD flow additionally
 *  takes PDF; a delivery photo is a photo). */
export const DELIVERY_PHOTO_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const DELIVERY_PHOTO_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

/** POST /:id/delivery-photo/sign-upload — ask for a short-lived signed upload
 *  URL into the proof-of-delivery bucket. The route refuses unless the order
 *  is delivered (the artifact proves a delivery that HAPPENED). */
export const signDeliveryPhotoUploadInput = z
  .object({
    mimeType: z.enum(DELIVERY_PHOTO_MIMES),
    sizeBytes: z.number().int().positive().max(DELIVERY_PHOTO_MAX_BYTES),
  })
  .strict();
export type SignDeliveryPhotoUploadInput = z.infer<
  typeof signDeliveryPhotoUploadInput
>;

/** POST /:id/delivery-photo/attach — record an uploaded photo on the order's
 *  ledger. The route verifies the path sits under this order's own prefix. */
export const attachDeliveryPhotoInput = z
  .object({
    path: z.string().min(1).max(500),
  })
  .strict();
export type AttachDeliveryPhotoInput = z.infer<typeof attachDeliveryPhotoInput>;

/** GET /:id/delivery-photos — the ledger + a short-lived signed VIEW url per
 *  photo (the bucket is private; the Worker signs after its own role gate). */
export const deliveryPhotoListResponseSchema = z.object({
  photos: z.array(
    deliveryPhotoSchema.extend({ url: z.string().nullable().default(null) }),
  ),
});
export type DeliveryPhotoListResponse = z.infer<
  typeof deliveryPhotoListResponseSchema
>;

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
  /** Master-imported storage fees (migration 0207) — the per-order fee Jess
   *  already hand-computes in the Master "MS/BF Storage Fees" / "SOF Storage
   *  Fees" columns. null = not imported. READ-only on the overlay; written by
   *  the import-stock-eta endpoint. The Storage panel prefers these over the
   *  auto `computeStorageFee` (a manual override still wins). */
  storage_fee_msbf: dbNumeric,
  storage_fee_sof: dbNumeric,
  /** Drawer Master-Sheet redesign (migration 0167): the logistic's committed
   *  delivery date (vs orders.delivery_date = customer deadline), the keyed
   *  amount paid (partial-payment support), and a storage-fee paid status. */
  logistic_eta: isoDate.nullable(),
  paid_amount: dbNumeric,
  storage_paid: z.string().nullable(),
  /** Per-line stock location { <sku>: string[] } + a call-first gate
   *  (migration 0168). */
  line_locations: z.record(z.string(), z.array(z.string())).nullable(),
  /** Per-line transfer route legs { <sku>: OrderRouteLeg[] } — a special
   *  multi-hop arrangement (supplier pickup, cross-warehouse). Empty/absent =
   *  the standard single hop to the default warehouse (migration 0216, Jess). */
  line_legs: z
    .record(z.string(), z.array(orderRouteLegSchema))
    .nullable()
    .default(null),
  /** Per-line stock ETA { <sku>: "yyyy-mm-dd" } — products don't all arrive on
   *  the same date (migration 0170, Jess). */
  line_etas: z.record(z.string(), z.string()).nullable(),
  /** Per-line stock STATUS override { <sku>: "ready"|"waiting"|"nopo" } — from the
   *  Master-sheet import or keyed per line; the readiness badge PREFERS it over
   *  the derived free-stock value (migration 0199, Jess 2026-07-02). */
  line_stock_status: z
    .record(z.string(), z.enum(["ready", "waiting", "nopo"]))
    .nullable(),
  /** Per-line GRN received qty { <sku>: number } — how many units have been
   *  booked into ops_stock_items (reserved to this SO) for the line. Drives the
   *  Recv X/N column; when it reaches the line qty the line auto-flips to Ready
   *  (via line_stock_status). READ-only on the overlay — written by the dedicated
   *  /receive-line endpoint, never the generic control PUT (migration 0208). */
  line_received: z.record(z.string(), z.number()).nullable().default(null),
  called_customer: z.boolean().default(false),
  /** DEPRECATED (0277) — use booking_stage. 0220 drawer marker, UI removed
   *  rev25; kept only so history reads. No writer, no reader. */
  customer_confirmed: z.boolean().default(false),
  /** D1 two-stage booking (migration 0277). `none` → `provisional` follows
   *  logistic_eta by DB trigger (a carrier date = Stage 1, never the customer's
   *  yes); `confirmed` is written ONLY by the booking-confirm endpoint after the
   *  goods-ready + balance-ready gates. Defaults keep an old-Worker response
   *  parseable (HR-O1 degrade lesson). */
  booking_stage: z.enum(["none", "provisional", "confirmed"]).default("none"),
  /** Stage 2 — the CUSTOMER-confirmed date + time slot (invariant #1: both or
   *  neither; DB CHECK + confirm endpoint enforce). READ-only on the overlay —
   *  written only by the confirm endpoint, never the generic control PUT. */
  confirmed_date: isoDate.nullable().default(null),
  confirmed_time_slot: z.string().nullable().default(null),
  /** Confirmation evidence stamp — when recorded + who recorded it. */
  customer_confirmed_at: z.string().nullable().default(null),
  customer_confirmed_by: z.string().uuid().nullable().default(null),
  /** When ops last chased the logistic/supplier (migration 0221) — stamped by
   *  the drawer's WhatsApp copy-template button. No alert-engine wiring. */
  last_chased_at: z.string().nullable().default(null),
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
  /** Storage delivery-extension (migration 0196). A one-time customer extension:
   *  `extension_original_date` snapshots the delivery date at the first extension
   *  (the storage free-window basis, so it survives the target date moving);
   *  `extension_new_date` is the new requested delivery date; reason + note +
   *  acknowledgement record the agreement. `extension_count` is the one-time
   *  guard (0 = none; operation may take it to 1; a 2nd needs a principal). These
   *  are READ-only on the overlay — written only by the dedicated /storage/extend
   *  endpoint, never the generic control PUT. */
  extension_original_date: isoDate.nullable().default(null),
  extension_new_date: isoDate.nullable().default(null),
  extension_reason: z.string().nullable().default(null),
  extension_note: z.string().nullable().default(null),
  extension_acknowledged_at: z.string().nullable().default(null),
  extended_at: z.string().nullable().default(null),
  extended_by: z.string().uuid().nullable().default(null),
  extension_count: z.number().int().default(0),
  /** Contact-by auto follow-up (migration 0197). `contact_by_days` = how many
   *  days before the delivery deadline to reach the customer (null = default 3;
   *  editable per order). `contact_by_task_at` is the idempotency stamp the cron
   *  sets when it creates the task — READ-only here (system-written). */
  contact_by_days: z.number().int().nullable().default(null),
  contact_by_task_at: z.string().nullable().default(null),
  /** Staff owner (migration 0232) — soft responsibility pointer (app_users.id);
   *  null = unassigned. assigned_by null = system auto-assign; assigned_at =
   *  when it last changed. Never a visibility wall. */
  assigned_staff: z.string().uuid().nullable().default(null),
  assigned_by: z.string().uuid().nullable().default(null),
  assigned_at: z.string().nullable().default(null),
  /** T6 delivery photos (migration 0280) — the proof a delivery happened:
   *  server-appended {path, at, by} entries pointing into the
   *  proof-of-delivery Storage bucket (order/{order_id}/… keys). READ-only on
   *  the overlay — written only by the dedicated /delivery-photo/attach
   *  endpoint (which gates on the order being delivered), never the generic
   *  control PUT. Default keeps a pre-0280 Worker response parseable (the
   *  HR-O1 degrade lesson). */
  delivery_photos: z.array(deliveryPhotoSchema).default([]),
  /** T8 delivery groups (migration 0282) — which groups the CONFIRMED trip
   *  carries. `null` = the whole order, which is what every pre-T8 confirmation
   *  means, so the default is also the honest reading of an old row. A partial
   *  scope exists only when the customer chose to split (bed set now, sofa
   *  later, or the reverse). READ-only on the overlay — written only by the
   *  booking-confirm endpoint, never the generic control PUT. */
  booking_groups: z.array(deliveryGroupKeySchema).nullable().default(null),
  /** T8 (0282) — trips a later confirmation replaced. NOT a second booking
   *  store: the live booking stays in booking_stage / confirmed_date /
   *  confirmed_time_slot. Default keeps a pre-0282 Worker response parseable
   *  (the HR-O1 degrade lesson). */
  delivery_trips: z.array(deliveryTripSchema).default([]),
  updated_at: z.string().nullable(),
  updated_by: z.string().uuid().nullable(),
});
export type OpsOrderControl = z.infer<typeof opsOrderControlSchema>;

// ── Storage fees ───────────────────────────────────────────────────────────
/** Storage-fee rates (Jess 2026-07-13, UI-KIT §7.5 — supersedes the 2026-06-30
 *  working-day-window framing): the fee runs over an explicit START→END window.
 *  START = the operator's From date (auto-suggested as the next SAME WEEKDAY
 *  after the delivery deadline, i.e. deadline + 7 days — see
 *  `defaultStorageStart`); END = the actual delivery / collection date.
 *  MS/BF = RM150 per commenced 30-day month over the window. Sofa = the first
 *  14 days of the window free, then a flat one-time RM200. */
export const STORAGE_RATES = {
  msbf: { amount: 150, periodDays: 30, label: "RM150 / month" },
  sof: { amount: 200, freeDays: 14, label: "free 14 days, then RM200" },
} as const;

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

function addDays(fromIso: string, n: number): string {
  const s = fromIso.slice(0, 10);
  const [y, m, dd] = s.split("-").map(Number);
  // UTC throughout so toISOString() doesn't shift the date across the local
  // (MYT, UTC+8) offset.
  const d = new Date(Date.UTC(y, (m ?? 1) - 1, dd ?? 1));
  if (Number.isNaN(d.getTime())) return s;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The default storage START for a delivery deadline (UI-KIT §7.5): the next
 *  SAME WEEKDAY after the deadline — deadline Mon 1 Jan → start Mon 8 Jan.
 *  Exactly deadline + 7 days. null in → null out. */
export function defaultStorageStart(deadlineIso: string | null): string | null {
  if (!deadlineIso || !/^\d{4}-\d{2}-\d{2}/.test(deadlineIso)) return null;
  return addDays(deadlineIso, 7);
}

/**
 * Storage fee owed over the window START (`startDate`) → END (`asOf` — pass the
 * actual delivery/collection date when known, else today while still accruing),
 * per UI-KIT §7.5 (Jess 2026-07-13):
 *
 *  - MS/BF bills RM150 per commenced 30-day month over the window
 *    (`msbfMonths` = how many). Any window > 0 days commences the first month.
 *  - Sofa is FREE for the window's first 14 days (`freeUntilSof` = last free
 *    day), then bills a flat ONE-TIME RM200 (never recurs; `sofCharged`).
 *
 * An order can carry both (separate MS/BF + SOF columns on the Master Sheet), so
 * they sum. 0 with no START or while END ≤ START. `freeUntilMsbf` is the START
 * itself (MS/BF has no free window — the grace week lives in the START rule).
 */
export function computeStorageFee(opts: {
  startDate: string | null;
  asOf: string;
  hasMsbf: boolean;
  hasSof: boolean;
}): {
  msbf: number;
  sof: number;
  total: number;
  days: number;
  freeUntilMsbf: string | null;
  freeUntilSof: string | null;
  msbfMonths: number;
  sofCharged: boolean;
} {
  const { startDate, asOf, hasMsbf, hasSof } = opts;
  const empty = {
    msbf: 0,
    sof: 0,
    total: 0,
    days: 0,
    freeUntilMsbf: null as string | null,
    freeUntilSof: null as string | null,
    msbfMonths: 0,
    sofCharged: false,
  };
  if (!startDate) return empty;
  const days = Math.max(0, daysBetween(startDate, asOf));

  let msbf = 0;
  let msbfMonths = 0;
  let freeUntilMsbf: string | null = null;
  if (hasMsbf) {
    freeUntilMsbf = startDate.slice(0, 10);
    if (days > 0) {
      msbfMonths = Math.ceil(days / STORAGE_RATES.msbf.periodDays);
      msbf = msbfMonths * STORAGE_RATES.msbf.amount;
    }
  }

  let sof = 0;
  let sofCharged = false;
  let freeUntilSof: string | null = null;
  if (hasSof) {
    freeUntilSof = addDays(startDate, STORAGE_RATES.sof.freeDays);
    if (daysBetween(freeUntilSof, asOf) > 0) {
      sof = STORAGE_RATES.sof.amount;
      sofCharged = true;
    }
  }

  return {
    msbf,
    sof,
    total: msbf + sof,
    days,
    freeUntilMsbf,
    freeUntilSof,
    msbfMonths,
    sofCharged,
  };
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
    line_legs: z
      .record(z.string(), z.array(orderRouteLegSchema))
      .nullable(),
    line_etas: z.record(z.string(), z.string()).nullable(),
    line_stock_status: z
      .record(z.string(), z.enum(["ready", "waiting", "nopo"]))
      .nullable(),
    called_customer: z.boolean(),
    // Customer confirmed the delivery (migration 0220) — the drawer Next-banner
    // marker. Plain writable boolean; no alert-engine wiring.
    customer_confirmed: z.boolean(),
    // Last-chased stamp (migration 0221) — the WhatsApp copy button writes now().
    last_chased_at: z.string().datetime({ offset: true }).nullable(),
    // Balance job (migration 0184) — payment due date. The storage_collected_at
    // / storage_waiver_* columns are intentionally NOT writable here: those go
    // through the dedicated collect / waiver endpoints (a waiver approval must
    // be principal-gated, so it can't ride the generic operator PUT).
    balance_due_date: isoDate.nullable(),
    // Contact-by (migration 0197) — per-order override of the default 3-day
    // pre-deadline reminder. contact_by_task_at is system-written (cron), not here.
    contact_by_days: z.number().int().min(0).max(60).nullable(),
    // Staff owner (migration 0232) — soft responsibility pointer, null =
    // unassigned. assigned_by / assigned_at are SERVER-stamped when this key
    // is present (never client-supplied).
    assigned_staff: z.string().uuid().nullable(),
    // D1 booking (0277): booking_stage / confirmed_date / confirmed_time_slot /
    // customer_confirmed_* are DELIBERATELY absent — `.strict()` rejects them
    // here. Provisional derives from logistic_eta (DB trigger); Confirmed goes
    // only through POST /:id/booking/confirm, which enforces the gates.
    // T8 (0282): booking_groups / delivery_trips are absent for the same
    // reason — a trip's scope is part of the confirmation, not a field an
    // operator may edit afterwards (a DB CHECK backstops it either way).
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

// ── D1 booking confirm (migration 0277) ─────────────────────────────────────
/** POST /:id/booking/confirm — record the CUSTOMER's yes. Date + slot both
 *  required (invariant #1); the endpoint additionally enforces goods ready +
 *  balance ready + the Sunday rule. Re-calling on a confirmed booking updates
 *  the date/slot and re-stamps the evidence (the customer re-confirmed). */
export const confirmBookingInput = z
  .object({
    confirmedDate: isoDate,
    /** Free text ≤100 (DELIVERY_TIME_SLOTS are the suggested set). */
    confirmedTimeSlot: z.string().trim().min(1).max(100),
    /** T8 (0282) — the delivery groups THIS trip carries, i.e. the customer's
     *  wait-vs-split answer. OMIT for a normal delivery: absent = the whole
     *  order, which is the pre-T8 behaviour and the reason nothing splits by
     *  itself. `[]` is rejected on purpose — a trip carrying nothing is not a
     *  delivery, and an accidental empty array must never read as "everything".
     *  The server still gates every named group on goods-ready + balance. */
    deliverGroups: z.array(deliveryGroupKeySchema).min(1).max(2).optional(),
  })
  .strict();
export type ConfirmBookingInput = z.infer<typeof confirmBookingInput>;

// ── GRN per-line receive (migration 0208) ────────────────────────────────────
/** Book n units of ONE order line into ops_stock_items, reserved to the SO. The
 *  condition mirrors ops_stock_items ('new' | 'exhibition' | 'old'); location +
 *  a receipt/DO number are optional stamps. */
export const receiveLineInput = z
  .object({
    sku: z.string().trim().min(1).max(200),
    qty: z.number().int().min(1).max(999),
    condition: z.enum(["new", "exhibition", "old", "refurbished"]).default("new"),
    location: z.string().trim().max(120).optional(),
    doNumber: z.string().trim().max(60).optional(),
  })
  .strict();
export type ReceiveLineInput = z.infer<typeof receiveLineInput>;

export interface ReceiveLineResult {
  /** Units booked in this call. */
  received: number;
  /** Line's cumulative received qty after this call. */
  lineReceived: number;
  /** The line's ordered qty (received == ordered ⇒ the line flips to Ready). */
  lineQty: number;
  /** True when the line is now fully received (auto-set to Ready). */
  ready: boolean;
}

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

// ── Storage delivery-extension input (the two Google Forms, Jess 2026-06-30) ──
/**
 * Record a one-time storage delivery-extension. POST /:id/storage/extend.
 * `acknowledged` must be true (the customer-acknowledgement checkbox is
 * mandatory on the form). T4 Reason Library v1: `reasonKey` is a required pick
 * from the shared DELIVERY_REASONS (structured, no free text — the old
 * Renovation/Traveling/Others dropdown is retired; legacy rows keep their
 * stored words and display as-is). `note` is an optional detail for any
 * reason. The new date must be a valid delivery date — we only shape-check
 * here (yyyy-mm-dd); the route snapshots the original date.
 */
export const recordStorageExtensionInput = z.object({
  newDeliveryDate: isoDate,
  reasonKey: z.enum(DELIVERY_REASON_KEYS, {
    errorMap: () => ({ message: "a delivery reason is required" }),
  }),
  note: z.string().trim().max(500).nullish(),
  acknowledged: z.literal(true, {
    errorMap: () => ({ message: "customer acknowledgement is required" }),
  }),
});
export type RecordStorageExtensionInput = z.infer<typeof recordStorageExtensionInput>;

// ── Staff assignment pool (migration 0232, Jess model B 2026-07-18) ──────────
/** One operation staff account as the assignment UI sees it. `pooled` = has an
 *  ops_staff_settings row (opt-in to auto-assign); `available` = pooled AND not
 *  away (MC / leave). Visibility is NEVER gated by any of this. */
export const opsStaffMemberSchema = z.object({
  user_id: z.string().uuid(),
  email: z.string(),
  name: z.string().nullable(),
  pooled: z.boolean(),
  available: z.boolean(),
  note: z.string().nullable(),
  /** Presence stamp (0235) — set by touch_last_seen when they open the
   *  portal; null = never seen. Drives the seen-today auto-availability. */
  last_seen_at: z.string().nullable().default(null),
  /** HR-P2 (0260) — THIS person's duty keys, from `org_duty_holders()`.
   *  Present so list surfaces can answer "which of these are managers?"
   *  (the pool filter) without a per-row request. Defaults to [] on a Worker
   *  that predates 0260, which keeps the legacy email path in charge. */
  duties: z.array(z.string()).default([]),
});
export type OpsStaffMember = z.infer<typeof opsStaffMemberSchema>;

export const opsStaffListResponseSchema = z.object({
  staff: z.array(opsStaffMemberSchema),
  /** The CALLER's own duty keys (`my_org_duties()`). Rides this payload
   *  because every surface that asks "may I?" already fetches the staff list —
   *  no second round-trip, and no duty read on pages that never gate. */
  myDuties: z.array(z.string()).default([]),
});
export type OpsStaffListResponse = z.infer<typeof opsStaffListResponseSchema>;

/** PUT /api/operation/staff/:userId — upsert the pool membership/availability.
 *  pooled:false deletes the settings row (out of the pool entirely). */
export const updateOpsStaffSettingInput = z
  .object({
    pooled: z.boolean(),
    available: z.boolean().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export type UpdateOpsStaffSettingInput = z.infer<typeof updateOpsStaffSettingInput>;

/** "Came to work today" (0235) — the presence stamp falls on today's date in
 *  MYT (UTC+8, Malaysia has no DST). The auto-assign sweep only hands NEW
 *  orders to pool members seen today: MC / no-show = never stamped = skipped
 *  automatically, no manual click needed. */
export function seenTodayMYT(
  lastSeenIso: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastSeenIso) return false;
  const seen = new Date(lastSeenIso);
  if (Number.isNaN(seen.getTime())) return false;
  const dayMYT = (d: Date) => Math.floor((d.getTime() + 8 * 3_600_000) / 86_400_000);
  return dayMYT(seen) === dayMYT(now);
}

/**
 * Least-loaded distribution (auto-assign + redistribute share this): hand each
 * order to whichever staff currently has the fewest open orders, bumping their
 * count as we go. Deterministic — ties break on userId so two operators running
 * the sweep concurrently converge on the same plan. Empty staff → no plan
 * (never throws; the caller just skips the sweep).
 */
export function distributeOrders(
  orderIds: string[],
  staff: { userId: string; openCount: number }[],
): { orderId: string; userId: string }[] {
  if (staff.length === 0 || orderIds.length === 0) return [];
  const loads = staff.map((s) => ({ ...s }));
  const plan: { orderId: string; userId: string }[] = [];
  for (const orderId of orderIds) {
    loads.sort(
      (a, b) => a.openCount - b.openCount || a.userId.localeCompare(b.userId),
    );
    const target = loads[0]!;
    target.openCount += 1;
    plan.push({ orderId, userId: target.userId });
  }
  return plan;
}

/** HR-P2 (0260): "who may manage the pool" moved to duty keys — the grant now
 *  hangs off the POSITION (`org_position_duties`), not an email list, so a
 *  promotion in the Team tab is the whole change. `isOpsManager` lives in
 *  `./org-duties` and is re-exported here so existing importers keep working;
 *  the old `OPS_MANAGER_EMAILS` constant survives as
 *  `LEGACY_OPS_MANAGER_EMAILS` inside the transition fallback and comes out
 *  one release later. */
export { isOpsManager } from "./org-duties";

/** GENERIC (non-person) operation accounts — never auto-join the assignment
 *  pool and never appear as a person in the TEAM rail. Round-4's "generic
 *  accounts never auto-join" intent, made explicit: auto-enroll previously
 *  only excluded managers, so a login on logistics@ would have silently
 *  enrolled it and started swallowing orders.
 *  NOTE (2026-07-26 live check): logistics@carres.com no longer exists as an
 *  app_user, so this list is currently inert — kept because the guard must
 *  survive the account being recreated, not because it fires today. This is
 *  NOT a duty: "is this a robot account" is a property of the account, not a
 *  permission that a position can grant. */
export const OPS_GENERIC_EMAILS = ["logistics@carres.com"] as const;
export function isOpsGenericAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  return (OPS_GENERIC_EMAILS as readonly string[]).includes(email.toLowerCase());
}

/** Working-day cutoff (MYT hour): BEFORE it, a not-yet-logged-in pool member
 *  keeps their share (late morning ≠ absent); AT/AFTER it, no heartbeat today
 *  = treated absent TODAY and their system-assigned orders flow to whoever is
 *  in — fully automatic MC handling (Jess 2026-07-18 round-3: no manual away
 *  click needed). They log in later → their share flows straight back. */
export const OPS_DAY_CUTOFF_HOUR_MYT = 10;

/** Does this member count as "in" for auto-assignment right now? */
export function countsAsInToday(
  lastSeenIso: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const hourMYT = Math.floor(
    ((now.getTime() + 8 * 3_600_000) % 86_400_000) / 3_600_000,
  );
  if (hourMYT < OPS_DAY_CUTOFF_HOUR_MYT) return true; // morning grace
  return seenTodayMYT(lastSeenIso, now);
}
