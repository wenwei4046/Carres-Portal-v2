import { z } from "zod";
import { MAX_DELIVERY_FLOOR } from "../constants";

/**
 * Single Order schema with optional rels. Lists return arrays of orders without
 * lines/addons/history; the detail endpoint populates them via PostgREST nested
 * fetch. One schema, one type — aligns 1:1 with `domain.Order`.
 */

export const orderStatusSchema = z.enum([
  "place",
  "proceed_order",
  "delivered",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/**
 * The stage an order IS in — this list must equal the Postgres enum exactly,
 * because `orderSchema.parse()` runs on live rows and a value it does not know
 * throws.
 *
 * It had drifted both ways. `placed` was listed here but migration 0167 remapped
 * it to `confirmed` and dropped it from the type, so no row can hold it —
 * `placed` survives only as a SYNTHETIC FILTER value (`ListOperationOrdersQuery`),
 * where the route turns it into `status='place'`. And `waiting` — a real value
 * since 0028, set by the partner-rejection lane (`resume-dispatch.ts`) — was
 * missing, so parsing any order in that stage threw.
 */
export const operationStageSchema = z.enum([
  "confirmed",
  "in_production",
  "ready_to_dispatch",
  "waiting",
  "dispatched",
  "delivered",
]);

export const partnerStageSchema = z.enum([
  "assigned",
  "picked_from_wh",
  "en_route",
  "delivered",
]);

const orderLineSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  sku: z.string(),
  qty: z.number().int(),
  attrs: z.record(z.unknown()).nullable(),
  unitPrice: z.number(),
});

const orderAddonSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  addonKey: z.string(),
  qty: z.number().int(),
  unitPrice: z.number(),
  // Migration 0133 — disposal size tag etc. Optional + nullable; absence
  // means "no extra attributes" (the legacy shape).
  attrs: z.record(z.unknown()).nullable().optional(),
});

const orderHistorySchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  text: z.string(),
  byRole: z.string().nullable(),
  occurredAt: z.string(),
});

export const orderSchema = z.object({
  id: z.string().uuid(),
  so: z.number().int(),
  status: orderStatusSchema,
  channel: z.string(),
  dealerId: z.string().uuid(),
  outletId: z.string().uuid().nullable(),
  salespersonId: z.string().uuid().nullable(),
  customer: z.object({
    name: z.string(),
    phone: z.string().nullable(),
    address: z.string().nullable(),
    addressUnknown: z.boolean(),
    billing: z.string().nullable(),
    billingSame: z.boolean(),
    emergency: z.string().nullable(),
    // 0200 — POS-parity demographics. `.optional()` keeps rows fetched before
    // the migration parse-safe (adapter coalesces to null).
    email: z.string().nullable().optional(),
    race: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    birthday: z.string().nullable().optional(),
    // 0230 — structured MY address parts. Present ⇒ they match the composed
    // `address` string (flat-only writers clear them). `.optional()` keeps
    // pre-0230 responses parse-safe.
    addressLine1: z.string().nullable().optional(),
    addressLine2: z.string().nullable().optional(),
    addressState: z.string().nullable().optional(),
    addressCity: z.string().nullable().optional(),
    addressPostcode: z.string().nullable().optional(),
  }),
  delivery: z.object({
    date: z.string().nullable(),
    // Phase 11.1 — salesperson-entered planned production-start ("Proceed")
    // date. Pairs with `date` via `dateTbd`; <= `date`.
    proceedDate: z.string().nullable(),
    dateTbd: z.boolean(),
    floor: z.number(),
    hasLift: z.boolean(),
    stairItems: z.number().int().nonnegative().nullable(),
  }),
  paid: z.number(),
  signatureUrl: z.string().nullable(),
  paymentSlipUrl: z.string().nullable(),
  termsAccepted: z.boolean(),
  // 0219 — config-driven methods: any configured key (e.g. "cash"), not just
  // the historical trio. Widened from the old enum; existing values parse.
  paymentMethod: z.string().max(40).nullable(),
  approvalCode: z.string().nullable(),
  installmentMonths: z.union([z.literal(6), z.literal(12)]).nullable(),
  /** 0219 — POS entry extras: payment follow-up answers (e.g.
   *  { payment: { bank: "Maybank" } }) + custom form-field values
   *  ({ fields: {...} }). Optional so pre-0219 responses still parse. */
  entryData: z.record(z.unknown()).nullable().optional(),
  operationStage: operationStageSchema.nullable(),
  // Origin marker — 'autocount' for imported legacy rows (null = native).
  // Optional so responses fetched before the field existed still parse.
  sourceSystem: z.string().nullable().optional(),
  warehouseId: z.string().uuid().nullable(),
  deliveryPartnerId: z.string().uuid().nullable(),
  partnerStage: partnerStageSchema.nullable(),
  partnerPickedAt: z.string().nullable(),
  partnerEta: z.string().nullable(),
  doNumber: z.string().nullable(),
  doNote: z.string().nullable(),
  invoiceNo: z.string().nullable(),
  invoicedAt: z.string().nullable(),
  placedAt: z.string(),
  // List response augments — set server-side in the list handler only.
  lineCount: z.number().int().optional(),
  /** Sum of line_subtotal + addon_subtotal computed by the list handler. Excludes
   *  stair carry (proto's monthValue definition). Detail endpoint omits it; use
   *  `lineSubtotal + addonSubtotal + floorSurcharge` from `order-totals.ts`
   *  there to get the authoritative grand total. */
  totalAmount: z.number().optional(),
  // Detail response augments — populated only by the detail handler.
  lines: z.array(orderLineSchema).optional(),
  addons: z.array(orderAddonSchema).optional(),
  history: z.array(orderHistorySchema).optional(),
});
export type Order = z.infer<typeof orderSchema>;
export type OrderLine = z.infer<typeof orderLineSchema>;
export type OrderAddon = z.infer<typeof orderAddonSchema>;
export type OrderHistory = z.infer<typeof orderHistorySchema>;

