import { z } from "zod";

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

export const logisticsStageSchema = z.enum([
  "awaiting_stock",
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
  dl: z.number().int(),
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
  }),
  paid: z.number(),
  signatureUrl: z.string().nullable(),
  termsAccepted: z.boolean(),
  logisticsStage: logisticsStageSchema.nullable(),
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
    floor: z.number().int().min(1),
    hasLift: z.boolean(),
  }),
  lines: z.array(orderLineInputSchema).min(1),
  addons: z.array(orderAddonInputSchema).default([]),
  paid: z.number().nonnegative(),
  signaturePath: z.string().min(1),
  paymentSlipPath: z.string().nullable(),
  termsAccepted: z.literal(true),
  depositPct: z.number().int().min(0).max(100),
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;
export type OrderLineInput = z.infer<typeof orderLineInputSchema>;
export type OrderAddonInput = z.infer<typeof orderAddonInputSchema>;

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
