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

export const operationStageSchema = z.enum([
  "placed",
  "confirmed",
  "in_production",
  "ready_to_dispatch",
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
  }),
  delivery: z.object({
    date: z.string().nullable(),
    // Phase 11.1 — proceed date pairs with `date` (both-or-neither via
    // `dateTbd`) and must be <= `date`. Cross-field rules in the superRefine.
    proceedDate: z.string().nullable(),
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
  // Phase 11.1 — Proceed date pairs with Delivery date. When the order is NOT
  // marked TBD, both dates are required and proceed date must be on/before the
  // delivery date (you can't start building after you promised delivery). ISO
  // YYYY-MM-DD strings compare lexicographically, so a plain `>` is correct.
  if (!data.delivery.dateTbd) {
    if (!data.delivery.date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery", "date"], message: "delivery date is required unless marked TBD" });
    }
    if (!data.delivery.proceedDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery", "proceedDate"], message: "proceed date is required unless marked TBD" });
    }
    if (data.delivery.date && data.delivery.proceedDate && data.delivery.proceedDate > data.delivery.date) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["delivery", "proceedDate"], message: "proceed date must be on or before the delivery date" });
    }
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
});

export const rawCreateOrderInputSchema = z.object({
  dealerId: z.string().uuid(),
  outletId: z.string().uuid().nullable().optional(),
  salespersonId: z.string().uuid().nullable().optional(),
  customer: z.object({
    name: z.string().trim().min(1),
    phone: z.string().trim().nullable().optional(),
    address: z.string().trim().nullable().optional(),
  }),
  /** ISO YYYY-MM-DD. Null / absent = delivery date TBD. */
  deliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  lines: z.array(rawOrderLineInputSchema).min(1),
  paid: z.number().nonnegative().default(0),
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
  /** Internal method key — matches reference/proto's TopUpDepositModal options. */
  method: z.enum(["cash", "bank", "cheque", "online", "card"]),
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
});
export type TopUpOrderInput = z.infer<typeof topUpOrderInputSchema>;

export const setOrderAddressInputSchema = z.object({
  /** Composed address string the wizard would have written. The RPC stores
   *  it as-is; the `MYAddressFields` cascade is unmounted on submit. */
  address: z.string().min(5),
  billing: z.string().nullable(),
  billingSame: z.boolean(),
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
/** Phase 2C.3 — dealer cancel input. Reason is optional but the UI
 *  encourages it (audit trail value). RPC trims + nulls empty strings. */
export const cancelOrderInputSchema = z.object({
  reason: z.string().nullable(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderInputSchema>;

export const updateOrderInputSchema = z
  .object({
    customer: z
      .object({
        name: z.string().min(2).optional(),
        phone: z.string().regex(/^[0-9-+\s]{8,}/).optional(),
        address: z.string().nullable().optional(),
        addressUnknown: z.boolean().optional(),
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
