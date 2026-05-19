/**
 * camelCase domain types — UI code uses these. Adapters in `adapters.ts`
 * convert from snake_case DB rows to these.
 */

import type { CostSource, OperationStage } from "./db-types";

// Re-exported so UI code can write `import type { CostSource } from
// "@carres/shared/domain"` alongside the rest of the camelCase surface.
// The enum labels themselves are 1:1 with DB (snake-cased like the other DB
// enums consumed in domain types — see Order.status, PartnerStage, etc.).
export type { CostSource };

export type Role =
  | "principal" | "dealer" | "salesperson" | "showroom"
  | "operation" | "supplier" | "partner" | "finance" | "bd";

export interface Dealer {
  id: string;
  name: string;
  region: string | null;
  contact: string | null;
  joinedDate: string | null;
  status: "active" | "suspended" | "pending";
  creditLimit: number;
  paymentTerms: string | null;
  depositBalance: number;
  channel: string;
}

export interface Outlet {
  id: string;
  dealerId: string;
  name: string;
  address: string;
}

export interface Salesperson {
  id: string;
  dealerId: string;
  outletId: string | null;
  name: string;
  phone: string | null;
  userId: string | null;
}

export interface ProductModel {
  id: string;
  category: "mattress" | "bedframe" | "sofa";
  modelKey: string;
  name: string;
  blurb: string | null;
  colors: string[] | null;
  gaps: string[] | null;
  sofaMode: "preset" | "custom" | "both" | null;
  // 0074 — soft-delete flag for the catalog admin UI (Loo 2026-05-09).
  discontinuedAt?: string | null;
}

export interface ProductSku {
  id: string;
  modelId: string;
  sku: string;
  variant: string;
  variantKind: "size" | "preset" | "part";
  price: number;
  // 0074 — fixed procurement cost per unit; auto-fills onto every Create-PO
  // line. Null = not yet set (Create-PO refuses lines whose SKU has null cost).
  cost: number | null;
  // 2026-05-17 (Loo A→Z test bug A) — SKU-level supplier ownership. The DB
  // column has been NOT NULL since migration 0074; surfacing it on the DTO
  // lets CreatePOModal route lines to the right supplier group directly
  // instead of parsing a `category:model:variant` prefix from the SKU string
  // (the proto-era convention that's no longer how SKUs are formatted).
  supplierId: string | null;
  discontinuedAt?: string | null;
}

export interface SofaFabric {
  id: string;
  modelId: string;
  fabricName: string;
  surcharge: number;
  // 0075 — fabric color options (Loo 2026-05-09). Mirrors bedframe
  // product_models.colors[] pattern.
  colors: string[] | null;
  discontinuedAt?: string | null;
}

export interface Addon {
  key: string;
  name: string;
  price: number;
  active: boolean;
}

export interface FloorConfig {
  id: number;
  freeUpToFloor: number;
  perFloorPerItem: number;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  leadTime: string | null;
  kind: "own_logistics" | "factory_pickup";
  catCovered: string[];
  // Stable slug (migration 0032, v3-S4) — NOT NULL post-migration. Seeded as
  // 'hookka' / 'nice-future'; used by SUPPLIER_SOP routing in sops.ts.
  slug: string;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  contact: string | null;
  zones: string | null;
  onboardedDate: string | null;
  rateCard: Record<string, { base: number; perFloorWalkUp: number; perKm: number }> | null;
}

export interface PartnerFleet {
  id: string;
  partnerId: string;
  plate: string;
  vehicleType: string;
  capacity: string | null;
  driverName: string | null;
  driverPhone: string | null;
}

export interface StockBalance {
  sku: string;
  warehouseId: string;
  qty: number;
  // Reserved-against-pending-orders count (migration 0018). Phase 4 M5
  // warehouse + drawer views need it to compute available = qty - reserved.
  reserved: number;
}

export interface StockMovement {
  id: string;
  sku: string;
  warehouseId: string;
  qty: number;
  kind: "in" | "out" | "adjust";
  ref: string | null;
  note: string | null;
  byRole: Role | null;
  occurredAt: string;
}

export interface OrderLine {
  id: string;
  orderId: string;
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
  unitPrice: number;
}

/**
 * Order addon (e.g. disposal services). `attrs` is a free-form jsonb added
 * by migration 0133 — currently used for disposal size tag, e.g.
 * `{ size: "King" }` / `{ size: "2-seater" }`. Optional so old fixtures
 * still compile.
 */
export interface OrderAddon {
  id: string;
  orderId: string;
  addonKey: string;
  qty: number;
  unitPrice: number;
  attrs?: Record<string, unknown> | null;
}

export interface OrderHistory {
  id: string;
  orderId: string;
  text: string;
  byRole: Role | null;
  occurredAt: string;
}

export interface Order {
  id: string;
  so: number;
  status: "place" | "proceed_order" | "delivered" | "cancelled";
  channel: string;
  dealerId: string;
  outletId: string | null;
  salespersonId: string | null;

