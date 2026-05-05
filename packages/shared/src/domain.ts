/**
 * camelCase domain types — UI code uses these. Adapters in `adapters.ts`
 * convert from snake_case DB rows to these.
 */

export type Role =
  | "principal" | "dealer" | "salesperson" | "showroom"
  | "logistics" | "supplier" | "partner" | "finance" | "bd";

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
}

export interface ProductSku {
  id: string;
  modelId: string;
  sku: string;
  variant: string;
  variantKind: "size" | "preset" | "part";
  price: number;
}

export interface SofaFabric {
  id: string;
  modelId: string;
  fabricName: string;
  surcharge: number;
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

export interface OrderAddon {
  id: string;
  orderId: string;
  addonKey: string;
  qty: number;
  unitPrice: number;
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
  dl: number;
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
  };

  paid: number;
  signatureUrl: string | null;
  paymentSlipUrl: string | null;
  termsAccepted: boolean;
  paymentMethod: "online" | "credit" | "installment" | null;
  approvalCode: string | null;
  installmentMonths: 6 | 12 | null;

  // v3-S3 (migration 0028) added `awaiting_logistics_action` + `waiting`.
  // Phase 4.5a (2026-05-05): legacy `awaiting_stock` value fully removed —
  // T5 swept FE/tests, T6 (migration 0040) dropped it from the DB enum.
  // logistics_stage now matches this union 1:1.
  logisticsStage:
    | "placed" | "proceed_request"
    | "awaiting_logistics_action"
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
  // Logistics timestamps (migration 0019). dispatchedAt set on D1 step 1;
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

export interface PurchaseOrder {
  id: string;
  dl: number | null;
  // Cross-order bundle backrefs (migration 0017). See PurchaseOrderRow comment.
  dlRefs: number[] | null;
  supplierId: string;
  warehouseId: string;
  // Single-sku/qty columns dropped in 0017 — lines live in purchase_order_lines.
  status: "open" | "received" | "cancelled";
  // v3-S3 (migration 0030) added 6 values for the HoOKkA Sofa flow.
  supStatus:
    | "pending" | "acknowledged" | "in_production"
    | "shipped" | "delivered"
    | "ready_for_pickup" | "pickup_assigned" | "pickup_accepted" | "picked_up" | "reassign_needed"
    | "ready_confirm_sent" | "partner_confirmed" | "customer_rejected"
    | "relocated" | "at_partner_wh" | "at_own_wh_waiting";
  deliveryPartnerId: string | null;
  expectedReadyDate: string | null;
  pickupDate: string | null;
  etaDate: string | null;
  payStatus: "unpaid" | "scheduled" | "paid";
  placedAt: string;
  // Optionally hydrated by detail handlers via PostgREST nested fetch.
  lines?: PurchaseOrderLine[];
}

/** Child rows of a PO (migration 0017). */
export interface PurchaseOrderLine {
  poId: string;
  sku: string;
  qty: number;
  receivedQty: number;
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