export const ordersListResponseSchema = z.object({
  orders: z.array(orderSchema),
  total: z.number().int(),
});
export type OrdersListResponse = z.infer<typeof ordersListResponseSchema>;

/**
 * Create-order input — what the wizard POSTs to `/api/orders`. The web side
 * composes this from `WizardDraft` + uploaded Storage paths (signature, slip)
 * + computed totals. The API hands it to the `create_order` RPC after a thin
 * adapter pass.
 *
 * Shape notes:
 * - `dealerId` is NOT included; the API derives it from the JWT (cross-dealer
 *   posts are blocked at the RPC level via SECURITY DEFINER manual check).
 * - `signaturePath` is required (Step 3 gate enforces signature). It's a
 *   Storage path like `orders-attachments/{dealer_id}/{wizard_uuid}/signature.png`.
 * - `paymentSlipPath` may be null when payment method = credit/installment
 *   without slip (rare; spec requires slip for online).
 * - `lines.length >= 1` — the RPC also enforces this defensively.
 * - `termsAccepted` must be literal `true` — submitting unchecked is rejected.
 * - `depositPct` is included (not derived) so the RPC's order_history text
 *   matches what the dealer saw at submit time.
 */
const orderLineInputSchema = z.object({
  sku: z.string().min(1),
  qty: z.number().int().positive(),
  attrs: z.record(z.unknown()).nullable(),
  unitPrice: z.number().nonnegative(),
});

const orderAddonInputSchema = z.object({
  addonKey: z.string().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  // Migration 0133 — disposal size tag etc. The frontend enforces "size
  // required for any disposal addon"; the RPC just persists whatever is sent.
  attrs: z.record(z.unknown()).nullable().optional(),
});

