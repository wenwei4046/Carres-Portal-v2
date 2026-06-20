/**
 * Adapters: snake_case DB rows → camelCase domain objects.
 */
import type * as DB from "./db-types";
import type * as D from "./domain";
import type { CreateOrderInput } from "./schemas/orders";

export const dealerFromRow = (r: DB.DealerRow): D.Dealer => ({
  id: r.id,
  name: r.name,
  region: r.region,
  contact: r.contact,
  joinedDate: r.joined_date,
  status: r.status,
  creditLimit: Number(r.credit_limit),
  paymentTerms: r.payment_terms,
  depositBalance: Number(r.deposit_balance),
  channel: r.channel,
});

export const outletFromRow = (r: DB.OutletRow): D.Outlet => ({
  id: r.id,
  dealerId: r.dealer_id,
  name: r.name,
  address: r.address,
});

export const salespersonFromRow = (r: DB.SalespersonRow): D.Salesperson => ({
  id: r.id,
  dealerId: r.dealer_id,
  outletId: r.outlet_id,
  name: r.name,
  phone: r.phone,
  userId: r.user_id,
});

export const productModelFromRow = (r: DB.ProductModelRow): D.ProductModel => ({
  id: r.id,
  category: r.category,
  modelKey: r.model_key,
  name: r.name,
  blurb: r.blurb,
  colors: r.colors,
  gaps: r.gaps,
  sofaMode: r.sofa_mode,
  discontinuedAt: r.discontinued_at,
  // 0171 — photo + option pool (default to an empty pool when absent).
  photoUrl: r.photo_url ?? null,
  allowedOptions: r.allowed_options ?? {},
});

export const productSkuFromRow = (r: DB.ProductSkuRow): D.ProductSku => ({
  id: r.id,
  modelId: r.model_id,
  sku: r.sku,
  variant: r.variant,
  variantKind: r.variant_kind,
  price: Number(r.price),
  // 0074 — Postgres numeric arrives as string|number; coalesce to null when
  // the column is NULL (catalog admin's "cost not yet set" state).
  cost: r.cost == null ? null : Number(r.cost),
  // 2026-05-17 — pass through SKU-level supplier ownership.
  supplierId: r.supplier_id,
  discontinuedAt: r.discontinued_at,
  // 0170 — sell-side flag (default true to match the column default when a
  // legacy query didn't select it) + editable description.
  posActive: r.pos_active ?? true,
  description: r.description ?? null,
  // 0178 — nullable link to a sofa compartment type (additive, null on every
  // existing SKU).
  compartmentId: r.compartment_id ?? null,
});

export const sofaFabricFromRow = (r: DB.SofaFabricRow): D.SofaFabric => ({
  id: r.id,
  modelId: r.model_id,
  fabricName: r.fabric_name,
  surcharge: Number(r.surcharge),
  colors: r.colors,
  discontinuedAt: r.discontinued_at,
  // 0176 — default to PRICE_1 if the column is absent on a legacy row fetched
  // before the migration applied (belt-and-suspenders; the DB default also
  // sets PRICE_1 for all pre-existing rows).
  tier: (r.tier ?? "PRICE_1") as D.FabricTier,
});

/**
 * Maps a `fabric_tier_addon_config` row to the camelCase domain shape.
 * Postgres numeric(12,2) columns surface as strings or numbers depending on
 * the PostgREST version; `Number()` normalises both.
 */
export const fabricTierConfigFromRow = (r: DB.FabricTierAddonConfigRow): D.FabricTierConfig => ({
  sofaTier2Delta: Number(r.sofa_tier2_delta),
  sofaTier3Delta: Number(r.sofa_tier3_delta),
});

/**
 * Maps a `model_fabric_tier_overrides` row to the camelCase domain shape.
 * Nullable deltas: `null` means "inherit from global" and must stay null
 * (not coerced to 0) so callers can distinguish "set to zero" from "unset".
 */
