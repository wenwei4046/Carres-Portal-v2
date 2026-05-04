/**
 * Database row types — match Postgres schema in supabase/migrations/0001_init.sql.
 * These are snake_case (Postgres convention). Use the camelCase domain types in
 * `domain.ts` for UI code.
 */
export type Role =
  | "principal" | "dealer" | "salesperson" | "showroom"
  | "logistics" | "supplier" | "partner" | "finance" | "bd";

export type OrderStatus       = "place" | "proceed_order" | "delivered" | "cancelled";
// `awaiting_logistics_action` and `waiting` added in migration 0028 (v3-S3).
// `awaiting_stock` retained as alias for legacy code paths still matching against it.
export type LogisticsStage    =
  | "placed" | "proceed_request"
  | "awaiting_logistics_action" | "awaiting_stock"
  | "ready_to_dispatch" | "dispatched"
  | "waiting" | "delivered";
export type PartnerStage      = "assigned" | "picked_from_wh" | "en_route" | "delivered";
export type POStatus          = "open" | "received" | "cancelled";
// 6 new values appended in migration 0030 (v3-S3) for the HoOKkA Sofa flow:
// ready_confirm -> partner confirm -> (customer_rejected -> relocated)? ->
// at_partner_wh | at_own_wh_waiting.
export type POSupStatus       =
  | "pending" | "acknowledged" | "in_production"
  | "shipped" | "delivered"
  | "ready_for_pickup" | "pickup_assigned" | "pickup_accepted" | "picked_up" | "reassign_needed"
  | "ready_confirm_sent" | "partner_confirmed" | "customer_rejected"
  | "relocated" | "at_partner_wh" | "at_own_wh_waiting";
export type POPayStatus       = "unpaid" | "scheduled" | "paid";
export type PaymentMethod     =
  | "cash" | "bank_transfer" | "cheque" | "credit_card"
  | "debit_card" | "duitnow_qr" | "dealer_deposit";
export type PaymentDir        = "in" | "out";
export type RefundStatus      = "pending" | "approved" | "rejected" | "paid";
export type ApprovalKind      = "refund" | "discount" | "new_dealer" | "top_up" | "price_change" | "other";
export type ApprovalStatus    = "pending" | "approved" | "rejected";
export type InquiryKind       = "new_dealer" | "expansion" | "product";
export type InquiryStage      = "new" | "contacted" | "qualified" | "converted" | "lost";
export type ProductCategory   = "mattress" | "bedframe" | "sofa";
export type VariantKind       = "size" | "preset" | "part";
export type StockMovementKind = "in" | "out" | "adjust";
// Migration 0027 (v3-S3). 'own' = HQ-controlled warehouse (default for legacy
// rows). 'logistics_partner' = partner-owned WH; pairs with owning_partner_id
// on warehouses (CHECK constraint warehouses_partner_kind_check).
export type WarehouseKind     = "own" | "logistics_partner";

export interface DealerRow {
  id: string;
  name: string;
  region: string | null;
  contact: string | null;
  joined_date: string | null;
  status: "active" | "suspended" | "pending";
  credit_limit: number;
  payment_terms: string | null;
  deposit_balance: number;
  channel: string;
  created_at: string;
  updated_at: string;
}