export const createOrderInputSchema = z.object({
  outletId: z.string().uuid(),
  salespersonId: z.string().uuid(),
  customer: z.object({
    name: z.string().min(2),
    phone: z.string().regex(/^[0-9-+\s]{8,}/),
    address: z.string().nullable(),
    addressUnknown: z.boolean(),
    billing: z.string().nullable(),
    billingSame: z.boolean(),
    emergency: z.string().min(1),
    // 0200 — POS-parity demographics. The POS front-end gates requiredness;
    // the server stays LENIENT (nullable/optional) so non-POS callers and
    // in-flight drafts keep submitting (2990s precedent).
    email: z.string().nullable().optional(),
    race: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    birthday: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    // 0230 — structured MY address parts, sent alongside the composed
    // `address` string by the POS wizard. LENIENT (nullable/optional): non-POS
    // callers omit them and the order simply has no structured address.
    addressLine1: z.string().max(200).nullable().optional(),
    addressLine2: z.string().max(200).nullable().optional(),
    addressState: z.string().max(60).nullable().optional(),
    addressCity: z.string().max(120).nullable().optional(),
    addressPostcode: z.string().max(10).nullable().optional(),
  }),
  delivery: z.object({
    date: z.string().nullable(),
    // Phase 11.1 — proceed date pairs with `date` and must be <= `date`.
    // Cross-field rules in the superRefine.
    proceedDate: z.string().nullable(),
    /** ⛔ OWNER RULING 2026-08-15 — a NEW Sales Order may never be dateless.
     *  The field stays on the wire (existing callers keep their shape) but the
     *  superRefine refuses `true`: if the date is not confirmed with the
     *  customer, Operation must not receive the order. Legacy rows that
     *  already carry `delivery_date_tbd = TRUE` are untouched — this door
     *  creates orders, it does not rewrite them. */
    dateTbd: z.boolean(),
    floor: z.number().int().min(1).max(MAX_DELIVERY_FLOOR),
    hasLift: z.boolean(),
    stairItems: z.number().int().nonnegative().nullable().optional(),
  }),
  lines: z.array(orderLineInputSchema).min(1),
  addons: z.array(orderAddonInputSchema).default([]),
  paid: z.number().nonnegative(),
  signaturePath: z.string().min(1),
  paymentSlipPath: z.string().nullable(),
  termsAccepted: z.literal(true),
  depositPct: z.number().int().min(0).max(100),
  /** Payment instrument used at order time. Persisted as `orders.payment_method`.
   *  0219 — config-driven: the route validates the key against the ACTIVE
   *  `order_entry_config` method list (code defaults incl. "cash" when the
   *  config is empty); the old 3-value DB CHECK is gone. */
  paymentMethod: z.string().trim().min(1).max(40),
  /** Bank/EDC approval (or bank reference) code from the slip. Required for ALL
   *  methods (≥ 3 chars) as of 2026-06-16: online = bank reference / FT number,
   *  credit/installment = EDC approval code — Finance reconciles the deposit
   *  against the bank statement with it. The wizard enforces the ≥3 rule; the
   *  schema accepts any non-empty string (null only for legacy/imported rows). */
  approvalCode: z.string().nullable(),
  /** Installment plan months. Only valid when paymentMethod === "installment".
   *  RPC re-checks the cross-field rule and rejects with 22023. */
  installmentMonths: z.union([z.literal(6), z.literal(12)]).nullable(),
  /** Attribution dealer for an order an INTERNAL role (principal/operation/
   *  finance/bd) places ON BEHALF OF a dealer it picks. Additive + optional: a
   *  dealer/salesperson/showroom omits it — the API uses their JWT dealer and
   *  IGNORES this field (no spoofing); only an internal role with no own
   *  dealer_id has its value honored. */
  dealerId: z.string().uuid().optional(),
  /** 0184 (2990s parity Phase 6) — the operator's free-form additional delivery
   *  fee (RM, ≥0). OPTIONAL: non-POS callers omit it. The Hono recompute is
   *  authoritative for the base + cross-category portions; only this additional
   *  fee + `crossCategorySourceSo` come from the client. */
  additionalDeliveryFee: z.number().nonnegative().optional(),
  /** 0184 — the customer's earlier SO this order is a cross-category follow-up
   *  of (the base was paid on that SO → this order owes only the reduced cross
   *  rate). OPTIONAL + nullable: non-follow-up orders omit / null it. Hono
   *  validates the linked SO (exists / same customer / not cancelled / not
   *  already linked) before booking. */
  crossCategorySourceSo: z.string().nullable().optional(),
  /** 0187 (2990s parity Phase 8c) — the trigger cart-line keys whose RESERVED
   *  pwp_codes belong to THIS submit, so the order-path Confirm-pass can DELETE
   *  the unclaimed ones. OPTIONAL + default [] (DORMANT). A server-derived
   *  fallback (the claimed codes' own cart_line_key) cleans claimed triggers'
   *  siblings even if a client omits this, so correctness never hinges on the
   *  field; it makes the cleanup COMPLETE (also reaches triggers whose reward was
   *  never claimed). Mirrors the additionalDeliveryFee / crossCategorySourceSo
   *  precedent. */
  pwpCartLineKeys: z.array(z.string()).optional().default([]),
  /** 0219 — POS entry extras. `payment` holds follow-up answers keyed by the
   *  method's followUp keys (e.g. { bank: "Maybank" }); `fields` holds custom
   *  form-field values keyed by the configured field keys. OPTIONAL — non-POS
   *  callers omit it (byte-identical payloads). The route validates required
   *  follow-ups against the config; create_order re-checks shape + a 16KB cap. */
  entryData: z
    .object({
      payment: z.record(z.string().max(120)).optional(),
      fields: z.record(z.string().max(400)).optional(),
    })
    .strict()
    .optional(),
}).superRefine((data, ctx) => {
  /* ⛔ OWNER RULING 2026-08-15 — CUSTOMER DELIVERY IS MANDATORY AT ORDER ENTRY.
     The wizard's "Confirm later" option is gone; this is the server half of the
     same rule, so a curl or a stale tab cannot file a dateless order either.
     The date is a PROMISE (`docs/orders/MASTER.md` — THE THREE DELIVERY DATES),
     and a promise nobody made is not a fact Operation can work from. */
  if (data.delivery.dateTbd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["delivery", "dateTbd"],
      message: "Delivery date is required. Ask the customer for the date before you save the order.",
    });
  }
  // Phase 11.1 — Proceed date pairs with Delivery date: both are required and
  // proceed date must be on/before the delivery date (you can't start building
  // after you promised delivery). ISO YYYY-MM-DD strings compare
  // lexicographically, so a plain `>` is correct.
  if (!data.delivery.date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery", "date"], message: "Delivery date is required. Ask the customer for the date before you save the order." });
  }
  if (!data.delivery.proceedDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery", "proceedDate"], message: "Proceed date is required. Choose the day production should start." });
  }
  if (data.delivery.date && data.delivery.proceedDate && data.delivery.proceedDate > data.delivery.date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery", "proceedDate"], message: "proceed date must be on or before the delivery date" });
  }
  // 0219 — the per-method approval-code requirement is CONFIG-DRIVEN now
  // (order_entry_config.approvalCodeRequired), so it's enforced in the route
  // against the resolved method — not here. The installment↔months pairing
  // stays universal (create_order re-raises 22023 on violation).
  if (data.paymentMethod === "installment" && data.installmentMonths === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentMonths"], message: "required for installment" });
  }
  if (data.paymentMethod !== "installment" && data.installmentMonths !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentMonths"], message: "only valid when paymentMethod is installment" });
  }
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type OrderAddonInput = z.infer<typeof orderAddonInputSchema>;