  customer: {
    name: string;
    phone: string | null;
    address: string | null;
    addressUnknown: boolean;
    billing: string | null;
    billingSame: boolean;
    emergency: string | null;
  };

  delivery: {
    date: string | null;
    dateTbd: boolean;
    floor: number;
    hasLift: boolean;
    /** Count of items the dealer marked as needing stair-carry. NULL = dealer
     *  left it auto, callers fall back to sum(line.qty) for backward compat. */
    stairItems: number | null;
  };

  paid: number;
  signatureUrl: string | null;
  paymentSlipUrl: string | null;
  termsAccepted: boolean;
  paymentMethod: "online" | "credit" | "installment" | null;
  approvalCode: string | null;
  installmentMonths: 6 | 12 | null;

  // v3-S3 (migration 0028) added `awaiting_operation_action` + `waiting`.
  // Phase 4.5a (2026-05-05): legacy `awaiting_stock` value fully removed —
  // T5 swept FE/tests, T6 (migration 0040) dropped it from the DB enum.
  // operation_stage now matches this union 1:1.
  operationStage:
    | "placed" | "proceed_request"
    | "awaiting_operation_action"
    | "ready_to_dispatch" | "dispatched"
    | "waiting" | "delivered"
    | null;
  warehouseId: string | null;
  deliveryPartnerId: string | null;
  partnerStage: "assigned" | "picked_from_wh" | "en_route" | "delivered" | null;
  partnerPickedAt: string | null;
  partnerEta: string | null;
  doNumber: string | null;
  doNote: string | null;
  // operation timestamps (migration 0019). dispatchedAt set on D1 step 1;
  // deliveredAt set on D1 step 2 (DO attach + sign).
  dispatchedAt: string | null;
  deliveredAt: string | null;

  invoiceNo: string | null;
  invoicedAt: string | null;

  placedAt: string;

  lines?: OrderLine[];
  addons?: OrderAddon[];
  history?: OrderHistory[];
}

/**
 * camelCase mirror of `OrderSupplierThreadRow` (migration 0033, v3-S4). One row
 * per (order, supplier, category). Drives the v3 operation pipeline so each
 * fulfillment slice of an order has its own SOP-driven kanban presence.
 *
 * `sopName` mirrors `SopName` from `sops.ts` ('STANDARD' | 'SOFA_SPECIAL').
 * `history` is a jsonb append log defaulting to `[]`.
 */
export interface OrderSupplierThread {
  id: string;
  orderId: string;
  supplierId: string;
  category: string;
  sopName: "STANDARD" | "SOFA_SPECIAL";
  // Mirrors `OrderSupplierThreadRow.operation_stage` which is non-null
  // (migration 0033 line 51 declares the column NOT NULL). Reuses the named
  // `operationStage` type from db-types.ts so FE and DB stay 1:1 if the enum
  // changes.
  operationStage: OperationStage;
  poId: string | null;
  warehouseId: string | null;
  reservedAt: string | null;
  deliveredAt: string | null;
  // Phase 4.5 Chunk 2 customer-leg LP fields (migration 0049). Per-leg split
  // per Chunk 2 design spec §3 (CQ1 = option (b)): customer-leg LP +
  // RFD/accept/reject timestamps live on the thread, while the procurement-leg
  // LP lives on `purchase_orders.procurement_partner_id` (renamed from
  // `delivery_partner_id` in Sprint C migration 0052). Mirrors
  // `OrderSupplierThreadRow` snake_case fields 1:1.
  deliveryPartnerId: string | null;
  confirmDeliveryDate: string | null;
  requestForDeliveryAt: string | null;
  partnerAcceptedAt: string | null;
  partnerRejectedAt: string | null;
  // Supplier per-thread pickup feature (migration 0107). Mirrors snake_case
  // `OrderSupplierThreadRow.supplier_ready_at` / `_by` / `pickup_event_id` 1:1.
  supplierReadyAt: string | null;
  supplierReadyBy: string | null;
  pickupEventId: string | null;
  history: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  so: number | null;
  // Cross-order bundle backrefs (migration 0017). See PurchaseOrderRow comment.
  soRefs: number[] | null;
  supplierId: string;
  warehouseId: string;
  // Single-sku/qty columns dropped in 0017 — lines live in purchase_order_lines.
  status: "open" | "received" | "cancelled";
  // v3-S3 (migration 0030) added 6 values for the HoOKkA Sofa flow.
  // Phase 4.5 Chunk 1 (migration 0043) appended `at_warehouse_waiting` for the
  // Sofa Reject + Relocate + Receive flow; mirrors DB.POSupStatus.
  supStatus:
    | "pending" | "acknowledged" | "in_production"
    | "shipped" | "delivered"
    | "ready_for_pickup" | "pickup_assigned" | "pickup_accepted" | "picked_up" | "reassign_needed"
    | "ready_confirm_sent" | "partner_confirmed" | "customer_rejected"
    | "relocated" | "at_partner_wh" | "at_own_wh_waiting"
    | "at_warehouse_waiting";
  // Procurement-leg LP — renamed from `deliveryPartnerId` in Phase 4.5 Chunk 2
  // Sprint C migration 0052. Customer-leg LP now lives on
  // `OrderSupplierThread.deliveryPartnerId` (per-leg split). Mirrors
  // `PurchaseOrderRow.procurement_partner_id`.
  procurementPartnerId: string | null;
  expectedReadyDate: string | null;
  pickupDate: string | null;
  etaDate: string | null;
  payStatus: "unpaid" | "scheduled" | "paid";
  placedAt: string;
  // Optionally hydrated by detail handlers via PostgREST nested fetch.
  lines?: PurchaseOrderLine[];
}

