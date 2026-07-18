import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import {
  type AbandonOrderInput,
  type AdjustStockInput,
  type AssignPartnerInput,
  type AssignPickupPartnerInput,
  type AttachDoInput,
  type AwaitingStockShortageResponse,
  type CancelOrderInput,
  type CatalogResponse,
  type ProductModelDto,
  type ProductSkuDto,
  type SofaFabricDto,
  type ProductModelCreateInput,
  type ProductModelPatchInput,
  type ProductSkuCreateInput,
  type ProductSkuPatchInput,
  type SkuImportRow,
  type SkuImportResult,
  type StockEtaImportRow,
  type StorageFeeImportRow,
  type BalanceImportRow,
  type StockEtaImportResult,
  type OpsStockImportRow,
  type ReceiveLineInput,
  type ReceiveLineResult,
  type LoanSofaInput,
  type BorrowLoanInput,
  type ReturnLoanInput,
  type ReturnToSupplierInput,
  type SofaLoanDto,
  type SofaLoansResponse,
  type AutocountImportInput,
  type AutocountImportResponse,
  type SpecialAddonDto,
  type SpecialAddonCreateInput,
  type SpecialAddonPatchInput,
  type CatalogOptionPoolName,
  type CatalogPoolBatchSaveInput,
  type CatalogConfigHistoryDto,
  type CatalogFabricsBatchSaveInput,
  type CatalogFabricsHistoryDto,
  type SofaFabricCreateInput,
  type SofaFabricPatchInput,
  type SofaComboDto,
  type SofaComboCreateInput,
  type SofaComboPatchInput,
  type SofaCompartmentDto,
  type SofaCompartmentCreateInput,
  type SofaCompartmentPatchInput,
  type ModelSofaCompartmentDto,
  type ModelSofaCompartmentInput,
  type SizesActiveInput,
  type GenerateSkusInput,
  type FloorConfigPatchInput,
  // 0184 — delivery TRIP fee config + per-RuleTarget special rules.
  type DeliveryFeeConfigDto,
  type DeliveryFeeConfigPatchInput,
  type SpecialDeliveryFeeRuleDto,
  type SpecialDeliveryFeeRuleInput,
  // 0185 — Default Free Gifts (per model) + Free Item Campaigns (GWP).
  type ModelDefaultFreeGiftsDto,
  type ModelDefaultFreeGiftsInput,
  type FreeItemCampaignDto,
  type FreeItemCampaignInput,
  // 0186 — PWP / Promo rules (Phase 8a, principal-only CRUD).
  type PwpRuleDto,
  type PwpRuleInput,
  // 0187 — PWP voucher codes (Phase 8c, the SAME-CART state machine reserve API).
  type PwpReserveInput,
  type PwpCodesResponse,
  // 0188 — PWP cross-order DISCOVERY (Phase 8d) — the stripped (no PII) AVAILABLE
  // voucher discovery the POS cross-order affordance reads by phone / code.
  type PwpDiscoverResponse,
  type AddonCreateInput,
  type AddonPatchInput,
  type AddonDto,
  type FloorConfigDto,
  type ConfirmProceedRequestInput,
  type LpRejectOrderInput,
  type ReselectPartnerInput,
  type CreateOrderInput,
  type RawCreateOrderInput,
  type CreatePoInput,
  type CreatePosBatchInput,
  type CreatePosBatchResponse,
  type DealerSelf,
  type BankStatementCreateInput,
  type FinanceInvoiceIssueInput,
  type FinanceInvoiceVoidInput,
  type FinancePoPayInput,
  type FinancePoScheduleInput,
  type FinanceRecordReceiptInput,
  type FinanceTopupApproveInput,
  type ReconciliationCreateInput,
  type RefundApplyInput,
  type ListOperationOrdersQuery,
  type ListMovementsQuery,
  type ListPurchaseOrdersQuery,
  type Order,
  type OrdersListResponse,
  type OrderStatus,
  type OutletsListResponse,
  type ProcurementTabSlug,
  type ReassignPoWarehouseInput,
  type ReceivePoWithDoInput,
  type RefundCreateInput,
  type RefundPayInput,
  type ReservedDrilldownResponse,
  type SalespersonDto,
  type SalespersonCreateInput,
  type AddOrderLinesInput,
  type SalespersonsListResponse,
  // 0232 — Staff PIN login (tiers + PIN identity on salespersons rows).
  type StaffListResponse,
  type StaffSessionResponse,
  type VerifyPinInput,
  type StaffReauthInput,
  type CreateStaffInput,
  type UpdateStaffInput,
  type SetStaffPinInput,
  type StaffDto,
  type SetOrderAddressInput,
  type SetOrderDateInput,
  type TopUpOrderInput,
  type CreateStripeCheckoutInput,
  type StripeCheckoutSessionInfo,
  type TransferReadyInput,
  type UpdateOrderInput,
  type WarehousePickInput,
  type DeliveryStop,
  type SetDeliveryChainInput,
  type PatchDeliveryStopInput,
  type OpsOrderControl,
  type OpsOrderControlResponse,
  type UpdateOpsOrderControlInput,
  type OrderPaymentRow,
  type RecordPaymentInput,
  type CollectStorageInput,
  type RequestStorageWaiverInput,
  type DecideStorageWaiverInput,
  type RecordStorageExtensionInput,
  type SetOpsAssignedLogisticInput,
  type FabricTierConfigDto,
  type ModelFabricTierOverrideDto,
  type OrderEntryConfigDto,
  type SetOrderEntryConfigInput,
} from "@carres/shared";
import { ApiError, apiFetch } from "./api";
import { uploadCompartmentPhoto, uploadModelPhoto } from "./photo-upload";

export const qk = {
  dealers:      () => ["dealers"] as const,
  dealerSelf:   () => ["dealers", "me"] as const,
  orders:       (filters?: OrderFilters) => ["orders", filters ?? {}] as const,
  order:        (id: string) => ["orders", id] as const,
  /** 0223 — one Stripe Checkout link's status poll (collect-online modal). */
  stripeSession: (orderId: string, sessionId: string) =>
    ["orders", orderId, "stripe-session", sessionId] as const,
  catalog:      () => ["catalog"] as const,
  /** 0201 — per-pool config-history snapshots. Nested under 'catalog' so every
   *  catalog mutation's ["catalog"] prefix-invalidation refreshes it too. */
  catalogConfigHistory: (section: string) => ["catalog", "config-history", section] as const,
  outlets:      () => ["outlets"] as const,
  salespersons: (outletId?: string) => ["salespersons", outletId ?? null] as const,
  /** 0232 — staff PIN roster (GET /api/staff). Principal may scope to another
   *  store via dealerId; own-store reads pass none. Kept off the `salespersons`
   *  prefix so staff mutations that flip hasPin invalidate distinctly. */
  staff:        (dealerId?: string) => ["staff", dealerId ?? null] as const,
  /** 0187 (Phase 8c) — the caller's RESERVED pwp_codes (GET /api/pwp-codes/mine),
   *  feeding the POS Auto-Fill voucher rail. The reserve/free mutations invalidate
   *  this so the rail re-reads the live RESERVED set after a trigger change. */
  pwpCodesMine: () => ["pwp-codes", "mine"] as const,
  /** 0188 (Phase 8d) — cross-order AVAILABLE voucher DISCOVERY (GET
   *  /api/pwp-codes/available), keyed by the selector (phone / code) so the POS
   *  auto-suggest + manual-entry affordance cache distinctly per lookup. The
   *  stripped (no-PII) DTO. Only enabled when a selector is present + PWP is
   *  active (DORMANT carts make zero discovery traffic). */
  pwpAvailable: (sel: { phone?: string | null; code?: string | null; name?: string | null }) =>
    ["pwp-codes", "available", sel.phone ?? null, sel.code ?? null, sel.name ?? null] as const,
  pwpByOrder: (orderId: string) => ["pwp-codes", "by-order", orderId] as const,
  // Phase 3 — Principal admin namespace. Keys are nested under 'principal' so
  // we can selectively invalidate the whole sub-tree (e.g. after a decision
  // ripples to dealers + dashboard) without touching dealer/order caches.
  principal: {
    dashboard: () => ["principal", "dashboard"] as const,
    approvals: (filters?: ApprovalFilters) =>
      ["principal", "approvals", filters ?? {}] as const,
    dealers:   (filters?: PrincipalDealerFilters) =>
      ["principal", "dealers", filters ?? {}] as const,
    dealer:    (id: string) => ["principal", "dealers", id] as const,
    partners:  () => ["principal", "partners"] as const,
    /** Phase 10 — principal accounts admin (PrincipalAccounts page). */
    accounts:  () => ["principal", "accounts"] as const,
    /** Phase 10 — audit log (PrincipalAudit). */
    audit:     (filters?: Record<string, unknown>) =>
      ["principal", "audit", filters ?? {}] as const,
    // 2026-05-19 — stock / orders / suppliers tabs moved to Operation
    // (qk.operation.stock / ordersFeed / suppliersOverview). Principal admit
    // is still allowed on those endpoints for oversight deep links.
  },
  // Phase 4.5 Chunk 1 — operation Partner (LP) namespace. Nested keys mirror
  // `principal` so we can blast `["partner"]` to invalidate the whole sub-tree
  // (e.g. after accept/reject RFD ripples to dashboard counts + pickups list).
  partner: {
    dashboard:  () => ["partner", "dashboard"] as const,
    pickups:    () => ["partner", "pickups"] as const,
    rfdPending: () => ["partner", "rfd-pending"] as const,
    toDeliver:  () => ["partner", "to-deliver"] as const,
    fleet:      () => ["partner", "fleet"] as const,
    /** Migration 0147 (item h, 2026-05-23) — LP "Incoming" queue: orders
     *  picked by Operation at Accept Proceed that the LP hasn't yet accepted
     *  or rejected. Polled every 15s while the page is open. */
    incoming:   () => ["partner", "incoming"] as const,
  },
  // Phase 4 — HQ operation namespace. Same nested-key strategy as `principal`
  // so M5 mutation hooks can blast `["operation"]` (or a sub-tree) on each
  // ripple — e.g. assign-partner invalidates orders + dashboard; PO receive
  // invalidates pos + warehouse + dashboard. Filter keys are typed via the
  // `List*Query` zod-derived shapes from `@carres/shared` so a wrong key fails
  // typecheck at the call site rather than silently breaking cache reads.
  operation: {
    /** 0136 — AutoCount-imported orders still in Inbox triage (no logistic
     *  assigned). Polled 15s while the page is open so newly-imported orders
     *  appear without manual refresh. */
    inbox: () => ["operation", "inbox"] as const,
    dashboard: () => ["operation", "dashboard"] as const,
    /** Loo 2026-05-10 — sidebar badge counts (orders awaiting + pickup-action
     *  POs). 30s refetch, kept under `operation` so a future blunt invalidate
     *  on `["operation"]` after a relevant mutation fans out here too. */
    badges:    () => ["operation", "badges"] as const,
    orders:    (filters?: operationOrderFilters) =>
      ["operation", "orders", filters ?? {}] as const,
    order:     (id: string) => ["operation", "orders", id] as const,
    /** P2 (migration 0159) — editable ops_order_control overlay for the order
     *  drawer. Nested under the order id so a blunt ["operation","orders"]
     *  invalidation after any order mutation refreshes it too. */
    orderControl: (id: string) => ["operation", "orders", id, "control"] as const,
    /** Balance job (migration 0184) — the multi-entry payment ledger for an
     *  order. Nested under the order id so a blunt ["operation","orders"]
     *  invalidation after any order mutation refreshes it too. */
    orderPayments: (id: string) => ["operation", "orders", id, "payments"] as const,
    partners:  () => ["operation", "partners"] as const,
    suppliers: () => ["operation", "suppliers"] as const,
    pos:       (filters?: operationPoFilters) =>
      ["operation", "pos", filters ?? {}] as const,
    po:        (id: string) => ["operation", "pos", id] as const,
    /** Loo 2026-05-16 — per-source-order ETA list for the PO detail modal.
     *  Nested under "pos" so a blunt `["operation","pos"]` invalidation after
     *  a PO mutation also clears these. Cheap (1-row-per-SO select), and the
     *  fetch only fires when the modal opens. */
    poSourceOrders: (id: string) =>
      ["operation", "pos", id, "source-orders"] as const,
    /** Phase 4.5 Chunk 2 (T34) — per-supplier procurement tab list. Keyed by
     *  `slug` so each tab's cache stays distinct (otherwise switching tabs
     *  would thrash the same key). Nested under `pos` so a future blunt
     *  invalidation on `["operation","pos"]` (e.g. after a CreatePO) reaches
     *  every tab too. */
    procurementTab: (slug: ProcurementTabSlug) =>
      ["operation", "pos", "tab", slug] as const,
    /** Pipeline v2 (C5.3) — SKU-level shortage feed for the "Auto-fill from
     *  awaiting stock" button on CreatePOModal. Lazy: fired only on click via
     *  the hook's `refetch()`. Nested under `pos` so future blunt
     *  invalidations on `["operation","pos"]` reach this cache too (e.g. when
     *  a PO is issued, the in_production pool changes).
     *
     *  `dls` (optional, sorted) scopes shortage to a specific so set, used by
     *  the cross-order bundle prefill flow. Sorting keeps the cache key stable
     *  across permutations of the same selection. */
    awaitingStockShortage: (dls?: number[]) =>
      dls && dls.length > 0
        ? (["operation", "pos", "awaiting-stock-shortage", [...dls].sort((a, b) => a - b)] as const)
        : (["operation", "pos", "awaiting-stock-shortage"] as const),
    /** Phase 4.5 Chunk 2 (T18/T21) — stock alerts derived from
     *  `(qty - reserved) < low_threshold`. Read by `StockAlertsTile` on the
     *  dashboard and (later) the warehouse red-dot indicator. The
     *  `SetThresholdDialog` invalidates this key on save so the tile
     *  re-derives. */
    stockAlerts: () => ["operation", "stock-alerts"] as const,
    warehouse: () => ["operation", "warehouse"] as const,
    /** Pipeline v2 (C4) — reserve drill-down per (warehouse, sku). Nested under
     *  warehouse so future blunt invalidations on `["operation","warehouse"]`
     *  fan out to drill-down caches too. */
    reservedDrilldown: (warehouseId: string | null, sku: string | null) =>
      ["operation", "warehouse", "reserved", warehouseId ?? "null", sku ?? "null"] as const,
    movements: (filters?: MovementsFilters) =>
      ["operation", "movements", filters ?? {}] as const,
    /** 2026-05-19 — cross-warehouse stock table (OperationStock page). */
    stock: () => ["operation", "stock"] as const,
    /** 2026-05-19 — read-only cross-dealer orders feed (OperationAllOrders
     *  page). Distinct from qk.operation.orders (the kanban-driver). */
    ordersFeed: (filters?: Record<string, unknown>) =>
      ["operation", "orders-feed", filters ?? {}] as const,
    /** 2026-05-19 — supplier oversight roster (OperationSuppliers page).
     *  Distinct from qk.operation.suppliers (the CRUD list). */
    suppliersOverview: () => ["operation", "suppliers-overview"] as const,
    /** 2026-05-19 — per-supplier recent-12-PO drawer query. Nested under
     *  the parent so a blunt invalidate fans out. */
    suppliersOverviewPos: (id: string) =>
      ["operation", "suppliers-overview", id, "pos"] as const,
    /** Phase B (migration 0138) — merged annotation + activity timeline for
     *  a single order. Nested under "orders" so a blunt invalidate on
     *  `["operation","orders"]` fans out here too. */
    orderTimeline: (id: string) =>
      ["operation", "orders", id, "timeline"] as const,
    /** Phase B — recent 'escalate'-tagged annotations for Jess's exception inbox. */
    escalations: () => ["operation", "escalations"] as const,
  },
  // Phase 5 — HQ Finance namespace. Same nested-key strategy as `principal`
  // and `operation` so mutations can blast `["finance"]` (e.g. topup-approve
  // ripples to dashboard summary + payments list + AR aging) or a tighter
  // sub-tree.
  finance: {
    dashboardSummary: () => ["finance", "dashboard-summary"] as const,
    arAging:          () => ["finance", "ar-aging"] as const,
    apAging:          () => ["finance", "ap-aging"] as const,
    cashflow:         (weeks?: number) =>
      ["finance", "cashflow", weeks ?? 12] as const,
    monthlyPl:        (months?: number) =>
      ["finance", "monthly-pl", months ?? 6] as const,
    topSkus:          (limit?: number) =>
      ["finance", "top-skus", limit ?? 8] as const,
    bankStatements:   (filters?: { from?: string; to?: string; matched?: "true" | "false" }) =>
      ["finance", "bank-statements", filters ?? {}] as const,
    reconSuggest:     (bankStmtId: string) =>
      ["finance", "recon-suggest", bankStmtId] as const,
    payments:         (filters?: FinancePaymentsFilters) =>
      ["finance", "payments", filters ?? {}] as const,
    invoices:         (filters?: FinanceInvoicesFilters) =>
      ["finance", "invoices", filters ?? {}] as const,
    refunds:          (filters?: FinanceRefundsFilters) =>
      ["finance", "refunds", filters ?? {}] as const,
  },
  // Phase 8 — BD namespace.
  bd: {
    inquiries: () => ["bd", "inquiries"] as const,
  },
  // Phase 6 — Supplier namespace. Same nested-key strategy so mutations can
  // blast `["supplier"]` (e.g. ack/start-production ripples to PO list +
  // dashboard counts) or a tighter sub-tree.
  supplier: {
    me:       () => ["supplier", "me"] as const,
    activity: (limit?: number) => ["supplier", "activity", limit ?? 6] as const,
    pos:      (bucket?: SupplierBucket) => ["supplier", "pos", bucket ?? "all"] as const,
    po:       (id: string) => ["supplier", "pos", id] as const,
    products: () => ["supplier", "products"] as const,
    demand:   () => ["supplier", "products", "demand"] as const,
  },
  // 2026-05-15 (Loo) — Supplier per-thread readiness + pickup event keys.
  // Top-level (not nested under `supplier`) because thread + pickup-event
  // reads are role-agnostic (supplier reads threads; partner+operation +
  // anyone with link reads pickup-event print payload). Mutations invalidate
  // these by their top-level prefix (`["supplierThreads"]` /
  // `["pickupEvents"]`) so the namespacing matches the invalidate calls.
  supplierThreads: {
    byPo: (poId: string) => ["supplierThreads", poId] as const,
  },
  pickupEvent: {
    print: (eventId: string) => ["pickupEvent", eventId] as const,
    byPo:  (poId: string)  => ["pickupEvents", poId] as const,
  },
  // 0219 — the Order Entry (POS form) config editor read. (The 0174 SO grid
  // that shared this prefix was deleted 2026-07-12; the key stays stable.)
  salesOrderGrid: {
    entryConfig: () => ["sales-order-grid", "entry-config"] as const,
  },
};

export interface OrderFilters {
  status?: OrderStatus;
  outletId?: string;
  salespersonId?: string;
  dealerId?: string;
}

// Phase 3 — Principal filter shapes. Kept tiny on purpose: the route handlers
// already do the heavy lifting; the frontend just needs stable cache keys
// keyed on whatever the user picked in the inbox / dealers list.
export interface ApprovalFilters {
  status?: "pending" | "approved" | "rejected" | "all";
  kind?: "refund" | "new_dealer" | "top_up" | "price_change" | "other";
}

export interface PrincipalDealerFilters {
  status?: "active" | "suspended" | "pending";
  search?: string;
}

// ---------------------------------------------------------------------------
// Phase 5 — Finance filter shapes (kept as plain interfaces so the qk keys
// stay structurally typed without dragging the zod schema into every cache
// key build site).
// ---------------------------------------------------------------------------
export interface FinancePaymentsFilters {
  orderId?:   string;
  dealerId?:  string;
  direction?: "in" | "out";
  from?:      string;
  to?:        string;
  limit?:     number;
}
export interface FinanceInvoicesFilters {
  status?:   "all" | "unpaid" | "partial" | "paid" | "voided";
  dealerId?: string;
  from?:     string;
  to?:       string;
  limit?:    number;
}
export interface FinanceRefundsFilters {
  status?:   "all" | "pending" | "approved" | "rejected" | "paid" | "issued" | "applied";
  dealerId?: string;
  from?:     string;
  to?:       string;
  limit?:    number;
}

// ---------------------------------------------------------------------------
// Phase 5 — Finance response shapes (inline types matching the SQL RPC
// payloads; no need for a domain layer for these aggregates since they're
// read-only dashboard data, never round-tripped through adapters).
// ---------------------------------------------------------------------------
export interface FinanceArAgingRow {
  order_id:      string;
  so:            number;
  customer_name: string;
  dealer_id:     string | null;
  dealer_name:   string | null;
  placed_at:     string;
  days:          number;
  aging:         "0-30" | "31-60" | "61-90" | "90+";
  total:         number;
  paid:          number;
  outstanding:   number;
  invoice_no:    string;
  status:        string;
}
export interface FinanceArAgingBucket {
  amount: number;
  count:  number;
}
export interface FinanceArAgingResponse {
  rows:    FinanceArAgingRow[];
  buckets: Record<"0-30" | "31-60" | "61-90" | "90+", FinanceArAgingBucket>;
}

// AP aging — finance_ap_aging() RPC payload (migration 0063). Single
// round-trip returns per-PO rows + bucket aggregates so FinanceAP and the
// dashboard ready-to-pay tile never disagree. pay_status_ui is a derived
// 5-value bucket; the raw db enum (pay_status) only has 3 values.
export type FinanceApPayStatusUi =
  | "matched"
  | "scheduled"
  | "paid"
  | "in_transit"
  | "in_production";
export interface FinanceApAgingLine {
  sku:          string;
  sku_name:     string;
  qty:          number;
  received_qty: number;
  unit_cost:    number | null;
  line_total:   number;
}
export interface FinanceApAgingHistoryEntry {
  text:        string;
  occurred_at: string;
  by_role:     string | null;
}
export interface FinanceApAgingRow {
  po_id:               string;
  so:                  number | null;
  supplier_id:         string | null;
  supplier_name:       string | null;
  warehouse_id:        string | null;
  delivery_partner_id: string | null;
  placed_at:           string;
  expected_ready_date: string | null;
  eta_date:            string | null;
  pickup_date:         string | null;
  status:              string;
  sup_status:          string;
  pay_status:          "unpaid" | "scheduled" | "paid";
  pay_status_ui:       FinanceApPayStatusUi;
  qty:                 number;
  total:               number;
  do_number:           string | null;
  has_do:              boolean;
  due_in:              number | null;
  lines:               FinanceApAgingLine[];
  history:             FinanceApAgingHistoryEntry[];
}
export interface FinanceApAgingBucket {
  amount: number;
  count:  number;
}
export interface FinanceApAgingResponse {
  rows:        FinanceApAgingRow[];
  byPayStatus: Record<FinanceApPayStatusUi, FinanceApAgingBucket>;
}