/**
 * POS-parity (MAINTAIN → New Order) — the RAW create input for INTERNAL roles
 * (principal/operation). Mirrors the 2990s Backend "New Sales Order": no POS
 * gates. Deliberately minimal vs `createOrderInputSchema`:
 *   - no signature / terms / payment method / emergency contact / billing
 *   - no lead-time floor — any (or no) delivery date; absent = TBD
 *   - lines are free TEXT skus (catalog OR fully custom, `order_lines.sku` has
 *     no FK) at operator-entered prices, persisted exactly as sent
 * The create_order RPC still enforces: dealer required, ≥1 line, and the
 * standing sofa ↔ mattress/bed-frame composition rule.
 */
const rawOrderLineInputSchema = z.object({
  sku: z.string().trim().min(1),
  qty: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
  /** POS-configurator spec attrs (colour / gap / options / fabric / specials /
   *  remark…), recorded for downstream display (PO / SO PDF / drawers). OPTIONAL
   *  — a bare raw line stays attrs-null. The route strips engine-marker keys
   *  (pwp / free_gift / free_item) so no order-path engine ever recognises a
   *  raw line as a marker line. */
  attrs: z.record(z.unknown()).nullable().optional(),
});

export const rawCreateOrderInputSchema = z.object({
  dealerId: z.string().uuid(),
  outletId: z.string().uuid().nullable().optional(),
  salespersonId: z.string().uuid().nullable().optional(),
  // POS-structure parity (Loo 2026-07-18) — the raw door now ACCEPTS the full
  // POS customer block, but everything beyond `name` stays optional/lenient:
  // this path records exactly what the operator entered, gating nothing.
  customer: z.object({
    name: z.string().trim().min(1),
    phone: z.string().trim().nullable().optional(),
    address: z.string().trim().nullable().optional(),
    addressUnknown: z.boolean().optional(),
    billing: z.string().trim().nullable().optional(),
    billingSame: z.boolean().optional(),
    /** Composed "name · phone · relationship" string (same as the POS submit). */
    emergency: z.string().trim().nullable().optional(),
    email: z.string().nullable().optional(),
    race: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    birthday: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    // 0230 — structured MY address parts, sent alongside the composed
    // `address` string (same lenient contract as the POS door).
    addressLine1: z.string().max(200).nullable().optional(),
    addressLine2: z.string().max(200).nullable().optional(),
    addressState: z.string().max(60).nullable().optional(),
    addressCity: z.string().max(120).nullable().optional(),
    addressPostcode: z.string().max(10).nullable().optional(),
  }),
  /** ISO YYYY-MM-DD. Null / absent = delivery date TBD. No lead-time floor and
   *  no not-in-the-past rule — the raw door accepts any date (backfill). */
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /** Production-start date. Persisted only when a deliveryDate is set (the
   *  create_order pairing); no today-floor on this path. */
  proceedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  deliveryFloor: z.number().int().min(1).max(MAX_DELIVERY_FLOOR).optional(),
  deliveryHasLift: z.boolean().optional(),
  deliveryStairItems: z.number().int().nonnegative().nullable().optional(),
  lines: z.array(rawOrderLineInputSchema).min(1),
  addons: z.array(orderAddonInputSchema).optional().default([]),
  paid: z.number().nonnegative().default(0),
  // Payment + signature — the POS Confirm structure, ALL optional ("fill it if
  // you have it"): a phone/backfill order creates fine with none of these.
  paymentMethod: z.string().trim().min(1).max(40).nullable().optional(),
  approvalCode: z.string().trim().nullable().optional(),
  installmentMonths: z.union([z.literal(6), z.literal(12)]).nullable().optional(),
  signaturePath: z.string().min(1).nullable().optional(),
  paymentSlipPath: z.string().min(1).nullable().optional(),
  termsAccepted: z.boolean().optional(),
  /** 0219 — POS entry extras (payment follow-up answers + custom form-field
   *  values). Same shape as the POS door. */
  entryData: z
    .object({
      payment: z.record(z.string().max(120)).optional(),
      fields: z.record(z.string().max(400)).optional(),
    })
    .strict()
    .optional(),
});
/** z.input — `paid` stays optional for the POSTing client. */
export type RawCreateOrderInput = z.input<typeof rawCreateOrderInputSchema>;
export type RawOrderLineInput = z.infer<typeof rawOrderLineInputSchema>;