/**
 * Child rows of a PO (migration 0017). Phase 4.5 Chunk 2 Sprint E migration
 * 0055 added `cost` + `costSource` — both nullable because legacy rows have
 * no historical cost recorded (CQ3 backfill NULL).
 */
export interface PurchaseOrderLine {
  poId: string;
  sku: string;
  qty: number;
  receivedQty: number;
  // Migration 0055. numeric(14,2) → number passthrough; null on legacy rows.
  cost: number | null;
  // Migration 0055. Mirrors `PurchaseOrderLineRow.cost_source` 1:1.
  costSource: CostSource | null;
}

export interface Payment {
  id: string;
  direction: "in" | "out";
  amount: number;
  method:
    | "cash" | "bank_transfer" | "cheque" | "credit_card"
    | "debit_card" | "duitnow_qr" | "dealer_deposit";
  reference: string | null;
  note: string | null;
  paidAt: string;
  orderId: string | null;
  poId: string | null;
  refundId: string | null;
  receiptUrl: string | null;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  orderId: string;
  amount: number;
  taxAmount: number;
  issuedAt: string;
  voidedAt: string | null;
  pdfUrl: string | null;
}

export interface Refund {
  id: string;
  orderId: string;
  dealerId: string | null;
  amount: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  approvalId: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  creditNoteNo: string | null;
}

export interface Approval {
  id: string;
  kind: "refund" | "discount" | "new_dealer" | "top_up" | "price_change" | "other";
  title: string;
  actor: string | null;
  refersTo: string | null;
  amount: number | null;
  dealerId: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  role: Role | null;
  actorText: string | null;
  action: string;
  dealerId: string | null;
  ref: string | null;
  occurredAt: string;
}

export interface Inquiry {
  id: string;
  kind: "new_dealer" | "expansion" | "product";
  company: string;
  region: string | null;
  contact: string | null;
  stage: "new" | "contacted" | "qualified" | "converted" | "lost";
  ownerUserId: string | null;
  note: string | null;
  linkedDealerId: string | null;
  createdAt: string;
}

/**
 * Supplier per-thread pickup feature (migration 0107). Urgency is a derived
 * UI badge for `ThreadReadinessRow`, ranked by customer delivery date proximity:
 *   - critical  → delivery date is past or within 3 days
 *   - urgent    → 4-7 days out
 *   - normal    → 8+ days, null, or unset
 */
export type Urgency = "critical" | "urgent" | "normal";

/**
 * camelCase mirror of `PoPickupEventsRow` (migration 0107). One row per
 * physical DO paper / one trip. Created when a partner or operation user
 * batch-picks one or more ready threads off a PO; the new event id is then
 * stamped onto every collected thread (`OrderSupplierThread.pickupEventId`).
 *
 * `ackRole` records which side recorded the pickup — partner (factory_pickup
 * supplier) or operation (own_logistics supplier delivers to HQ warehouse).
 */
export type PickupEvent = {
  id: string;
  poId: string;
  doNumber: string;
  doFilePath: string | null;
  doNote: string | null;
  pickedUpAt: string;
  pickedUpBy: string | null;
  ackRole: "partner" | "operation";
  createdAt: string;
};

/**
 * Hydrated row shape for the per-thread readiness UI (supplier "Ready" tab +
 * partner pickup batch screen + operation receive-threads screen). Joins
 * `order_supplier_threads` with parent order customer fields + the optional
 * pickup event DO number.
 *
 * `skuLines` lists the per-thread SKU breakdown so users can verify the
 * physical goods match what they're acknowledging. Sourced from the threaded
 * subset of `order_lines` filtered by `(order_id, category)`.
 */
export type ThreadReadinessRow = {
  threadId: string;
  orderId: string;
  orderDl: number;
  customerName: string;
  customerDeliveryDate: string | null;
  supplierReadyAt: string | null;
  pickupEventId: string | null;
  pickupDoNumber: string | null;
  skuLines: Array<{ sku: string; qty: number }>;
};