// Cashflow series (Chunk B) — finance_cashflow_series RPC payload.
export interface FinanceCashflowSeries {
  labels:  string[];   // ["W18", "W19", ...]
  inflow:  number[];   // positive numbers per week
  outflow: number[];   // negative numbers per week (proto convention)
}

// Monthly P&L (Chunk B) — finance_monthly_pl RPC payload.
export interface FinanceMonthlyPlRow {
  m:       string;     // "Nov 25"
  revenue: number;
  cogs:    number;
  opex:    number;
  net:     number;
}
export interface FinanceMonthlyPlResponse {
  rows: FinanceMonthlyPlRow[];
}

// Top SKUs (Chunk B) — finance_top_skus RPC payload.
export interface FinanceTopSkuRow {
  sku:     string;
  name:    string;
  qty:     number;
  revenue: number;
}
export interface FinanceTopSkusResponse {
  rows: FinanceTopSkuRow[];
}

// Bank statement row (from /api/finance/bank-statements list — augmented
// with matched_ref derived from reconciliations join).
export interface FinanceBankStatementRow {
  id:             string;
  statement_date: string;
  description:    string;
  amount:         number;
  reference:      string | null;
  currency:       string;
  imported_from:  string;
  created_at:     string;
  matched_ref:    string | null;  // server-side derived
}

// Refund row (Chunk C) — credit_note_no IS NOT NULL discriminates a credit
// note from a refund. UI label derivation:
//   credit_note_no IS NULL  + status='pending'   -> "RF pending"
//   credit_note_no IS NULL  + status='approved'  -> "RF approved"
//   credit_note_no IS NULL  + status='paid'      -> "RF paid"
//   credit_note_no NOT NULL + status='approved'  -> "CN issued"
//   credit_note_no NOT NULL + status='paid'      -> "CN applied"
export interface FinanceRefundRow {
  id:                    string;
  order_id:              string;
  dealer_id:             string | null;
  amount:                number;
  reason:                string | null;
  status:                "pending" | "approved" | "rejected" | "paid";
  approval_id:           string | null;
  approved_at:           string | null;
  paid_at:               string | null;
  credit_note_no:        string | null;
  applied_to_order_id:   string | null;
  created_at:            string;
}

// finance_recon_suggest_matches RPC payload.
export interface FinanceReconCandidate {
  so:            number;
  customer_name: string;
  dealer_name:   string | null;
  total:         number;
  paid:          number;
  outstanding:   number;
  invoice_no:    string;
  distance:      number;
}
export interface FinanceReconSuggestResponse {
  bank_statement: {
    id:             string;
    statement_date: string;
    description:    string;
    amount:         number;
    reference:      string | null;
  };
  candidates: FinanceReconCandidate[];
}
export interface FinanceDashboardSummary {
  ar:           { outstanding: number; count: number; overdueAmt: number; overdueCount: number };
  ap:           { dueAmt: number; count: number };
  cashflow12w:  { inflow: number; outflow: number; net: number };
  agingBuckets: Record<"0-30" | "31-60" | "61-90" | "90+", FinanceArAgingBucket>;
}
export interface FinancePaymentRow {
  id:           string;
  direction:    "in" | "out";
  amount:       number;
  method:       string;
  reference:    string | null;
  paid_at:      string;
  order_id:     string | null;
  po_id:        string | null;
  refund_id:    string | null;
  receipt_url:  string | null;
  recorded_by:  string | null;
  created_at:   string;
}

// ---------------------------------------------------------------------------
// Phase 4 — operation filter shapes
// ---------------------------------------------------------------------------
// Re-exported as plain type aliases of the zod-inferred query shapes from
// @carres/shared/schemas/operation. The web side only needs these as cache-key
// values + URLSearchParams sources — no runtime parse here, the server already
// owns that boundary. Keeping the alias means a schema change in one file
// updates both the API and the React Query keys without drift.
export type operationOrderFilters = Partial<ListOperationOrdersQuery>;
export type operationPoFilters = Partial<ListPurchaseOrdersQuery>;
export type MovementsFilters = Partial<ListMovementsQuery>;
// Re-export the payment-ledger row type so consumers (OrderDetailDrawer) can pull
// it from the queries boundary alongside the payment hooks, matching the pattern
// used for the other operation detail types. (It was imported above for internal
// use but never re-exported — batch-2 build gap.)
export type { OrderPaymentRow };