/**
 * Phase 2C.1b — Blocker resolution mutation inputs. Each one targets a single
 * field on a Place order so the dealer can clear specific blockers without
 * going through the full edit modal. Server-side RPCs re-validate everything.
 */

export const topUpOrderInputSchema = z.object({
  amount: z.number().positive(),
  /** Internal method key. 0230 — widened from the hardcoded 5-value enum to
   *  any kebab key so the manual-payment panel can offer the SAME configurable
   *  methods as checkout (order_entry_config). The route validates the key
   *  against the active configured methods ∪ the legacy proto keys
   *  (cash/bank/cheque/online/card) so old clients keep working. */
  method: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "method must be a kebab-case key"),
  /** Human-readable label captured from the UI so the order_history line reads
   *  "Top-up RM 500 via Bank transfer" without the API needing a label table. */
  methodLabel: z.string().min(1),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  /** ISO date string (YYYY-MM-DD) when the dealer received the top-up. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Storage paths for receipt photos, validated by the route to live inside
   *  the caller's dealer folder. Up to 4 (proto matches that cap). */
  photoPaths: z.array(z.string()).max(4),
  idempotencyKey: z.string().uuid().optional(),
});
export type TopUpOrderInput = z.infer<typeof topUpOrderInputSchema>;

/** 0231/0232 — Add-product P1+P2 (design 2026-07-18): append products to a
 *  PLACE-lane order. Server price authority (Loo default #2): the route
 *  prices flat lines from the FRESH catalog + re-runs the special-addon /
 *  option-pick trust gates; a sofa BUILD line (attrs.sofa_build, P2) is
 *  re-run through `computeSofaPrice` + exploded server-side. `attrs` carries
 *  the configurator selections. Free markers are always rejected; a
 *  voucher-CODED pwp claim (attrs.pwp.code) is rejected (code-less stateless
 *  claims only — vouchers ride the wizard / a new order). */
