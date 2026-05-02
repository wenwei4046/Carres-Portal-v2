/**
 * Adapters: snake_case DB rows → camelCase domain objects.
 */
import type * as DB from "./db-types";
import type * as D from "./domain";

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
});

export const productSkuFromRow = (r: DB.ProductSkuRow): D.ProductSku => ({
  id: r.id,
  modelId: r.model_id,
  sku: r.sku,
  variant: r.variant,
  variantKind: r.variant_kind,
  price: Number(r.price),
});

export const sofaFabricFromRow = (r: DB.SofaFabricRow): D.SofaFabric => ({
  id: r.id,
  modelId: r.model_id,
  fabricName: r.fabric_name,
  surcharge: Number(r.surcharge),
});

export const addonFromRow = (r: DB.AddonRow): D.Addon => ({
  key: r.key,
  name: r.name,
  price: Number(r.price),
  active: r.active,
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
  dl: r.dl,
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
    dateTbd: r.delivery_date_tbd,
    floor: r.delivery_floor,
    hasLift: r.delivery_has_lift,
  },
  paid: Number(r.paid),
  signatureUrl: r.signature_url,
  termsAccepted: r.terms_accepted,
  logisticsStage: r.logistics_stage,
  warehouseId: r.warehouse_id,
  deliveryPartnerId: r.delivery_partner_id,
  partnerStage: r.partner_stage,
  partnerPickedAt: r.partner_picked_at,
  partnerEta: r.partner_eta,
  doNumber: r.do_number,
  doNote: r.do_note,
  invoiceNo: r.invoice_no,
  invoicedAt: r.invoiced_at,
  placedAt: r.placed_at,
  lines: rels?.lines?.map(orderLineFromRow),
  addons: rels?.addons?.map(orderAddonFromRow),
  history: rels?.history?.map(orderHistoryFromRow),
});

export const purchaseOrderFromRow = (r: DB.PurchaseOrderRow): D.PurchaseOrder => ({
  id: r.id,
  dl: r.dl,
  supplierId: r.supplier_id,
  warehouseId: r.warehouse_id,
  sku: r.sku,
  qty: r.qty,
  status: r.status,
  supStatus: r.sup_status,
  deliveryPartnerId: r.delivery_partner_id,
  expectedReadyDate: r.expected_ready_date,
  pickupDate: r.pickup_date,
  etaDate: r.eta_date,
  payStatus: r.pay_status,
  placedAt: r.placed_at,
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
