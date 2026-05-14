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
// Phase 4.5a T5 (2026-05-05): legacy `awaiting_stock` alias removed from FE
// vocabulary in lockstep with migrations 0038/0038b/0039 (RPC body sweep).
// Phase 4.5a T6 (2026-05-05): migration 0040 dropped `awaiting_stock` from the
// DB-side enum via DROP TYPE … CASCADE recreate. DB and FE vocabularies are
// now back in sync. Tuple matches Supabase-generated types verbatim.
export type LogisticsStage    =
  | "placed" | "proceed_request"
  | "awaiting_logistics_action"
  | "ready_to_dispatch" | "dispatched"
  | "waiting" | "delivered";
export type PartnerStage      = "assigned" | "picked_from_wh" | "en_route" | "delivered";
export type POStatus          = "open" | "received" | "cancelled";
// 6 new values appended in migration 0030 (v3-S3) for the HoOKkA Sofa flow:
// ready_confirm -> partner confirm -> (customer_rejected -> relocated)? ->
// at_partner_wh | at_own_wh_waiting.
// Phase 4.5 Chunk 1 (migration 0043): `at_warehouse_waiting` appended for the
// Sofa Reject + Relocate + Receive flow. The earlier v3 value `at_own_wh_waiting`
// stays in the enum (deprecated) — cleanup deferred per carry-forward
// `phase-4.5-cleanup-at-own-wh-waiting-rename`.
export type POSupStatus       =
  | "pending" | "acknowledged" | "in_production"
  | "shipped" | "delivered"
  | "ready_for_pickup" | "pickup_assigned" | "pickup_accepted" | "picked_up" | "reassign_needed"
  | "ready_confirm_sent" | "partner_confirmed" | "customer_rejected"
  | "relocated" | "at_partner_wh" | "at_own_wh_waiting"
  | "at_warehouse_waiting";
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
// Phase 4.5 Chunk 2 Sprint E migration 0055 (T24). Enum labels matching
// `cost_source_enum` in DB. Drives `purchase_order_lines.cost_source`:
//   - 'hand_entered'      logistics user typed the cost manually.
//   - 'prev_po'           auto-filled from the most-recent received PO for the
//                         same SKU (logistics_recent_po_cost RPC, T27).
//   - 'system_suggested'  heuristic suggestion (e.g. 110% of prev_po).
//   - 'auto_issued'       sentinel for system-issued PO lines from
//                         logistics_issue_pos_for_order when no historical cost
//                         existed (migration 0057 — T42 codex C1 fix). When a
//                         recent received-PO cost IS found, the auto-issue RPC
//                         persists 'prev_po' instead. 'auto_issued' rows always
//                         have cost = NULL and surface for Finance reconciliation.
// Both `cost` + `cost_source` are NULLABLE on the row (legacy rows pre-0055
// have no historical cost recorded — CQ3: backfill NULL, do not invent). New
// PO creates enforce non-NULL via zod (T25) + RPC validation (T26). The
// auto-issue path predates that gate and uses 'auto_issued' instead.
// 0074 added 'catalog' (Loo 2026-05-09): Create-PO auto-stamps every line
// with cost_source='catalog' since cost auto-reads from product_skus.cost.
// The other 4 values stay live for legacy + auto-issue paths.
export type CostSource        = "hand_entered" | "prev_po" | "system_suggested" | "auto_issued" | "catalog";

// T42-C1 — narrower form-state variant excluding the server-only `auto_issued`
// label. The auto-issue path predates the Sprint E (T25) manual-create gating
// and emits `auto_issued` to mark cost values inferred at PO-issue time.
export type ManualCostSource  = Exclude<CostSource, "auto_issued">;

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
  // 0074 — fixed procurement cost per unit. NULL = "not yet set" (Create-PO
  // refuses lines whose SKU has cost=null until logistics sets a value via
  // the catalog admin UI).
  cost: number | null;
  // 0074 — soft-delete flag for the catalog admin UI.
  discontinued_at: string | null;
}

export interface SofaFabricRow {
  id: string;
  model_id: string;
  fabric_name: string;
  surcharge: number;
  // 0075 — list of available colors for this fabric (Loo 2026-05-09).
  // NULL means "no colors configured yet"; the catalog admin fills via
  // comma-separated input. Mirrors product_models.colors[] on bedframe.
  colors: string[] | null;
  // 0074 — soft-delete flag for the catalog admin UI.
  discontinued_at: string | null;
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
  // Stable slug for cross-env supplier identification (migration 0032, v3-S4).
  // NOT NULL UNIQUE in DB. Seeded values: 'hookka' (HoOKkA), 'nice-future'
  // (Nice Future). Used by SUPPLIER_SOP keying in `sops.ts` so SOP routing
  // survives env reseeds where supplier UUIDs differ.
  slug: string;
}