export const modelFabricTierOverrideFromRow = (
  r: DB.ModelFabricTierOverrideRow,
): D.ModelFabricTierOverride => ({
  modelId: r.model_id,
  tier2Delta: r.tier2_delta == null ? null : Number(r.tier2_delta),
  tier3Delta: r.tier3_delta == null ? null : Number(r.tier3_delta),
});

export const addonFromRow = (r: DB.AddonRow): D.Addon => ({
  key: r.key,
  name: r.name,
  price: Number(r.price),
  active: r.active,
  // 0172 — link to the Service-category SKU (bare SVC- code).
  serviceSku: r.service_sku ?? null,
});

export const floorConfigFromRow = (r: DB.FloorConfigRow): D.FloorConfig => ({
  id: r.id,
  freeUpToFloor: r.free_up_to_floor,
  perFloorPerItem: Number(r.per_floor_per_item),
});

/**
 * Maps a `combo_components` row to the camelCase domain shape (migration 0177).
 */
export const comboComponentFromRow = (r: DB.ComboComponentRow): D.ComboComponent => ({
  sku: r.sku,
  qty: Number(r.qty),
  sortOrder: Number(r.sort_order),
});

/**
 * Maps a `combos` row to the camelCase domain shape (migration 0177).
 * `combo_price` is Postgres numeric — `Number()` normalises the string|number
 * PostgREST surfaces it as. `components` is NOT on the row; the caller attaches
 * the mapped `combo_components` (via comboComponentFromRow) after fetch, so this
 * adapter defaults it to an empty array.
 */
export const comboFromRow = (r: DB.ComboRow): D.Combo => ({
  id: r.id,
  comboKey: r.combo_key,
  name: r.name,
  comboPrice: Number(r.combo_price),
  active: r.active,
  effectiveFrom: r.effective_from,
  components: [],
});

/**
 * Maps a `sofa_compartments` row to the camelCase domain shape (migration 0178).
 * `default_price` is Postgres numeric(12,2) — `Number()` normalises the
 * string|number PostgREST surfaces it as. `seat_count` is nullable and stays
 * null (not coerced to 0) so "unspecified" is distinct from "zero seats".
 */
export const sofaCompartmentFromRow = (r: DB.SofaCompartmentRow): D.SofaCompartment => ({
  id: r.id,
  code: r.code,
  description: r.description ?? null,
  seatCount: r.seat_count == null ? null : Number(r.seat_count),
  armConfig: r.arm_config ?? null,
  iconUrl: r.icon_url ?? null,
  defaultPrice: Number(r.default_price),
  sortOrder: Number(r.sort_order),
  active: r.active,
});

/**
 * Maps a `model_sofa_compartments` row to the camelCase domain shape (0178).
 * `price_override` is nullable: `null` means "inherit the pool default_price"
 * and must stay null (not coerced to 0) so callers can distinguish "no override"
 * from "override set to zero".
 */
export const modelSofaCompartmentFromRow = (
  r: DB.ModelSofaCompartmentRow,
): D.ModelSofaCompartment => ({
  modelId: r.model_id,
  compartmentId: r.compartment_id,
  priceOverride: r.price_override == null ? null : Number(r.price_override),
  sortOrder: Number(r.sort_order),
});

export const warehouseFromRow = (r: DB.WarehouseRow): D.Warehouse => ({
  id: r.id,
  name: r.name,
  address: r.address,
});

export const supplierFromRow = (r: DB.SupplierRow): D.Supplier => ({
  id: r.id,
  name: r.name,
  contact: r.contact,
  leadTime: r.lead_time,
  kind: r.kind,
  catCovered: r.cat_covered,
  slug: r.slug,
});

export const partnerFromRow = (r: DB.DeliveryPartnerRow): D.DeliveryPartner => ({
  id: r.id,
  name: r.name,
  contact: r.contact,
  zones: r.zones,
  onboardedDate: r.onboarded_date,
  rateCard: r.rate_card
    ? Object.fromEntries(
        Object.entries(r.rate_card).map(([k, v]) => [
          k,
          { base: v.base, perFloorWalkUp: v.per_floor_walk_up, perKm: v.per_km },
        ]),
      )
    : null,
});

