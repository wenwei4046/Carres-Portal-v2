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
  "proceed_request",
  "awaiting_operation_action",
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
  }),
  delivery: z.object({
    date: z.string().nullable(),
    dateTbd: z.boolean(),
    floor: z.number(),
    hasLift: z.boolean(),
    stairItems: z.number().int().nonnegative().nullable(),
  }),
  paid: z.number(),
  signatureUrl: z.string().nullable(),
  paymentSlipUrl: z.string().nullable(),
  termsAccepted: z.boolean(),
  paymentMethod: z.enum(["online", "credit", "installment"]).nullable(),
  approvalCode: z.string().nullable(),
  installmentMonths: z.union([z.literal(6), z.literal(12)]).nullable(),
  operationStage: operationStageSchema.nullable(),
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
  }),
  delivery: z.object({
    date: z.string().nullable(),
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
  /** Payment instrument used at order time. Persisted as `orders.payment_method`
   *  (DB CHECK gates the enum). Phase 2D's payments table will reference this
   *  for full-payment workflows; this field always represents the *initial*
   *  deposit method. */
  paymentMethod: z.enum(["online", "credit", "installment"]),
  /** Bank/EDC approval code from the slip, when method ∈ {credit, installment}.
   *  Required for those methods (≥ 3 chars), null for "online". The wizard
   *  enforces the ≥3 rule; the schema accepts any non-empty string when given. */
  approvalCode: z.string().nullable(),
  /** Installment plan months. Only valid when paymentMethod === "installment".
   *  RPC re-checks the cross-field rule and rejects with 22023. */
  installmentMonths: z.union([z.literal(6), z.literal(12)]).nullable(),
}).superRefine((data, ctx) => {
  if (data.paymentMethod === "installment") {
    if (data.installmentMonths === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentMonths"], message: "required for installment" });
    }
    if (!data.approvalCode || data.approvalCode.trim().length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approvalCode"], message: "approval code must be ≥3 chars for installment" });
    }
  }
  if (data.paymentMethod === "credit") {
    if (!data.approvalCode || data.approvalCode.trim().length < 3) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["approvalCode"], message: "approval code must be ≥3 chars for credit" });
    }
  }
  if (data.paymentMethod !== "installment" && data.installmentMonths !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["installmentMonths"], message: "only valid when paymentMethod is installment" });
  }
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type OrderAddonInput = z.infer<typeof orderAddonInputSchema>;

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