export interface DeliveryPartnerRow {
  id: string;
  name: string;
  contact: string | null;
  // Postal address — added in migration 0048 (Phase 4.5 Chunk 1 carry-forward
  // `lp-address-column`). NULL for legacy rows that pre-date the LP creation
  // form; new rows from POST /api/principal/partners always populate it.
  address: string | null;
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
  /** Migration 0054 (Phase 4.5 Chunk 2 Sprint D Task 17). NULL = no alert
   *  configured for this (sku, warehouse) pair. Alert fires when
   *  (qty - reserved) < low_threshold. */
  low_threshold: number | null;
  /** Migration 0054. Replenishment ceiling used by CreatePOModal "Suggest from
   *  alerts" — gap = high_threshold - effective. NULL = use low * 2 fallback. */
  high_threshold: number | null;
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
  delivery_stair_items: number | null;
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

/**
 * `order_supplier_threads` (migration 0033, v3-S4). One row per
 * (order, supplier, category) — UNIQUE constraint enforces this. Drives the
 * v3 logistics pipeline so each fulfillment slice of an order has its own
 * SOP-driven kanban presence (a single order with mattress + sofa lines from
 * different suppliers spawns 2 threads, one per supplier×category).
 *
 * `po_id` is `text` because `purchase_orders.id` is `text` (not uuid). `sop_name`
 * mirrors `SopName` from `sops.ts` ('STANDARD' | 'SOFA_SPECIAL'). `history` is
 * a jsonb append log defaulting to `[]`.
 */
export interface OrderSupplierThreadRow {
  id: string;
  order_id: string;
  supplier_id: string;
  category: string;
  sop_name: "STANDARD" | "SOFA_SPECIAL";
  logistics_stage: LogisticsStage;
  po_id: string | null;
  warehouse_id: string | null;
  reserved_at: string | null;
  delivered_at: string | null;
  // Phase 4.5 Chunk 2 customer-leg LP fields (migration 0049). Per-leg split
  // per Chunk 2 design spec §3 (CQ1 = option (b)): customer-leg LP +
  // RFD/accept/reject timestamps live on the thread, while the procurement-leg
  // LP lives on `purchase_orders.procurement_partner_id` (renamed from
  // `delivery_partner_id` in Sprint C migration 0052). Closes carry-forward
  // `phase-4.5-procurement-vs-delivery-partner-field-split`. Backfilled from
  // PO columns by migration 0050; the legacy PO customer-leg columns were
  // dropped by migration 0052. Partial index `ost_partner_rfd_pending_idx`
  // backs the "RFD pending" LP queue.
  delivery_partner_id: string | null;
  confirm_delivery_date: string | null;
  request_for_delivery_at: string | null;
  partner_accepted_at: string | null;
  partner_rejected_at: string | null;
  // Supplier per-thread pickup feature (migration 0107). All nullable — legacy
  // threads pre-0107 have no per-thread readiness signal (the supplier marked
  // the whole PO ready instead). `supplier_ready_at` flips when a supplier
  // calls supplier_mark_thread_ready; `pickup_event_id` is stamped when a
  // partner / logistics batch-picks the thread off its PO.
  supplier_ready_at: string | null;
  supplier_ready_by: string | null;
  pickup_event_id: string | null;
  history: unknown[];
  created_at: string;
  updated_at: string;
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
  // Procurement-leg LP — the supplier→warehouse pickup partner.
  // Renamed from `delivery_partner_id` → `procurement_partner_id` in Phase 4.5
  // Chunk 2 Sprint C migration 0052 to disambiguate from the customer-leg LP,
  // which now lives on `order_supplier_threads.delivery_partner_id` (migration
  // 0049). The PO holds ONLY procurement-leg state from 0052 forward.
  procurement_partner_id: string | null;
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
  // do_number text added in migration 0035 (hotfix for 0034 RPC reference).
  do_number: string | null;
  // v3-S3 outsource fields (migration 0030). Used when a PO is delivered by a
  // one-shot outsourced partner (not a registered delivery_partners row); the
  // CHECK constraint po_outsource_xor_partner enforces these are mutually
  // exclusive with procurement_partner_id (renamed in 0052).
  outsource_partner_name: string | null;
  outsource_partner_contact: string | null;
  outsource_partner_zones: string | null;
  // Phase 4.5 Chunk 2 Sprint C migration 0052 DROPPED the 4 customer-leg fields
  // (`confirm_delivery_date`, `request_for_delivery_at`, `partner_accepted_at`,
  // `partner_rejected_at`) from `purchase_orders` — they were backfilled to
  // `order_supplier_threads` by migration 0050 and now live there exclusively.
  pay_status: POPayStatus;
  placed_at: string;
}

/**
 * `purchase_order_lines` child table (migration 0017). Composite PK on
 * (po_id, sku); CHECK constraint enforces received_qty <= qty so over-receipt
 * is impossible at the DB layer.
 *
 * Phase 4.5 Chunk 2 Sprint E migration 0055 added `cost` + `cost_source`. Both
 * NULLABLE because legacy rows from 0019/0025-era PO creates have no historical
 * cost recorded (CQ3 locked: backfill NULL, do not invent). New PO creates
 * enforce non-NULL via zod schema (T25) + RPC validation (T26).
 */
export interface PurchaseOrderLineRow {
  po_id: string;
  sku: string;
  qty: number;
  received_qty: number;
  // Migration 0055. numeric(14,2) — passed through as `number`; CHECK enforces
  // non-negative when set (NULL allowed for legacy rows).
  cost: number | null;
  // Migration 0055. cost_source_enum — which heuristic produced the cost
  // value above (see `CostSource` definition for label semantics).
  cost_source: CostSource | null;
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

/**
 * `po_pickup_events` (migration 0107). One row = one physical DO paper = one
 * trip. Created when a partner (factory_pickup flow) or logistics (own_logistics
 * delivers to HQ warehouse) batch-acks 1+ ready threads off a PO. Threads
 * involved in the same trip share the same `pickup_event_id`, which is the
 * grouping key for "1 DO covers N threads".
 *
 * `ack_role` records which side captured the pickup — 'partner' or 'logistics'.
 * `do_file_path` is the canonical Storage path in the `delivery-orders` bucket;
 * `do_note` is an optional free-text field for the picker.
 */
export interface PoPickupEventsRow {
  id: string;
  po_id: string;
  do_number: string;
  do_file_path: string | null;
  do_note: string | null;
  picked_up_at: string;
  picked_up_by: string | null;
  ack_role: "partner" | "logistics";
  created_at: string;
}