export interface OutletRow {
  id: string;
  dealer_id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface SalespersonRow {
  id: string;
  dealer_id: string;
  outlet_id: string | null;
  name: string;
  phone: string | null;
  user_id: string | null;
  created_at: string;
}

export interface ProductModelRow {
  id: string;
  category: ProductCategory;
  model_key: string;
  name: string;
  blurb: string | null;
  colors: string[] | null;
  gaps: string[] | null;
  sofa_mode: "preset" | "custom" | "both" | null;
  discontinued_at: string | null;
}

export interface ProductSkuRow {
  id: string;
  model_id: string;
  sku: string;
  variant: string;
  variant_kind: VariantKind;
  price: number;
  // Added in migration 0026 (v3-S3). FK to suppliers; NOT NULL after seed
  // populates it (staging/prod), but stays nullable in fresh-dev until the
  // follow-up tightening migration runs (carry-forward
  // phase-4-v3-skus-supplier-id-not-null-tighten).
  supplier_id: string | null;
}

export interface SofaFabricRow {
  id: string;
  model_id: string;
  fabric_name: string;
  surcharge: number;
}

export interface AddonRow {
  key: string;
  name: string;
  price: number;
  active: boolean;
}

export interface FloorConfigRow {
  id: number;
  free_up_to_floor: number;
  per_floor_per_item: number;
  updated_at: string;
}

export interface WarehouseRow {
  id: string;
  name: string;
  address: string | null;
  // Added in migration 0027 (v3-S3). NOT NULL with default 'own' so legacy
  // rows fall back to 'own'. owning_partner_id required when kind =
  // 'logistics_partner' (CHECK constraint warehouses_partner_kind_check).
  kind: WarehouseKind;
  owning_partner_id: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  contact: string | null;
  lead_time: string | null;
  kind: "own_logistics" | "factory_pickup";
  cat_covered: string[];
}

export interface DeliveryPartnerRow {
  id: string;
  name: string;
  contact: string | null;
  zones: string | null;
  onboarded_date: string | null;
  rate_card: Record<string, { base: number; per_floor_walk_up: number; per_km: number }> | null;
}

export interface PartnerFleetRow {
  id: string;
  partner_id: string;
  plate: string;
  vehicle_type: string;
  capacity: string | null;
  driver_name: string | null;
  driver_phone: string | null;
}

export interface StockBalanceRow {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  updated_at: string;
}

export interface StockMovementRow {
  id: string;
  sku: string;
  warehouse_id: string;
  qty: number;
  kind: StockMovementKind;
  ref: string | null;
  note: string | null;
  by_role: Role | null;
  by_user_id: string | null;
  occurred_at: string;
}

export interface OrderRow {
  id: string;
  dl: number;
  status: OrderStatus;
  channel: string;
  dealer_id: string;
  outlet_id: string | null;
  salesperson_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_address_unknown: boolean;
  customer_billing: string | null;
  customer_billing_same: boolean;
  customer_emergency: string | null;
  delivery_date: string | null;
  delivery_date_tbd: boolean;
  delivery_floor: number;
  delivery_has_lift: boolean;
  paid: number;
  signature_url: string | null;
  payment_slip_url: string | null;
  terms_accepted: boolean;
  payment_method: "online" | "credit" | "installment" | null;
  approval_code: string | null;
  installment_months: 6 | 12 | null;
  logistics_stage: LogisticsStage | null;
  warehouse_id: string | null;
  delivery_partner_id: string | null;
  partner_stage: PartnerStage | null;
  partner_picked_at: string | null;
  partner_eta: string | null;
  do_number: string | null;
  do_note: string | null;
  // Logistics timestamps (migration 0019). `dispatched_at` set by
  // logistics_assign_partner; `delivered_at` set by logistics_attach_do_and_deliver.
  dispatched_at: string | null;
  delivered_at: string | null;
  invoice_no: string | null;
  invoiced_at: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
}

export interface OrderLineRow {
  id: string;
  order_id: string;
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
  unit_price: number;
}

export interface OrderAddonRow {
  id: string;
  order_id: string;
  addon_key: string;
  qty: number;
  unit_price: number;
}

export interface OrderHistoryRow {
  id: string;
  order_id: string;
  text: string;
  by_role: Role | null;
  by_user_id: string | null;
  occurred_at: string;
}

export interface PurchaseOrderRow {
  id: string;
  dl: number | null;
  // Cross-order PO bundle backrefs (migration 0017). Combined POs that group
  // SKUs across N source orders populate this; single-order POs use `dl`.
  // GIN-indexed for `= ANY(dl_refs)` lookups (drawer + linked-PO queries).
  dl_refs: number[] | null;
  supplier_id: string;
  warehouse_id: string;
  // Single-line `sku` + `qty` columns were dropped in migration 0017; lines
  // now live in the `purchase_order_lines` child table — see PurchaseOrderLineRow.
  status: POStatus;
  sup_status: POSupStatus;
  delivery_partner_id: string | null;
  expected_ready_date: string | null;
  pickup_date: string | null;
  eta_date: string | null;
  customer_rejection: Record<string, unknown> | null;
  // v3-S3 audit / DO-upload trail (migration 0030). Sofa-flow audit timestamps
  // and Supabase Storage path for the delivery order PDF.
  ready_confirm_at: string | null;
  partner_confirmed_at: string | null;
  do_file_path: string | null;
  do_uploaded_at: string | null;
  do_uploaded_by: string | null;
  // v3-S3 outsource fields (migration 0030). Used when a PO is delivered by a
  // one-shot outsourced partner (not a registered delivery_partners row); the
  // CHECK constraint po_outsource_xor_partner enforces these are mutually
  // exclusive with delivery_partner_id.
  outsource_partner_name: string | null;
  outsource_partner_contact: string | null;
  outsource_partner_zones: string | null;
  pay_status: POPayStatus;
  placed_at: string;
}

/**
 * `purchase_order_lines` child table (migration 0017). Composite PK on
 * (po_id, sku); CHECK constraint enforces received_qty <= qty so over-receipt
 * is impossible at the DB layer.
 */
export interface PurchaseOrderLineRow {
  po_id: string;
  sku: string;
  qty: number;
  received_qty: number;
}

export interface POHistoryRow {
  id: string;
  po_id: string;
  text: string;
  by_role: Role | null;
  occurred_at: string;
}

export interface PaymentRow {
  id: string;
  direction: PaymentDir;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  paid_at: string;
  order_id: string | null;
  po_id: string | null;
  refund_id: string | null;
  receipt_url: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_no: string;
  order_id: string;
  amount: number;
  tax_amount: number;
  issued_at: string;
  voided_at: string | null;
  pdf_url: string | null;
}

export interface RefundRow {
  id: string;
  order_id: string;
  dealer_id: string | null;
  amount: number;
  reason: string | null;
  status: RefundStatus;
  approval_id: string | null;
  approved_at: string | null;
  paid_at: string | null;
  credit_note_no: string | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  kind: ApprovalKind;
  title: string;
  actor: string | null;
  refers_to: string | null;
  amount: number | null;
  dealer_id: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  status: ApprovalStatus;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  role: Role | null;
  actor_text: string | null;
  action: string;
  dealer_id: string | null;
  ref: string | null;
  occurred_at: string;
}

export interface InquiryRow {
  id: string;
  kind: InquiryKind;
  company: string;
  region: string | null;
  contact: string | null;
  stage: InquiryStage;
  owner_user_id: string | null;
  note: string | null;
  linked_dealer_id: string | null;
  created_at: string;
  updated_at: string;
}