const orderLineInputItemSchema = z.object({
  sku: z.string().trim().min(1),
  qty: z.number().int().min(1).max(99),
  attrs: z.record(z.unknown()).nullable().optional(),
  /** P2 — the client PREVIEW total for a sofa BUILD line only: the sofa
   *  recompute's ±0.5% drift gate compares it against the fresh server
   *  figure (create-route contract). IGNORED on every non-build line —
   *  flat lines stay fully server-priced. */
  unitPrice: z.number().nonnegative().optional(),
  /** P3 — human-readable line label for the operator's approval view
   *  (e.g. "Cloud Mattress · Queen"). Display-only: never persisted on
   *  the order_line (the RPC reads sku/qty/attrs/unit_price only). */
  label: z.string().max(120).optional(),
});

/** 0257 — a SERVICE add-on rides the post-create add doors (Loo 2026-07-25:
 *  "Dispose old sofa/mattress are SKUs too — same setting as opening a sales
 *  order"). Server price authority: the route re-prices from the `addons`
 *  config table (active + not the server-exclusive DELIVERY* keys); the
 *  client `unitPrice`/`label` are display-only previews for the approval
 *  view. `attrs` carries the 0242 per-unit size picks. */
const serviceAddonInputItemSchema = z.object({
  addonKey: z.string().trim().min(1),
  qty: z.number().int().min(1).max(99),
  attrs: z.record(z.unknown()).nullable().optional(),
  unitPrice: z.number().nonnegative().optional(),
  label: z.string().max(120).optional(),
});
export type ServiceAddonInputItem = z.infer<typeof serviceAddonInputItemSchema>;

export const addOrderLinesInputSchema = z
  .object({
    lines: z.array(orderLineInputItemSchema).max(10).optional().default([]),
    /** 0257 — service add-ons appended alongside (or instead of) lines. */
    addons: z.array(serviceAddonInputItemSchema).max(10).optional().default([]),
  })
  .refine((v) => v.lines.length + v.addons.length >= 1, {
    message: "at least one line or add-on is required",
  });
export type AddOrderLinesInput = z.infer<typeof addOrderLinesInputSchema>;

/** 0255 — Order line EDIT (Loo 2026-07-25): re-configure an existing
 *  PLACE-lane item via the pencil on the My-orders drawer. `targetLineIds`
 *  names the row(s) being replaced — ONE flat line, or the FULL exploded
 *  sofa group (every row sharing the sofa_build_key). `line` is the
 *  re-configured replacement, priced through the SAME server pipeline as an
 *  add. The one business rule — up-sell only (new total ≥ old total) — is
 *  enforced in the RPC (details `downsell_blocked`). */
export const replaceOrderLinesInputSchema = z.object({
  targetLineIds: z.array(z.string().uuid()).min(1).max(30),
  line: orderLineInputItemSchema,
});
export type ReplaceOrderLinesInput = z.infer<typeof replaceOrderLinesInputSchema>;

/** 0258 — edit a SERVICE add-on row (Loo 2026-07-25 S0-1255: "service sku
 *  need to be editable as well"). Qty + per-unit sizes only; the row's
 *  unit_price snapshot never changes, so the up-sell law reduces to
 *  qty ≥ current (RPC detail `downsell_blocked`). DELIVERY* rows are
 *  server-owned and never editable. */
export const editOrderAddonInputSchema = z.object({
  qty: z.number().int().min(1).max(99),
  /** 0242 sizes: for a sized addon the route requires attrs.sizes (one per
   *  unit) + the composed attrs.size summary; size-less addons omit attrs. */
  attrs: z.record(z.unknown()).nullable().optional(),
});
export type EditOrderAddonInput = z.infer<typeof editOrderAddonInputSchema>;

/** 0233 — P3 change-request lifecycle. 0257 widens `kind`: 'replace_lines'
 *  is the proceed-lane "change an ORIGINAL item" submission (Loo 2026-07-25),
 *  applied at approval through the same replace pipeline as the place-lane
 *  pencil (0255/0256) — up-sell only, thread-virgin lines only. */