export const fleetFromRow = (r: DB.PartnerFleetRow): D.PartnerFleet => ({
  id: r.id,
  partnerId: r.partner_id,
  plate: r.plate,
  vehicleType: r.vehicle_type,
  capacity: r.capacity,
  driverName: r.driver_name,
  driverPhone: r.driver_phone,
});

export const stockBalanceFromRow = (r: DB.StockBalanceRow): D.StockBalance => ({
  sku: r.sku,
  warehouseId: r.warehouse_id,
  qty: r.qty,
  reserved: r.reserved,
});

export const stockMovementFromRow = (r: DB.StockMovementRow): D.StockMovement => ({
  id: r.id,
  sku: r.sku,
  warehouseId: r.warehouse_id,
  qty: r.qty,
  kind: r.kind,
  ref: r.ref,
  note: r.note,
  byRole: r.by_role,
  occurredAt: r.occurred_at,
});

export const orderLineFromRow = (r: DB.OrderLineRow): D.OrderLine => ({
  id: r.id,
  orderId: r.order_id,
  sku: r.sku,
  qty: r.qty,
  attrs: r.attrs,
  unitPrice: Number(r.unit_price),
});

export const orderAddonFromRow = (r: DB.OrderAddonRow): D.OrderAddon => ({
  id: r.id,
  orderId: r.order_id,
  addonKey: r.addon_key,
  qty: r.qty,
  unitPrice: Number(r.unit_price),
  attrs: r.attrs ?? null,
});

export const orderHistoryFromRow = (r: DB.OrderHistoryRow): D.OrderHistory => ({
  id: r.id,
  orderId: r.order_id,
  text: r.text,
  byRole: r.by_role,
  occurredAt: r.occurred_at,
});

export const orderFromRow = (
  r: DB.OrderRow,
  rels?: { lines?: DB.OrderLineRow[]; addons?: DB.OrderAddonRow[]; history?: DB.OrderHistoryRow[] },
): D.Order => ({
  id: r.id,
  so: r.so,
  status: r.status,
  channel: r.channel,
  dealerId: r.dealer_id,
  outletId: r.outlet_id,
  salespersonId: r.salesperson_id,
  customer: {
    name: r.customer_name,
    phone: r.customer_phone,
    address: r.customer_address,
    addressUnknown: r.customer_address_unknown,
    billing: r.customer_billing,
    billingSame: r.customer_billing_same,
    emergency: r.customer_emergency,
  },
  delivery: {
    date: r.delivery_date,
    // Phase 11.1 — `?? null` so rows fetched before migration 0165 (which added
    // the column) surface as null rather than tripping zod's nullable check.
    proceedDate: r.proceed_date ?? null,
    dateTbd: r.delivery_date_tbd,
    floor: r.delivery_floor,
    hasLift: r.delivery_has_lift,
    stairItems: r.delivery_stair_items ?? null,
  },
  paid: Number(r.paid),
  // `?? null` so an old DB row missing this column reads as null rather than
  // tripping zod's nullable check downstream. Migration 0005 added the column
  // but legacy rows from before the migration still surface as undefined.
  signatureUrl: r.signature_url ?? null,
  paymentSlipUrl: r.payment_slip_url ?? null,
  termsAccepted: r.terms_accepted,
  // 0007 added payment_method/approval_code/installment_months. Pre-0007 rows
  // surface as undefined → null here so zod nullable enums stay happy.
  paymentMethod: r.payment_method ?? null,
  approvalCode: r.approval_code ?? null,
  installmentMonths: r.installment_months ?? null,
  operationStage: r.operation_stage,
  warehouseId: r.warehouse_id,
  deliveryPartnerId: r.delivery_partner_id,
  partnerStage: r.partner_stage,
  partnerPickedAt: r.partner_picked_at,
  partnerEta: r.partner_eta,
  doNumber: r.do_number,
  doNote: r.do_note,
  // 0019 migration columns. `?? null` so pre-0019 rows still adapt cleanly.
  dispatchedAt: r.dispatched_at ?? null,
  deliveredAt: r.delivered_at ?? null,
  invoiceNo: r.invoice_no,
  invoicedAt: r.invoiced_at,
  placedAt: r.placed_at,
  lines: rels?.lines?.map(orderLineFromRow),
  addons: rels?.addons?.map(orderAddonFromRow),
  history: rels?.history?.map(orderHistoryFromRow),
});