function toSearch(f?: OrderFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.outletId) params.set("outletId", f.outletId);
  if (f.salespersonId) params.set("salespersonId", f.salespersonId);
  if (f.dealerId) params.set("dealerId", f.dealerId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useDealerSelf(opts?: Partial<UseQueryOptions<DealerSelf>>) {
  return useQuery({
    queryKey: qk.dealerSelf(),
    queryFn: () => apiFetch<DealerSelf>("/api/dealers/me"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useOrders(filters?: OrderFilters, opts?: Partial<UseQueryOptions<OrdersListResponse>>) {
  return useQuery({
    queryKey: qk.orders(filters),
    queryFn: () => apiFetch<OrdersListResponse>("/api/orders" + toSearch(filters)),
    staleTime: 30_000,
    ...opts,
  });
}

export function useOrder(id: string | null, opts?: Partial<UseQueryOptions<Order>>) {
  return useQuery({
    queryKey: qk.order(id ?? ""),
    queryFn: () => apiFetch<Order>(`/api/orders/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    ...opts,
  });
}

/**
 * useCreateOrder — POST /api/orders. On success, prime the detail cache with
 * the just-created order (so the ThankYou screen can render its number
 * without a second round-trip) and invalidate the list cache so the dashboard
 * kanban picks up the new card on next mount.
 */
export function useCreateOrder(
  opts?: Partial<UseMutationOptions<Order, Error, CreateOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, Error, CreateOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>("/api/orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (...args) => {
      const [order] = args;
      qc.setQueryData(qk.order(order.id), order);
      void qc.invalidateQueries({ queryKey: ["orders"] });
      // Forward to caller's onSuccess if provided. Spread keeps us
      // signature-agnostic across TanStack versions.
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * useSalesAnalytics — GET /api/analytics/sales?months=N (POS-parity,
 * MAINTAIN → Sales analysis; principal only). Flattened order + line rows;
 * the page aggregates via lib/sales-analysis.
 */
export function useSalesAnalytics(
  months: number,
  opts?: Partial<UseQueryOptions<import("./sales-analysis").SalesAnalyticsResponse>>,
) {
  return useQuery<import("./sales-analysis").SalesAnalyticsResponse>({
    queryKey: ["analytics", "sales", months],
    queryFn: () =>
      apiFetch<import("./sales-analysis").SalesAnalyticsResponse>(
        `/api/analytics/sales?months=${months}`,
      ),
    staleTime: 60_000,
    ...opts,
  });
}

/**
 * useCustomerTypeProbe — GET /api/orders/customer-type?phone= (POS-parity
 * "CUSTOMER TYPE (AUTO)"). Answers whether any RLS-visible order already
 * carries this phone. Disabled until the phone looks dial-able.
 */
export function useCustomerTypeProbe(
  phone: string,
  opts?: Partial<UseQueryOptions<{ existing: boolean; matches: number }>>,
) {
  const trimmed = phone.trim();
  return useQuery<{ existing: boolean; matches: number }>({
    queryKey: ["orders", "customer-type", trimmed],
    queryFn: () =>
      apiFetch<{ existing: boolean; matches: number }>(
        `/api/orders/customer-type?phone=${encodeURIComponent(trimmed)}`,
      ),
    enabled: trimmed.length >= 8,
    staleTime: 30_000,
    ...opts,
  });
}

/** One customer distilled from RLS-visible past orders (newest order wins) —
 *  the wire shape of GET /api/orders/customer-search. `address` / `emergency`
 *  are the composed DB strings; the POS parses them back into structured
 *  fields via `customerPatchFromHit`. */
export interface CustomerSearchHit {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  addressUnknown: boolean;
  billing: string | null;
  billingSame: boolean;
  emergency: string | null;
  race: string | null;
  gender: string | null;
  birthday: string | null;
}

/**
 * useCustomerSearch — GET /api/orders/customer-search?q= (POS Full-name
 * autocomplete). Returns up to 8 distinct customers from RLS-visible past
 * orders whose name contains `q`. Disabled until 2+ chars are typed.
 */
export function useCustomerSearch(
  q: string,
  opts?: Partial<UseQueryOptions<{ customers: CustomerSearchHit[] }>>,
) {
  const trimmed = q.trim();
  return useQuery<{ customers: CustomerSearchHit[] }>({
    queryKey: ["orders", "customer-search", trimmed],
    queryFn: () =>
      apiFetch<{ customers: CustomerSearchHit[] }>(
        `/api/orders/customer-search?q=${encodeURIComponent(trimmed)}`,
      ),
    enabled: trimmed.length >= 2,
    staleTime: 30_000,
    ...opts,
  });
}

/**
 * useRawCreateOrder — POST /api/orders/raw (POS-parity, MAINTAIN → New Order).
 * Internal-only raw creation: free-form line skus + prices, no POS gates.
 * Same Order response contract as useCreateOrder.
 */
export function useRawCreateOrder(
  opts?: Partial<UseMutationOptions<Order, Error, RawCreateOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, Error, RawCreateOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>("/api/orders/raw", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (...args) => {
      const [order] = args;
      qc.setQueryData(qk.order(order.id), order);
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * useProceedOrder — POST /api/orders/:id/proceed. Atomically transitions a
 * Place order to Proceed (sent to operation). On success, primes both the
 * detail cache and invalidates the list cache so kanban + tabs reflect the
 * new bucket on next mount.
 *
 * Errors:
 *   - 422 with `{ code: ProceedBlockerCode }` — caller can read
 *     `(err as ApiError).body.code` to show the matching inline blocker hint.
 *   - 403 / 404 / 500 — generic toast.
 */
export function useProceedOrder(
  opts?: Partial<UseMutationOptions<Order, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, string>({
    mutationFn: (id) => apiFetch<Order>(`/api/orders/${id}/proceed`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      const [order, mutateOrderId] = args;
      // mutateOrderId is the id we passed to mutate(id) — guaranteed to
      // match the URL param the parent's useOrder is observing.
      qc.setQueryData(qk.order(mutateOrderId), order);
      await qc.invalidateQueries({ queryKey: qk.order(mutateOrderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * useUnproceedOrder — POST /api/orders/:id/unproceed (0220). Reverses the
 * sales-side Proceed marker: Proceed → Place while operation hasn't started
 * (operation_stage still 'confirmed') and the proceed date hasn't passed.
 * Mirrors useProceedOrder's cache mechanics (prime detail + invalidate list).
 *
 * Errors:
 *   - 422 with `{ error: "unproceed_blocked", code }` — code is one of
 *     wrong_status / wrong_stage / proceed_date_passed for inline copy.
 *   - 403 / 404 / 500 — generic toast.
 */
export function useUnproceedOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, void>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, void>({
    mutationFn: () =>
      apiFetch<Order>(`/api/orders/${orderId}/unproceed`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      const [order] = args;
      qc.setQueryData(qk.order(orderId), order);
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * useTopUpOrder — POST /api/orders/:id/top-up. Records an additional partial
 * payment toward the order total. On success, primes the detail cache + busts
 * the list so kanban paid pct updates on next mount.
 *
 * 422 errors carry an `already_paid` / `wrong_status` / `invalid_amount` code
 * that the caller can branch on (sonner toast text).
 */
export function useTopUpOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, TopUpOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, TopUpOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/top-up`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** 0231 — Add-product P1: append server-priced lines to a Place-lane order
 *  (POST /api/orders/:id/lines). Same cache discipline as useTopUpOrder:
 *  prime the detail, refetch it, invalidate the lists. */
export function useAddOrderLines(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, AddOrderLinesInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, AddOrderLinesInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/lines`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      const [order] = args;
      qc.setQueryData(qk.order(orderId), order);
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * useCreateStripeCheckout — POST /api/orders/:id/stripe/checkout (0223).
 * Mints a Stripe Checkout link (QR at the counter / WhatsApp) for RM<amount>.
 * The server re-validates amount ≤ outstanding; 422 codes:
 * amount_exceeds_outstanding (body carries maxAmount) / already_paid /
 * wrong_status. 503 = Stripe keys not configured yet.
 */
export function useCreateStripeCheckout(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ session: StripeCheckoutSessionInfo }, ApiError, CreateStripeCheckoutInput>>,
) {
  return useMutation<{ session: StripeCheckoutSessionInfo }, ApiError, CreateStripeCheckoutInput>({
    mutationFn: (input) =>
      apiFetch<{ session: StripeCheckoutSessionInfo }>(`/api/orders/${orderId}/stripe/checkout`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
  });
}

/**
 * useStripeCheckoutStatus — GET /api/orders/:id/stripe/checkout/:sid (0223).
 * Polls one checkout link while the collect modal is open. While the session
 * is 'open' the SERVER also live-reconciles against Stripe, so a counter
 * payment lands within one poll even before the webhook endpoint exists.
 * Callers watch data.session.status flip to 'paid' and then invalidate
 * qk.order(orderId) + ["orders"] (the RPC moved orders.paid server-side).
 */
export function useStripeCheckoutStatus(
  orderId: string,
  sessionId: string | null,
  opts?: { enabled?: boolean; refetchInterval?: number },
) {
  return useQuery<{ session: StripeCheckoutSessionInfo }, ApiError>({
    queryKey: qk.stripeSession(orderId, sessionId ?? ""),
    queryFn: () =>
      apiFetch<{ session: StripeCheckoutSessionInfo }>(
        `/api/orders/${orderId}/stripe/checkout/${sessionId}`,
      ),
    enabled: !!sessionId && (opts?.enabled ?? true),
    refetchInterval: opts?.refetchInterval ?? 4000,
    refetchIntervalInBackground: false,
  });
}

/** useSetOrderAddress — POST /api/orders/:id/address. Resolves the
 *  addressUnknown blocker by writing customer_address. */
export function useSetOrderAddress(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, SetOrderAddressInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, SetOrderAddressInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/address`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** useSetOrderDate — POST /api/orders/:id/date. Resolves the dateTbd blocker. */
export function useSetOrderDate(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, SetOrderDateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, SetOrderDateInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/date`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** useUpdateOrder — PATCH /api/orders/:id. Phase 2C.2 — full edit of a Place
 *  order's customer + delivery fields. Only keys present in the payload are
 *  updated; the RPC enforces that no fields → 400, status≠place → 422. */
export function useUpdateOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, UpdateOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, UpdateOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** useCancelOrder — POST /api/orders/:id/cancel. Phase 2C.3 — sets status to
 *  'cancelled'. Only Place orders cancelable. Reason persisted in
 *  order_history.metadata for the audit trail. */
export function useCancelOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, CancelOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, CancelOrderInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/cancel`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      const [order] = args;
      // Prime the detail cache with the freshly-mutated row so the page
      // updates instantly. We key on the orderId we already have rather
      // than the response's order.id — they should always match but the
      // closure-captured value is the safer choice when callers are
      // reading the same query.
      qc.setQueryData(qk.order(orderId), order);
      // Force a refetch on the order detail too, so the cache stays
      // authoritative even if the response shape ever drifts from the
      // GET /:id shape (defense-in-depth — no observable cost when the
      // response was correct, fixes the "Windows screen out of sync"
      // bug Loo flagged on 2026-05-03).
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      // List views (kanban / orders tabs) — invalidate so paid pct,
      // status badge, and counts refresh when reopened.
      void qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ===========================================================================
// 0219 — Order Entry config (POS payment methods + form fields)
// ===========================================================================
/** 0219 — GET /api/operation/sales-order-maintenance/entry-config — the Order
 *  Entry config (payment methods + POS form fields). Internal only. */
export function useOrderEntryConfig(
  opts?: Partial<UseQueryOptions<{ entryConfig: OrderEntryConfigDto }>>,
) {
  return useQuery({
    queryKey: qk.salesOrderGrid.entryConfig(),
    queryFn: () =>
      apiFetch<{ entryConfig: OrderEntryConfigDto }>(
        "/api/operation/sales-order-maintenance/entry-config",
      ),
    staleTime: 30_000,
    ...opts,
  });
}

/** 0219 — PUT the Order Entry config (full replace via the role-gated RPC).
 *  Invalidates the editor read AND the catalog bundle (the POS renders from
 *  catalog.orderEntryConfig). */
export function useUpdateOrderEntryConfig(
  opts?: Partial<
    UseMutationOptions<{ entryConfig: OrderEntryConfigDto }, ApiError, SetOrderEntryConfigInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ entryConfig: OrderEntryConfigDto }, ApiError, SetOrderEntryConfigInput>({
    mutationFn: (input) =>
      apiFetch<{ entryConfig: OrderEntryConfigDto }>(
        "/api/operation/sales-order-maintenance/entry-config",
        { method: "PUT", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.salesOrderGrid.entryConfig() });
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * Catalog bundle — models + skus + sofa fabrics + addons + floor_config.
 * staleTime: 5 min (D5). Wizard Step 2 explicitly calls `.refetch()` on mount
 * so the dealer always sees fresh prices before they pick products.
 *
 * 0075 (Loo 2026-05-09) — `admin: true` includes discontinued models so the
 * catalog admin UI can render them with a Restore toggle. Uses a distinct
 * cache key so the admin + public bundles don't collide.
 */
export function useCatalog(
  opts?: Partial<UseQueryOptions<CatalogResponse>> & { admin?: boolean },
) {
  const { admin, ...rest } = opts ?? {};
  return useQuery({
    queryKey: admin ? [...qk.catalog(), "admin"] : qk.catalog(),
    queryFn: () =>
      apiFetch<CatalogResponse>(`/api/catalog${admin ? "?admin=true" : ""}`),
    staleTime: 5 * 60_000,
    ...rest,
  });
}

export function useOutlets(opts?: Partial<UseQueryOptions<OutletsListResponse>>) {
  return useQuery({
    queryKey: qk.outlets(),
    queryFn: () => apiFetch<OutletsListResponse>("/api/outlets"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/* ─── 0187 (Phase 8c) — PWP voucher codes (SAME-CART reserve API) ───────────── */

/**
 * usePwpCodesMine — GET /api/pwp-codes/mine. The caller's RESERVED pwp_codes,
 * feeding the POS Auto-Fill voucher rail (the cart binds a RESERVED code onto an
 * eligible reward line so the order route claims it). Self-heals on the server
 * (an owner-scoped orphan reaper runs before the read). `enabled` defaults true
 * but the POS only mounts this when a catalog with ACTIVE pwp_rules is loaded —
 * DORMANT carts pass `enabled: false` so a no-rules order makes zero reserve
 * traffic (byte-identical). Short `staleTime` so the rail reflects reserves
 * promptly; the reserve/free mutations also invalidate it.
 */
export function usePwpCodesMine(opts?: Partial<UseQueryOptions<PwpCodesResponse>>) {
  return useQuery({
    queryKey: qk.pwpCodesMine(),
    queryFn: () => apiFetch<PwpCodesResponse>("/api/pwp-codes/mine"),
    staleTime: 10_000,
    ...opts,
  });
}

/**
 * useReservePwpCode — POST /api/pwp-codes/reserve. Idempotent (sequential)
 * reconcile of ONE trigger line's RESERVED set (top-up / trim). On success,
 * invalidate `pwpCodesMine` so the Auto-Fill rail re-reads the live set. The
 * reconciler treats this as best-effort — a failed reserve just shows fewer
 * codes in the rail; it never blocks submit.
 */
export function useReservePwpCode(
  opts?: Partial<UseMutationOptions<PwpCodesResponse, ApiError, PwpReserveInput>>,
) {
  const qc = useQueryClient();
  return useMutation<PwpCodesResponse, ApiError, PwpReserveInput>({
    mutationFn: (input) =>
      apiFetch<PwpCodesResponse>("/api/pwp-codes/reserve", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.pwpCodesMine() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * useFreePwpCode — DELETE /api/pwp-codes/reserve?cartLineKey=… Frees a removed /
 * zeroed trigger line's RESERVED codes (RESERVED only — never USED). On success,
 * invalidate `pwpCodesMine`. Best-effort — a missed free is swept by the order
 * route's Confirm-pass / the RESERVED-orphan cron.
 */
export function useFreePwpCode(
  opts?: Partial<UseMutationOptions<{ ok: boolean }, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, ApiError, string>({
    mutationFn: (cartLineKey) =>
      apiFetch<{ ok: boolean }>(
        `/api/pwp-codes/reserve?cartLineKey=${encodeURIComponent(cartLineKey)}`,
        { method: "DELETE" },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.pwpCodesMine() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/* ─── 0188 (Phase 8d) — PWP cross-order voucher DISCOVERY ───────────────────── */

/**
 * usePwpAvailableForPhone — GET /api/pwp-codes/available?phone=…[&code=…]. The
 * cross-order voucher discovery the POS cross-order affordance reads: the customer
 * enters / has captured a phone (auto-suggest) OR a salesperson types a voucher
 * code (manual entry). The route calls the SECURITY DEFINER `pwp_discover_available`
 * which returns the STRIPPED projection (NO bound phone / owner / trigger sku) +
 * a server-computed `phoneMatches` boolean — so the raw bound phone is never sent
 * to the client (no PII / enumeration oracle). PDPA-safe by construction.
 *
 * `enabled` is gated by the caller on (PWP active AND a selector is present): with
 * no phone + no code the query is disabled (the route would 0-row anyway), so a
 * DORMANT / no-selector cart makes ZERO discovery traffic. Short `staleTime` so a
 * freshly-redeemed voucher drops out of the suggestion promptly on re-fetch.
 */
export function usePwpAvailableForPhone(
  selector: { phone?: string | null; code?: string | null; name?: string | null },
  opts?: Partial<UseQueryOptions<PwpDiscoverResponse>>,
) {
  const phone = (selector.phone ?? "").trim();
  const code = (selector.code ?? "").trim();
  // 0204 — the customer NAME rides along so the server can compute nameMatches
  // (the 2990s name+phone identity). Never a selector on its own.
  const name = (selector.name ?? "").trim();
  return useQuery({
    queryKey: qk.pwpAvailable({ phone: phone || null, code: code || null, name: name || null }),
    queryFn: () => {
      const params = new URLSearchParams();
      if (phone) params.set("phone", phone);
      if (code) params.set("code", code);
      if (name) params.set("name", name);
      return apiFetch<PwpDiscoverResponse>(
        `/api/pwp-codes/available${params.toString() ? `?${params.toString()}` : ""}`,
      );
    },
    // Default off unless a selector exists; the caller AND-gates with PWP-active.
    enabled: Boolean(phone || code),
    staleTime: 10_000,
    ...opts,
  });
}

/**
 * usePwpCodesByOrder — GET /api/pwp-codes/by-order/:orderId. The vouchers EARNED
 * on one order (carry-forward `source_order_id` = this order) — the 2990s
 * "codes printed on the SO" surface (Loo 2026-07-06): the POS ThankYou screen
 * lists them so the customer walks away with the code. Owner/dealer-scoped via
 * RLS; an order with no carried vouchers returns `{ codes: [] }`.
 */
export function usePwpCodesByOrder(
  orderId: string | null,
  opts?: Partial<UseQueryOptions<PwpCodesResponse>>,
) {
  return useQuery({
    queryKey: qk.pwpByOrder(orderId ?? ""),
    queryFn: () => apiFetch<PwpCodesResponse>(`/api/pwp-codes/by-order/${orderId}`),
    enabled: Boolean(orderId),
    staleTime: 30_000,
    ...opts,
  });
}

/**
 * 2026-05-22 (Loo) — Dealer-side create outlet. Used in DealerSettings →
 * Outlets section to add a second / third physical location after the
 * principal-seeded default outlet.
 */
export function useCreateOutlet(
  opts?: Partial<
    UseMutationOptions<
      { id: string; dealerId: string; name: string; address: string },
      ApiError,
      { name: string; address: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ id: string; dealerId: string; name: string; address: string }>(
        "/api/outlets",
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.outlets() });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

export function useSalespersons(
  outletId?: string,
  opts?: Partial<UseQueryOptions<SalespersonsListResponse>>,
) {
  return useQuery({
    queryKey: qk.salespersons(outletId),
    queryFn: () =>
      apiFetch<SalespersonsListResponse>(
        outletId ? `/api/salespersons?outletId=${outletId}` : "/api/salespersons",
      ),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/**
 * Phase 2D — Dealer/Showroom Settings page CRUD.
 * useCreateSalesperson posts to POST /api/salespersons. After success,
 * invalidates the wizard's salespersons cache so the dropdown shows the
 * new row immediately. The hook is intentionally agnostic of which dealer
 * the new SP belongs to — server derives that from the JWT.
 */
export function useCreateSalesperson(
  opts?: Partial<UseMutationOptions<SalespersonDto, ApiError, SalespersonCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<SalespersonDto, ApiError, SalespersonCreateInput>({
    mutationFn: (input) =>
      apiFetch<SalespersonDto>("/api/salespersons", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["salespersons"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useDeleteSalesperson(
  opts?: Partial<UseMutationOptions<{ ok: true }, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) =>
      apiFetch<{ ok: true }>(`/api/salespersons/${id}`, { method: "DELETE" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["salespersons"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// 0232 — Staff PIN login (Loo 2026-07-18)
//
// Read the staff roster + tier/PIN state, and the four token-minting /
// roster-mutating calls. Verify-pin / reauth / self-token return a signed staff
// token (StaffSessionResponse) the caller stores in `useStaffSession`; the
// central fetcher then echoes it on every subsequent request. Roster mutations
// invalidate BOTH `staff` (hasPin/tier) and `salespersons` (the POS dropdowns
// read the same rows).
// ---------------------------------------------------------------------------

/** GET /api/staff — the store's staff roster + `activated`/`selfStaffId`/`storeKind`.
 *  A principal passes another store's `dealerId` (RLS-read-all for internal roles);
 *  own-store reads pass none. */
export function useStaffList(
  dealerId?: string,
  opts?: Partial<UseQueryOptions<StaffListResponse>>,
) {
  return useQuery({
    queryKey: qk.staff(dealerId),
    queryFn: () =>
      apiFetch<StaffListResponse>(
        dealerId ? `/api/staff?dealerId=${dealerId}` : "/api/staff",
      ),
    staleTime: 30_000,
    ...opts,
  });
}

/** POST /api/staff/verify-pin — tap-a-tile PIN verify. Success mints a token;
 *  errors surface via ApiError.body (bad_pin{remaining} 401 · pin_locked{lockedUntil}
 *  423 · no_pin 409) for the keypad to render. */
export function useVerifyPin(
  opts?: Partial<UseMutationOptions<StaffSessionResponse, ApiError, VerifyPinInput>>,
) {
  return useMutation<StaffSessionResponse, ApiError, VerifyPinInput>({
    mutationFn: (input) =>
      apiFetch<StaffSessionResponse>("/api/staff/verify-pin", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
  });
}

/** POST /api/staff/reauth — re-prove the STORE email+password to mint an
 *  owner-mode token (setup wizard + "Forgot PIN"). */
export function useStaffReauth(
  opts?: Partial<UseMutationOptions<StaffSessionResponse, ApiError, StaffReauthInput>>,
) {
  return useMutation<StaffSessionResponse, ApiError, StaffReauthInput>({
    mutationFn: (input) =>
      apiFetch<StaffSessionResponse>("/api/staff/reauth", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
  });
}

/** POST /api/staff/self-token — a salesperson-role login mints its own token
 *  from the linked salespersons row (409 when unlinked). */
export function useStaffSelfToken(
  opts?: Partial<UseMutationOptions<StaffSessionResponse, ApiError, void>>,
) {
  return useMutation<StaffSessionResponse, ApiError, void>({
    mutationFn: () => apiFetch<StaffSessionResponse>("/api/staff/self-token", { method: "POST" }),
    ...opts,
  });
}

/** POST /api/staff — create a staff member (tier gating is server-side). A
 *  principal provisioning ANOTHER store passes `dealerId` (query param, like the
 *  GET); own-store creates omit it and the JWT's dealer wins. */
export function useCreateStaff(
  opts?: Partial<UseMutationOptions<StaffDto, ApiError, CreateStaffInput & { dealerId?: string }>>,
) {
  const qc = useQueryClient();
  return useMutation<StaffDto, ApiError, CreateStaffInput & { dealerId?: string }>({
    mutationFn: ({ dealerId, ...input }) =>
      apiFetch<StaffDto>(`/api/staff${dealerId ? `?dealerId=${dealerId}` : ""}`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["staff"] });
      await qc.invalidateQueries({ queryKey: ["salespersons"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** PATCH /api/staff/:id — edit name/color/outlet/tier/active (server tier-gates). */
export function usePatchStaff(
  opts?: Partial<UseMutationOptions<StaffDto, ApiError, { id: string; patch: UpdateStaffInput }>>,
) {
  const qc = useQueryClient();
  return useMutation<StaffDto, ApiError, { id: string; patch: UpdateStaffInput }>({
    mutationFn: ({ id, patch }) =>
      apiFetch<StaffDto>(`/api/staff/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["staff"] });
      await qc.invalidateQueries({ queryKey: ["salespersons"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** POST /api/staff/:id/pin — set/reset a member's 6-digit PIN (server scope-gates). */
export function useSetStaffPin(
  opts?: Partial<UseMutationOptions<{ ok: true }, ApiError, { id: string } & SetStaffPinInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, { id: string } & SetStaffPinInput>({
    mutationFn: ({ id, pin }) =>
      apiFetch<{ ok: true }>(`/api/staff/${id}/pin`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["staff"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 3 — Principal hooks
// ---------------------------------------------------------------------------
// API contract is snake_case for dashboard / approvals / audit (the RPC
// payload is forwarded verbatim) and camelCase for the dealer list rows
// (the dealers route does the snake→camel adapter inline). We mirror that
// distinction here in the response types — no silent conversion.

/** Shape returned by GET /api/principal/dashboard.
 *  Matches `principal_dashboard_summary()` (migration 0013). */
export interface PrincipalDashboardKpis {
  total_gmv: number;
  active_orders: number;
  active_dealers: number;
  total_dealers: number;
  pending_approvals: number;
  low_stock_skus: number;
}
export interface PrincipalLeaderboardRow {
  id: string;
  name: string;
  region: string;
  status: string;
  order_count: number;
  gmv: number;
}
export interface PrincipalPendingApprovalRow {
  id: string;
  kind: string;
  title: string;
  actor: string;
  refers_to: string | null;
  amount: number | null;
  dealer_id: string | null;
  created_at: string;
}
export interface PrincipalAuditRow {
  id: string;
  role: string;
  actor_text: string;
  action: string;
  dealer_id: string | null;
  ref: string | null;
  occurred_at: string;
}
export interface PrincipalAlerts {
  suspended_dealers: number;
  low_stock: { sku: string; name: string; available: number; incoming: number }[];
}
export interface PrincipalDashboardResponse {
  kpis: PrincipalDashboardKpis;
  leaderboard: PrincipalLeaderboardRow[];
  pending_approvals: PrincipalPendingApprovalRow[];
  audit_recent: PrincipalAuditRow[];
  alerts: PrincipalAlerts;
}

/** Shape returned by GET /api/approvals (raw row from approvals table). */
export interface ApprovalRow {
  id: string;
  kind: string;
  status: "pending" | "approved" | "rejected";
  title: string;
  actor: string;
  refers_to: string | null;
  amount: number | null;
  dealer_id: string | null;
  reason: string | null;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}
export interface ApprovalsListResponse {
  approvals: ApprovalRow[];
}

/** Shape returned by GET /api/principal/dealers (camelCase via inline adapter). */
export interface PrincipalDealerRow {
  id: string;
  name: string;
  region: string;
  contact: string;
  status: "active" | "suspended" | "pending" | "rejected";
  joinedDate: string;
  creditLimit: number;
  paymentTerms: string;
  depositBalance: number;
  orderCount: number;
  gmv: number;
  outstanding: number;
}
export interface PrincipalDealersListResponse {
  dealers: PrincipalDealerRow[];
}

/** Shape returned by GET /api/principal/dealers/:id. The `dealer` field is
 *  the raw row from `dealer_with_stats` RPC (snake_case). `recentOrders` is
 *  hand-rolled camelCase in the route. */
export interface PrincipalDealerDetailDealer {
  id: string;
  name: string;
  region: string;
  contact: string;
  status: string;
  joined_date: string;
  credit_limit: number;
  payment_terms: string;
  deposit_balance: number;
  order_count: number;
  gmv: number;
  outstanding: number;
  // 2026-05-22 (Loo) — populated by GET /api/principal/dealers/:id via a
  // second SELECT, since dealer_with_stats RPC returns only legacy columns.
  // All null-able because pre-migration-0144/0145/0146 rows may not have
  // had the editor touch them yet.
  address: string | null;
  ssm_code: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}
export interface PrincipalDealerRecentOrder {
  id: string;
  so: number;
  status: string;
  customerName: string;
  paid: number;
  total: number;
}
export interface PrincipalDealerDetailResponse {
  dealer: PrincipalDealerDetailDealer;
  recentOrders: PrincipalDealerRecentOrder[];
}

// === Read hooks ===

/** Dashboard summary — KPIs + leaderboard + pending approvals + audit recent
 *  + alerts. One round-trip per refresh. */
export function usePrincipalDashboard(
  opts?: Partial<UseQueryOptions<PrincipalDashboardResponse>>,
) {
  return useQuery({
    queryKey: qk.principal.dashboard(),
    queryFn: () =>
      apiFetch<PrincipalDashboardResponse>("/api/principal/dashboard"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Approvals inbox — defaults to status='pending' on the server when omitted. */
export function useApprovals(
  filters: ApprovalFilters = {},
  opts?: Partial<UseQueryOptions<ApprovalsListResponse>>,
) {
  return useQuery({
    queryKey: qk.principal.approvals(filters),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.kind) params.set("kind", filters.kind);
      const qs = params.toString();
      return apiFetch<ApprovalsListResponse>(
        `/api/approvals${qs ? `?${qs}` : ""}`,
      );
    },
    staleTime: 30_000,
    ...opts,
  });
}

/** Dealer admin list — rolled-up stats (gmv, order_count, outstanding). */
export function usePrincipalDealers(
  filters: PrincipalDealerFilters = {},
  opts?: Partial<UseQueryOptions<PrincipalDealersListResponse>>,
) {
  return useQuery({
    queryKey: qk.principal.dealers(filters),
    queryFn: () =>
      apiFetch<PrincipalDealersListResponse>("/api/principal/dealers"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Dealer detail + last 8 orders. Pass `null` when no dealer is open
 *  (e.g. drawer closed) to disable the query. */
export function usePrincipalDealer(
  id: string | null,
  opts?: Partial<UseQueryOptions<PrincipalDealerDetailResponse>>,
) {
  return useQuery({
    queryKey: id ? qk.principal.dealer(id) : (["principal", "dealers", "null"] as const),
    queryFn: () =>
      apiFetch<PrincipalDealerDetailResponse>(`/api/principal/dealers/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    ...opts,
  });
}

// === Mutation hooks (closure-captured ID, await invalidate) ===
//
// All four follow the Phase 2C cache-sync pattern:
//   1. The mutation hook closes over the id (e.g. `useDecideApproval(id)`)
//      so callers cannot accidentally mismatch the URL param vs the cache key
//      when reading from the same query.
//   2. `onSuccess` `await`s every invalidation BEFORE returning, so the next
//      render sees authoritative data — fixes the "Windows screen out of
//      sync" class of bugs we hit in 2C.

/** Decide an approval (approve | reject). Ripples to dashboard (KPI counts),
 *  approvals list (status flip), and dealers (new_dealer approvals turn a
 *  pending dealer active). */
export function useDecideApproval(
  approvalId: string,
  opts?: Partial<
    UseMutationOptions<
      { approval: ApprovalRow },
      ApiError,
      { status: "approved" | "rejected"; note?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { approval: ApprovalRow },
    ApiError,
    { status: "approved" | "rejected"; note?: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ approval: ApprovalRow }>(
        `/api/approvals/${approvalId}/decide`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      await qc.invalidateQueries({
        queryKey: qk.principal.dashboard(),
        exact: true,
      });
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

/** Invite a new dealer. Idempotent on (name, region) — server returns
 *  `idempotent: true` when the second call hits an existing pending dealer. */
export function useInviteDealer(
  opts?: Partial<
    UseMutationOptions<
      {
        dealer: PrincipalDealerDetailDealer;
        approval: ApprovalRow;
        idempotent: boolean;
      },
      ApiError,
      { name: string; region: string; contact: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    {
      dealer: PrincipalDealerDetailDealer;
      approval: ApprovalRow;
      idempotent: boolean;
    },
    ApiError,
    { name: string; region: string; contact: string }
  >({
    mutationFn: (input) =>
      apiFetch<{
        dealer: PrincipalDealerDetailDealer;
        approval: ApprovalRow;
        idempotent: boolean;
      }>("/api/principal/dealers/invite", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      await qc.invalidateQueries({
        queryKey: qk.principal.dashboard(),
        exact: true,
      });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

/** Suspend / reactivate a dealer. Updates dashboard suspended_dealers count
 *  via dashboard invalidate. */
export function useDealerSetStatus(
  dealerId: string,
  opts?: Partial<
    UseMutationOptions<
      { dealer: PrincipalDealerDetailDealer },
      ApiError,
      { status: "active" | "suspended"; reason?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { dealer: PrincipalDealerDetailDealer },
    ApiError,
    { status: "active" | "suspended"; reason?: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ dealer: PrincipalDealerDetailDealer }>(
        `/api/principal/dealers/${dealerId}/status`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({
        queryKey: qk.principal.dealer(dealerId),
        exact: true,
      });
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      await qc.invalidateQueries({
        queryKey: qk.principal.dashboard(),
        exact: true,
      });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

/**
 * 2026-05-22 (Loo) — PATCH dealer profile (name, region, address, ssm_code,
 * contact name/phone). Every field optional; the server applies a partial
 * UPDATE and recomputes the legacy `dealers.contact` text column when
 * contact_name or contact_phone changes.
 */
export function useUpdateDealer(
  dealerId: string,
  opts?: Partial<
    UseMutationOptions<
      { ok: boolean; dealer: unknown },
      ApiError,
      {
        name?: string;
        region?: string;
        address?: string;
        ssmCode?: string;
        contactName?: string;
        contactPhone?: string;
      }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ ok: boolean; dealer: unknown }>(
        `/api/principal/dealers/${dealerId}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({
        queryKey: qk.principal.dealer(dealerId),
        exact: true,
      });
      await qc.invalidateQueries({ queryKey: ["principal", "dealers"] });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

// ===========================================================================
// Phase 10 — Principal Accounts admin
// ===========================================================================
// Closes phase-10-rotate-alpha-test-passwords HIGH carry-forward by giving
// the principal a UI surface for create / disable / re-enable / reset-password
// instead of needing direct SQL + auth.admin.updateUserById on the server.

export type AppRole =
  | "principal"
  | "dealer"
  | "salesperson"
  | "showroom"
  | "operation"
  | "supplier"
  | "partner"
  | "finance"
  | "bd";

export interface AccountRow {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  title: string | null;
  status: "active" | "invited" | "disabled";
  dealerId: string | null;
  supplierId: string | null;
  partnerId: string | null;
  outletId: string | null;
  orgName: string | null;
  createdBy: string | null;
  lastSeenAt: string | null;
  createdAt: string;
}

export function usePrincipalAccounts() {
  return useQuery<{ users: AccountRow[] }, ApiError>({
    queryKey: qk.principal.accounts(),
    queryFn: () => apiFetch("/api/principal/accounts"),
  });
}

export function useCreateAccount(
  opts?: Partial<
    UseMutationOptions<
      {
        id: string;
        email: string;
        name: string;
        role: AppRole;
        dealerId: string | null;
        supplierId: string | null;
        partnerId: string | null;
      },
      ApiError,
      {
        name: string;
        email: string;
        role: AppRole;
        title?: string | null;
        companyName?: string;
        region?: string;
        outletName?: string;
        address?: string;
        ssmCode?: string;
        contactName?: string;
        contactPhone?: string;
        tempPassword: string;
      }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{
        id: string;
        email: string;
        name: string;
        role: AppRole;
        dealerId: string | null;
        supplierId: string | null;
        partnerId: string | null;
      }>("/api/principal/accounts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.principal.accounts() });
      await qc.invalidateQueries({ queryKey: qk.principal.audit() });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

export function useSetAccountStatus(
  userId: string,
  opts?: Partial<
    UseMutationOptions<
      { id: string; status: "active" | "disabled" },
      ApiError,
      { status: "active" | "disabled"; reason?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ id: string; status: "active" | "disabled" }>(
        `/api/principal/accounts/${userId}/status`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.principal.accounts() });
      await qc.invalidateQueries({ queryKey: qk.principal.audit() });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

export function useResetAccountPassword(
  userId: string,
  opts?: Partial<
    UseMutationOptions<
      { id: string; ok: true },
      ApiError,
      { tempPassword: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) =>
      apiFetch<{ id: string; ok: true }>(
        `/api/principal/accounts/${userId}/reset-password`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.principal.audit() });
      opts?.onSuccess?.(
        ...(args as Parameters<NonNullable<typeof opts.onSuccess>>),
      );
    },
  });
}

// ===========================================================================
// Phase 4 — HQ operation hooks
// ===========================================================================
// API contract is snake_case across the board (matching how Phase 3 principal
// dashboard / approvals payloads are forwarded verbatim from the RPCs). The
// list endpoints returning PostgREST-shaped rows keep the snake_case row
// fields too — adapters live at the consumer page if/when they need camelCase.
//
// Mutation hooks follow the Phase 2C / Phase 3 pattern:
//   1. Closure-capture the path-id (e.g. `useAssignPartnerMutation(orderId)`)
//      so callers cannot accidentally mismatch the URL param vs. the cache key.
//   2. `onSuccess` `await`s the relevant invalidations BEFORE returning so the
//      next render sees authoritative data — closes the "out of sync drawer"
//      class of bugs we hit in Phase 2C.
//   3. Forward the caller's `onSuccess` last (signature-agnostic spread).

// --- Shared response shapes (snake_case, forwarded from RPC / route) -------

/** GET /api/operation/dashboard — `operation_dashboard_summary()` payload.
 *  Field names mirror the RPC verbatim (migration 0019, lines 380-414):
 *  `today_deliveries`, `open_pos`, `overdue_orders`, `active_orders`,
 *  `active_gmv`. The proto KPI tiles read these as Today / Open POs / Overdue. */
export interface operationDashboardKpis {
  today_deliveries: number;
  open_pos: number;
  overdue_orders: number;
  active_orders: number;
  active_gmv: number;
}
export interface operationPipelineCounts {
  /** Pipeline v2 (C3): orders with `status='place'` — dealer-side, not yet
   *  proceeded. Counted via the dashboard route since the RPC is frozen. */
  placed: number;
  /** Pipeline v2 (C3): orders with `operation_stage='confirmed'` —
   *  awaiting HQ operation triage decision. */
  confirmed: number;
  in_production: number;
  ready_to_dispatch: number;
  dispatched: number;
}
export interface operationOpenPoRow {
  id: string;
  supplier_id: string;
  warehouse_id: string;
  status: string;
  sup_status: string;
  eta_date: string | null;
  placed_at: string;
  so: number | null;
  so_refs: number[] | null;
}
export interface operationLowStockRow {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  available: number;
}
export interface operationAuditRow {
  id: string;
  role: string;
  actor_text: string | null;
  action: string;
  dealer_id: string | null;
  ref: string | null;
  occurred_at: string;
}
export interface operationAlerts {
  out_of_stock_skus: number;
}
export interface operationDashboardResponse {
  kpis: operationDashboardKpis;
  pipeline: operationPipelineCounts;
  open_pos: operationOpenPoRow[];
  low_stock: operationLowStockRow[];
  audit_recent: operationAuditRow[];
  alerts: operationAlerts;
}

/** Row in GET /api/operation/partners. Bare `delivery_partners` row trimmed to
 *  what `DispatchModal` needs (name + zones in the option label, contact in the
 *  preview). */
export interface DeliveryPartnerRow {
  id: string;
  name: string;
  contact: string | null;
  zones: string | null;
}
export interface DeliveryPartnersListResponse {
  partners: DeliveryPartnerRow[];
}

/** Row in GET /api/operation/suppliers. Used by `CreatePOModal` for the
 *  supplier dropdown + auto-detect via `cat_covered`. `kind` is the supplier's
 *  fulfilment mode (own_logistics ships goods themselves; factory_pickup
 *  expects operation to dispatch a partner to the factory). */
export interface SupplierRow {
  id: string;
  name: string;
  kind: "own_logistics" | "factory_pickup";
  cat_covered: string[];
  lead_time: string | null;
  contact: string | null;
}
export interface SuppliersListResponse {
  suppliers: SupplierRow[];
}

/** Phase 4.5 Chunk 2 (T9) — embedded `order_supplier_threads` row shape on
 *  operation order list/detail responses. Carries the per-leg customer-side LP
 *  fields that migrated off `purchase_orders` per design spec §CQ1 option (b).
 *  One row per (order, supplier, category); a multi-supplier order spawns N
 *  threads, each with its own customer-leg LP assignment. */
export interface operationOrderThreadRow {
  id: string;
  supplier_id: string;
  category: string;
  operation_stage:
    | "placed"
    | "confirmed"
    | "in_production"
    | "ready_to_dispatch"
    | "dispatched"
    | "delivered";
  po_id: string | null;
  /** Phase 4.5 Chunk 2 customer-leg LP source (migration 0049). FE OrderCard
   *  reads this to render the LP pill; an order may have heterogeneous LPs
   *  across threads (different supplier legs picked different partners). */
  delivery_partner_id: string | null;
  /** 2026-05-18 (Loo) — partner name embed so OrderCard pill renders
   *  "via NETS" instead of "LP-{8-char UUID}". Closes the
   *  phase-4-detail-partner-name-join carry-forward. */
  delivery_partners: { id: string; name: string } | null;
  confirm_delivery_date: string | null;
  request_for_delivery_at: string | null;
  partner_accepted_at: string | null;
  partner_rejected_at: string | null;
}

/** Row in GET /api/operation/orders. Embedded `dealers(name)` is a PostgREST
 *  nested fetch shape — the route forwards it verbatim.
 *
 *  Pipeline v2 (C1/C2): adds `'placed'` + `'confirmed'` to operation_stage
 *  and widens status to include the dealer-side `'place'` value (orders that
 *  haven't been pushed to operation yet still surface in the kanban so HQ can
 *  see what's coming).
 *
 *  Phase 4.5 Chunk 2 (T9): adds embedded `order_supplier_threads` array
 *  (PostgREST nested fetch) — exposes per-thread customer-leg LP for the
 *  OrderCard pill. The order-level `delivery_partner_id` is kept for backward
 *  compat (print-DO and other legacy callers) — but the kanban now reads from
 *  threads to honor multi-supplier scenarios. */
export interface operationOrderListRow {
  id: string;
  so: number;
  status: "place" | "proceed_order" | "delivered";
  operation_stage:
    | "placed"
    | "confirmed"
    | "in_production"
    | "ready_to_dispatch"
    | "dispatched"
    | "delivered"
    | null;
  warehouse_id: string | null;
  customer_name: string;
  /** Jess redesign step 2 — control-table row subtitle + extra columns. All
   *  optional/nullable so the kanban OrderCard + existing fixtures that don't
   *  populate them keep typechecking. */
  customer_phone?: string | null;
  /** P2 (project-orders-control-spec) — drives the AREA (KV/Outstation) tag +
   *  the suggested default carrier in the control table (apps/web/src/lib/region.ts). */
  customer_address?: string | null;
  placed_at: string;
  delivery_date: string | null;
  delivery_date_tbd?: boolean | null;
  /** Phase 11.1 (migration 0165) — salesperson-entered planned production-start
   *  ("Process") date, pairs with delivery_date. Null on pre-11.1 / AutoCount orders. */
  proceed_date?: string | null;
  /** AutoCount provenance (migration 0132/0136). source_system='autocount'
   *  drives the entry rule (AutoCount→Proceed tab, native→Placed); source_ref
   *  is the CR/TCF doc-no list shown as the ref prefix. */
  source_system?: string | null;
  source_ref?: string[] | null;
  /** Inbox-triage LP (migration 0136), a delivery_partners.id resolved to a
   *  name client-side. Shown in the 物流 cell when no formal LP is set yet. */
  ops_assigned_logistic?: string | null;
  /** Compact line embed for the 货品 items summary (control table only). */
  order_lines?: { sku: string; qty: number; source_po?: string | null }[];
  delivery_partner_id: string | null;
  /** Migration 0147 (item h, 2026-05-23) — order-level LP request/accept/reject
   *  state. Set by `operation_confirm_proceed_request_v3` when Operation
   *  picks an LP at Accept Proceed; the LP then accepts (partner_accepted_at)
   *  or rejects (partner_rejected_at + partner_rejected_reason). On reselect
   *  Operation clears the reject and writes a fresh request_for_delivery_at. */
  request_for_delivery_at: string | null;
  partner_accepted_at: string | null;
  partner_rejected_at: string | null;
  partner_rejected_reason: string | null;
  /** Joined name for the order-level LP (when delivery_partner_id is set). */
  delivery_partners: { id: string; name: string } | null;
  do_number: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  outlet_id: string | null;
  dealer_id: string;
  dealers: { name: string } | null;
  /** Phase 4.5 Chunk 2 (T9) embedded customer-leg LP per thread. PostgREST
   *  nested fetches always return an array shape — never `null` — so this
   *  field is non-nullable. An empty array means no threads have been spawned
   *  yet (pre-confirm-proceed orders); the FE treats `[]` as "no thread state
   *  available" and omits the LP pill. */
  order_supplier_threads: operationOrderThreadRow[];
  /** Phase B (migration 0138) — latest annotation snippet for kanban card.
   *  PostgREST returns all annotations; card picks newest by created_at. */
  order_annotations: { content: string; tag: string | null; created_at: string }[];
  /** Jess 2026-06-24 — the 4 operator remark fields surfaced into the list (was
   *  drawer-only) so the Orders table's Remark column can show them. From
   *  ops_order_control (1:1 via order_id); PostgREST returns the embed as a
   *  single object, or null when no overlay row exists yet. Defensively also
   *  typed as an array in case PostgREST resolves the relation as to-many. */
  ops_order_control?: opsRemarkEmbed | opsRemarkEmbed[] | null;
}
export interface opsRemarkEmbed {
  // Optional (C2): the list no longer renders these remark fields in-row, and
  // test fixtures build partial overlays (e.g. just `balance`), so they're not
  // required on the embed type. Still selected by the query when present.
  customer_request?: string | null;
  action_for_logistic?: string | null;
  carres_remark?: string | null;
  warehouse_remark?: string | null;
  /** The logistic's committed delivery date (migration 0180) — distinct from the
   *  customer's `delivery_date` deadline. Surfaced into the Orders list ETA
   *  column (Jess 2026-06-25); operation fills it from the drawer or the cell. */
  logistic_eta?: string | null;
  /** Payment + storage overlay (C2 Next-action, 2026-07-08) — the Orders list now
   *  also reads these so the "Collect $" payment-hold + "Call customer" lamps can
   *  compute. All optional so pre-C2 fixtures keep typechecking. */
  balance?: number | string | null;
  payment_status?: string | null;
  storage_fee_msbf?: number | string | null;
  storage_fee_sof?: number | string | null;
  storage_paid?: boolean | null;
  storage_collected_at?: string | null;
  storage_waiver_status?: string | null;
  called_customer?: boolean | null;
  /** Per-line supplier ETA + stock status (Import from Master → migration 0170).
   *  `line_etas` maps a line key → ISO ETA; `line_stock_status` maps it →
   *  "waiting" / "ready". The Orders list STOCK column reads the latest waiting
   *  ETA from these (Jess spec §5, stock_eta version, 2026-07-12). */
  line_etas?: Record<string, string> | null;
  line_stock_status?: Record<string, string> | null;
}
export interface operationOrdersListResponse {
  orders: operationOrderListRow[];
}

/** GET /api/operation/orders/:id — composed drawer payload (orders.ts §97). */
export interface operationOrderDetailOrder {
  id: string;
  so: number;
  /** Customer/source reference(s), e.g. ["DL0584"] — shown next to the SO. */
  source_ref: string[] | null;
  /** 'autocount' for imported orders (already proceeded — never "placed"). */
  source_system?: string | null;
  status: string;
  operation_stage:
    | "placed"
    | "confirmed"
    | "in_production"
    | "ready_to_dispatch"
    | "dispatched"
    | "delivered"
    | null;
  warehouse_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_address_unknown: boolean;
  /** 2026-07-16 — POS-captured extras surfaced to the drawer's customer card.
   *  Emergency = one composed string ("Name · Phone · Relationship"); billing
   *  only meaningful when customer_billing_same is false. Optional so older
   *  detail fixtures keep typechecking. */
  customer_emergency?: string | null;
  customer_billing?: string | null;
  customer_billing_same?: boolean;
  delivery_date: string | null;
  delivery_date_tbd: boolean;
  /** Phase 11.1 (migration 0165) — salesperson-entered planned production-start
   *  date, pairs with delivery_date. Null on pre-11.1 / AutoCount orders.
   *  Optional so detail fixtures that predate the field keep typechecking. */
  proceed_date?: string | null;
  placed_at: string;
  do_number: string | null;
  do_note: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  delivery_partner_id: string | null;
  /** P2 (migration 0136/0159) — planned logistic carrier set in Inbox/drawer
   *  triage (status='place' orders). Distinct from delivery_partner_id (the
   *  formal LP owned by the proceed/dispatch flow). Optional so existing detail
   *  fixtures that predate the field keep typechecking. */
  ops_assigned_logistic?: string | null;
  /** Migration 0156 — multi-leg delivery chain (γ). Null/empty = single-leg
   *  (uses delivery_partner_id). Otherwise an ordered array of stops; each
   *  carries partner_id + partner_name + from_loc + to_loc + per-leg POD
   *  url + status. See `packages/shared/src/schemas/delivery-chain.ts` for
   *  the typed shape. */
  delivery_stops: DeliveryStop[] | null;
  dealer_id: string;
  outlet_id: string | null;
  /** 0098: auto-set by orders_auto_issue_on_dispatched_trg when
   *  operation_stage transitions to 'dispatched'. Surfaces in the drawer
   *  as the Print Invoice button gate. */
  invoice_no: string | null;
  invoiced_at: string | null;
  /** 0105 — surfaced so the drawer can render the Record-top-up modal at
   *  ready_to_dispatch / dispatched stages (operation records the customer's
   *  final balance payment at delivery). */
  paid: number;
  dealers: { name: string } | null;
  outlets: { name: string } | null;
}
export interface operationOrderDetailLine {
  sku: string;
  qty: number;
  unit_price: number;
  /** 2026-07-16 — server-resolved readable product name ("Model · Variant")
   *  from product_skus/product_models; null when the sku isn't in the catalog
   *  (e.g. AutoCount free-text skus). Optional for older fixtures. */
  label?: string | null;
  // 2026-05-10 (Loo) — cascade picker payload threaded into the "+ Issue POs"
  // → CreatePOModal navigation so bedframe color/gap and sofa fabric stay
  // attached to the new PO line. Null for mattress lines (no extras) and
  // pre-cascade legacy data.
  attrs?: Record<string, unknown> | null;
  /** AutoCount PO number carried on the imported line (order_lines.source_po).
   *  Present ⇒ the order already has a PO — do NOT show "No PO" for it. */
  source_po?: string | null;
}
export interface operationOrderDetailAddon {
  addon_key: string;
  qty: number;
  unit_price: number;
}
export interface operationOrderDetailHistoryRow {
  text: string;
  by_role: string | null;
  occurred_at: string;
}
export interface operationOrderDetailWarehouse {
  id: string;
  name: string;
  address: string | null;
}
export interface operationOrderDetailStockBalance {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
}
export interface operationOrderDetailPoLine {
  id: string;
  po_id: string;
  sku: string;
  qty: number;
  received_qty: number;
}
/** A free per-unit stock item at the order's warehouse (Jess 2026-06-30). The
 *  drawer matches these to each line by normalizeSkuKey (the catalog is empty,
 *  so order_lines.sku ↔ ops_stock_items.sku only match after normalisation) and
 *  lets the operator reserve the chosen unit(s) to the order's SO. */
export interface operationOrderDetailFreeUnit {
  id: string;
  unitCode: string | null;
  sku: string;
  warehouseId: string;
  condition: "new" | "exhibition" | "old" | "refurbished" | "damaged";
  poNo: string | null;
  sourceRef: string | null;
  dateIn: string | null;
}
export interface operationOrderDetailPo {
  id: string;
  supplier_id: string;
  warehouse_id: string;
  status: string;
  sup_status: string;
  so: number | null;
  so_refs: number[] | null;
  eta_date: string | null;
  lines: operationOrderDetailPoLine[];
}
export interface operationOrderDetailResponse {
  order: operationOrderDetailOrder;
  lines: operationOrderDetailLine[];
  addons: operationOrderDetailAddon[];
  total: number;
  warehouse: operationOrderDetailWarehouse | null;
  stockBalances: operationOrderDetailStockBalance[];
  freeUnits: operationOrderDetailFreeUnit[];
  pos: operationOrderDetailPo[];
  history: operationOrderDetailHistoryRow[];
  /** Phase 4.5 Chunk 2 (T9) — per-supplier thread rows carrying customer-leg
   *  LP state. Drawer reads `threads[].delivery_partner_id` to compute partner
   *  assignment instead of order-level `delivery_partner_id`, since per design
   *  spec §CQ1 option (b) the customer-leg LP lives on the thread now. */
  threads: operationOrderThreadRow[];
}

/** Row in GET /api/operation/pos. `purchase_order_lines(...)` is the embedded
 *  PostgREST nested resource. */
export interface operationPoListRow {
  id: string;
  supplier_id: string;
  warehouse_id: string;
  status: "open" | "received" | "cancelled";
  sup_status: string;
  so: number | null;
  so_refs: number[] | null;
  eta_date: string | null;
  placed_at: string;
  purchase_order_lines: {
    // 0076 (Loo 2026-05-10): line UUID — primary key after migration. Used
    // by ReceivePOModal as the recv-state key (replacing sku) so multi-
    // variant lines (same SKU different colors/fabrics) don't collide. Also
    // the lookup key for operation_receive_po_with_do.
    id: string;
    sku: string;
    qty: number;
    received_qty: number;
    // 0073 cascade picker (Loo 2026-05-09). Null for mattress + legacy
    // pre-0073 lines; bedframe carries {color, gap}; sofa carries
    // {fabric_id, fabric_name, fabric_surcharge}.
    attrs?: Record<string, unknown> | null;
  }[];
  /** 2026-05-18 (Loo C+D) — per-source-SO enrichment from
   *  /api/operation/procurement/:slug. One entry per SO this PO serves
   *  (po.so for single, po.so_refs[] for bundle). Empty for stockpile POs
   *  or non-procurement-tabs endpoints (the global /api/operation/pos still
   *  returns the bare row without this field — treat as []). */
  orders?: {
    so: number;
    customer_name: string;
    delivery_date: string | null;
  }[];
  /** 2026-05-18 (Loo C+D) — worst-case urgency across source SOs. NULL when
   *  the PO has no source SOs (stockpile) or all delivery_date are NULL. */
  urgency?: "critical" | "urgent" | "normal" | null;
}
export interface operationPosListResponse {
  pos: operationPoListRow[];
}

/** Pipeline v2 (C4) — re-export the zod-derived drill-down shape so consumers
 *  don't have to import from @carres/shared directly. */
export type operationReservedDrilldownResponse = ReservedDrilldownResponse;

/** Pipeline v2 (C5.3) — re-export the awaiting-stock shortage shape for the
 *  CreatePOModal auto-fill button, same convention as the drill-down above. */
export type operationAwaitingStockShortageResponse = AwaitingStockShortageResponse;

/** GET /api/operation/warehouse — composed table-style payload (warehouse.ts). */
export type LowStockStatus = "out" | "low" | "ok";
export interface WarehouseStockEntry {
  sku: string;
  qty: number;
  reserved: number;
  low_stock_status: LowStockStatus;
  /** T42-pass3-C1 — current `stock_balances.low_threshold`. NULL = no alert
   *  configured. Used by `SetThresholdDialog` prefill from OperationWarehouse. */
  low_threshold: number | null;
  /** T42-pass3-C1 — current `stock_balances.high_threshold`. NULL = use low * 2
   *  fallback. Same prefill purpose as low_threshold. */
  high_threshold: number | null;
}
export interface WarehouseSkuTotals {
  total_qty: number;
  total_reserved: number;
  low_stock_status_aggregate: LowStockStatus;
}
export interface WarehouseListResponse {
  /** P4 — `owning_partner_id` NULL = Carres own warehouse (GRN-eligible, e.g.
   *  Klang); non-NULL = LP-owned (e.g. HOUZS Balakong) — goods there are tracked
   *  by Stock Location, not a Klang GRN. */
  warehouses: { id: string; name: string; address: string | null; owning_partner_id?: string | null }[];
  byWarehouse: Record<string, WarehouseStockEntry[]>;
  totalsBySku: Record<string, WarehouseSkuTotals>;
}

/** GET /api/operation/movements — `stock_movements` table rows + cap. */
export interface MovementRow {
  id: string;
  sku: string;
  warehouse_id: string;
  qty: number;
  kind: "in" | "out" | "adjust";
  ref: string | null;
  note: string | null;
  by_role: string | null;
  occurred_at: string;
}
export interface MovementsListResponse {
  rows: MovementRow[];
  limit: number;
}

/** Mutation responses — RPCs return the mutated row; routes wrap in `{ x: data }`. */
export interface operationOrderMutationResponse {
  order: unknown;
}
export interface operationPoMutationResponse {
  po: unknown;
}
export interface operationRecheckStockResponse {
  warehouseId: string | null;
  shortages: { sku: string; short: number }[];
}
export interface operationIssuePosResponse {
  pos_created: { po_id: string; supplier_id: string; lines: number }[];
}
export interface operationAdjustStockResponse {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
}
/** Phase 4.5 Chunk 2 (T18/T21) — `GET /api/operation/stock-alerts` row shape.
 *  RPC `operation_stock_alerts()` returns rows where `(qty - reserved) <
 *  low_threshold`. The dashboard tile slices the top-3 by shortage; the
 *  warehouse page (Sprint D follow-up) drives a red-dot indicator off the
 *  count. `effective = qty - reserved`; `shortage = low_threshold - effective`. */
export interface operationStockAlertRow {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  effective: number;
  low_threshold: number;
  shortage: number;
}
export interface operationStockAlertsResponse {
  alerts: operationStockAlertRow[];
}
/** GET /api/operation/stock — cross-warehouse availability (apps/api/src/routes/
 *  operation/stock.ts). `available` = qty − reserved, summed across warehouses.
 *  Shared by the Stock On-Hand page AND the Orders control table's Stock column
 *  (via useOperationStock) so both surfaces agree on a SKU's free balance. */
export interface operationStockResponse {
  warehouses: { id: string; name: string }[];
  skus: {
    sku: string;
    name: string;
    category: string | null;
    price: number;
    available: number;
    lowThreshold: number;
    incoming: number;
    perWarehouse: Record<string, { qty: number; reserved: number }>;
  }[];
  summary: { totalSkus: number; lowStockCount: number; openPos: number };
}
export interface operationReceivePoWithDoResponse {
  po_id: string;
  do_file_path: string;
  do_number: string;
  lines_updated: number;
  threads_advanced: number;
  po_status: "open" | "received" | "cancelled";
  sup_status: string;
  was_relocated: boolean;
}

// --- Filter → query string helpers -----------------------------------------

function operationOrdersSearch(f?: operationOrderFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.stage && f.stage !== "all") params.set("stage", f.stage);
  if (f.channel && f.channel !== "all") params.set("channel", f.channel);
  if (f.search) params.set("search", f.search);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function operationPosSearch(f?: operationPoFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.status && f.status !== "all") params.set("status", f.status);
  if (f.supplierId) params.set("supplierId", f.supplierId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function movementsSearch(f?: MovementsFilters): string {
  if (!f) return "";
  const params = new URLSearchParams();
  if (f.warehouseId) params.set("warehouseId", f.warehouseId);
  if (f.category && f.category !== "all") params.set("category", f.category);
  if (f.sku) params.set("sku", f.sku);
  if (f.kind && f.kind !== "all") params.set("kind", f.kind);
  if (f.search) params.set("search", f.search);
  if (f.period && f.period !== "30d") params.set("period", f.period);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// --- Query hooks (7) -------------------------------------------------------

/** operation dashboard — KPIs + pipeline + open POs + low stock + audit. */
export function useOperationDashboard(
  opts?: Partial<UseQueryOptions<operationDashboardResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.dashboard(),
    queryFn: () =>
      apiFetch<operationDashboardResponse>("/api/operation/dashboard"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Loo 2026-05-10 — sidebar badge counts. Polled every 30s so the operator
 *  sees the chip update without leaving the page. Mounted from
 *  OperationSidebar; staleTime matches refetchInterval so the cache stays
 *  warm across nav transitions. */
export function useOperationBadges(
  opts?: Partial<UseQueryOptions<import("@carres/shared").OperationBadgesResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.badges(),
    queryFn: () =>
      apiFetch<import("@carres/shared").OperationBadgesResponse>(
        "/api/operation/badges",
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
    ...opts,
  });
}

/**
 * Mark a operation nav badge as seen — Loo 2026-05-11 unread semantics.
 *
 * Optimistically zeros the count for the given key in the badges cache so
 * the UI reacts instantly (~16 ms instead of waiting for the next 30s
 * poll). On settle, invalidates the badges query so the actual server
 * count (could be >0 if new items advanced between click and ack)
 * reconciles.
 *
 * Pairs with POST /api/operation/badges/seen which calls the
 * mark_badge_seen RPC (migration 0083).
 */
// 0152 (Loo 2026-05-31) — `lp_rejected` added. Its response field is camelCase
// `lpRejected` (the others match their short key), so the optimistic-zero needs
// a short→field map below.
type operationBadgeKey =
  | "operation:orders"
  | "operation:procurement"
  | "operation:lp_rejected";
type operationBadgeKeyShort = "orders" | "procurement" | "lp_rejected";
const BADGE_FIELD: Record<operationBadgeKeyShort, keyof import("@carres/shared").OperationBadgesResponse> = {
  orders: "orders",
  procurement: "procurement",
  lp_rejected: "lpRejected",
};

export function useMarkOperationBadgeSeen() {
  const qc = useQueryClient();
  return useMutation<
    { badgeKey: operationBadgeKey; lastSeenAt: string },
    ApiError,
    operationBadgeKeyShort,
    { prev: import("@carres/shared").OperationBadgesResponse | undefined }
  >({
    mutationFn: (short) =>
      apiFetch("/api/operation/badges/seen", {
        method: "POST",
        body: JSON.stringify({ badgeKey: `operation:${short}` }),
      }),
    onMutate: async (short) => {
      await qc.cancelQueries({ queryKey: qk.operation.badges() });
      const prev = qc.getQueryData<import("@carres/shared").OperationBadgesResponse>(
        qk.operation.badges(),
      );
      if (prev) {
        qc.setQueryData<import("@carres/shared").OperationBadgesResponse>(
          qk.operation.badges(),
          { ...prev, [BADGE_FIELD[short]]: 0 },
        );
      }
      return { prev };
    },
    onError: (_err, _short, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.operation.badges(), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.operation.badges() });
    },
  });
}

/** Delivery partners — populates the DispatchModal dropdown (M5 task 2 §18.3).
 *  Stable list, rarely changes; cache for 5 minutes. */
export function useDeliveryPartners(
  opts?: Partial<UseQueryOptions<DeliveryPartnersListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.partners(),
    queryFn: () =>
      apiFetch<DeliveryPartnersListResponse>("/api/operation/partners"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/** Suppliers — populates the CreatePOModal supplier dropdown (M5 task 3
 *  §18.4). Stable list (suppliers are managed in operation Settings + don't
 *  change between sessions); cache for 5 minutes. */
export function useOperationSuppliers(
  opts?: Partial<UseQueryOptions<SuppliersListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.suppliers(),
    queryFn: () =>
      apiFetch<SuppliersListResponse>("/api/operation/suppliers"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/** operation orders kanban list. Server defaults stage='all', channel='all'. */
export function useOperationOrders(
  filters: operationOrderFilters = {},
  opts?: Partial<UseQueryOptions<operationOrdersListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.orders(filters),
    queryFn: () =>
      apiFetch<operationOrdersListResponse>(
        "/api/operation/orders" + operationOrdersSearch(filters),
      ),
    staleTime: 30_000,
    // Keep showing the previous filtered/searched list while fetching the
    // next one — without this, the query key flips on every keystroke and
    // TanStack treats each filter change as a brand-new query (no data →
    // isLoading=true → page falls back to <KanbanSkeleton />, which
    // unmounts the search input mid-keystroke and steals focus).
    placeholderData: keepPreviousData,
    ...opts,
  });
}

/** Drawer detail. `null` id disables the query (mirror of usePrincipalDealer). */
export function useOperationOrder(
  id: string | null,
  opts?: Partial<UseQueryOptions<operationOrderDetailResponse>>,
) {
  return useQuery({
    queryKey: id ? qk.operation.order(id) : (["operation", "orders", "null"] as const),
    queryFn: () =>
      apiFetch<operationOrderDetailResponse>(`/api/operation/orders/${id}`),
    enabled: !!id,
    staleTime: 10_000,
    ...opts,
  });
}

/** Procurement (PO) list. Server defaults status='all'. */
export function useOperationPos(
  filters: operationPoFilters = {},
  opts?: Partial<UseQueryOptions<operationPosListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.pos(filters),
    queryFn: () =>
      apiFetch<operationPosListResponse>(
        "/api/operation/pos" + operationPosSearch(filters),
      ),
    staleTime: 30_000,
    ...opts,
  });
}

/** PO drawer detail. There is no GET /:id route — the list embeds lines via
 *  PostgREST nested fetch. Kept here as a future hook; for now M5 pages should
 *  pluck the row from `useOperationPos`. The unused-id query is disabled when
 *  id is null. (Endpoint may land in M5 task 4 when the drawer needs richer
 *  history; this hook is a placeholder for that.) */
export function useOperationPo(
  _id: string | null,
  opts?: Partial<UseQueryOptions<operationPoListRow>>,
) {
  return useQuery({
    queryKey: _id ? qk.operation.po(_id) : (["operation", "pos", "null"] as const),
    queryFn: () => {
      throw new Error(
        "useOperationPo: GET /api/operation/pos/:id not implemented yet — read from useOperationPos list cache via select() instead.",
      );
    },
    enabled: false,
    staleTime: 10_000,
    ...opts,
  });
}

/** Loo 2026-05-16 — per-source-order delivery date list for PoDetailModal.
 *  Returns `[{so, deliveryDate}]` for every so in the PO's `so + so_refs`.
 *  The PO list itself doesn't carry delivery_date because that lives on
 *  `orders`, not on the PO row. */
export interface operationPoSourceOrder {
  so: number;
  deliveryDate: string | null;
}
export interface operationPoSourceOrdersResponse {
  orders: operationPoSourceOrder[];
}
export function useOperationPoSourceOrders(
  poId: string | null,
  opts?: Partial<UseQueryOptions<operationPoSourceOrdersResponse>>,
) {
  return useQuery({
    queryKey: poId
      ? qk.operation.poSourceOrders(poId)
      : (["operation", "pos", "null", "source-orders"] as const),
    queryFn: () =>
      apiFetch<operationPoSourceOrdersResponse>(
        `/api/operation/pos/${encodeURIComponent(poId ?? "")}/source-orders`,
      ),
    enabled: !!poId,
    staleTime: 30_000,
    ...opts,
  });
}

/** Phase 4.5 Chunk 2 (T34) — per-tab procurement listing.
 *  Wraps `GET /api/operation/procurement/:slug` (T33). Each tab on the
 *  TabbedProcurementShell mounts a child component that calls this hook with
 *  its own slug, so the active tab's data fetches lazily on mount. The
 *  response shape mirrors `operationPosListResponse` (`{ pos: [...] }`) so
 *  child tabs can reuse the existing PO row rendering verbatim. */
export function useProcurementTab(
  slug: ProcurementTabSlug,
  opts?: Partial<UseQueryOptions<operationPosListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.procurementTab(slug),
    queryFn: () =>
      apiFetch<operationPosListResponse>(
        `/api/operation/procurement/${encodeURIComponent(slug)}`,
      ),
    staleTime: 30_000,
    ...opts,
  });
}

/** Warehouse stock matrix. */
export function useOperationWarehouse(
  opts?: Partial<UseQueryOptions<WarehouseListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.warehouse(),
    queryFn: () => apiFetch<WarehouseListResponse>("/api/operation/warehouse"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Pipeline v2 (C4) — drill-down on a single (warehouse, sku) pair to list
 *  the orders currently holding `stock_balances.reserved`. `null` for either
 *  param disables the query (mirror of `useOperationOrder`). staleTime is
 *  short (5s) — reserve counts shift on every assign-partner / attach-do /
 *  abandon, so we want fresh data when the dialog reopens. */
export function useReservedDrilldown(
  warehouseId: string | null,
  sku: string | null,
  opts?: Partial<UseQueryOptions<operationReservedDrilldownResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.reservedDrilldown(warehouseId, sku),
    queryFn: () => {
      const params = new URLSearchParams({
        warehouseId: warehouseId ?? "",
        sku: sku ?? "",
      });
      return apiFetch<operationReservedDrilldownResponse>(
        `/api/operation/warehouse/reserved-drilldown?${params.toString()}`,
      );
    },
    enabled: !!warehouseId && !!sku,
    staleTime: 5_000,
    ...opts,
  });
}

/** Pipeline v2 (C5.3) — awaiting-stock shortage feed for the CreatePOModal
 *  "Auto-fill from awaiting stock" button. Lazy: `enabled: false` so the
 *  query only fires when the user clicks the button (via `refetch()`). The
 *  result replaces the modal's `lines` state. staleTime is 0 so a fresh
 *  refetch is always triggered — the in_production pool can change between
 *  clicks (e.g. user dispatches an order, abandons one).
 *
 *  Bundle scoping: when `dls` is non-empty the query appends `?dls=1,2,3` so
 *  the server narrows shortage to those orders only — used by the
 *  CrossOrderBundleSheet → CreatePOModal flow so the modal pre-fills lines
 *  for the operator's exact selection instead of the global awaiting pool. */
export function useAwaitingStockShortage(
  dls?: number[],
  opts?: Partial<UseQueryOptions<operationAwaitingStockShortageResponse>>,
) {
  const hasDls = dls != null && dls.length > 0;
  const url = hasDls
    ? `/api/operation/pos/awaiting-stock-shortage?dls=${[...dls!].sort((a, b) => a - b).join(",")}`
    : "/api/operation/pos/awaiting-stock-shortage";
  return useQuery({
    queryKey: qk.operation.awaitingStockShortage(dls),
    queryFn: () => apiFetch<operationAwaitingStockShortageResponse>(url),
    enabled: false,
    staleTime: 0,
    ...opts,
  });
}

/** Phase 4.5 Chunk 2 (T18/T21) — Stock alerts feed. Used by the dashboard
 *  `StockAlertsTile` (count + top-3) and the warehouse page red-dot indicator.
 *  Cache key `["operation","stock-alerts"]` is invalidated by
 *  `SetThresholdDialog` on save so a freshly-cleared low threshold removes the
 *  tile entry without a manual refetch. staleTime mirrors the dashboard
 *  surface (30s) — alerts only shift when stock or thresholds change, both of
 *  which already trigger broader invalidations on their own mutation paths. */
export function useStockAlerts(
  opts?: Partial<UseQueryOptions<operationStockAlertsResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.stockAlerts(),
    queryFn: () =>
      apiFetch<operationStockAlertsResponse>("/api/operation/stock-alerts"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Cross-warehouse stock snapshot — the Stock On-Hand source of truth, reused by
 *  the Orders control table so its Stock column matches that page's free-balance
 *  figures. 30s stale mirrors the other operation stock surfaces. */
export function useOperationStock(
  opts?: Partial<UseQueryOptions<operationStockResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.stock(),
    queryFn: () => apiFetch<operationStockResponse>("/api/operation/stock"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Movements log. Default period='30d'; cap at 200 rows server-side. */
export function useOperationMovements(
  filters: MovementsFilters = {},
  opts?: Partial<UseQueryOptions<MovementsListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.movements(filters),
    queryFn: () =>
      apiFetch<MovementsListResponse>(
        "/api/operation/movements" + movementsSearch(filters),
      ),
    staleTime: 30_000,
    ...opts,
  });
}

// --- Mutation hooks (12) ---------------------------------------------------
//
// Invalidation strategy: every mutation invalidates a minimum of
//   • the affected detail key (`qk.operation.order(id)` / .po(id))
//   • the affected list key tree (`["operation", "orders"]` / .pos)
//   • the dashboard (`qk.operation.dashboard()`) — KPIs depend on order /
//     PO state changes universally.
// Stock-touching mutations also invalidate `["operation", "warehouse"]` and
// `["operation", "movements"]` because stock_balances + stock_movements rows
// shift on every receive / adjust / dispatch.

/** D1 step 1 — assign a delivery partner. Stage flips to dispatched; KPIs +
 *  list + drawer all need a refetch. */
export function useAssignPartnerMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<operationOrderMutationResponse, ApiError, AssignPartnerInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationOrderMutationResponse, ApiError, AssignPartnerInput>({
    mutationFn: (input) =>
      apiFetch<operationOrderMutationResponse>(
        `/api/operation/orders/${orderId}/assign-partner`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** D1 step 2 — attach DO + flip to delivered. Decrements stock so warehouse
 *  + movements caches also get busted. */
export function useAttachDoMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<operationOrderMutationResponse, ApiError, AttachDoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationOrderMutationResponse, ApiError, AttachDoInput>({
    mutationFn: (input) =>
      apiFetch<operationOrderMutationResponse>(
        `/api/operation/orders/${orderId}/attach-do`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "movements"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** 2026-06-05 (γ multi-leg) — replace the entire delivery chain for an order.
 *  Single-leg orders (current behaviour) pass `stops:[]` to clear back to
 *  delivery_partner_id-driven mode. Multi-leg orders send 2..N stops with
 *  contiguous `leg` numbering. */
export function useSetDeliveryChain(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<{ stops: DeliveryStop[] }, ApiError, SetDeliveryChainInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ stops: DeliveryStop[] }, ApiError, SetDeliveryChainInput>({
    mutationFn: (input) =>
      apiFetch<{ stops: DeliveryStop[] }>(
        `/api/operation/orders/${orderId}/delivery-chain`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** 2026-06-05 (γ multi-leg) — sparse patch one leg of the chain. Use for:
 *  marking status transitions (server auto-stamps timestamps), attaching POD
 *  url after Storage upload, editing notes, or re-pointing partner mid-flight. */
export function usePatchDeliveryStop(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<{ stop: DeliveryStop }, ApiError, { leg: number; patch: PatchDeliveryStopInput }>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ stop: DeliveryStop }, ApiError, { leg: number; patch: PatchDeliveryStopInput }>({
    mutationFn: ({ leg, patch }) =>
      apiFetch<{ stop: DeliveryStop }>(
        `/api/operation/orders/${orderId}/delivery-stops/${leg}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** P2 (migration 0159) — read the editable ops_order_control overlay for an
 *  order. `null` id disables the query (mirror of useOperationOrder). An absent
 *  overlay row comes back as `{ control: null }` → drawer shows all-default. */
export function useOrderControl(
  orderId: string | null,
  opts?: Partial<UseQueryOptions<OpsOrderControlResponse>>,
) {
  return useQuery({
    queryKey: orderId
      ? qk.operation.orderControl(orderId)
      : (["operation", "orders", "null", "control"] as const),
    queryFn: () =>
      apiFetch<OpsOrderControlResponse>(
        `/api/operation/orders/${orderId}/control`,
      ),
    enabled: !!orderId,
    staleTime: 10_000,
    ...opts,
  });
}

/** P2 (migration 0159) — sparse upsert of the order-control overlay. Invalidates
 *  the overlay key + the orders list tree so the drawer + table reflect the
 *  edit (the AREA / stock cells read from the same order data family). */
export function useSaveOrderControl(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<{ control: OpsOrderControl }, ApiError, UpdateOpsOrderControlInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ control: OpsOrderControl }, ApiError, UpdateOpsOrderControlInput>({
    mutationFn: (input) =>
      apiFetch<{ control: OpsOrderControl }>(
        `/api/operation/orders/${orderId}/control`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.orderControl(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ===========================================================================
// Balance job (migration 0184) — payment ledger + storage collect / waiver.
// ===========================================================================
/** Read the order's payment ledger (newest first). `null` id disables. */
export function useOrderPayments(
  orderId: string | null,
  opts?: Partial<UseQueryOptions<{ payments: OrderPaymentRow[] }>>,
) {
  return useQuery({
    queryKey: orderId
      ? qk.operation.orderPayments(orderId)
      : (["operation", "orders", "null", "payments"] as const),
    queryFn: () =>
      apiFetch<{ payments: OrderPaymentRow[] }>(
        `/api/operation/orders/${orderId}/payments`,
      ),
    enabled: !!orderId,
    staleTime: 10_000,
    ...opts,
  });
}

/** After any money mutation, refresh the ledger + the overlay (gate state) + the
 *  order detail/list + the Payments panel so every surface agrees at once. */
function invalidateOrderMoney(
  qc: ReturnType<typeof useQueryClient>,
  orderId: string,
) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: qk.operation.orderPayments(orderId), exact: true }),
    qc.invalidateQueries({ queryKey: qk.operation.orderControl(orderId), exact: true }),
    qc.invalidateQueries({ queryKey: ["operation", "orders"] }),
    qc.invalidateQueries({ queryKey: ["operation", "payments"] }),
  ]);
}

/** Record one payment on the ledger. */
export function useRecordPayment(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ payment: OrderPaymentRow }, ApiError, RecordPaymentInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ payment: OrderPaymentRow }, ApiError, RecordPaymentInput>({
    mutationFn: (input) =>
      apiFetch<{ payment: OrderPaymentRow }>(
        `/api/operation/orders/${orderId}/payments`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await invalidateOrderMoney(qc, orderId);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Void a mis-keyed ledger entry (principal only — server-enforced). */
export function useVoidPayment(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ ok: true }, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (paymentId) =>
      apiFetch<{ ok: true }>(
        `/api/operation/orders/${orderId}/payments/${paymentId}`,
        { method: "DELETE" },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await invalidateOrderMoney(qc, orderId);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Collect the storage fee — records a kind:'storage' payment + opens the
 *  delivery gate (storage_collected_at). */
export function useCollectStorage(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      { payment: OrderPaymentRow; control: OpsOrderControl },
      ApiError,
      CollectStorageInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { payment: OrderPaymentRow; control: OpsOrderControl },
    ApiError,
    CollectStorageInput
  >({
    mutationFn: (input) =>
      apiFetch<{ payment: OrderPaymentRow; control: OpsOrderControl }>(
        `/api/operation/orders/${orderId}/storage/collect`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await invalidateOrderMoney(qc, orderId);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Operator requests a storage-fee waiver (reason mandatory). */
export function useRequestStorageWaiver(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ control: OpsOrderControl }, ApiError, RequestStorageWaiverInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ control: OpsOrderControl }, ApiError, RequestStorageWaiverInput>({
    mutationFn: (input) =>
      apiFetch<{ control: OpsOrderControl }>(
        `/api/operation/orders/${orderId}/storage/waiver/request`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await invalidateOrderMoney(qc, orderId);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Principal decides a pending storage waiver (approve opens the gate). */
export function useDecideStorageWaiver(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ control: OpsOrderControl }, ApiError, DecideStorageWaiverInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ control: OpsOrderControl }, ApiError, DecideStorageWaiverInput>({
    mutationFn: (input) =>
      apiFetch<{ control: OpsOrderControl }>(
        `/api/operation/orders/${orderId}/storage/waiver/decide`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await invalidateOrderMoney(qc, orderId);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Record a one-time storage delivery-extension (new date + reason +
 *  acknowledgement; migration 0196). A 2nd+ extension is principal-only (the
 *  route 403s `extension_used` for operation). */
export function useExtendStorage(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ control: OpsOrderControl }, ApiError, RecordStorageExtensionInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ control: OpsOrderControl }, ApiError, RecordStorageExtensionInput>({
    mutationFn: (input) =>
      apiFetch<{ control: OpsOrderControl }>(
        `/api/operation/orders/${orderId}/storage/extend`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await invalidateOrderMoney(qc, orderId);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** P2 (migration 0136) — set/clear the planned logistic carrier
 *  (orders.ops_assigned_logistic) from the order drawer. operation/principal,
 *  status='place' only (the /ops-assign endpoint scopes it). Invalidates the
 *  operation order detail + list so the drawer + table reflect the change. */
export function useSetOpsAssignedLogistic(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      { id: string; ops_assigned_logistic: string | null },
      ApiError,
      SetOpsAssignedLogisticInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; ops_assigned_logistic: string | null },
    ApiError,
    SetOpsAssignedLogisticInput
  >({
    mutationFn: (input) =>
      apiFetch<{ id: string; ops_assigned_logistic: string | null }>(
        `/api/orders/${orderId}/ops-assign`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** P2 — set the delivery date (set_order_date RPC, status='place' only,
 *  lead-time floor enforced server-side) from the order drawer. Operation
 *  variant of useSetOrderDate: invalidates the operation order detail + list
 *  (the dealer-facing hook keys on qk.order, which the operation surfaces
 *  don't read). */
export function useOperationSetDeliveryDate(
  orderId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, SetOrderDateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, SetOrderDateInput>({
    mutationFn: (input) =>
      apiFetch<unknown>(`/api/orders/${orderId}/date`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** A6 post-Proceed cancel. Releases reserved stock → warehouse cache busts. */
export function useAbandonOrderMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<operationOrderMutationResponse, ApiError, AbandonOrderInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationOrderMutationResponse, ApiError, AbandonOrderInput>({
    mutationFn: (input) =>
      apiFetch<operationOrderMutationResponse>(
        `/api/operation/orders/${orderId}/abandon`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** 2026-05-12 (Loo) — back-arrow from Confirmed column → Placed.
 *  No body. Server enforces operation or principal role + RPC 0095 enforces
 *  current stage. */
export function useRevertOrderProceedMutation(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ order_id: string; so: number }, ApiError, void>>,
) {
  const qc = useQueryClient();
  return useMutation<{ order_id: string; so: number }, ApiError, void>({
    mutationFn: () =>
      apiFetch<{ order_id: string; so: number }>(
        `/api/operation/orders/${orderId}/revert-proceed`,
        { method: "POST" },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** 2026-05-12 (Loo) — back-arrow from Dispatched column → Ready to Dispatch.
 *  Reverts every dispatched thread on the order; clears partner assignment. */
export function useRevertOrderDispatchMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<{ order_id: string; so: number; threads_reverted: number }, ApiError, void>
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { order_id: string; so: number; threads_reverted: number },
    ApiError,
    void
  >({
    mutationFn: () =>
      apiFetch<{ order_id: string; so: number; threads_reverted: number }>(
        `/api/operation/orders/${orderId}/revert-dispatch`,
        { method: "POST" },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Manual override of the auto-picked source warehouse (E1 in_production). */
export function useWarehousePickMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<operationOrderMutationResponse, ApiError, WarehousePickInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationOrderMutationResponse, ApiError, WarehousePickInput>({
    mutationFn: (input) =>
      apiFetch<operationOrderMutationResponse>(
        `/api/operation/orders/${orderId}/warehouse`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Pipeline v2 (C2 / migration 0024) — confirm a `confirmed` order.
 *  RPC `operation_confirm_proceed_request` decides in_production vs
 *  ready_to_dispatch based on shortage at the chosen warehouse. `warehouseId`
 *  is optional — RPC accepts NULL when the order already has a warehouse_id.
 *
 *  Stock-touching: ready_to_dispatch path reserves stock atomically, so the
 *  warehouse cache must bust. Dashboard counts shift either way.
 *
 *  Errors (422 with body.code):
 *    - `wrong_stage` — order has already been triaged
 *    - `warehouse_required` — RPC needs a warehouse pick (shouldn't fire from
 *      the dialog since picker is required, but kept in the contract for
 *      defense-in-depth)
 *    - `insufficient_stock_for_reserve` — race-condition: stock changed
 *      between pre-flight check and submit. Body carries a `hint` like
 *      "sku=X warehouse_id=Y". */
export function useConfirmProceedRequest(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      operationOrderMutationResponse,
      ApiError,
      ConfirmProceedRequestInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    operationOrderMutationResponse,
    ApiError,
    ConfirmProceedRequestInput
  >({
    mutationFn: (input) =>
      apiFetch<operationOrderMutationResponse>(
        `/api/operation/orders/${orderId}/confirm-proceed`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "movements"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Migration 0147 (item h, 2026-05-23) — Operation reselects a different LP
 *  after the previously assigned LP rejected via lp_reject_order. Clears the
 *  reject timestamps + reason on the order and writes a fresh
 *  request_for_delivery_at, putting the order back into the new LP's queue.
 *
 *  Errors (422 with body.code):
 *    - `not_rejected` — order has no active reject (FE should not have surfaced
 *      the reselect entry, but covered for defense-in-depth)
 *    - `same_partner` — operator picked the LP that just rejected (no-op)
 *    - `partner_not_found` — the new partner uuid is unknown */
export function useReselectPartner(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<unknown, ApiError, ReselectPartnerInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, ReselectPartnerInput>({
    mutationFn: (input) =>
      apiFetch(
        `/api/operation/orders/${orderId}/reselect-partner`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Migration 0147 (item h, 2026-05-23) — LP accepts an incoming delivery
 *  assignment. Body is empty (orderId is in the path). Mutation source is
 *  the Partner "Incoming" page. */
export function useLpAcceptOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, void>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, void>({
    mutationFn: () =>
      apiFetch(
        `/api/partner/orders/${orderId}/accept`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.partner.incoming() });
      await qc.invalidateQueries({ queryKey: qk.partner.toDeliver() });
      await qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Migration 0147 (item h, 2026-05-23) — LP rejects an incoming delivery
 *  assignment with a required free-text reason. The reason surfaces back to
 *  Operation in the red-badge tooltip + reselect dialog. */
export function useLpRejectOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, LpRejectOrderInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, LpRejectOrderInput>({
    mutationFn: (input) =>
      apiFetch(
        `/api/partner/orders/${orderId}/reject`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.partner.incoming() });
      await qc.invalidateQueries({ queryKey: qk.partner.dashboard() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Migration 0147 (item h, 2026-05-23) — LP "Incoming" queue. Orders picked
 *  by Operation at Accept Proceed that this LP hasn't yet accepted or
 *  rejected. Polled 15s while the page is open. */
export interface PartnerIncomingOrder {
  id: string;
  so: number;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_date: string | null;
  request_for_delivery_at: string;
  placed_at: string;
  operation_stage: string | null;
  warehouse_id: string | null;
  dealers: { name: string } | null;
  warehouses: { name: string; address: string | null } | null;
}
export interface PartnerIncomingResponse {
  orders: PartnerIncomingOrder[];
}
export function usePartnerIncomingOrders() {
  return useQuery<PartnerIncomingResponse>({
    queryKey: qk.partner.incoming(),
    queryFn: () => apiFetch<PartnerIncomingResponse>("/api/partner/orders/incoming"),
    refetchInterval: 15_000,
  });
}

/** Pipeline v2 (C2 / migration 0024) — flip a `confirmed` or
 *  `in_production` order directly to `ready_to_dispatch`. Wraps
 *  `operation_warehouse_pick` whose source-stage guard widens to permit both
 *  stages. `warehouseId` is REQUIRED here (the RPC raises 22023
 *  `warehouse_required` on NULL — confirm-proceed accepts NULL via a different
 *  RPC, do not conflate). Reserves stock; busts warehouse cache. */
export function useTransferReady(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      operationOrderMutationResponse,
      ApiError,
      TransferReadyInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    operationOrderMutationResponse,
    ApiError,
    TransferReadyInput
  >({
    mutationFn: (input) =>
      apiFetch<operationOrderMutationResponse>(
        `/api/operation/orders/${orderId}/transfer-ready`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "movements"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** E1 re-check stock — re-runs pick_warehouse + calc_shortages. Body empty. */
export function useRecheckStockMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<operationRecheckStockResponse, ApiError, void>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationRecheckStockResponse, ApiError, void>({
    mutationFn: () =>
      apiFetch<operationRecheckStockResponse>(
        `/api/operation/orders/${orderId}/recheck-stock`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Auto-issue POs for an in_production order's shortages. Body empty. */
export function useIssuePosForOrderMutation(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<operationIssuePosResponse, ApiError, void>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationIssuePosResponse, ApiError, void>({
    mutationFn: () =>
      apiFetch<operationIssuePosResponse>(
        `/api/operation/orders/${orderId}/issue-pos`,
        { method: "POST", body: JSON.stringify({}) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Manual create-PO from procurement page. */
export function useCreatePoMutation(
  opts?: Partial<
    UseMutationOptions<operationPoMutationResponse, ApiError, CreatePoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationPoMutationResponse, ApiError, CreatePoInput>({
    mutationFn: (input) =>
      apiFetch<operationPoMutationResponse>("/api/operation/pos", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      // If the PO is tied to a SO (single or via so_refs), the in_production
      // drawer for those orders should refresh. Bust the orders sub-tree too.
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * C5.2 — Batch create POs in one atomic RPC call.
 *
 * The CreatePOModal now picks a warehouse per supplier-group (Q4=A, blank
 * required). When the SKU set spans 2+ suppliers, we collapse the N parallel
 * useCreatePoMutation calls into a single useCreatePosBatch call so the PG
 * transaction either commits all rows or none — no half-issued batches if
 * (say) the 3rd supplier validation fails.
 *
 * Cache invalidation matches useCreatePoMutation (pos / dashboard / warehouse
 * / orders sub-trees) so the procurement list, KPI strip, in_production
 * drawers, and the warehouse stock view all refresh after the batch lands.
 *
 * de8bf4e pattern: spread `...opts` BEFORE `onSuccess` so caller-supplied
 * onSuccess runs LAST (after our cache busting completes), matching every
 * other Phase 4 mutation hook.
 */
export function useCreatePosBatch(
  opts?: Partial<
    UseMutationOptions<CreatePosBatchResponse, ApiError, CreatePosBatchInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<CreatePosBatchResponse, ApiError, CreatePosBatchInput>({
    mutationFn: (input) =>
      apiFetch<CreatePosBatchResponse>("/api/operation/pos/batch", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * Receive a PO with DO upload — single batched call carrying all ticked lines
 * plus the uploaded DO file path and supplier DO number. Maps to v3 RPC
 * `operation_receive_po_with_do` (migration 0045) per Phase 4.5 Chunk 1
 * carry-forward `phase-4.5-chunk-1-receive-rpc-v3-swap`.
 */
export function useReceivePoWithDoMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<operationReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>({
    mutationFn: (input) =>
      apiFetch<operationReceivePoWithDoResponse>(
        `/api/operation/pos/${poId}/receive`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "movements"] });
      // Receiving stock can unblock in_production orders → invalidate orders.
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * Partner-side variant of useReceivePoWithDoMutation — Loo 2026-05-11.
 *
 * Posts to /api/partner/pickups/:id/receive, which calls the SAME
 * `operation_receive_po_with_do` RPC under the hood (the RPC's role gate
 * already admits partners + checks procurement_partner_id matches caller).
 * Replaces the "Arrived at WH → wait for operation Receive" two-step with
 * one atomic move: partner uploads DO + ticks qty → PO flips straight to
 * status='received'.
 *
 * Cache invalidation differs from the operation version: blast the partner
 * sub-tree (so dashboard + pickups kanban refresh) AND the operation tree
 * (so the procurement view sees the PO arrive in the Received tab).
 */
export function useReceivePoAsPartnerMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<operationReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationReceivePoWithDoResponse, ApiError, ReceivePoWithDoInput>({
    mutationFn: (input) =>
      apiFetch<operationReceivePoWithDoResponse>(
        `/api/partner/pickups/${poId}/receive`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      // Partner-side caches.
      await qc.invalidateQueries({ queryKey: ["partner"] });
      // operation-side caches (PO appears in Received tab; warehouse stock
      // bumped; orders may unblock in_production).
      await qc.invalidateQueries({ queryKey: qk.operation.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "movements"] });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Cancel an open PO. Reason required; mirrors abandon-order shape. */
export function useCancelPoMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<operationPoMutationResponse, ApiError, { reason: string }>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationPoMutationResponse, ApiError, { reason: string }>({
    mutationFn: (input) =>
      apiFetch<operationPoMutationResponse>(
        `/api/operation/pos/${poId}/cancel`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** F1.A factory_pickup — assign pickup partner to a ready_for_pickup PO. */
export function useAssignPickupPartnerMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<operationPoMutationResponse, ApiError, AssignPickupPartnerInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationPoMutationResponse, ApiError, AssignPickupPartnerInput>({
    mutationFn: (input) =>
      apiFetch<operationPoMutationResponse>(
        `/api/operation/pos/${poId}/assign-pickup-partner`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** F1.A customer-rejection flow — reassign destination warehouse on a PO. */
export function useReassignPoWarehouseMutation(
  poId: string,
  opts?: Partial<
    UseMutationOptions<operationPoMutationResponse, ApiError, ReassignPoWarehouseInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationPoMutationResponse, ApiError, ReassignPoWarehouseInput>({
    mutationFn: (input) =>
      apiFetch<operationPoMutationResponse>(
        `/api/operation/pos/${poId}/reassign-warehouse`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Manual stock adjustment (positive=inbound, negative=damage/loss). Writes a
 *  stock_movements row + audit_log entry. */
export function useAdjustStockMutation(
  opts?: Partial<
    UseMutationOptions<operationAdjustStockResponse, ApiError, AdjustStockInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<operationAdjustStockResponse, ApiError, AdjustStockInput>({
    mutationFn: (input) =>
      apiFetch<operationAdjustStockResponse>("/api/operation/warehouse/adjust", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      // T42-pass3-C2 — stock-touching mutations must also bust the stock-alerts
      // cache; otherwise the dashboard tile + CreatePOModal "Suggest from
      // alerts" stay stale for up to 30s after qty/reserved change.
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "movements"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 5 — Finance hooks (queries + mutations)
// ---------------------------------------------------------------------------
// Server contract:
//   GET   /api/finance/reports/dashboard-summary  -> FinanceDashboardSummary
//   GET   /api/finance/reports/ar-aging           -> FinanceArAgingResponse
//   GET   /api/finance/payments?filter            -> FinancePaymentRow[]
//   POST  /api/finance/payments/topup-approve     mutation -> payments row
//   POST  /api/finance/payments/order-receipt     mutation -> payments row
//   POST  /api/finance/invoices/issue             mutation -> invoices row
//   POST  /api/finance/invoices/:id/void          mutation -> invoices row
//   POST  /api/finance/refunds/create             mutation -> { refund, needsApproval }
//   POST  /api/finance/refunds/:id/pay            mutation -> refunds row
//
// Each mutation invalidates the relevant qk.finance.* keys + ripples to
// related namespaces (e.g. topup-approve invalidates principal.approvals
// since it mutates an approval row, plus dealer caches since deposit_balance
// changes).

function toFinancePaymentsSearch(f?: FinancePaymentsFilters): string {
  if (!f) return "";
  const p = new URLSearchParams();
  if (f.orderId)   p.set("orderId",   f.orderId);
  if (f.dealerId)  p.set("dealerId",  f.dealerId);
  if (f.direction) p.set("direction", f.direction);
  if (f.from)      p.set("from",      f.from);
  if (f.to)        p.set("to",        f.to);
  if (f.limit)     p.set("limit",     String(f.limit));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

function toFinanceInvoicesSearch(f?: FinanceInvoicesFilters): string {
  if (!f) return "";
  const p = new URLSearchParams();
  if (f.status)   p.set("status",   f.status);
  if (f.dealerId) p.set("dealerId", f.dealerId);
  if (f.from)     p.set("from",     f.from);
  if (f.to)       p.set("to",       f.to);
  if (f.limit)    p.set("limit",    String(f.limit));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

function toFinanceRefundsSearch(f?: FinanceRefundsFilters): string {
  if (!f) return "";
  const p = new URLSearchParams();
  if (f.status)   p.set("status",   f.status);
  if (f.dealerId) p.set("dealerId", f.dealerId);
  if (f.from)     p.set("from",     f.from);
  if (f.to)       p.set("to",       f.to);
  if (f.limit)    p.set("limit",    String(f.limit));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function useFinanceDashboardSummary(
  opts?: Partial<UseQueryOptions<FinanceDashboardSummary>>,
) {
  return useQuery({
    queryKey: qk.finance.dashboardSummary(),
    queryFn: () => apiFetch<FinanceDashboardSummary>("/api/finance/reports/dashboard-summary"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceArAging(
  opts?: Partial<UseQueryOptions<FinanceArAgingResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.arAging(),
    queryFn: () => apiFetch<FinanceArAgingResponse>("/api/finance/reports/ar-aging"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceApAging(
  opts?: Partial<UseQueryOptions<FinanceApAgingResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.apAging(),
    queryFn: () => apiFetch<FinanceApAgingResponse>("/api/finance/reports/ap-aging"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceCashflow(
  weeks?: number,
  opts?: Partial<UseQueryOptions<FinanceCashflowSeries>>,
) {
  return useQuery({
    queryKey: qk.finance.cashflow(weeks),
    queryFn: () =>
      apiFetch<FinanceCashflowSeries>(
        `/api/finance/reports/cashflow${weeks ? `?weeks=${weeks}` : ""}`,
      ),
    staleTime: 60_000,
    ...opts,
  });
}

export function useFinanceMonthlyPl(
  months?: number,
  opts?: Partial<UseQueryOptions<FinanceMonthlyPlResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.monthlyPl(months),
    queryFn: () =>
      apiFetch<FinanceMonthlyPlResponse>(
        `/api/finance/reports/monthly-pl${months ? `?months=${months}` : ""}`,
      ),
    staleTime: 60_000,
    ...opts,
  });
}

export function useFinanceTopSkus(
  limit?: number,
  opts?: Partial<UseQueryOptions<FinanceTopSkusResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.topSkus(limit),
    queryFn: () =>
      apiFetch<FinanceTopSkusResponse>(
        `/api/finance/reports/top-skus${limit ? `?limit=${limit}` : ""}`,
      ),
    staleTime: 60_000,
    ...opts,
  });
}

export function useFinanceBankStatements(
  filters?: { from?: string; to?: string; matched?: "true" | "false" },
  opts?: Partial<UseQueryOptions<FinanceBankStatementRow[]>>,
) {
  const qs = new URLSearchParams();
  if (filters?.from)    qs.set("from",    filters.from);
  if (filters?.to)      qs.set("to",      filters.to);
  if (filters?.matched) qs.set("matched", filters.matched);
  const search = qs.toString();
  return useQuery({
    queryKey: qk.finance.bankStatements(filters),
    queryFn: () =>
      apiFetch<FinanceBankStatementRow[]>(
        `/api/finance/bank-statements${search ? `?${search}` : ""}`,
      ),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceReconSuggest(
  bankStmtId: string,
  opts?: Partial<UseQueryOptions<FinanceReconSuggestResponse>>,
) {
  return useQuery({
    queryKey: qk.finance.reconSuggest(bankStmtId),
    queryFn: () =>
      apiFetch<FinanceReconSuggestResponse>(
        `/api/finance/reconciliations/suggest/${bankStmtId}`,
      ),
    enabled: !!bankStmtId,
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinancePayments(
  filters?: FinancePaymentsFilters,
  opts?: Partial<UseQueryOptions<FinancePaymentRow[]>>,
) {
  return useQuery({
    queryKey: qk.finance.payments(filters),
    queryFn: () => apiFetch<FinancePaymentRow[]>(`/api/finance/payments${toFinancePaymentsSearch(filters)}`),
    staleTime: 15_000,
    ...opts,
  });
}

// Invoice row shape (matches the `invoices` table in 0001:409-420).
export interface FinanceInvoiceRow {
  id:         string;
  invoice_no: string;
  order_id:   string;
  amount:     number;
  tax_amount: number;
  issued_at:  string;
  voided_at:  string | null;
  pdf_url:    string | null;
  created_at: string;
}

export function useFinanceInvoices(
  filters?: FinanceInvoicesFilters,
  opts?: Partial<UseQueryOptions<FinanceInvoiceRow[]>>,
) {
  return useQuery({
    queryKey: qk.finance.invoices(filters),
    queryFn: () => apiFetch<FinanceInvoiceRow[]>(`/api/finance/invoices${toFinanceInvoicesSearch(filters)}`),
    staleTime: 30_000,
    ...opts,
  });
}

export function useFinanceRefunds(
  filters?: FinanceRefundsFilters,
  opts?: Partial<UseQueryOptions<FinanceRefundRow[]>>,
) {
  return useQuery({
    queryKey: qk.finance.refunds(filters),
    queryFn: () => apiFetch<FinanceRefundRow[]>(`/api/finance/refunds${toFinanceRefundsSearch(filters)}`),
    staleTime: 30_000,
    ...opts,
  });
}

export function useTopupApprove(
  opts?: Partial<UseMutationOptions<FinancePaymentRow, ApiError, FinanceTopupApproveInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinancePaymentRow, ApiError, FinanceTopupApproveInput>({
    mutationFn: (input) =>
      apiFetch<FinancePaymentRow>("/api/finance/payments/topup-approve", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // Approval row decided + payment row inserted + deposit_balance bumped.
      // Invalidate everything that depends on these.
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      await qc.invalidateQueries({ queryKey: ["dealers"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useRecordReceipt(
  opts?: Partial<UseMutationOptions<FinancePaymentRow, ApiError, FinanceRecordReceiptInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinancePaymentRow, ApiError, FinanceRecordReceiptInput>({
    mutationFn: (input) =>
      apiFetch<FinancePaymentRow>("/api/finance/payments/order-receipt", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // orders.paid bumped + new payment inserted. AR aging shifts.
      await qc.invalidateQueries({ queryKey: ["finance"] });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useIssueInvoice(
  opts?: Partial<UseMutationOptions<unknown, ApiError, FinanceInvoiceIssueInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, FinanceInvoiceIssueInput>({
    mutationFn: (input) =>
      apiFetch<unknown>("/api/finance/invoices/issue", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // orders.invoice_no + invoiced_at set; new invoices row.
      await qc.invalidateQueries({ queryKey: qk.finance.invoices() });
      await qc.invalidateQueries({ queryKey: qk.finance.arAging() });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useVoidInvoice(
  invoiceId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, FinanceInvoiceVoidInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, FinanceInvoiceVoidInput>({
    mutationFn: (input) =>
      apiFetch<unknown>(`/api/finance/invoices/${invoiceId}/void`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.invoices() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useCreateRefund(
  opts?: Partial<UseMutationOptions<{ refund: unknown; needsApproval: boolean }, ApiError, RefundCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ refund: unknown; needsApproval: boolean }, ApiError, RefundCreateInput>({
    mutationFn: (input) =>
      apiFetch<{ refund: unknown; needsApproval: boolean }>("/api/finance/refunds/create", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.refunds() });
      // amount > 1000 path also creates an approval row
      await qc.invalidateQueries({ queryKey: ["principal", "approvals"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useRefundPay(
  refundId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, RefundPayInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, RefundPayInput>({
    mutationFn: (input) =>
      apiFetch<unknown>(`/api/finance/refunds/${refundId}/pay`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // refunds.status='paid' + paid_at + outbound payments row
      await qc.invalidateQueries({ queryKey: qk.finance.refunds() });
      await qc.invalidateQueries({ queryKey: qk.finance.payments() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function usePoPay(
  opts?: Partial<UseMutationOptions<FinancePaymentRow, ApiError, FinancePoPayInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinancePaymentRow, ApiError, FinancePoPayInput>({
    mutationFn: (input) =>
      apiFetch<FinancePaymentRow>("/api/finance/payments/po-pay", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // PO.pay_status='paid' + new outbound payments row. Ripples to
      // ap-aging, dashboard summary, payments list.
      await qc.invalidateQueries({ queryKey: ["finance"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function usePoSchedule(
  opts?: Partial<UseMutationOptions<unknown, ApiError, FinancePoScheduleInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, FinancePoScheduleInput>({
    mutationFn: (input) =>
      apiFetch<unknown>("/api/finance/payments/po-schedule", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // PO.pay_status flips unpaid -> scheduled. Buckets shift.
      await qc.invalidateQueries({ queryKey: qk.finance.apAging() });
      await qc.invalidateQueries({ queryKey: qk.finance.dashboardSummary() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useCreateBankStatement(
  opts?: Partial<UseMutationOptions<FinanceBankStatementRow, ApiError, BankStatementCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinanceBankStatementRow, ApiError, BankStatementCreateInput>({
    mutationFn: (input) =>
      apiFetch<FinanceBankStatementRow>("/api/finance/bank-statements", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.bankStatements() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useCreateReconciliation(
  opts?: Partial<UseMutationOptions<unknown, ApiError, ReconciliationCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, ReconciliationCreateInput>({
    mutationFn: (input) =>
      apiFetch<unknown>("/api/finance/reconciliations", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // matched_ref derivation flips on the bank-statements list.
      await qc.invalidateQueries({ queryKey: qk.finance.bankStatements() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useApplyCreditNote(
  refundId: string,
  opts?: Partial<UseMutationOptions<FinanceRefundRow, ApiError, RefundApplyInput>>,
) {
  const qc = useQueryClient();
  return useMutation<FinanceRefundRow, ApiError, RefundApplyInput>({
    mutationFn: (input) =>
      apiFetch<FinanceRefundRow>(`/api/finance/refunds/${refundId}/apply`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      // refund row flips status='paid' + applied_to_order_id set.
      // The target order's outstanding balance is conceptually reduced
      // but Phase 5 V1 doesn't auto-deduct on the order side — that
      // happens on next checkout / dealer ack. Invalidate the refunds
      // list + AR aging so finance sees the CN move to "applied".
      await qc.invalidateQueries({ queryKey: qk.finance.refunds() });
      await qc.invalidateQueries({ queryKey: qk.finance.arAging() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useDeleteReconciliation(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (recId) =>
      apiFetch<unknown>(`/api/finance/reconciliations/${recId}`, {
        method: "DELETE",
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.finance.bankStatements() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}


// ---------------------------------------------------------------------------
// Phase 6 — Supplier namespace. Mirrors finance pattern: typed row interfaces
// + 4 GET query hooks + 4 POST mutation hooks. Mutations invalidate the
// relevant qk.supplier.* keys to keep dashboard counts + PO lists in sync.
// ---------------------------------------------------------------------------

export type SupplierBucket = "po" | "ready" | "delivered";

export type SupplierSupStatus =
  | "pending"
  | "acknowledged"
  | "in_production"
  | "ready_for_pickup"
  | "ready_confirm_sent"
  // 0090 sofa flow (Loo 2026-05-11): partner WH owner confirmed receive;
  // supplier now self-dispatches.
  | "partner_confirmed"
  | "pickup_assigned"
  | "pickup_accepted"
  // 2026-05-15 (Task 14): migration 0107 per-thread pickup introduces this
  // intermediate state — some but not all linked threads picked up. PO
  // remains "open" from forecast / pipeline / badge perspectives. Filter
  // audit landed `partially_shipped` in the `ready` bucket of
  // PIPELINE_BUCKETS (apps/api/src/routes/supplier/pos.ts).
  | "partially_shipped"
  | "shipped"
  | "picked_up"
  | "delivered"
  | "reassign_needed";

/** Mirror of `purchase_orders` row visible to a supplier (RLS-scoped to
 *  own supplier_id). Keep fields aligned with API response from
 *  GET /api/supplier/pos. */
export interface SupplierPoLine {
  id: string;
  sku: string;
  qty: number;
  received_qty: number;
  // 0073 cascade picker payload — bedframe={color,gap}, sofa={fabric_id,
  // fabric_name, fabric_surcharge}, mattress=null. Supplier sees this on
  // the PO card so they make the right version.
  attrs?: Record<string, unknown> | null;
}

export interface SupplierPoRow {
  id: string;
  so: number | null;
  supplier_id: string;
  warehouse_id: string;
  // 2026-05-10 (Loo) — was scalar `sku`/`qty` (read from dropped columns
  // post-0017) which always rendered blank. Now embeds the full line array
  // so the supplier card sums qty + lists every variant.
  lines: SupplierPoLine[];
  // 2026-05-11 (Loo migration 0091) — embed destination warehouse + owning
  // partner so the supplier card can render "send to X (owned by partner Y)"
  // — supplier self-delivers and needs to know where the goods go.
  warehouses: {
    id: string;
    name: string;
    address: string | null;
    kind: "own" | "operation_partner" | null;
    owning_partner_id: string | null;
    owner: { id: string; name: string; contact: string | null } | null;
  } | null;
  status: "open" | "received" | "cancelled";
  sup_status: SupplierSupStatus;
  delivery_partner_id: string | null;
  expected_ready_date: string | null;
  pickup_date: string | null;
  eta_date: string | null;
  customer_rejection: unknown;
  pay_status: "unpaid" | "scheduled" | "paid";
  do_number: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
  // Task 6 server enrichment (apps/api/src/routes/supplier/pos.ts:120-150).
  // All optional so older callers / tests that mock without these still typecheck.
  //   customer_eta_min — min(orders.delivery_date) across linked threads
  //   urgency          — <7d critical · 7-13d urgent · >=14d normal · null if no threads
  //   behind_schedule  — true when PO.eta_date is at/after customer_eta_min
  //   sku_summary      — deduped [{sku, qty}] from lines for compact card render
  customer_eta_min?: string | null;
  urgency?: "critical" | "urgent" | "normal" | null;
  behind_schedule?: boolean;
  sku_summary?: Array<{ sku: string; qty: number }>;
  // 2026-05-16 (migration 0114) — per-thread state counts that drive the
  // supplier kanban bucket placement + the "X of Y" card subtitle. Same PO
  // can land in `po` (producing > 0) AND `ready` (ready > 0) when partial.
  thread_state_counts?: {
    producing: number;
    ready: number;
    picked: number;
    total: number;
  };
  // 2026-05-17 (Loo screenshot) — per-thread enrichment server-side spliced
  // into the list response so the card body can list every linked SO with
  // its own customer ETA. `orders` is populated via supplier_orders_for_threads
  // RPC (0116) and is null for threads whose order RLS lookup misses.
  threads?: Array<{
    id: string;
    order_id: string;
    supplier_ready_at: string | null;
    pickup_event_id: string | null;
    orders: {
      so: number;
      customer_name: string;
      delivery_date: string | null;
    } | null;
  }>;
}

export interface SupplierProductRow {
  sku: string;
  category: string;
  model_key: string;
  variant: string;
  price: number;
  model: { name: string; blurb: string | null } | null;
}

/** GET /api/supplier/activity row — closes phase-6-supplier-recent-activity.
 *  RLS-scoped via po_history_read (0002:256); supplier sees only own rows. */
export interface SupplierActivityRow {
  id:          string;
  po_id:       string;
  text:        string;
  by_role:     string | null;
  occurred_at: string;
}

/** GET /api/supplier/me payload — closes phase-6-supplier-me-endpoint.
 *  `kind` gates the PO action buttons (factory_pickup skips Acknowledge);
 *  `cat_covered` + `lead_time` + `contact_email` feed the Dashboard
 *  Coverage callout (proto:supplier-pages.jsx:184-195). */
export interface SupplierMe {
  id:             string;
  name:           string;
  kind:           "own_logistics" | "factory_pickup";
  cat_covered:    string[];
  lead_time:      string | null;
  contact:        string | null;
  contact_email:  string | null;
  slug:           string | null;
  portal_enabled: boolean;
}

export interface SupplierDemandRow {
  sku: string;
  /** mattress | bedframe | sofa, or null for accessories/services (hidden).
   *  Server-derived via resolve_demand_category (migration 0148). */
  category: "mattress" | "bedframe" | "sofa" | null;
  /** Formal commitment (already-issued PO lines) — the Commit bucket. */
  openQty: number;
  poCount: number;
  // 2026-05-10 (Loo) — pre-commit demand from active orders not yet POed —
  // the Forecast bucket. Fed by `supplier_pending_demand()` RPC; 0 means
  // nothing in the pipeline beyond what's already POed.
  pendingQty: number;
  pendingOrderCount: number;
}

/** Phase 7 Sprint 1 — partner_threads_to_deliver RPC payload.
 *  2026-05-13 (Loo): added `do_number` (migration 0099) so the POD upload
 *  dialog can auto-fill. 2026-05-13 (Loo, later): migration 0101 widens
 *  the RPC to also return delivered threads (last 30 days) + exposes
 *  `operation_stage` + `delivered_at` so the Deliveries kanban can show
 *  a Delivered column without a second query. */
export interface PartnerToDeliverRow {
  thread_id:             string;
  order_id:              string;
  po_id:                 string | null;
  customer_name:         string;
  customer_address:      string | null;
  customer_phone:        string | null;
  dispatched_at:         string;
  confirm_delivery_date: string | null;
  do_number:             string | null;
  /** 'dispatched' or 'delivered' — caller uses this to bucket into kanban columns */
  operation_stage:       "dispatched" | "delivered";
  /** populated for delivered rows only */
  delivered_at:          string | null;
}

export function usePartnerToDeliver(
  opts?: Partial<UseQueryOptions<PartnerToDeliverRow[], ApiError>>,
) {
  return useQuery<PartnerToDeliverRow[], ApiError>({
    queryKey: qk.partner.toDeliver(),
    queryFn: () => apiFetch<PartnerToDeliverRow[]>("/api/partner/pickups/to-deliver"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Phase 7 — partner_attach_pod mutation. Caller passes threadId + podPath
 *  (the path returned by the prior sign-upload call) + DO number + optional
 *  note + signed bool. On success, blasts the partner namespace (toDeliver
 *  disappears, dashboard counts update).
 *
 *  Migration 0088 (Loo 2026-05-11): partner POD upload now matches the
 *  operation DOAttachModal field set so role-switching operators don't
 *  re-learn anything. RPC validates signed=true + doNumber ≥3 chars +
 *  podPath non-empty. */
export type AttachPodInput = {
  threadId:  string;
  podPath:   string;
  doNumber:  string;
  doNote?:   string;
  signed:    true;
  /** 0151 — REQUIRED customer e-signature: Storage path of the captured
   *  signature PNG + the receiving customer's typed name. */
  signaturePath: string;
  signerName:    string;
};
export function useAttachPod(
  opts?: Partial<UseMutationOptions<unknown, ApiError, AttachPodInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, AttachPodInput>({
    mutationFn: ({ threadId, podPath, doNumber, doNote, signed, signaturePath, signerName }) =>
      apiFetch(`/api/partner/pod/${threadId}/attach`, {
        method: "POST",
        body: JSON.stringify({ podPath, doNumber, doNote, signed, signaturePath, signerName }),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["partner"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// Phase 8 — BD namespace.
// ---------------------------------------------------------------------------
export type InquiryKind = "new_dealer" | "expansion" | "product";
export type InquiryStage = "new" | "contacted" | "qualified" | "converted" | "lost";

export interface InquiryRow {
  id:                string;
  kind:              InquiryKind;
  company:           string;
  region:            string | null;
  contact:           string | null;
  stage:             InquiryStage;
  owner_user_id:     string | null;
  note:              string | null;
  linked_dealer_id:  string | null;
  created_at:        string;
  updated_at:        string;
}

export interface InquiryCreateInput {
  kind:    InquiryKind;
  company: string;
  region?: string | null;
  contact?: string | null;
  note?:   string | null;
}

export interface InquiryUpdateInput {
  stage?:   InquiryStage;
  contact?: string | null;
  region?:  string | null;
  note?:    string | null;
}

export function useBdInquiries(
  opts?: Partial<UseQueryOptions<InquiryRow[], ApiError>>,
) {
  return useQuery<InquiryRow[], ApiError>({
    queryKey: qk.bd.inquiries(),
    queryFn: () => apiFetch<InquiryRow[]>("/api/bd/inquiries"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useCreateInquiry(
  opts?: Partial<UseMutationOptions<InquiryRow, ApiError, InquiryCreateInput>>,
) {
  const qc = useQueryClient();
  return useMutation<InquiryRow, ApiError, InquiryCreateInput>({
    mutationFn: (input) =>
      apiFetch<InquiryRow>("/api/bd/inquiries", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.bd.inquiries() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useUpdateInquiry(
  opts?: Partial<UseMutationOptions<InquiryRow, ApiError, { id: string; patch: InquiryUpdateInput }>>,
) {
  const qc = useQueryClient();
  return useMutation<InquiryRow, ApiError, { id: string; patch: InquiryUpdateInput }>({
    mutationFn: ({ id, patch }) =>
      apiFetch<InquiryRow>(`/api/bd/inquiries/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.bd.inquiries() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useConvertInquiry(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) =>
      apiFetch(`/api/bd/inquiries/${id}/convert`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.bd.inquiries() });
      // Approval row was created — also blast principal namespace if it
      // exists in the cache so the principal approvals view picks up the
      // new pending row when next observed.
      await qc.invalidateQueries({ queryKey: ["principal"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useSupplierMe(
  opts?: Partial<UseQueryOptions<SupplierMe, ApiError>>,
) {
  return useQuery<SupplierMe, ApiError>({
    queryKey: qk.supplier.me(),
    queryFn: () => apiFetch<SupplierMe>("/api/supplier/me"),
    staleTime: 5 * 60_000,
    ...opts,
  });
}

export function useSupplierActivity(
  limit?: number,
  opts?: Partial<UseQueryOptions<SupplierActivityRow[], ApiError>>,
) {
  return useQuery<SupplierActivityRow[], ApiError>({
    queryKey: qk.supplier.activity(limit),
    queryFn: () => {
      const path = limit
        ? `/api/supplier/activity?limit=${encodeURIComponent(limit)}`
        : "/api/supplier/activity";
      return apiFetch<SupplierActivityRow[]>(path);
    },
    staleTime: 30_000,
    ...opts,
  });
}

export function useSupplierPos(
  bucket?: SupplierBucket,
  opts?: Partial<UseQueryOptions<SupplierPoRow[], ApiError>>,
) {
  return useQuery<SupplierPoRow[], ApiError>({
    queryKey: qk.supplier.pos(bucket),
    queryFn: () => {
      const path = bucket
        ? `/api/supplier/pos?bucket=${encodeURIComponent(bucket)}`
        : "/api/supplier/pos";
      return apiFetch<SupplierPoRow[]>(path);
    },
    placeholderData: keepPreviousData,
    ...opts,
  });
}

export function useSupplierPo(
  id: string,
  opts?: Partial<UseQueryOptions<SupplierPoRow, ApiError>>,
) {
  return useQuery<SupplierPoRow, ApiError>({
    queryKey: qk.supplier.po(id),
    queryFn: () => apiFetch<SupplierPoRow>(`/api/supplier/pos/${id}`),
    enabled: !!id,
    ...opts,
  });
}

export function useSupplierProducts(
  opts?: Partial<UseQueryOptions<SupplierProductRow[], ApiError>>,
) {
  return useQuery<SupplierProductRow[], ApiError>({
    queryKey: qk.supplier.products(),
    queryFn: () => apiFetch<SupplierProductRow[]>("/api/supplier/products"),
    ...opts,
  });
}

export function useSupplierDemand(
  opts?: Partial<UseQueryOptions<SupplierDemandRow[], ApiError>>,
) {
  return useQuery<SupplierDemandRow[], ApiError>({
    queryKey: qk.supplier.demand(),
    queryFn: () => apiFetch<SupplierDemandRow[]>("/api/supplier/products/demand"),
    ...opts,
  });
}

export function useAcknowledgePo(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (poId) =>
      apiFetch(`/api/supplier/pos/${poId}/acknowledge`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useStartProduction(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (poId) =>
      apiFetch(`/api/supplier/pos/${poId}/start-production`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useReadyForPickup(
  opts?: Partial<UseMutationOptions<unknown, ApiError, string>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (poId) =>
      apiFetch(`/api/supplier/pos/${poId}/ready-for-pickup`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

type MarkDeliveredInput = {
  poId: string;
  doNumber: string;
  doFilePath: string;
  doNote?: string;
};
export function useMarkDelivered(
  opts?: Partial<UseMutationOptions<unknown, ApiError, MarkDeliveredInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, MarkDeliveredInput>({
    mutationFn: ({ poId, doNumber, doFilePath, doNote }) =>
      apiFetch(`/api/supplier/pos/${poId}/mark-delivered`, {
        method: "POST",
        body: JSON.stringify({ doNumber, doFilePath, doNote }),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["supplier"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// 2026-05-15 (Loo) — Supplier per-thread readiness + pickup batch hooks
// (Task 8 of supplier-thread-pickup-plan). The supplier marks individual
// threads ready (POST/DELETE /api/supplier/threads/:id/ready); partners or
// operation batch-pickup a set of ready threads on a PO (POST
// /api/partner/pickups/batch or POST /api/operation/pos/:poId/receive-threads).
// The reprint queries hit /api/pickup-events/:id/print for the bundled DO
// payload.
//
// NOTE: `/api/supplier/pos/:poId/threads` and
// `/api/supplier/pos/:poId/pickup-events` endpoints DO NOT EXIST yet — Task 10
// (per-thread checklist) adds `/threads`; Task 13 (DO reprint history) adds
// `/pickup-events`. The hooks below type-check now but will 404 at runtime
// until those tasks land. This is intentional scaffolding so feature work in
// Tasks 9/11/12 can call them.
// ---------------------------------------------------------------------------

/** Supplier marks a single thread ready for pickup. RPC returns the updated
 *  thread row + new `po_sup_status` so callers can show optimistic UI; the
 *  `noop` flag fires when the thread was already marked ready (idempotent). */
export function useMarkThreadReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      return apiFetch<{
        thread_id: string;
        supplier_ready_at: string | null;
        po_sup_status: string;
        noop?: boolean;
      }>(`/api/supplier/threads/${threadId}/ready`, { method: "POST" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier", "pos"] });
      qc.invalidateQueries({ queryKey: ["supplierThreads"] });
    },
  });
}

/** Supplier un-marks a thread ready (only allowed pre-pickup). RPC nulls
 *  `supplier_ready_at` and recomputes PO sup_status downward (last ready
 *  removed → drops back to `ready_for_pickup`/`in_production`). `noop` fires
 *  when the thread was already not-ready. */
export function useUnmarkThreadReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      return apiFetch<{
        thread_id: string;
        po_sup_status?: string;
        noop?: boolean;
      }>(`/api/supplier/threads/${threadId}/ready`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier", "pos"] });
      qc.invalidateQueries({ queryKey: ["supplierThreads"] });
    },
  });
}

/** Partner batch pickup — picks N ready threads on a PO in one DO. Server
 *  creates one `pickup_events` row + stamps every selected thread's
 *  `pickup_event_id`.
 *
 *  2026-05-16 (migration 0117) — `doNumber` + `doFilePath` are optional.
 *  Server auto-generates `DO-{poId}-{seq}` when omitted; the partner doesn't
 *  type a number for a doc they didn't issue. Response includes the final
 *  do_number so the UI can echo it back in a toast.
 */
export function usePartnerPickupBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      poId: string;
      threadIds: string[];
      doNumber?: string;
      doFilePath?: string;
      doNote?: string;
    }) => {
      return apiFetch<{
        pickup_event_id: string;
        thread_count: number;
        do_number: string;
        po_sup_status: string;
      }>("/api/partner/pickups/batch", {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner"] });
      qc.invalidateQueries({ queryKey: ["pickupEvents"] });
      qc.invalidateQueries({ queryKey: ["supplierThreads"] });
    },
  });
}

/**
 * Partner marks a pickup event as "physically collected · departing factory".
 * Stamps po_pickup_events.departed_at = NOW() server-side. Drives the kanban
 * PO from SCHEDULED → IN TRANSIT (the middle of the proto-faithful 3-step
 * partner flow restored 2026-05-17 by migration 0119).
 */
export function usePartnerMarkPickupCollected() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (eventId: string) => {
      return apiFetch<{ event_id: string; departed_at: string }>(
        `/api/partner/pickups/events/${eventId}/collect`,
        { method: "POST" },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner"] });
      qc.invalidateQueries({ queryKey: ["pickupEvents"] });
    },
  });
}

/** operation counterpart — same shape, different role-gated route.
 *  `poId` lives in the URL (matches the existing
 *  `/api/operation/pos/:poId/...` family); body carries the rest. */
export function useOperationReceiveThreads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      poId: string;
      threadIds: string[];
      doNumber: string;
      doFilePath: string;
      doNote?: string;
    }) => {
      const { poId, ...body } = input;
      return apiFetch<{
        pickup_event_id: string;
        thread_count: number;
        po_sup_status: string;
      }>(`/api/operation/pos/${poId}/receive-threads`, {
        method: "POST",
        body: JSON.stringify({ ...body, signed: true }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      qc.invalidateQueries({ queryKey: ["pickupEvents"] });
      qc.invalidateQueries({ queryKey: ["supplierThreads"] });
    },
  });
}

/** Thread list for a single PO. Used by the supplier PODrawer's per-thread
 *  checklist (Task 10). Each row is one `order_supplier_threads` row scoped
 *  to that PO, plus the SKU lines this thread is responsible for (derived
 *  from the `order_supplier_thread_lines` join). `pickup_event_id` is
 *  non-null when the thread has already been picked up.
 *
 *  Endpoint added by Task 10; this hook currently 404s until then. */
export type ThreadRow = {
  id: string;
  order_id: string;
  order_dl: number;
  customer_name: string;
  customer_delivery_date: string | null;
  supplier_ready_at: string | null;
  pickup_event_id: string | null;
  sku_lines: Array<{ sku: string; qty: number }>;
};

export function useSupplierThreadsForPo(poId: string | null) {
  return useQuery({
    queryKey: poId ? qk.supplierThreads.byPo(poId) : ["supplierThreads", "none"],
    queryFn: () => apiFetch<ThreadRow[]>(`/api/supplier/pos/${poId}/threads`),
    enabled: !!poId,
  });
}

/** operation counterpart to {@link useSupplierThreadsForPo} — same payload
 *  shape, different role-gated endpoint (operation-only). Used by the
 *  operation ReceivePOModal (Task 12) to render the per-thread receive list
 *  for own_logistics suppliers (where operation receives goods directly at
 *  the HQ warehouse with no LP involved). Share the `supplierThreads` cache
 *  key family with the supplier endpoint — both refer to the same DB rows. */
export function useOperationThreadsForPo(
  poId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: poId ? qk.supplierThreads.byPo(poId) : ["supplierThreads", "none"],
    queryFn: () => apiFetch<ThreadRow[]>(`/api/operation/pos/${poId}/threads`),
    enabled: !!poId && (options?.enabled ?? true),
  });
}

/** Pickup events list for a single PO (history view). Used by the supplier
 *  PODrawer's "Past pickups" section + the reprint button.
 *  `ack_role` lets the UI label "Picked by partner" vs "Received by HQ".
 *
 *  Endpoint added by Task 13; this hook currently 404s until then. */
export type PickupEventRow = {
  id: string;
  do_number: string;
  picked_up_at: string;
  ack_role: "partner" | "operation";
  thread_count: number;
};

export function usePickupEventsForPo(poId: string | null) {
  return useQuery({
    queryKey: poId ? qk.pickupEvent.byPo(poId) : ["pickupEvents", "none"],
    queryFn: () => apiFetch<PickupEventRow[]>(`/api/supplier/pos/${poId}/pickup-events`),
    enabled: !!poId,
  });
}

/** Full pickup event payload for the print/reprint flow. Returns enough
 *  context to render the DO without a second round-trip: PO ID + ETA,
 *  supplier name, every thread in the event with customer + SKU lines.
 *
 *  Endpoint added by Task 13 (`/api/pickup-events/:id/print`). */
export type PickupEventPrintPayload = {
  event_id: string;
  do_number: string;
  do_file_path: string | null;
  do_note: string | null;
  picked_up_at: string;
  ack_role: "partner" | "operation";
  po_id: string;
  po_eta_date: string | null;
  supplier_name: string;
  threads: Array<{
    thread_id: string;
    order_id: string;
    order_dl: number;
    customer_name: string;
    customer_delivery_date: string | null;
    sku_lines: Array<{ sku: string; qty: number }>;
  }>;
};

export function usePickupEventPrint(eventId: string | null) {
  return useQuery({
    queryKey: eventId ? qk.pickupEvent.print(eventId) : ["pickupEvent", "none"],
    queryFn: () => apiFetch<PickupEventPrintPayload>(`/api/pickup-events/${eventId}/print`),
    enabled: !!eventId,
  });
}

// ---------------------------------------------------------------------------
// 0074 catalog admin mutations (Loo 2026-05-09 Q2=c). Each mutation
// invalidates qk.catalog() so the public bundle picks up the change on the
// next consumer mount (Create-PO modal, dealer wizard, etc.).
// ---------------------------------------------------------------------------

function catalogJson(method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown) {
  return {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };
}

export function useCreateCatalogModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductModelCreateInput) =>
      apiFetch<{ model: ProductModelDto }>("/api/catalog/models", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchCatalogModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductModelPatchInput }) =>
      apiFetch<{ model: ProductModelDto }>(`/api/catalog/models/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteCatalogModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/models/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useCreateCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductSkuCreateInput) =>
      apiFetch<{ sku: ProductSkuDto }>("/api/catalog/skus", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProductSkuPatchInput }) =>
      apiFetch<{ sku: ProductSkuDto }>(`/api/catalog/skus/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/skus/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// 2990s Products parity Phase 1 — bulk SKU import. Sends the staged + validated
// rows; the server resolves/creates models, upserts SKUs (blank=preserve), and
// returns a per-row result. Invalidates the catalog bundle on success.
export function useImportSkus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: SkuImportRow[]) =>
      apiFetch<SkuImportResult>("/api/catalog/import-skus", catalogJson("POST", { rows })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// Orders import (AutoCount RPC) — reused by the Master combined import to create
// the missing orders before setting their stock. Idempotent by ref server-side.
export function useImportOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AutocountImportInput) =>
      apiFetch<AutocountImportResponse>("/api/orders/import", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["operation"] }),
  });
}

// Stock-ETA import — bulk-fill per-line Stock ETA from the Master "Ops" sheet.
// dryRun previews the match rate (writes nothing); a real run merges the ETAs
// into ops_order_control.line_etas, so every operation orders/detail view
// refreshes.
export function useImportStockEta() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      rows: StockEtaImportRow[];
      storageFees?: StorageFeeImportRow[];
      balances?: BalanceImportRow[];
      dryRun?: boolean;
    }) =>
      apiFetch<{ result: StockEtaImportResult }>(
        "/api/operation/orders/import-stock-eta",
        catalogJson("POST", input),
      ).then((r) => r.result),
    onSuccess: (_res, vars) => {
      if (!vars.dryRun) void qc.invalidateQueries({ queryKey: ["operation"] });
    },
  });
}

/** On Hand — bulk book-in from the "Klg Warehouse" ready-stock sheet. Sends ALL
 *  parsed lines; the server reconciles against the live pool (count-based, per
 *  stable key) and inserts only the deficit — idempotent. One line = one record
 *  carrying its qty. Refreshes every ops-stock list + the dashboard. */
export function useImportStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rows: OpsStockImportRow[] }) =>
      apiFetch<{ created: number; alreadyIn: number; total: number }>(
        "/api/ops/stock/import",
        catalogJson("POST", input),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
      void qc.invalidateQueries({ queryKey: qk.operation.dashboard() });
    },
  });
}

/** GRN per-line receive (migration 0208) — book n units of one order line into
 *  stock (reserved to the SO). Refreshes the order detail + control overlay +
 *  the ops-stock listing so the Recv X/N + readiness update. */
export function useReceiveLine(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceiveLineInput) =>
      apiFetch<{ result: ReceiveLineResult }>(
        `/api/operation/orders/${orderId}/receive-line`,
        catalogJson("POST", input),
      ).then((r) => r.result),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      void qc.invalidateQueries({
        queryKey: qk.operation.orderControl(orderId),
        exact: true,
      });
      void qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
    },
  });
}

// ── Sofa loan flow (migration 0209) ──────────────────────────────────────────
const loansKey = (orderId: string | null) =>
  ["operation", "orders", orderId ?? "null", "loans"] as const;

/** The order's sofa loans (active + returned). */
export function useOrderLoans(orderId: string | null) {
  return useQuery({
    queryKey: loansKey(orderId),
    queryFn: () =>
      apiFetch<SofaLoansResponse>(`/api/operation/orders/${orderId}/loans`),
    enabled: !!orderId,
    staleTime: 10_000,
  });
}

/** Lend a free sofa to the order (issue a loan DO + on-loan tracking). */
export function useLoanSofa(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoanSofaInput) =>
      apiFetch<{ loan: SofaLoanDto }>(
        `/api/operation/orders/${orderId}/loan-sofa`,
        catalogJson("POST", input),
      ).then((r) => r.loan),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: loansKey(orderId) });
      void qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
    },
  });
}

/** Return a loaned sofa (the swap at final delivery) — frees the unit again. */
export function useReturnLoan(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReturnLoanInput) =>
      apiFetch<{ ok: true }>(
        `/api/operation/orders/${orderId}/loan-return`,
        catalogJson("POST", input),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: loansKey(orderId) });
      void qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
    },
  });
}

/** Borrow a piece from a supplier to loan (migration 0217) — creates a return
 *  obligation. No own-stock unit is touched. */
export function useBorrowLoan(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BorrowLoanInput) =>
      apiFetch<{ loan: SofaLoanDto }>(
        `/api/operation/orders/${orderId}/loan-borrow`,
        catalogJson("POST", input),
      ).then((r) => r.loan),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: loansKey(orderId) });
      void qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
    },
  });
}

/** Close the supplier return obligation — the borrowed piece went back. */
export function useReturnLoanSupplier(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReturnToSupplierInput) =>
      apiFetch<{ ok: true }>(
        `/api/operation/orders/${orderId}/loan-return-supplier`,
        catalogJson("POST", input),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: loansKey(orderId) });
      void qc.invalidateQueries({ queryKey: qk.operation.order(orderId), exact: true });
    },
  });
}

// 0181 — Special Add-ons CRUD (principal-only on the server; the catalog bundle
// invalidates so the Maintenance tab + per-model attach + POS picker all refresh).
export function useCreateSpecialAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SpecialAddonCreateInput) =>
      apiFetch<{ specialAddon: SpecialAddonDto }>("/api/catalog/special-addons", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchSpecialAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SpecialAddonPatchInput }) =>
      apiFetch<{ specialAddon: SpecialAddonDto }>(`/api/catalog/special-addons/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteSpecialAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/special-addons/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// 0182→0201 — Global option pools. Curated reference lists (sizes / heights /
// gaps / supplier categories) rendered by the Maintenance + Special Add-ons
// sidebar panels. Not a source of truth for any order-side consumer — sizes
// only SUGGEST in the per-model size picker; product_models.allowed_options
// stays authoritative. 0201 replaced the per-row CRUD hooks with ONE batch
// save (Edit-mode draft → PUT replaces the pool + appends a history snapshot
// atomically via the catalog_pool_batch_save RPC). Principal-only at the
// API/RLS layer; the UI gate in PoolPanel is a friendly read-only veneer.
export function useBatchSaveOptionPool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pool, input }: { pool: CatalogOptionPoolName; input: CatalogPoolBatchSaveInput }) =>
      apiFetch<{ ok: true }>(`/api/catalog/option-pools/${pool}`, catalogJson("PUT", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** 0201 — the History dialog's snapshot log for one pool (newest first). Only
 *  fetched while the dialog is open (`enabled`); rides the ["catalog"] prefix
 *  so every pool save refreshes it. */
export function useCatalogConfigHistory(section: CatalogOptionPoolName, enabled: boolean) {
  return useQuery({
    queryKey: qk.catalogConfigHistory(section),
    queryFn: () =>
      apiFetch<{ history: CatalogConfigHistoryDto[] }>(
        `/api/catalog/config-history?section=${section}`,
      ),
    enabled,
    staleTime: 60_000,
  });
}

/** 0202 — atomic replace-all save of the global fabric master (the Fabrics tab
 *  Edit draft). Appends a section='fabrics' history snapshot server-side
 *  (catalog_fabrics_batch_save RPC). Principal-only at the API/RLS layer. */
export function useBatchSaveCatalogFabrics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CatalogFabricsBatchSaveInput) =>
      apiFetch<{ ok: true }>("/api/catalog/fabrics", catalogJson("PUT", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** 0226 — Operation Catalog: record a fabric's buying add-on (RM). Internal
 *  (operation + principal) via the catalog_fabrics_set_cost DEFINER RPC. */
export function useSetCatalogFabricCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cost }: { id: string; cost: number | null }) =>
      apiFetch<{ ok: true }>(`/api/catalog/fabrics/${id}/cost`, catalogJson("PATCH", { cost })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** 0202 — the Fabrics History dialog's snapshot log (newest first). Rides the
 *  ["catalog"] prefix so every fabric save refreshes it. */
export function useCatalogFabricsHistory(enabled: boolean) {
  return useQuery({
    queryKey: qk.catalogConfigHistory("fabrics"),
    queryFn: () =>
      apiFetch<{ history: CatalogFabricsHistoryDto[] }>("/api/catalog/fabrics/history"),
    enabled,
    staleTime: 60_000,
  });
}

export function useCreateSofaFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SofaFabricCreateInput) =>
      apiFetch<{ fabric: SofaFabricDto }>("/api/catalog/sofa-fabrics", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchSofaFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SofaFabricPatchInput }) =>
      apiFetch<{ fabric: SofaFabricDto }>(`/api/catalog/sofa-fabrics/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteSofaFabric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/sofa-fabrics/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// 0176 — Alias so callers can use the Task-5 brief's naming convention.
// Both names are exported; the underlying hook is the same.
export { usePatchSofaFabric as useUpdateSofaFabric };

// ---------------------------------------------------------------------------
// 0179 — sofa combos (sofa engine Phase 2). Slots = ordered OR-sets of
// compartment codes; prices_by_height matrix per SOFA_HEIGHTS. Three CRUD
// mutations mirroring the 0177 combo hooks: POST creates, PATCH replaces
// fields, DELETE soft-deletes (active=false + discontinued_at). Principal-only
// at the API/RLS layer (sofa_combo_pricing_write_principal); the UI gate in
// ProductModelDrawer's Sofa Combos panel is a friendly read-only veneer. Each
// invalidates the whole `['catalog']` tree so the admin bundle re-fetches (sofa
// combos ride in the bundle — no dedicated query key needed).
// ---------------------------------------------------------------------------

export function useCreateSofaCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SofaComboCreateInput) =>
      apiFetch<{ sofaCombo: SofaComboDto }>("/api/catalog/sofa-combos", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpdateSofaCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SofaComboPatchInput }) =>
      apiFetch<{ sofaCombo: SofaComboDto }>(`/api/catalog/sofa-combos/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteSofaCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/sofa-combos/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// 0178 — sofa compartment pool + per-model offered (sofa engine Phase 1). CRUD
// hooks mirroring the sofa-fabric / combo hooks; all invalidate ['catalog'] so
// the admin bundle re-fetches. Principal-only at the API/RLS layer; the UI gate
// in the maintenance page is a friendly read-only veneer.
export function useCreateSofaCompartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SofaCompartmentCreateInput) =>
      apiFetch<{ compartment: SofaCompartmentDto }>("/api/catalog/sofa-compartments", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpdateSofaCompartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: SofaCompartmentPatchInput }) =>
      apiFetch<{ compartment: SofaCompartmentDto }>(`/api/catalog/sofa-compartments/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteSofaCompartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/sofa-compartments/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpsertModelSofaCompartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      modelId,
      compartmentId,
      input,
    }: {
      modelId: string;
      compartmentId: string;
      input: ModelSofaCompartmentInput;
    }) =>
      apiFetch<{ modelSofaCompartment: ModelSofaCompartmentDto }>(
        `/api/catalog/models/${modelId}/compartments/${compartmentId}`,
        catalogJson("PUT", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** Offer MANY compartments on a model in one go (the New-SKU sofa flow — Loo
 *  2026-07-06). Each offer is the same idempotent principal-only PUT the drawer
 *  uses (the server auto-syncs the `{MODEL_KEY}-{code}` SKU per offer). One
 *  failing compartment does NOT abort the rest — failures are collected and
 *  returned so the caller can retry just those — and the catalog invalidates
 *  ONCE at the end instead of once per compartment. */
export function useOfferModelCompartments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      compartmentIds,
    }: {
      modelId: string;
      compartmentIds: string[];
    }) => {
      const failed: { compartmentId: string; message: string }[] = [];
      for (const compartmentId of compartmentIds) {
        try {
          await apiFetch<{ modelSofaCompartment: ModelSofaCompartmentDto }>(
            `/api/catalog/models/${modelId}/compartments/${compartmentId}`,
            catalogJson("PUT", {}),
          );
        } catch (e) {
          failed.push({
            compartmentId,
            message: e instanceof ApiError ? e.message : "offer failed",
          });
        }
      }
      return { offered: compartmentIds.length - failed.length, failed };
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteModelSofaCompartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, compartmentId }: { modelId: string; compartmentId: string }) =>
      apiFetch<{ ok: true }>(
        `/api/catalog/models/${modelId}/compartments/${compartmentId}`,
        catalogJson("DELETE"),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** Compartment photo (signed-upload flow in photo-upload.ts — principal-only).
 *  Lands in `sofa_compartments.icon_url`; the builder silhouettes prefer it. */
export function useSetCompartmentPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ compartmentId, file }: { compartmentId: string; file: Blob }) =>
      uploadCompartmentPhoto(compartmentId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteCompartmentPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (compartmentId: string) =>
      apiFetch<{ compartment: SofaCompartmentDto }>(
        `/api/catalog/sofa-compartments/${compartmentId}/photo`,
        catalogJson("DELETE"),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/**
 * PATCH /api/catalog/fabric-tier-config — update the global tier deltas
 * (sofaTier2Delta / sofaTier3Delta). Principal-only at the RLS layer.
 * Invalidates the whole `['catalog']` tree so the admin bundle re-fetches.
 */
export function useUpdateFabricTierConfig(
  opts?: Partial<UseMutationOptions<{ fabricTierConfig: FabricTierConfigDto }, ApiError, FabricTierConfigDto>>,
) {
  const qc = useQueryClient();
  return useMutation<{ fabricTierConfig: FabricTierConfigDto }, ApiError, FabricTierConfigDto>({
    mutationFn: (input) =>
      apiFetch<{ fabricTierConfig: FabricTierConfigDto }>(
        "/api/catalog/fabric-tier-config",
        catalogJson("PATCH", input),
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * PUT /api/catalog/model-fabric-tier-override/:modelId — upsert a per-model
 * tier delta override. Pass `tier2Delta: null` / `tier3Delta: null` to revert
 * that tier's delta to the global config. Principal-only at the RLS layer.
 * Invalidates the whole `['catalog']` tree.
 */
export function useUpsertModelFabricTierOverride(
  opts?: Partial<
    UseMutationOptions<
      { override: ModelFabricTierOverrideDto },
      ApiError,
      { modelId: string; tier2Delta: number | null; tier3Delta: number | null }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { override: ModelFabricTierOverrideDto },
    ApiError,
    { modelId: string; tier2Delta: number | null; tier3Delta: number | null }
  >({
    mutationFn: ({ modelId, tier2Delta, tier3Delta }) =>
      apiFetch<{ override: ModelFabricTierOverrideDto }>(
        `/api/catalog/model-fabric-tier-override/${modelId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier2Delta, tier3Delta }),
        },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["catalog"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ---------------------------------------------------------------------------
// 0169-0173 — Product & Maintenance mutations (Modular + Maintenance tabs).
// Each invalidates ['catalog'] so the admin bundle + every consumer
// (dealer wizard, Create-PO) re-reads on the next mount.
// ---------------------------------------------------------------------------

/** Modular "active sizes" cascade — writes allowed_options.sizes AND flips
 *  pos_active across the model's size SKUs (in-set on, others off). Never
 *  touches discontinued_at. */
export function useToggleSizesActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, input }: { modelId: string; input: SizesActiveInput }) =>
      apiFetch<{ ok: true; sizes: string[] }>(
        `/api/catalog/models/${modelId}/sizes-active`,
        catalogJson("PATCH", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** Materialize one SKU per variant (from allowed_options.sizes or an explicit
 *  list). Idempotent — existing codes are skipped server-side. */
export function useGenerateSkus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, input }: { modelId: string; input: GenerateSkusInput }) =>
      apiFetch<{ ok: true; generated: number; skipped: number }>(
        `/api/catalog/models/${modelId}/generate-skus`,
        catalogJson("POST", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** Photo upload (signed-upload flow in photo-upload.ts). Takes the raw File;
 *  the helper shrinks → signs → uploads → stores → returns the updated model. */
export function useSetModelPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, file }: { modelId: string; file: Blob }) =>
      uploadModelPhoto(modelId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteModelPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) =>
      apiFetch<{ model: ProductModelDto }>(
        `/api/catalog/models/${modelId}/photo`,
        catalogJson("DELETE"),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** Delivery-fee singleton (floor_config, id=1). Principal-only server-side
 *  (floor_write_principal) — the Maintenance editor UI-gates to principal. */
export function usePatchFloorConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FloorConfigPatchInput) =>
      apiFetch<{ floorConfig: FloorConfigDto }>(
        "/api/catalog/floor-config",
        catalogJson("PATCH", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// ---------------------------------------------------------------------------
// 0184 — delivery TRIP fee (2990s Products parity Phase 6). The principal-owned
// config singleton + per-RuleTarget special overrides. All four mutations
// invalidate the ['catalog'] tree so the bundle (Maintenance + the POS preview)
// re-reads. Principal-only on the server (RLS + API gate); the Maintenance UI
// gate is a friendly read-only veneer. The floor STAIR surcharge stays separate.
// ---------------------------------------------------------------------------

/** PATCH /api/catalog/delivery-fee-config — update the singleton (base/cross
 *  fee, charged categories, lead days). Principal-only on the server. */
export function useUpdateDeliveryFeeConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DeliveryFeeConfigPatchInput) =>
      apiFetch<{ deliveryFeeConfig: DeliveryFeeConfigDto }>(
        "/api/catalog/delivery-fee-config",
        catalogJson("PATCH", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useCreateSpecialDeliveryFeeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SpecialDeliveryFeeRuleInput) =>
      apiFetch<{ specialDeliveryFeeRule: SpecialDeliveryFeeRuleDto }>(
        "/api/catalog/special-delivery-fee-rules",
        catalogJson("POST", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpdateSpecialDeliveryFeeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<SpecialDeliveryFeeRuleInput> }) =>
      apiFetch<{ specialDeliveryFeeRule: SpecialDeliveryFeeRuleDto }>(
        `/api/catalog/special-delivery-fee-rules/${id}`,
        catalogJson("PATCH", patch),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteSpecialDeliveryFeeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/special-delivery-fee-rules/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// ---------------------------------------------------------------------------
// 0185 — Default Free Gifts (per model) + Free Item Campaigns (2990s Products
// parity Phase 7, GWP). Principal-only on the server (RLS + API gate); the
// Maintenance UI gate is a friendly read-only veneer. Every mutation invalidates
// the ['catalog'] tree so the bundle (Promo tab + the POS preview resolver)
// re-reads. Free lines book as RM0 order_lines with attrs markers — the order
// submit pipeline (create_order / order_lines / DraftLine) is untouched.
// ---------------------------------------------------------------------------

/** PUT /api/catalog/model-free-gifts/:modelId — REPLACE a model's whole gift
 *  set (an empty `gifts` clears it server-side). Principal-only on the server. */
export function useUpsertModelFreeGifts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ modelId, input }: { modelId: string; input: ModelDefaultFreeGiftsInput }) =>
      apiFetch<{ modelDefaultFreeGifts: ModelDefaultFreeGiftsDto }>(
        `/api/catalog/model-free-gifts/${modelId}`,
        catalogJson("PUT", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

/** DELETE /api/catalog/model-free-gifts/:modelId — drop a model's gift config
 *  (idempotent; a missing row is a no-op). Principal-only on the server. */
export function useDeleteModelFreeGifts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (modelId: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/model-free-gifts/${modelId}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useCreateFreeItemCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FreeItemCampaignInput) =>
      apiFetch<{ freeItemCampaign: FreeItemCampaignDto }>(
        "/api/catalog/free-item-campaigns",
        catalogJson("POST", input),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpdateFreeItemCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FreeItemCampaignInput> }) =>
      apiFetch<{ freeItemCampaign: FreeItemCampaignDto }>(
        `/api/catalog/free-item-campaigns/${id}`,
        catalogJson("PATCH", patch),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteFreeItemCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/free-item-campaigns/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// ---------------------------------------------------------------------------
// 0186 — PWP / Promo rules (2990s Products parity Phase 8a). Principal-only on
// the server (RLS + API gate); the Maintenance UI gate is a friendly read-only
// veneer. Every mutation invalidates the ['catalog'] tree so the bundle (Promo
// tab + the POS preview resolver) re-reads. DORMANT — no order-path consumer in
// P8a; the rule pairs a trigger category/target with a reward category/target,
// and the reward PRICE lives on product_skus.pwpPrice / sofa_combo_pricing
// .pwpPricesByHeight (separate principal-locked write paths).
// ---------------------------------------------------------------------------

export function useCreatePwpRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PwpRuleInput) =>
      apiFetch<{ pwpRule: PwpRuleDto }>("/api/catalog/pwp-rules", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpdatePwpRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PwpRuleInput> }) =>
      apiFetch<{ pwpRule: PwpRuleDto }>(`/api/catalog/pwp-rules/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeletePwpRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/pwp-rules/${id}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useCreateAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddonCreateInput) =>
      apiFetch<{ addon: AddonDto }>("/api/catalog/addons", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function usePatchAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, patch }: { key: string; patch: AddonPatchInput }) =>
      apiFetch<{ addon: AddonDto }>(`/api/catalog/addons/${key}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteAddon() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/addons/${key}`, catalogJson("DELETE")),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

// ─── Phase B — Order annotations + activity timeline ─────────────────────────

export type AnnotationTag = "follow_up" | "escalate" | "resolved";

/** A single entry in the merged order timeline.
 *  kind='annotation' → human note (content + tag populated)
 *  kind='activity'   → system event (action + detail populated) */
export interface TimelineEntry {
  id: string;
  kind: "annotation" | "activity";
  content?: string | null;
  tag?: AnnotationTag | null;
  action?: string | null;
  detail?: Record<string, unknown> | null;
  actor_name?: string | null;
  occurred_at: string;
}

export interface AddAnnotationInput {
  orderId: string;
  content: string;
  tag?: AnnotationTag | null;
}

/** Merged annotation + activity timeline for one order. */
export function useOrderTimeline(orderId: string | null) {
  return useQuery({
    queryKey: orderId
      ? qk.operation.orderTimeline(orderId)
      : (["operation", "orders", "null", "timeline"] as const),
    queryFn: () =>
      apiFetch<TimelineEntry[]>(`/api/operation/orders/${orderId}/timeline`),
    enabled: !!orderId,
    staleTime: 10_000,
  });
}

/** A row in the GLOBAL activity feed — same as TimelineEntry but carries the
 *  order it belongs to (so + customer) so it can be shown across all orders. */
export interface GlobalActivityRow {
  id: string;
  kind: "annotation" | "activity";
  order_id: string | null;
  so: number | null;
  customer_name: string | null;
  action?: string | null;
  detail?: Record<string, unknown> | null;
  content?: string | null;
  tag?: AnnotationTag | null;
  actor_name?: string | null;
  occurred_at: string;
}

/** The global cross-order activity feed (monitor view). */
export function useOperationActivity() {
  return useQuery({
    queryKey: ["operation", "activity"] as const,
    queryFn: () => apiFetch<GlobalActivityRow[]>("/api/operation/activity"),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export interface EscalationRow {
  id: string;
  content: string;
  created_at: string;
  orders: { id: string; so: number; customer_name: string } | null;
  app_users: { name: string } | null;
}

/** Recent 🚨 escalate-tagged annotations for Jess's dashboard inbox. */
export function useEscalations(limit = 10) {
  return useQuery({
    queryKey: qk.operation.escalations(),
    queryFn: () =>
      apiFetch<EscalationRow[]>(`/api/operation/escalations?limit=${limit}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Append a human note to an order.
 *  Invalidates the timeline cache on success. */
export function useAddAnnotation() {
  const qc = useQueryClient();
  return useMutation<TimelineEntry, ApiError, AddAnnotationInput>({
    mutationFn: ({ orderId, content, tag }) =>
      apiFetch<TimelineEntry>(`/api/operation/orders/${orderId}/annotations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, tag: tag ?? null }),
      }),
    onSuccess: (_data, { orderId }) => {
      void qc.invalidateQueries({ queryKey: qk.operation.orderTimeline(orderId) });
      // The ⭐ follow-up star + the Orders-list "Follow-up" filter derive from each
      // order's embedded annotations, so the list must refetch when a follow_up /
      // resolved note is added — else the star stays stale in the list view.
      void qc.invalidateQueries({ queryKey: ["operation", "orders"] });
    },
  });
}