export const orderChangeRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);
export const orderChangeRequestKindSchema = z.enum(["add_lines", "replace_lines", "edit_addon"]);
export const orderChangeRequestSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  kind: orderChangeRequestKindSchema,
  /** The submitted payload verbatim. add_lines → lines/addons (sku/qty/attrs
   *  + preview unitPrice/label). replace_lines → targetLineIds + targetLines
   *  (display snapshot of the rows being replaced) + line (the replacement). */
  payload: z.object({
    lines: z.array(z.record(z.unknown())).optional(),
    addons: z.array(z.record(z.unknown())).optional(),
    targetLineIds: z.array(z.string()).optional(),
    targetLines: z.array(z.record(z.unknown())).optional(),
    line: z.record(z.unknown()).optional(),
    /** 0258 — edit_addon kind: the order_addons row being edited + the new
     *  qty/attrs (+ display snapshot for the operator's old→new view). */
    targetAddonId: z.string().optional(),
    qty: z.number().optional(),
    attrs: z.record(z.unknown()).nullable().optional(),
    label: z.string().optional(),
    oldQty: z.number().optional(),
    oldSize: z.string().nullable().optional(),
  }),
  status: orderChangeRequestStatusSchema,
  requestedBy: z.string().uuid().nullable(),
  requestedAt: z.string(),
  decidedBy: z.string().uuid().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  appliedAt: z.string().nullable(),
});
export type OrderChangeRequestDto = z.infer<typeof orderChangeRequestSchema>;

/** 0257 — POST /:id/change-requests + …/edit body. Backward compatible: a
 *  body without `kind` (the pre-0257 web) parses as the add variant. The
 *  replace variant carries the target row ids + a display snapshot of the
 *  old rows (server-side truth is re-read at approval; the snapshot only
 *  feeds the operator's old→new view). */
const submitChangeAddVariantSchema = z
  .object({
    kind: z.literal("add_lines").optional(),
    lines: z.array(orderLineInputItemSchema).max(10).optional().default([]),
    addons: z.array(serviceAddonInputItemSchema).max(10).optional().default([]),
  })
  .refine((v) => v.lines.length + v.addons.length >= 1, {
    message: "at least one line or add-on is required",
  });
const submitChangeReplaceVariantSchema = z.object({
  kind: z.literal("replace_lines"),
  targetLineIds: z.array(z.string().uuid()).min(1).max(30),
  targetLines: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        sku: z.string().min(1),
        qty: z.number().int().min(1),
        unitPrice: z.number().nonnegative().optional(),
        label: z.string().max(120).optional(),
      }),
    )
    .max(30)
    .optional(),
  line: orderLineInputItemSchema,
});
/** 0258 — proceed-lane service add-on edit: qty/sizes on ONE order_addons
 *  row, applied at approval via `edit_order_addon`. oldQty/oldSize are the
 *  display snapshot for the operator's old→new view. */
const submitChangeEditAddonVariantSchema = z.object({
  kind: z.literal("edit_addon"),
  targetAddonId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
  attrs: z.record(z.unknown()).nullable().optional(),
  label: z.string().max(120).optional(),
  oldQty: z.number().int().min(1).optional(),
  oldSize: z.string().max(200).nullable().optional(),
});
export const submitOrderChangeRequestInputSchema = z.union([
  submitChangeReplaceVariantSchema,
  submitChangeEditAddonVariantSchema,
  submitChangeAddVariantSchema,
]);
export type SubmitOrderChangeRequestInput = z.infer<typeof submitOrderChangeRequestInputSchema>;

/** POST /:id/change-requests/:reqId/decide body. `note` is surfaced to the
 *  dealer on reject (the UI encourages it; the server stays lenient). */
export const decideOrderChangeRequestInputSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(500).nullable().optional(),
});
export type DecideOrderChangeRequestInput = z.infer<typeof decideOrderChangeRequestInputSchema>;

export const setOrderAddressInputSchema = z.object({
  /** Composed address string the wizard would have written. The RPC stores
   *  it as-is; the `MYAddressFields` cascade is unmounted on submit. */
  address: z.string().min(5),
  billing: z.string().nullable(),
  billingSame: z.boolean(),
  /** 0230 — the structured parts the modal's MYAddressFields collected,
   *  persisted alongside the composed string so the POS detail drawer can
   *  repopulate its dropdowns. OPTIONAL: absent = legacy flat write (the RPC
   *  clears any previously-stored parts). */
  parts: z
    .object({
      line1: z.string().max(200),
      line2: z.string().max(200).optional(),
      state: z.string().max(60),
      city: z.string().max(120),
      postcode: z.string().max(10),
    })
    .optional(),
});
export type SetOrderAddressInput = z.infer<typeof setOrderAddressInputSchema>;