export const orderSupplierThreadFromRow = (
  r: DB.OrderSupplierThreadRow,
): D.OrderSupplierThread => ({
  id: r.id,
  orderId: r.order_id,
  supplierId: r.supplier_id,
  category: r.category,
  sopName: r.sop_name,
  operationStage: r.operation_stage,
  poId: r.po_id,
  warehouseId: r.warehouse_id,
  reservedAt: r.reserved_at,
  deliveredAt: r.delivered_at,
  // Phase 4.5 Chunk 2 customer-leg LP fields (migration 0049). Per-leg split
  // per Chunk 2 design spec §3 (CQ1 = option (b)). Procurement-leg LP stays
  // on `purchase_orders.delivery_partner_id` (renamed in Sprint C 0052).
  deliveryPartnerId: r.delivery_partner_id,
  confirmDeliveryDate: r.confirm_delivery_date,
  requestForDeliveryAt: r.request_for_delivery_at,
  partnerAcceptedAt: r.partner_accepted_at,
  partnerRejectedAt: r.partner_rejected_at,
  // Supplier per-thread pickup feature (migration 0107). `?? null` keeps the
  // adapter safe against rows fetched before the migration shipped.
  supplierReadyAt: r.supplier_ready_at ?? null,
  supplierReadyBy: r.supplier_ready_by ?? null,
  pickupEventId: r.pickup_event_id ?? null,
  history: r.history,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const purchaseOrderLineFromRow = (
  r: DB.PurchaseOrderLineRow,
): D.PurchaseOrderLine => ({
  poId: r.po_id,
  sku: r.sku,
  qty: r.qty,
  receivedQty: r.received_qty,
  // Migration 0055 (Phase 4.5 Chunk 2 Sprint E). `cost` is numeric(14,2) so
  // PostgREST may surface it as either string or number depending on driver
  // settings; coerce via Number() but preserve null for legacy rows. `?? null`
  // keeps the adapter safe against rows fetched before the migration shipped.
  cost: r.cost === null || r.cost === undefined ? null : Number(r.cost),
  costSource: r.cost_source ?? null,
});

export const purchaseOrderFromRow = (
  r: DB.PurchaseOrderRow,
  rels?: { lines?: DB.PurchaseOrderLineRow[] },
): D.PurchaseOrder => ({
  id: r.id,
  so: r.so,
  soRefs: r.so_refs,
  supplierId: r.supplier_id,
  warehouseId: r.warehouse_id,
  status: r.status,
  supStatus: r.sup_status,
  // Procurement-leg LP — renamed from `delivery_partner_id` in Phase 4.5 Chunk 2
  // Sprint C migration 0052. Customer-leg LP fields previously on the PO
  // (confirm_delivery_date / request_for_delivery_at / partner_accepted_at /
  // partner_rejected_at) were dropped by 0052 — they live on
  // `order_supplier_threads` and surface via `orderSupplierThreadFromRow`.
  procurementPartnerId: r.procurement_partner_id,
  expectedReadyDate: r.expected_ready_date,
  pickupDate: r.pickup_date,
  etaDate: r.eta_date,
  payStatus: r.pay_status,
  placedAt: r.placed_at,
  lines: rels?.lines?.map(purchaseOrderLineFromRow),
});

export const paymentFromRow = (r: DB.PaymentRow): D.Payment => ({
  id: r.id,
  direction: r.direction,
  amount: Number(r.amount),
  method: r.method,
  reference: r.reference,
  note: r.note,
  paidAt: r.paid_at,
  orderId: r.order_id,
  poId: r.po_id,
  refundId: r.refund_id,
  receiptUrl: r.receipt_url,
});

export const invoiceFromRow = (r: DB.InvoiceRow): D.Invoice => ({
  id: r.id,
  invoiceNo: r.invoice_no,
  orderId: r.order_id,
  amount: Number(r.amount),
  taxAmount: Number(r.tax_amount),
  issuedAt: r.issued_at,
  voidedAt: r.voided_at,
  pdfUrl: r.pdf_url,
});

export const refundFromRow = (r: DB.RefundRow): D.Refund => ({
  id: r.id,
  orderId: r.order_id,
  dealerId: r.dealer_id,
  amount: Number(r.amount),
  reason: r.reason,
  status: r.status,
  approvalId: r.approval_id,
  approvedAt: r.approved_at,
  paidAt: r.paid_at,
  creditNoteNo: r.credit_note_no,
});

export const approvalFromRow = (r: DB.ApprovalRow): D.Approval => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  actor: r.actor,
  refersTo: r.refers_to,
  amount: r.amount === null ? null : Number(r.amount),
  dealerId: r.dealer_id,
  reason: r.reason,
  payload: r.payload,
  status: r.status,
  decidedAt: r.decided_at,
  decisionNote: r.decision_note,
  createdAt: r.created_at,
});