export const setOrderDateInputSchema = z.object({
  /** ISO date string (YYYY-MM-DD). The RPC rejects nulls; the wizard's
   *  separate `dateTbd` checkbox is what flips the order back to TBD via the
   *  full edit modal. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Phase 11.1 — confirming a previously-TBD order now sets BOTH dates (the
   *  proceed date pairs with the delivery date). Must be on/before `date`. */
  proceedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).refine((v) => v.proceedDate <= v.date, {
  path: ["proceedDate"],
  message: "proceed date must be on or before the delivery date",
});
export type SetOrderDateInput = z.infer<typeof setOrderDateInputSchema>;

/**
 * Phase 2C.2 — Full edit input. All fields optional; the RPC only updates
 * keys that are present in the payload. The Hono route converts this
 * camelCase shape to the snake_case the `update_order` RPC consumes.
 */
/** THE cancellation input — one door for one act (SO V2 Cancel slice, 0350).
 *
 *  **The reason is REQUIRED.** A cancelled customer transaction that cannot
 *  say why is an audit row that answers nothing, and the MASTER's cancellation
 *  ruling has always read "permission, reason, ... and immutable audit". The
 *  RPC raises `reason_required` on a blank one; this stops it at the boundary
 *  so the caller gets the field back, not a 422 about the database.
 *
 *  Nothing live regressed when this tightened: both POS Stripe pending-order
 *  paths already pass a real sentence. The only door that permitted a blank
 *  reason was rendered by nothing and is gone. */
export const cancelOrderInputSchema = z.object({
  reason: z.string().trim().min(1, "A cancellation says why").max(2000),
});
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

export const updateOrderInputSchema = z
  .object({
    customer: z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().regex(/^[0-9-+\s]{8,}/).optional(),
        /** 0220 — POS proceed-lane edits. Editable email (0200 column); pass
         *  null (or an empty string, coerced here) to clear it. */
        email: z.preprocess(
          (v) => (typeof v === "string" && v.trim() === "" ? null : v),
          z.string().trim().max(320).email().nullable(),
        ).optional(),
        address: z.string().nullable().optional(),
        addressUnknown: z.boolean().optional(),
        // 0230 — structured MY address parts. The RPC enforces they only ride
        // WITH `address` (never alone) and that a flat-only `address` write
        // clears any stored parts.
        addressLine1: z.string().max(200).nullable().optional(),
        addressLine2: z.string().max(200).nullable().optional(),
        addressState: z.string().max(60).nullable().optional(),
        addressCity: z.string().max(120).nullable().optional(),
        addressPostcode: z.string().max(10).nullable().optional(),
        billing: z.string().nullable().optional(),
        billingSame: z.boolean().optional(),
        emergency: z.string().min(1).optional(),
      })
      .optional(),
    delivery: z
      .object({
        date: z.string().nullable().optional(),
        // Phase 11.1 — editable alongside the delivery date on a Place order.
        proceedDate: z.string().nullable().optional(),
        dateTbd: z.boolean().optional(),
        floor: z.number().int().min(1).max(MAX_DELIVERY_FLOOR).optional(),
        hasLift: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((v) => !!v.customer || !!v.delivery, {
    message: "At least one of customer / delivery must be provided",
  });
export type UpdateOrderInput = z.infer<typeof updateOrderInputSchema>;

// 0136 — Inbox triage assignment. Pass null to clear (return to Inbox).
export const setOpsAssignedLogisticInputSchema = z.object({
  deliveryPartnerId: z.string().uuid().nullable(),
});
export type SetOpsAssignedLogisticInput = z.infer<
  typeof setOpsAssignedLogisticInputSchema
>;

export const dealerSelfSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  region: z.string().nullable(),
  contact: z.string().nullable(),
  joinedDate: z.string().nullable(),
  status: z.enum(["active", "suspended", "pending"]),
  creditLimit: z.number(),
  paymentTerms: z.string().nullable(),
  depositBalance: z.number(),
  channel: z.string(),
});
export type DealerSelf = z.infer<typeof dealerSelfSchema>;