export const auditFromRow = (r: DB.AuditLogRow): D.AuditEntry => ({
  id: r.id,
  role: r.role,
  actorText: r.actor_text,
  action: r.action,
  dealerId: r.dealer_id,
  ref: r.ref,
  occurredAt: r.occurred_at,
});

/**
 * orderInputToRpcPayload — converts the camelCase CreateOrderInput from the
 * web wizard into the snake_case jsonb shape that `public.create_order(jsonb)`
 * expects. Stays a pure function so it's testable without a Supabase client.
 *
 * `dealerId` is added by the API layer from the verified JWT — the input
 * schema deliberately doesn't include it (cross-dealer posts are forbidden).
 */
export const orderInputToRpcPayload = (
  input: CreateOrderInput,
  dealerId: string,
): Record<string, unknown> => ({
  dealer_id: dealerId,
  outlet_id: input.outletId,
  salesperson_id: input.salespersonId,
  customer_name: input.customer.name,
  customer_phone: input.customer.phone,
  customer_address: input.customer.addressUnknown ? null : input.customer.address,
  customer_address_unknown: input.customer.addressUnknown,
  customer_billing: input.customer.billingSame ? null : input.customer.billing,
  customer_billing_same: input.customer.billingSame,
  customer_emergency: input.customer.emergency,
  delivery_date: input.delivery.dateTbd ? null : input.delivery.date,
  // Phase 11.1 — proceed date pairs with delivery date; both nulled when TBD.
  proceed_date: input.delivery.dateTbd ? null : input.delivery.proceedDate,
  delivery_date_tbd: input.delivery.dateTbd,
  delivery_floor: input.delivery.floor,
  delivery_has_lift: input.delivery.hasLift,
  delivery_stair_items: input.delivery.stairItems ?? null,
  paid: input.paid,
  signature_url: input.signaturePath,
  payment_slip_url: input.paymentSlipPath,
  terms_accepted: input.termsAccepted,
  payment_method: input.paymentMethod,
  approval_code: input.approvalCode,
  installment_months: input.installmentMonths,
  lines: input.lines.map((l) => ({
    sku: l.sku,
    qty: l.qty,
    attrs: l.attrs,
    unit_price: l.unitPrice,
  })),
  addons: input.addons.map((a) => ({
    addon_key: a.addonKey,
    qty: a.qty,
    unit_price: a.unitPrice,
    attrs: a.attrs ?? null,
  })),
  deposit_pct: input.depositPct,
});

export const inquiryFromRow = (r: DB.InquiryRow): D.Inquiry => ({
  id: r.id,
  kind: r.kind,
  company: r.company,
  region: r.region,
  contact: r.contact,
  stage: r.stage,
  ownerUserId: r.owner_user_id,
  note: r.note,
  linkedDealerId: r.linked_dealer_id,
  createdAt: r.created_at,
});
