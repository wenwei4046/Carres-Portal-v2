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
  type AppendMissingLinesInput,
  type AppendMissingLinesResult,
  type StorageFeeImportRow,
  type BalanceImportRow,
  type StockEtaImportResult,
  type OpsStockImportRow,
  type OpsReorderResponse,
  type OpsReorderPointInput,
  type OpsStockUsageResponse,
  type OpsStockHealthResponse,
  type OpsReserveLevelInput,
  type OpsStockPlanResponse,
  type OpsStockPlanOpenInput,
  type OpsStockPlanProposeInput,
  type OpsStockPlanConsolidateInput,
  type OpsStockPlanFinalInput,
  type OpsStockPlanDecideInput,
  type OpsStockEmergencyResponse,
  type OpsStockEmergencyRaiseInput,
  type OpsStockEmergencyDecideInput,
  type LoanSofaInput,
  type BorrowLoanInput,
  type UpdateLoanInput,
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
  type ServicePackage,
  type ServicePackageInput,
  type RentalPlan,
  type RentalPlanInput,
  type RentalOffer,
  type RentalOfferInput,
  type RentalOfferPatchInput,
  type RentalBuyPrice,
  type RentalBuyPriceInput,
  type RentalBuyPricePatchInput,
  type RentalOfferService,
  type RentalOfferServiceInput,
  type RentalOfferServicePatchInput,
  type RentalAgreementTemplate,
  type RecordRentalPaymentInput,
  type ChargeRentalInterestInput,
  type SettleRentalAgreementInput,
  type AgreementTemplateInput,
  type AgreementTemplatePatchInput,
  type RentalAgreement,
  type RentalStockUnit,
  type GuaranteeListResponse,
  type ServiceCaseListResponse,
  type GuaranteeProductInput,
  type PosRentalPlan,
  type Customer,
  type CreateRentalAgreementInput,
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
  // 0239 — Product bundles (bundle pricing, principal-only CRUD).
  type ProductBundleDto,
  type ProductBundleInput,
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
  type OfficeReceiveInput,
  type RefundCreateInput,
  type RefundPayInput,
  type ReservedDrilldownResponse,
  type SalespersonDto,
  type SalespersonCreateInput,
  type AddOrderLinesInput,
  type EditOrderAddonInput,
  type SubmitOrderChangeRequestInput,
  type ReplaceOrderLinesInput,
  type OrderChangeRequestDto,
  type SalespersonsListResponse,
  // 0233 — Staff PIN login (tiers + PIN identity on salespersons rows).
  type StaffListResponse,
  type StaffSessionResponse,
  type VerifyPinInput,
  type StaffReauthInput,
  type CreateStaffInput,
  type UpdateStaffInput,
  type SetStaffPinInput,
  type StaffDto,
  // 0240 — store-account email-change requests (dealer principal → HQ approval).
  type EmailChangeRequestDto,
  type SubmitEmailChangeInput,
  // 2026-07-19 — the BD dealer-account create door (principal-parity schema).
  type CreateAccountInput,
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
  type ConfirmBookingInput,
  type DelayDecisionInput,
  // T9 (0283) — logistic partner delivery rules + the date pre-check.
  type PartnerBookingCheckResponse,
  type PartnerBookingWarningWire,
  type SetPartnerDeliveryRulesInput,
  type DeliveryPhotoListResponse,
  type OpsOrderControlResponse,
  type UpdateOpsOrderControlInput,
  type OpsStaffListResponse,
  type OpsPoDutyResponse,
  type UpdateOpsStaffSettingInput,
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
  type StoreChannel,
  // Purchase / Procurement MRP cockpit — GET /api/operation/purchase/today.
  type PurchaseTodayResponse,
  // Q3 — Purchasing → Report (GET /api/operation/pos/report). Facts only; the
  // figures are computed by `buildPoReport`.
  type PoReportResponse,
  // P1 (0303) — Purchasing → Settings.
  type PurchasingSettingsResponse,
  type PurchasingSetNumberInput,
  type PurchasingSetPoDaysInput,
  type PurchasingSetProductionDaysInput,
  type PurchasingSetWorkWeekInput,
  // 0244/0245 — HR commission portal (GET /api/hr/report + config writes).
  type CommissionReport,
  type CommissionStaff,
  type CommissionConfig,
  type SetCommissionSchemeInput,
  type SetStaffRateInput,
  type SetModelRateInput,
  type SetModelTiersInput,
  type SetMilestonesInput,
  // 0250 — BD commission (paid by what their assigned dealers sell).
  type BdCommissionReport,
  type BdUser,
  type BdDealer,
  type BdRateRow,
  type SetBdRateInput,
  type AssignDealerBdInput,
  // 0251 — BD method switch (percentage | per_model) + executive/CBO positions.
  type CommissionMethod,
  type SetBdMethodInput,
  type SetBdPositionInput,
  // HR Team hierarchy (Phase 1) — org registry + THE account door.
  type HrTeamSource,
  // HR-P4 (0269) — employee master
  type HrPeopleSource,
  // HR-P6 (0276) — targets + scoreboard
  type KpiKey,
  type KpiSource,
  type Scorecards,
  type SetKpiTargetInput,
  type SetStoreManagerInput,
  // HR-P7 (0278) — people cost
  type PeopleCost,
  type StaffCompSource,
  type SetStaffCompInput,
  type HrEmployeeDetail,
  type HrEmployeePatchInput,
  type HrRecordExitInput,
  type HrChecklistToggleInput,
  type HrSetAccessInput,
  // HR-P5 (0272) — commission runs
  type CommissionRunSummary,
  type CommissionRunDetail,
  type CommissionRunState,
  type ReadinessCheck,
  type CloseMonthInput,
  type AddAdjustmentInput,
  type SetTeamPositionInput,
  type SetReportsToInput,
  type SetStaffCodeInput,
  type UpsertOrgDepartmentInput,
  type UpsertOrgPositionInput,
  type SetPositionDutyInput,
  type HrCreateTeamAccountInput,
  type HrCreateShowroomStaffInput,
  type SupplierClaimMove,
  type WarehouseIncomingResponse,
  type WarehouseReceiptLine,
  type WarehouseReceiptRow,
  type WarehouseSubmitReceiptInput,
} from "@carres/shared";
import { ApiError, apiFetch } from "./api";
import { uploadCompartmentPhoto, uploadDeliveryPhoto, uploadModelPhoto } from "./photo-upload";

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
  /** 0233 — staff PIN roster (GET /api/staff). Principal may scope to another
   *  store via dealerId; own-store reads pass none. Kept off the `salespersons`
   *  prefix so staff mutations that flip hasPin invalidate distinctly. */
  staff:        (dealerId?: string) => ["staff", dealerId ?? null] as const,
  /** 0240 — my store's latest email-change request (dealer principal). */
  emailChange:  () => ["email-change", "mine"] as const,
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
  // 0247-0249 — Rental + Service Plan base. Blast ["rental"] to refresh the
  // whole module after a config write.
  rental: {
    config: () => ["rental", "config"] as const,
    agreements: () => ["rental", "agreements"] as const,
    units: () => ["rental", "units"] as const,
    // 0255 — the POS sell lane's stripped offer list + checkout polling.
    posPlans: () => ["rental", "pos-plans"] as const,
    checkoutSession: (agreementId: string, sessionId: string) =>
      ["rental", "checkout", agreementId, sessionId] as const,
    // 0268 — the finance approver's credit queue.
    approvals: () => ["rental", "approvals"] as const,
    // 0279 — the wording in force, read by the POS before a customer signs.
    agreementTemplate: () => ["rental", "agreement-template"] as const,
    // 0281 — what has actually been collected against one agreement.
    collections: (agreementId: string) => ["rental", "collections", agreementId] as const,
    // 0300 — what paying the rest off today would cost, worked out server-side.
    settlementQuote: (agreementId: string) =>
      ["rental", "settlement-quote", agreementId] as const,
  },
  // 0261-0263 — Guarantee packages. Blast ["guarantees"] after a claim/attach
  // so the desk, the order badge and any open drawer all re-read together.
  guarantees: {
    search: (q: string, status: string) => ["guarantees", "search", q, status] as const,
    byOrder: (orderId: string) => ["guarantees", "by-order", orderId] as const,
  },
  serviceCases: {
    // Shares the ["ops","service-cases"] prefix the list page and modal already
    // invalidate, so saving a case refreshes the order drawer's Cases tab too.
    byOrder: (orderId: string) =>
      ["ops", "service-cases", "by-order", orderId] as const,
  },
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
    /** 0240 — store email-change request queue (HQ approval). */
    emailChanges: () => ["principal", "email-changes"] as const,
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
    /** T6 (migration 0280) — the order's delivery-photo ledger + signed view
     *  urls. Nested under the order id, same blunt-invalidate family. */
    deliveryPhotos: (id: string) =>
      ["operation", "orders", id, "delivery-photos"] as const,
    /** T9 (migration 0283) — what the order's carrier says about ONE candidate
     *  delivery date. Keyed by the date so picking another day is a fresh
     *  question, not a stale answer. */
    partnerBookingCheck: (id: string, date: string) =>
      ["operation", "orders", id, "partner-check", date] as const,
    /** Staff assignment pool (migration 0232) — operation accounts + pool state. */
    staff: ["operation", "staff"] as const,
    /** PO duty rotation (migration 0236) — this month's PO holder. */
    poDuty: ["operation", "po-duty"] as const,
    /** Balance job (migration 0184) — the multi-entry payment ledger for an
     *  order. Nested under the order id so a blunt ["operation","orders"]
     *  invalidation after any order mutation refreshes it too. */
    orderPayments: (id: string) => ["operation", "orders", id, "payments"] as const,
    partners:  () => ["operation", "partners"] as const,
    suppliers: () => ["operation", "suppliers"] as const,
    pos:       (filters?: operationPoFilters) =>
      ["operation", "pos", filters ?? {}] as const,
    po:        (id: string) => ["operation", "pos", id] as const,
    /** The per-unit goods ids a PO minted at Issue (0153) — the PO-PDF
     *  standard's Item ID column. Nested under "pos" for blunt invalidation. */
    poUnits:   (id: string) => ["operation", "pos", id, "units"] as const,
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
    /** R2 — the supplier-claim queue. Invalidated by a receive, because a
     *  receive is the thing that opens claims. */
    supplierClaims: (status: string) =>
      ["operation", "supplier-claims", status] as const,
    /** R6 — what the warehouse filed and is waiting on. Invalidated by a
     *  check-in, because a check-in IS a receive: the PO row, the claim queue
     *  and this queue all move together. */
    warehouseReceipts: (status: string) =>
      ["operation", "warehouse-receipts", status] as const,
    /** Slice B — one PO's Receiving Sessions + their event ledger. The
     *  Workspace's Summary and Activity both read this ONE call, so the two
     *  sections can never describe the same delivery differently. */
    poReceiving: (poId: string) =>
      ["operation", "pos", poId, "receiving"] as const,
    supplierClaimPhotos: (id: string) =>
      ["operation", "supplier-claims", "photos", id] as const,
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
    /** Purchase / Procurement MRP cockpit — the "what to buy today" read model
     *  (GET /api/operation/purchase/today). Nested under `operation` so a blunt
     *  invalidate on `["operation"]` after a PO mutation refreshes it too. */
    purchaseToday: () => ["operation", "purchase", "today"] as const,
    /** P1 (0303) — the purchasing numbers (GET /api/operation/purchasing/settings). */
    purchasingSettings: () => ["operation", "purchasing", "settings"] as const,
    /** To Order — the Planning Workspace projection, recomputed on every read
     *  (GET /api/operation/purchase/to-order). Issuing invalidates ["operation"]. */
    toOrder: () => ["operation", "purchase", "to-order"] as const,
    /** Q3 — the Report tab's ONE read (GET /api/operation/pos/report). Nested
     *  under `pos` so any blunt PO invalidation reaches the figures too: the
     *  report stores nothing, so it must never be the last screen holding an
     *  old number. */
    poReport: () => ["operation", "pos", "report"] as const,
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
  // BD namespace (2026-07-19 — the BD POS reads dealer stats + audit activity;
  // the Phase-8 Inquiries key died with the ERP-style BD portal).
  bd: {
    dealers:  () => ["bd", "dealers"] as const,
    activity: (limit?: number) => ["bd", "activity", limit ?? 12] as const,
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
  // R6 — the warehouse portal's own namespace, beside supplier and partner.
  // Its two reads share one prefix so filing a count refreshes BOTH: the PO
  // leaves the incoming list (it now has an open receipt) and appears in the
  // warehouse's own list at the same moment.
  warehousePortal: {
    incoming: () => ["warehouse-portal", "incoming"] as const,
    receipts: () => ["warehouse-portal", "receipts"] as const,
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
  // 0244/0245 — HR commission portal. Nested so config/assign mutations can
  // blast the whole `["hr"]` sub-tree (every month report embeds the config).
  hr: {
    report: (year: number, month: number) => ["hr", "report", year, month] as const,
    team: () => ["hr", "team"] as const,
    // HR-P4 (0269) — the employee master.
    people: () => ["hr", "people"] as const,
    // HR-P5 (0272) — commission runs
    runs: () => ["hr", "runs"] as const,
    run: (runId: string) => ["hr", "runs", runId] as const,
    runState: (year: number, month: number) =>
      ["hr", "runs", "state", year, month] as const,
    person: (employeeId: string) => ["hr", "people", employeeId] as const,
    // HR-P6 (0276) — targets + the scoreboard. Keyed on the metric too: switching
    // metric changes every number on the page, so it is a different query.
    kpi: (year: number, month: number, kpiKey: string) =>
      ["hr", "kpi", year, month, kpiKey] as const,
    // HR-P7 (0278) — people cost.
    comp: (year: number, month: number) => ["hr", "comp", year, month] as const,
  },
};

/** commission_run_state + the pure pre-flight the API folds in. */
export type CommissionRunStateWithChecks = CommissionRunState & {
  checks: ReadinessCheck[];
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

/** 0233 — P3 change requests: the order's submission list (POS pending
 *  banner + the ops approval panel). RLS scopes the read. */
export function useOrderChangeRequests(orderId: string) {
  return useQuery<{ requests: OrderChangeRequestDto[] }, ApiError>({
    queryKey: ["orders", orderId, "change-requests"],
    queryFn: () => apiFetch(`/api/orders/${orderId}/change-requests`),
  });
}

/** 0233 — P3: file a proceed-lane add-product submission. */
export function useSubmitOrderChangeRequest(orderId: string) {
  const qc = useQueryClient();
  return useMutation<
    { request: OrderChangeRequestDto | null },
    ApiError,
    SubmitOrderChangeRequestInput
  >({
    mutationFn: (input) =>
      apiFetch(`/api/orders/${orderId}/change-requests`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["orders", orderId, "change-requests"] });
    },
  });
}

/** 0233 — P3: requester cancels a pending submission. */
export function useCancelOrderChangeRequest(orderId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, ApiError, string>({
    mutationFn: (requestId) =>
      apiFetch(`/api/orders/${orderId}/change-requests/${requestId}/cancel`, {
        method: "POST",
        body: "{}",
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["orders", orderId, "change-requests"] });
    },
  });
}

/** 0234 — P3.1: replace a PENDING request's payload in place (View → Edit). */
export function useUpdateOrderChangeRequest(orderId: string) {
  const qc = useQueryClient();
  return useMutation<
    { request: OrderChangeRequestDto | null },
    ApiError,
    { requestId: string; input: SubmitOrderChangeRequestInput }
  >({
    mutationFn: ({ requestId, input }) =>
      apiFetch(`/api/orders/${orderId}/change-requests/${requestId}/edit`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["orders", orderId, "change-requests"] });
    },
  });
}

/** 0234 — the ops grid badge: ALL pending change requests (internal only). */
export function useAllPendingChangeRequests() {
  return useQuery<
    { requests: Array<{ id: string; orderId: string; requestedAt: string }> },
    ApiError
  >({
    queryKey: ["change-requests", "pending"],
    queryFn: () => apiFetch(`/api/orders/change-requests/pending`),
  });
}

/** 0233 — P3 ops decide: APPROVE applies the lines through the full engine
 *  pipeline (fresh prices) + stamps the request; REJECT stamps with a note.
 *  Response = the re-shaped order (same cache discipline as useTopUpOrder). */
export function useDecideOrderChangeRequest(orderId: string) {
  const qc = useQueryClient();
  return useMutation<
    Order,
    ApiError,
    { requestId: string; approve: boolean; note?: string | null }
  >({
    mutationFn: ({ requestId, approve, note }) =>
      apiFetch(`/api/orders/${orderId}/change-requests/${requestId}/decide`, {
        method: "POST",
        body: JSON.stringify({ approve, note: note ?? null }),
      }),
    onSuccess: async (order) => {
      qc.setQueryData(qk.order(orderId), order);
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
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

/** 0255 — line EDIT: replace one item (or a whole exploded sofa group) on a
 *  PLACE-lane order with a re-configured, server-re-priced version. Up-sell
 *  only (`downsell_blocked` 422 otherwise). */
export function useReplaceOrderLines(
  orderId: string,
  opts?: Partial<UseMutationOptions<Order, ApiError, ReplaceOrderLinesInput>>,
) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, ReplaceOrderLinesInput>({
    mutationFn: (input) =>
      apiFetch<Order>(`/api/orders/${orderId}/lines/replace`, {
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

/** 0258 — qty/size edit on a SERVICE add-on row (place lane direct; the
 *  proceed lane files an edit_addon change request instead). Up-sell law:
 *  qty can only stay or increase (`downsell_blocked`). */
export function useEditOrderAddon(orderId: string) {
  const qc = useQueryClient();
  return useMutation<Order, ApiError, { addonId: string; input: EditOrderAddonInput }>({
    mutationFn: ({ addonId, input }) =>
      apiFetch<Order>(`/api/orders/${orderId}/addons/${addonId}/edit`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async (order) => {
      qc.setQueryData(qk.order(orderId), order);
      await qc.invalidateQueries({ queryKey: qk.order(orderId), exact: true });
      void qc.invalidateQueries({ queryKey: ["orders"] });
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
 * 2026-05-22 (Loo) — Dealer-side create outlet. Used in the POS Staff overlay's
 * OutletsSection to add a second / third physical location after the
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
// 0233 — Staff PIN login (Loo 2026-07-18)
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

/** PATCH /api/staff/:id — edit name/color/outlet/tier/active (server tier-gates).
 *  An internal HQ caller (principal / bd) editing ANOTHER store's member passes
 *  `dealerId` — the server resolves the target store from the query param. */
export function usePatchStaff(
  opts?: Partial<
    UseMutationOptions<StaffDto, ApiError, { id: string; patch: UpdateStaffInput; dealerId?: string }>
  >,
) {
  const qc = useQueryClient();
  return useMutation<StaffDto, ApiError, { id: string; patch: UpdateStaffInput; dealerId?: string }>({
    mutationFn: ({ id, patch, dealerId }) =>
      apiFetch<StaffDto>(`/api/staff/${id}${dealerId ? `?dealerId=${dealerId}` : ""}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["staff"] });
      await qc.invalidateQueries({ queryKey: ["salespersons"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** POST /api/staff/:id/pin — set/reset a member's 6-digit PIN (server scope-gates).
 *  An internal HQ caller (principal / bd) targeting ANOTHER store's member
 *  passes `dealerId` — without it the server's target-dealer resolve 400s. */
export function useSetStaffPin(
  opts?: Partial<
    UseMutationOptions<{ ok: true }, ApiError, { id: string; dealerId?: string } & SetStaffPinInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, ApiError, { id: string; dealerId?: string } & SetStaffPinInput>({
    mutationFn: ({ id, pin, dealerId }) =>
      apiFetch<{ ok: true }>(`/api/staff/${id}/pin${dealerId ? `?dealerId=${dealerId}` : ""}`, {
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
// 0240 — store-account email-change (dealer principal submits; HQ decides).
// Password change never touches these — it is client → Supabase Auth direct
// (lib/password.ts).
// ---------------------------------------------------------------------------

/** GET /api/account/email-change — my store's LATEST request (any status). */
export function useMyEmailChange(
  opts?: Partial<UseQueryOptions<{ request: EmailChangeRequestDto | null }>>,
) {
  return useQuery({
    queryKey: qk.emailChange(),
    queryFn: () => apiFetch<{ request: EmailChangeRequestDto | null }>("/api/account/email-change"),
    staleTime: 30_000,
    ...opts,
  });
}

/** POST /api/account/email-change — submit for HQ approval (password re-proof).
 *  ApiError bodies: bad_password 401 · email_in_use/same_email 422 ·
 *  pending_exists 409. */
export function useSubmitEmailChange(
  opts?: Partial<UseMutationOptions<EmailChangeRequestDto, ApiError, SubmitEmailChangeInput>>,
) {
  const qc = useQueryClient();
  return useMutation<EmailChangeRequestDto, ApiError, SubmitEmailChangeInput>({
    mutationFn: (input) =>
      apiFetch<EmailChangeRequestDto>("/api/account/email-change", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.emailChange() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** POST /api/account/email-change/:id/cancel — withdraw my pending request. */
export function useCancelEmailChange(
  opts?: Partial<UseMutationOptions<EmailChangeRequestDto, ApiError, { id: string }>>,
) {
  const qc = useQueryClient();
  return useMutation<EmailChangeRequestDto, ApiError, { id: string }>({
    mutationFn: ({ id }) =>
      apiFetch<EmailChangeRequestDto>(`/api/account/email-change/${id}/cancel`, { method: "POST" }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.emailChange() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** GET /api/principal/accounts/email-change-requests — the HQ queue. */
export function usePrincipalEmailChanges(
  opts?: Partial<UseQueryOptions<{ requests: EmailChangeRequestDto[] }>>,
) {
  return useQuery({
    queryKey: qk.principal.emailChanges(),
    queryFn: () =>
      apiFetch<{ requests: EmailChangeRequestDto[] }>(
        "/api/principal/accounts/email-change-requests",
      ),
    ...opts,
  });
}

/** POST /api/principal/accounts/email-change-requests/:id/(approve|reject). */
export function useDecideEmailChange(
  opts?: Partial<
    UseMutationOptions<
      EmailChangeRequestDto,
      ApiError,
      { id: string; action: "approve" | "reject"; note?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    EmailChangeRequestDto,
    ApiError,
    { id: string; action: "approve" | "reject"; note?: string }
  >({
    mutationFn: ({ id, action, note }) =>
      apiFetch<EmailChangeRequestDto>(
        `/api/principal/accounts/email-change-requests/${id}/${action}`,
        { method: "POST", body: JSON.stringify(note ? { note } : {}) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.principal.emailChanges() });
      // Approve changes the login email shown in the accounts table too.
      await qc.invalidateQueries({ queryKey: qk.principal.accounts() });
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
  /** 'showroom' = one of Carres' OWN stores; 'dealer' = an external reseller.
   *  HQ lists the two on separate pages (Loo 2026-07-19). */
  channel: StoreChannel;
  /** How many outlets hang off this account (a dealer's branches). */
  outletCount: number;
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
  /** Same second SELECT — tells the drawer whether this is one of Carres' own
   *  showrooms (no SSM / PIC) or an external dealer. */
  channel: StoreChannel;
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
  | "bd"
  | "hr";

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
        // 2026-07-18 (Loo) — first staff identity + 6-digit PIN provisioned
        // with a dealer/showroom store (see createAccountInput.initialStaff).
        initialStaff?: { name: string; staffRole: "principal" | "manager" | "salesperson"; pin: string };
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
  /** The PO's own destination (0307). A line with none follows it. */
  destination_id?: string | null;
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
  /** Partner's WhatsApp GROUP invite link (chat.whatsapp.com/…), for the bulk
   *  bar's Logistic ⋮ → Chase/Remind. Seeded for NETS/AL/TEOW/TT; null = not set
   *  (the review card shows "group not set", Copy still works). */
  whatsapp_group_url?: string | null;
  /** T9 (migration 0283) — the carrier's own delivery rules. OPTIONAL on the
   *  type so a browser on this build against an older Worker degrades to "no
   *  rules recorded" (silence) instead of crashing. */
  off_days?: number[] | null;
  blackout_dates?: string[] | null;
  daily_capacity?: number | null;
  booking_lead_days?: number | null;
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
  whatsapp_group_url: string | null;
  /** The mailto: door's address (0313 — the ONE email column). */
  contact_email?: string | null;
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
  /** Compact line embed for the 货品 items summary (control table only).
   *  `unit_price` (C5) lets the row compute what the order is worth. */
  order_lines?: {
    sku: string;
    qty: number;
    unit_price?: number | string | null;
    source_po?: string | null;
    /** STAGE 1 — `Model · Variant`, resolved server-side by the SAME helper
     *  the detail route uses (Law D), so a product is never named two ways.
     *  `null` = not in the catalog (every AutoCount-imported line, whose
     *  "sku" is free text); the caller then shows that text. Optional: a
     *  browser on this build against an older Worker reads it as absent and
     *  falls back the same way. */
    label?: string | null;
  }[];
  /** C5 (2026-07-27) — the money truth. `orders.paid` is the only figure a
   *  live payment path writes; with the add-on sum below and the line prices
   *  above it feeds the shared `orderMoney`, so the row's 🔒, the drawer and
   *  the booking gate all answer with the same number. BOTH are optional: a
   *  browser on this build against a pre-C5 Worker reads them as absent, the
   *  order's value is then UNKNOWN, and unknown holds nothing — which is
   *  exactly what shipped before this card. */
  paid?: number | string | null;
  order_addons?: { qty: number; unit_price?: number | string | null }[];
  /**
   * D1 (2026-08-06) — the SKUs a real PURCHASE ORDER covers for this order,
   * linked the drawer's own way (`purchase_orders.so` or `so_refs[]`).
   *
   * Before this the list's only PO evidence was `order_lines.source_po`, which
   * ONLY the AutoCount importer writes, so the ladder read every native order
   * as "nothing ordered". Measured on production: 19 of 28 live orders were
   * covered by a real PO and 0 carried `source_po`.
   *
   * OPTIONAL on purpose, and `undefined` must behave as "we do not know",
   * never as "there is no PO": a browser on this build against a pre-D1 Worker
   * then falls back to exactly the pre-D1 answer instead of accusing.
   */
  po_skus?: string[];
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
  /** STAGE 1 — the register's Salesperson / Showroom fact columns. Both are
   *  name embeds off a single FK. Optional: absent on an older Worker. */
  salesperson_id?: string | null;
  salespersons?: { name: string } | null;
  outlets?: { name: string } | null;
  /**
   * STAGE 1 — the rest of the flat facts the CUSTOMER ORDER itself owns, so
   * the register's grouped column chooser can offer every one of them
   * (hidden by default). **Every field here is a column on `orders`** (or,
   * for `building_type`, a value the Sales Portal wrote into the order's own
   * `entry_data`) — nothing is another module's record, nothing is computed.
   * All optional: on an older Worker they read as absent, the column prints
   * its absence word, and nothing crashes.
   */
  customer_email?: string | null;
  customer_billing?: string | null;
  customer_emergency?: string | null;
  customer_address_line1?: string | null;
  customer_address_line2?: string | null;
  customer_address_city?: string | null;
  customer_address_state?: string | null;
  customer_address_postcode?: string | null;
  building_type?: string | null;
  delivery_floor?: number | null;
  delivery_has_lift?: boolean | null;
  channel?: string | null;
  invoice_no?: string | null;
  invoiced_at?: string | null;
  payment_method?: string | null;
  installment_months?: number | null;
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
  /** C9 — the ladder reads the storage fee through the ONE shared rule
   *  (`storageHold`), which needs the operator's start date and the keyed
   *  override, not just the Master-imported figures. Optional, so a browser on
   *  this build against an older Worker degrades to the imported fee instead of
   *  crashing. */
  storage_from?: string | null;
  storage_fee_override?: number | string | null;
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
  /** Staff owner (migration 0232) — soft responsibility pointer surfaced into
   *  the list for the owner chip + STAFF facet. Optional so older fixtures
   *  keep typechecking. */
  assigned_staff?: string | null;
  /** D1 two-stage booking (migration 0277, T1) — the list's Delivery column +
   *  queues read these to tell the CUSTOMER's confirmed booking apart from the
   *  carrier's provisional date (logistic_eta). Optional: a browser on this
   *  build against a pre-T1 Worker degrades to the provisional reading. */
  booking_stage?: "none" | "provisional" | "confirmed" | null;
  confirmed_date?: string | null;
  confirmed_time_slot?: string | null;
  /** T6 delivery-photo ledger (migration 0280) — surfaced into the list for T7's
   *  "Upload delivery photo" queue. `undefined` means the answer is UNKNOWN (an
   *  older Worker that doesn't select the column, or no overlay row at all), and
   *  the queue stays silent; an explicit `[]` is the real "no photo yet". Only
   *  paths ride the list — a signed view URL is minted per click in the drawer. */
  delivery_photos?: { path: string; at: string; by: string | null }[] | null;
  /** T8 delivery groups (migration 0282) — what the LIVE booking covers.
   *  `null`/absent = the trip carries the whole order (T8's own definition, so
   *  there is nothing to backfill); T11's detail pane reads it to name the
   *  second trip. Optional: a pre-T11 Worker simply doesn't select it. */
  booking_groups?: string[] | null;
  /** C8 delay planning (migration 0304) — the recorded answer to "can we still
   *  make the promised date?", and the supplier date it was made ABOUT. The
   *  ladder reads BOTH: a decision only silences the delay it was taken about,
   *  so a factory that slips again re-opens Delay planning by itself. Optional
   *  → `undefined` on a pre-0304 Worker, which reproduces the pre-C8 behaviour
   *  (the radar fires on the overshoot, as it always did). */
  delay_decision?: "keep" | "new_date" | null;
  delay_decision_eta?: string | null;
  /** C8b the two delay clocks (migration 0305) — the two moments the delay
   *  deadlines count from: `delay_detected_at` = the day the supplier's date
   *  FIRST overshot the promise (Delay planning, 2 working days),
   *  `delay_decision_at` = the moment Operations recorded that the promise
   *  cannot be met (the logistics call, the SAME working day). Both are
   *  server-owned. `delay_detected_eta` says which supplier date the sighting
   *  was about, so a stamp that has stopped being about the current date is not
   *  trusted. Optional → absent on a pre-0305 Worker, and an action with no
   *  anchor simply carries no deadline. */
  delay_decision_at?: string | null;
  delay_detected_at?: string | null;
  delay_detected_eta?: string | null;
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
  /** 2026-07-19 — POS entry extras bag; the drawer reads
   *  `fields.building_type` (delivery-address building type). Optional so
   *  older detail fixtures keep typechecking. */
  entry_data?: Record<string, unknown> | null;
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
  /** STAGE 1 — who sold it. The Sales Order workspace names the salesperson on
   *  the customer commitment. Optional so existing detail fixtures keep
   *  typechecking. */
  salesperson_id?: string | null;
  salespersons?: { name: string } | null;
}
export interface operationOrderDetailLine {
  /** STAGE 2 — the row's identity, so Save can diff lines in place. Optional:
   *  absent on an older Worker. */
  id?: string;
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
  /** J1 — the supplier's signed DO object in the `delivery-orders` bucket
   *  (column since 0030). Optional: a browser on this build talking to a
   *  pre-J1 Worker simply sees no supplier-DO row instead of crashing. */
  do_file_path?: string | null;
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
  /** The PO's own destination (0307). A line with none follows it. */
  destination_id?: string | null;
  status: "open" | "received" | "cancelled";
  sup_status: string;
  so: number | null;
  so_refs: number[] | null;
  eta_date: string | null;
  /** `Supplier Ready Date` (§12.2 ①) — the day the FACTORY says it has finished
   *  making the goods, written only by `purchasing_record_ready_date` (0318)
   *  after a supplier answered. It is NOT `eta_date`, which is our own
   *  prediction of arrival: R5 grades a supplier on this one, so the engine may
   *  never seed it. OPTIONAL — a browser on this build against an older Worker
   *  degrades to "no ready date yet", which is also the state that raises
   *  `Confirm ready date`. */
  expected_ready_date?: string | null;
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
    /** R1 (0284) — what arrived broken / as the wrong item, cumulative across
     *  every DO on this line. Neither counts as received: the supplier still
     *  owes a good unit, so the qty stays PENDING DELIVERY (never "missing").
     *  Optional because only the endpoints that select them return them — an
     *  absent value reads as "no problem recorded", not as unknown. */
    damaged_qty?: number;
    wrong_item_qty?: number;
    /** P3 (0306) — the day this line last took a SHORT delivery, stamped
     *  server-side. It is the balance call's Due anchor. OPTIONAL, so a browser
     *  on this build against an older Worker degrades to "no anchor" (the call
     *  shows with no deadline) rather than crashing. */
    short_since?: string | null;
    /** P3 — the received quantity the latest balance answer was made ABOUT.
     *  A second short delivery changes `received_qty`, the two stop matching,
     *  and the call re-opens by itself (S4 / C8's discipline). */
    balance_answer_about_qty?: number | null;
    /** Register (Jess, 2026-08-02) — the listing speaks MODEL, never the raw
     *  SKU code, and the name is resolved SERVER-side where every SKU can be
     *  looked up (the browser's POS catalog misses non-active SKUs and used
     *  to print the code). OPTIONAL: an older Worker degrades to the code. */
    model_name?: string | null;
    size?: string | null;
    /** Where THIS line goes (0311) — null = wherever the PO goes. */
    destination_id?: string | null;
    /** Purchasing's own internal note; never printed on the PO. */
    ops_remark?: string | null;
    /** Register (Jess, 2026-08-02) — the EXCEL rows this PO line becomes:
     *  one entry per SO × SKU, each carrying the SALESPERSON's remark from
     *  the sales order. Derived server-side; a quantity no SO claims comes
     *  back with `so: null`. OPTIONAL — an older Worker degrades to one row
     *  per line. */
    so_rows?: { so: number | null; qty: number; remark: string | null }[];
    // 0073 cascade picker (Loo 2026-05-09). Null for mattress + legacy
    // pre-0073 lines; bedframe carries {color, gap}; sofa carries
    // {fabric_id, fabric_name, fabric_surcharge}.
    attrs?: Record<string, unknown> | null;
  }[];
  /** P3 (0306) — the expected arrival the latest tomorrow's-delivery answer was
   *  made ABOUT. The factory moving the date again makes the old answer an
   *  answer about nothing, and the call re-opens. OPTIONAL for the same
   *  degrade-don't-crash reason as `short_since`. */
  tomorrow_answer_about_date?: string | null;
  /** Register (2026-08-02) — the EARLIEST promised customer delivery across
   *  every SO this PO covers; null for stockpile POs. OPTIONAL so a browser
   *  on this build against an older Worker degrades instead of crashing. */
  customer_delivery?: string | null;
  /** Register (Jess, 2026-08-02) — the arriving date has been answered about
   *  MORE THAN ONE expected arrival (promise-ledger history, 0306), so the
   *  listing marks it `(revised)`. OPTIONAL — older Worker degrades to false. */
  eta_revised?: boolean;
  /** What LEFT Carres for this supplier (0312), newest first. */
  sends?: {
    channel: string;
    note: string | null;
    sent_at: string;
    po_revisions: { rev_no: number } | null;
  }[];
  /** The supplier-date field's own history (0306 ledger, newest first) —
   *  it renders BESIDE the field, never in the Activity timeline. */
  promises?: {
    kind: string;
    answer: string;
    about_date: string | null;
    previous_date: string | null;
    new_date: string | null;
    reason: string | null;
    /** The free-text story beside the countable `reason` (0310). */
    remarks?: string | null;
    recorded_at: string;
  }[];
  /** 2026-05-18 (Loo C+D) — per-source-SO enrichment. One entry per SO this
   *  PO serves (po.so for single, po.so_refs[] for bundle). Empty for
   *  stockpile POs. Since 2026-08-02 the global /api/operation/pos fills it
   *  too (the Register's search answers the CUSTOMER's name); older Workers
   *  omit it — treat as []. */
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
  /** The active destination registry (0307) — the per-line picker's options. */
  destinations?: { id: string; name: string; is_default: boolean }[];
  /** ONE company-wide supplier-message draft (0312). */
  messageTemplate?: string | null;
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
  // R1 (0284) / R2 (0288) — what the inspection found, and how many supplier
  // claims it opened. OPTIONAL so a browser on this build talking to a
  // pre-0288 Worker degrades instead of crashing.
  damaged_qty?: number;
  wrong_item_qty?: number;
  claims_created?: number;
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
/**
 * R2 + R3 — the supplier-claim queue (`GET /api/operation/supplier-claims`).
 *
 * There is no "file a claim" mutation anywhere, because a claim is minted by
 * the receive (or the daily late-delivery sweep) inside migration 0288. A
 * hand-filed claim would be a receiving problem with no receiving behind it —
 * the exact hole the card closes. R3's three mutations move a claim that
 * already exists; none of them can create one.
 */
export interface SupplierClaimListRow {
  id: string;
  claim_no: string;
  po_id: string;
  po_line_id: string | null;
  supplier_id: string;
  supplier_name: string | null;
  sku: string;
  product_category: string;
  claim_type: string;
  qty: number;
  status: string;
  do_number: string | null;
  note: string | null;
  reported_by_name: string | null;
  reported_at: string;
  photo_count: number;
  // R3 — the two sides, and who owes the next move.
  requested_action: string | null;
  requested_at: string | null;
  supplier_response: string | null;
  supplier_response_note: string | null;
  responded_at: string | null;
  closed_at: string | null;
  close_note: string | null;
  /** Layer ③ (0324) — what we are doing for the CUSTOMER. A SECOND decision
   *  beside the item's outcome, never a replacement for it: the customer can
   *  cancel AND the item be destroyed, and both must be recordable. */
  customer_resolution: string | null;
  customer_resolution_note: string | null;
  customer_resolution_at: string | null;
  /** Does the PO line still owe us units? Read for late claims only; null =
   *  could not tell (the line was deleted), which counts as still pending. */
  line_pending: boolean | null;
  next_move: SupplierClaimMove;
  /** R4 — units of this claim still quarantined (`on_hold`). Read from the
   *  register, not derived from `qty`: a partner warehouse keeps no per-unit
   *  register, and resolved units are gone from the count. */
  held_units: number;
  hold_reason: string | null;
}

export interface SupplierClaimsResponse {
  claims: SupplierClaimListRow[];
  counts: { open: number; closed: number; all: number };
}

export function useOperationSupplierClaims(
  status: "open" | "closed" | "all",
  opts?: Partial<UseQueryOptions<SupplierClaimsResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.supplierClaims(status),
    queryFn: () =>
      apiFetch<SupplierClaimsResponse>(
        `/api/operation/supplier-claims?status=${status}`,
      ),
    staleTime: 30_000,
    ...opts,
  });
}

export interface SupplierClaimPhoto {
  path: string;
  at?: string;
  by?: string | null;
  url: string | null;
}

/** Signed URLs for one claim's evidence. Fetched only when the operator opens
 *  the row — the URLs are short-lived, so minting them for a whole list would
 *  be both wasteful and stale by the time anyone clicked. */
export function useOperationSupplierClaimPhotos(
  claimId: string | null,
  opts?: Partial<UseQueryOptions<{ photos: SupplierClaimPhoto[] }>>,
) {
  return useQuery({
    queryKey: qk.operation.supplierClaimPhotos(claimId ?? "none"),
    queryFn: () =>
      apiFetch<{ photos: SupplierClaimPhoto[] }>(
        `/api/operation/supplier-claims/${claimId}/photos`,
      ),
    enabled: !!claimId,
    staleTime: 10 * 60_000,
    ...opts,
  });
}

/**
 * R3 — the three moves on a claim: what we asked · what they answered · close.
 *
 * One hook shape for all three because they share one invalidation: any move
 * changes the row, the counts and who owes the next move, so the whole queue is
 * refetched rather than patched. A claim desk is small — correctness beats a
 * clever cache write, and a stale "supplier owes the move" is the one thing
 * this card exists to prevent.
 */
export interface SupplierClaimMoveResult {
  claim_no?: string;
  status?: string;
  requested_action?: string;
  supplier_response?: string;
  /** R4 — the hold resolution answers with what it moved. */
  outcome?: string;
  units?: number;
  /** Layer ③ — what we are doing for the customer. */
  customer_resolution?: string;
}

function useSupplierClaimMove<TInput>(
  path: (claimId: string) => string,
  opts?: Partial<
    UseMutationOptions<
      SupplierClaimMoveResult,
      ApiError,
      { claimId: string } & TInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    SupplierClaimMoveResult,
    ApiError,
    { claimId: string } & TInput
  >({
    mutationFn: ({ claimId, ...body }) =>
      apiFetch<SupplierClaimMoveResult>(path(claimId), {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["operation", "supplier-claims"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** What WE ask the supplier to do. */
export function useSupplierClaimRequestMutation(
  opts?: Partial<
    UseMutationOptions<
      SupplierClaimMoveResult,
      ApiError,
      { claimId: string; requested_action: string; note?: string }
    >
  >,
) {
  return useSupplierClaimMove<{ requested_action: string; note?: string }>(
    (id) => `/api/operation/supplier-claims/${id}/request`,
    opts,
  );
}

/**
 * Layer ③ — what we are doing for the CUSTOMER (0324).
 *
 * A SECOND decision beside the item's outcome, never a replacement for it, and
 * NOT gated on the supplier's answer: a customer who cancels does not wait for
 * the factory to reply. The server allows re-recording while the claim is open
 * (Carres may switch a repair to a replacement when the customer cannot wait)
 * and refuses it once the claim is closed.
 *
 * It moves no stock, so unlike the hold resolution it invalidates nothing but
 * the claim list.
 */
export function useSupplierClaimCustomerResolutionMutation(
  opts?: Partial<
    UseMutationOptions<
      SupplierClaimMoveResult,
      ApiError,
      { claimId: string; customer_resolution: string; note?: string }
    >
  >,
) {
  return useSupplierClaimMove<{ customer_resolution: string; note?: string }>(
    (id) => `/api/operation/supplier-claims/${id}/customer-resolution`,
    opts,
  );
}

/** What the SUPPLIER answered. Does not close the claim — the goods usually
 *  arrive days after the promise. */
export function useSupplierClaimResponseMutation(
  opts?: Partial<
    UseMutationOptions<
      SupplierClaimMoveResult,
      ApiError,
      { claimId: string; supplier_response: string; note?: string }
    >
  >,
) {
  return useSupplierClaimMove<{ supplier_response: string; note?: string }>(
    (id) => `/api/operation/supplier-claims/${id}/response`,
    opts,
  );
}

/** Settle it. The server refuses unless both sides are on file. */
export function useSupplierClaimCloseMutation(
  opts?: Partial<
    UseMutationOptions<
      SupplierClaimMoveResult,
      ApiError,
      { claimId: string; note?: string }
    >
  >,
) {
  return useSupplierClaimMove<{ note?: string }>(
    (id) => `/api/operation/supplier-claims/${id}/close`,
    opts,
  );
}

/**
 * R4 — what happened to the quarantined units.
 *
 * Shares the claim-move invalidation because the answer changes the row's held
 * count, and it ALSO invalidates the stock register: the units either entered
 * the ready pool or left the building, and an On-hand list still showing them
 * on hold is the one thing this card exists to prevent.
 */
export function useSupplierClaimHoldResolveMutation(
  opts?: Partial<
    UseMutationOptions<
      SupplierClaimMoveResult,
      ApiError,
      { claimId: string; outcome: string; note?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useSupplierClaimMove<{ outcome: string; note?: string }>(
    (id) => `/api/operation/supplier-claims/${id}/hold-resolve`,
    {
      ...opts,
      onSuccess: async (...args) => {
        await qc.invalidateQueries({ queryKey: ["operation", "ops-stock"] });
        opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
      },
    },
  );
}

// ── R6 · the warehouse portal ───────────────────────────────────────────────
//
// Three reads and one write, all of them RPCs the database gates on
// `app_role() = 'warehouse'`. Nothing here is scoped client-side: the warehouse
// id rides the caller's own account, never a parameter this code could get
// wrong.

/** Open POs bound for this warehouse, with R1's four numbers per line. */
export function useWarehouseIncoming(
  opts?: Partial<UseQueryOptions<WarehouseIncomingResponse>>,
) {
  return useQuery({
    queryKey: qk.warehousePortal.incoming(),
    queryFn: () =>
      apiFetch<WarehouseIncomingResponse>("/api/warehouse/incoming"),
    staleTime: 30_000,
    ...opts,
  });
}

/** What this warehouse filed, and what became of it — including the claims each
 *  check-in opened. */
export function useWarehouseMyReceipts(
  opts?: Partial<UseQueryOptions<{ receipts: WarehouseReceiptRow[] }>>,
) {
  return useQuery({
    queryKey: qk.warehousePortal.receipts(),
    queryFn: () =>
      apiFetch<{ receipts: WarehouseReceiptRow[] }>("/api/warehouse/receipts"),
    staleTime: 30_000,
    ...opts,
  });
}

/** File a count. Goods do NOT move — ops's check-in replays it through the
 *  receive engine, which is why both warehouse lists are refreshed and no
 *  stock cache is touched here. */
export function useWarehouseSubmitReceiptMutation(
  opts?: Partial<
    UseMutationOptions<
      { id: string; po_id: string; status: string },
      ApiError,
      WarehouseSubmitReceiptInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; po_id: string; status: string },
    ApiError,
    WarehouseSubmitReceiptInput
  >({
    mutationFn: (body) =>
      apiFetch<{ id: string; po_id: string; status: string }>(
        "/api/warehouse/receipts",
        { method: "POST", body: JSON.stringify(body) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["warehouse-portal"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** The ops queue row: one filed count, with the names a human needs and the
 *  one sentence the shared module composes. */
export interface WarehouseReceiptQueueRow {
  id: string;
  po_id: string;
  warehouse_id: string;
  warehouse_name: string | null;
  supplier_name: string | null;
  do_number: string;
  do_file_path: string;
  note: string | null;
  lines: WarehouseReceiptLine[];
  status: string;
  submitted_by_name: string | null;
  submitted_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  return_reason: string | null;
  /** "4 good · 1 damaged" — composed by the shared module, never typed. */
  summary: string;
  /** True when checking this in will file supplier claims. Said BEFORE the
   *  button is pressed. */
  opens_claims: boolean;
}

export interface WarehouseReceiptsQueueResponse {
  receipts: WarehouseReceiptQueueRow[];
  counts: { waiting: number };
}

/** R6 (ops) — what the warehouse filed. Defaults to the waiting queue. */
export function useOperationWarehouseReceipts(
  status: "submitted" | "returned" | "posted" | "voided" | "all" = "submitted",
  opts?: Partial<UseQueryOptions<WarehouseReceiptsQueueResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.warehouseReceipts(status),
    queryFn: () =>
      apiFetch<WarehouseReceiptsQueueResponse>(
        `/api/operation/warehouse-receipts?status=${status}`,
      ),
    staleTime: 30_000,
    ...opts,
  });
}

/**
 * The two ops moves: check in, or send it back.
 *
 * A check-in IS a receive — it books stock, advances threads and can open
 * supplier claims — so it invalidates the PO list, the claim queue and the
 * stock register alongside its own queue. Under-invalidating here would leave
 * an operator looking at a PO row that still says "In transit" seconds after
 * they booked its goods in.
 */
export function useWarehouseReceiptReviewMutation(
  move: "check-in" | "send-back",
  opts?: Partial<
    UseMutationOptions<
      Record<string, unknown>,
      ApiError,
      { receiptId: string; reason?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    Record<string, unknown>,
    ApiError,
    { receiptId: string; reason?: string }
  >({
    mutationFn: ({ receiptId, ...body }) =>
      apiFetch<Record<string, unknown>>(
        `/api/operation/warehouse-receipts/${receiptId}/${move}`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["operation", "warehouse-receipts"] }),
        qc.invalidateQueries({ queryKey: ["operation", "pos"] }),
        qc.invalidateQueries({ queryKey: ["operation", "supplier-claims"] }),
        qc.invalidateQueries({ queryKey: ["operation", "warehouse"] }),
      ]);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

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

/**
 * usePurchaseToday — GET /api/operation/purchase/today (the Procurement MRP
 * cockpit). Read-only: assembles live demand + supply, runs the net-requirements
 * engine, and returns the delivery bundles to raise + a per-supplier buy list +
 * urgency summary. operation + principal only. Refetched every 60s while open so
 * a freshly-placed order surfaces in the "① Place orders" list without a manual
 * reload.
 */
export function usePurchaseToday(
  opts?: Partial<UseQueryOptions<PurchaseTodayResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.purchaseToday(),
    queryFn: () =>
      apiFetch<PurchaseTodayResponse>("/api/operation/purchase/today"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    ...opts,
  });
}

/** Purchase §6 · ⋮ Skip — permanently drop order_lines from the purchase
 *  plan (POST /api/operation/purchase/line/skip). Invalidates /today so the
 *  row disappears immediately. */
export function usePurchaseSkipLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineIds: string[]) =>
      apiFetch<{ ok: boolean; skipped: number }>(
        "/api/operation/purchase/line/skip",
        { method: "POST", body: JSON.stringify({ lineIds }) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.operation.purchaseToday() });
    },
  });
}

/** Purchase §6 · ⋮ Push to next cycle — temp-skip order_lines until the next
 *  Mon/Wed/Fri PO day (server default) or an explicit `until` ISO. */
export function usePurchasePushLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { lineIds: string[]; until?: string }) =>
      apiFetch<{ ok: boolean; pushed: number; until: string }>(
        "/api/operation/purchase/line/push-next",
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.operation.purchaseToday() });
    },
  });
}

// ---------------------------------------------------------------------------
// P1 (0303) — Purchasing → Settings. The numbers the ordering engine reads.
// ---------------------------------------------------------------------------

/**
 * usePurchasingSettings — GET /api/operation/purchasing/settings.
 *
 * ONE query for every purchasing number, read by the Settings tab AND by the
 * surfaces that used to hold a copy of a literal (the Orders list's PO-day
 * banner and urgent bypass, the delivery queue deadlines, the right-rail
 * team card). A number with one home is the whole point of P1.
 */
export function usePurchasingSettings(
  opts?: Partial<UseQueryOptions<PurchasingSettingsResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.purchasingSettings(),
    queryFn: () =>
      apiFetch<PurchasingSettingsResponse>("/api/operation/purchasing/settings"),
    // Settings change a few times a year; re-reading them every minute would
    // be noise. They are invalidated on write.
    staleTime: 5 * 60_000,
    ...opts,
  });
}

/** Every settings write returns the whole settings object and blows the
 *  purchase plan away with it — a changed production time moves an order-by
 *  date, which is the card's own Done-when. */
/**
 * The supplier-date door (Jess, 2026-08-02) — POST
 * /api/operation/pos/:id/tomorrow-delivery, the ONE write for both
 * situations: the supplier tells us early, or nobody told us and we phoned.
 * The operator keys a DATE; the answer word is derived — the same date the
 * PO already holds is `shipping` (the promise stands), a different one is
 * `delayed` and must carry a reason. 0306/0310's RPC does the rest in one
 * transaction: ledger row · the PO's date · the push into Delay planning ·
 * the history sentence.
 */
export function useRecordSupplierDate(poId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      answer: "shipping" | "delayed";
      firstDate?: string;
      newDate?: string;
      reason?: string;
      remarks?: string;
    }) =>
      apiFetch<{ ok: true; result: unknown }>(
        `/api/operation/pos/${encodeURIComponent(poId ?? "")}/tomorrow-delivery`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      // Every PO list view — the register reads one, the workspace another.
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      // Q14 — INHERITED FROM THE DOOR THIS ONE REPLACED, not new behaviour.
      // A `delayed` answer moves the PO's expected arrival AND reaches the
      // ladder's own store, so Delay planning opens by itself on every
      // customer order the PO covers. The retired Receiving hook re-read both
      // of these; consolidating onto this door without them would have made a
      // recorded delay leave a stale Orders board.
      await qc.invalidateQueries({ queryKey: qk.operation.purchaseToday() });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
    },
  });
}

/**
 * Q5 · the SUPPLIER READY DATE door — POST /api/operation/pos/:id/ready-date.
 *
 * `Confirm ready date` is the oldest action in the purchasing flow and until
 * now the portal had no button that could close it: 0318 shipped the RPC and
 * nothing called it. ONE date and an optional reason — the factory finishing is
 * one fact, not a promise that can be "still standing", so there is no answer
 * word to derive (that belongs to the ARRIVAL door above).
 *
 * The RPC appends to the same promise ledger, so the history beside the field
 * grows by itself.
 */
export function useRecordReadyDate(poId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { newDate: string; reason?: string }) =>
      apiFetch<{ ok: true; result: unknown }>(
        `/api/operation/pos/${encodeURIComponent(poId ?? "")}/ready-date`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operation", "pos"] });
    },
  });
}

/**
 * The per-line doors (0311, Jess 2026-08-02): set where a line goes · SPLIT
 * part of it to somewhere else · keep purchasing's own internal note. One
 * hook, three paths — they invalidate the same list.
 */
export function usePoLineAction(lineId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      path: "destination" | "split" | "ops-remark";
      body: Record<string, unknown>;
    }) =>
      apiFetch<{ ok: true; result: unknown }>(
        `/api/operation/pos/lines/${encodeURIComponent(lineId ?? "")}/${input.path}`,
        { method: "POST", body: JSON.stringify(input.body) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operation", "pos"] });
    },
  });
}

/**
 * What LEFT Carres (0312) — one POST per send. The REVISION comes back from
 * the server: a send mints one only when the document changed since the last.
 */
export function useRecordSend(poId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { channel: "whatsapp" | "email" | "print"; note?: string }) =>
      apiFetch<{ ok: true; result: { revision: number } }>(
        `/api/operation/pos/${encodeURIComponent(poId ?? "")}/sends`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operation", "pos"] });
    },
  });
}

/** ONE company-wide supplier-message template. */
export function useSetMessageTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string }) =>
      apiFetch<{ ok: true }>("/api/operation/pos/message-template", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operation", "pos"] });
    },
  });
}

function usePurchasingSettingsMutation<TInput>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<PurchasingSettingsResponse>(`/api/operation/purchasing/settings${path}`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      qc.setQueryData(qk.operation.purchasingSettings(), data);
      void qc.invalidateQueries({ queryKey: qk.operation.purchaseToday() });
      void qc.invalidateQueries({ queryKey: qk.catalog() });
    },
  });
}

export function useSetPurchasingNumber() {
  return usePurchasingSettingsMutation<PurchasingSetNumberInput>("/number");
}
export function useSetPurchasingPoDays() {
  return usePurchasingSettingsMutation<PurchasingSetPoDaysInput>("/po-days");
}
export function useSetProductionDays() {
  return usePurchasingSettingsMutation<PurchasingSetProductionDaysInput>("/production-days");
}
export function useSetSupplierWorkWeek() {
  return usePurchasingSettingsMutation<PurchasingSetWorkWeekInput>("/work-week");
}

/** Purchase §6 · Snooze PO — defer a whole supplier's PO planning until
 *  `until` (ISO). Sending a past `until` clears the snooze (wake). */
export function usePurchaseSnoozeSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { supplierId: string; until: string; reason?: string }) =>
      apiFetch<{ ok: boolean; action: string; supplierId: string }>(
        "/api/operation/purchase/snooze",
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.operation.purchaseToday() });
    },
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

/* ─────────────────────────────────────────────────────────────────────────────
 * STAGE 2 · THE REVISION ENGINE — every write mints a revision (0327).
 * ──────────────────────────────────────────────────────────────────────────── */

/** One immutable snapshot: the agreement as it stood at that revision. */
export interface SalesOrderSnapshotLine {
  id?: string;
  sku: string;
  qty: number;
  unit_price: number | string;
  attrs?: Record<string, unknown> | null;
  source_po?: string | null;
  /** `Model name (Variant)` resolved AT MINT TIME, so an old revision's PDF
   *  still prints the name the customer saw even if the catalog changes. */
  description?: string | null;
}
export interface SalesOrderSnapshot {
  header: Record<string, unknown>;
  lines: SalesOrderSnapshotLine[];
  addons: Array<{ addon_key: string; qty: number; unit_price: number | string }>;
}
export interface SalesOrderRevisionRow {
  revision: number;
  snapshot: SalesOrderSnapshot;
  created_at: string;
  created_by: string | null;
  /** CARD 1 (0340) — who asked: staff_correction | customer_change. NULL on
   *  Rev 1 (the original) and on pre-0340 rows — history is never guessed. */
  change_type?: "staff_correction" | "customer_change" | null;
  note?: string | null;
}

export function useSalesOrderRevisions(
  orderId: string | null,
  opts?: Partial<UseQueryOptions<{ revisions: SalesOrderRevisionRow[] }>>,
) {
  return useQuery({
    queryKey: orderId
      ? ([...qk.operation.order(orderId), "revisions"] as const)
      : (["operation", "orders", "null", "revisions"] as const),
    queryFn: () =>
      apiFetch<{ revisions: SalesOrderRevisionRow[] }>(
        `/api/operation/orders/${orderId}/revisions`,
      ),
    enabled: !!orderId,
    ...opts,
  });
}

/* ─── STAGE 3 · card 3.3 — the attribution request lane ─────────────────────
 *
 * Four hooks, and the split between them IS the law: SUBMIT writes a request,
 * APPROVE writes only that request's status, APPLY is the only one that moves
 * the order (GATES.md GATE 4). They never collapse into one mutation, because
 * one hook would be one button, and one button is how two verbs become one act.
 * ─────────────────────────────────────────────────────────────────────────── */

/** A from → to pair, in NAMES. An approver never decides between two UUIDs. */
export interface AttributionMove {
  from: string | null;
  to: string | null;
}
export interface AttributionRequest {
  id: string;
  status: "pending" | "approved";
  reason: string | null;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
  applied_at: string | null;
  fields: string[];
  /** Who GATE 3 lets decide this exact request. */
  approver: "principal" | "hr_or_principal";
  salesperson?: AttributionMove;
  dealer?: AttributionMove;
  outlet?: AttributionMove;
  channel?: AttributionMove;
}

const attributionKey = (orderId: string) =>
  [...qk.operation.order(orderId), "attribution"] as const;

/** The ONE live request on an order — pending, or approved and not yet applied. */
export function useSalesOrderAttribution(
  orderId: string | null,
  opts?: Partial<UseQueryOptions<{ request: AttributionRequest | null }>>,
) {
  return useQuery({
    queryKey: orderId
      ? attributionKey(orderId)
      : (["operation", "orders", "null", "attribution"] as const),
    queryFn: () =>
      apiFetch<{ request: AttributionRequest | null }>(
        `/api/operation/orders/${orderId}/attribution`,
      ),
    enabled: !!orderId,
    ...opts,
  });
}

export interface AttributionChanges {
  salesperson_id?: string | null;
  dealer_id?: string;
  outlet_id?: string | null;
  channel?: "dealer" | "showroom";
}

/** SUBMIT — records a request. The order is not touched. */
export function useSubmitAttributionChange(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      { id: string; fields: string[] },
      ApiError,
      { changes: AttributionChanges; reason: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; fields: string[] },
    ApiError,
    { changes: AttributionChanges; reason: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ id: string; fields: string[] }>(
        `/api/operation/orders/${orderId}/attribution`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: attributionKey(orderId) });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** APPROVE / REJECT — writes the REQUEST's status. Writes nothing else. */
export function useDecideAttributionChange(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      { id: string; status: string },
      ApiError,
      { requestId: string; decision: "approved" | "rejected"; note?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; status: string },
    ApiError,
    { requestId: string; decision: "approved" | "rejected"; note?: string }
  >({
    mutationFn: ({ requestId, decision, note }) =>
      apiFetch<{ id: string; status: string }>(
        `/api/operation/orders/attribution/${requestId}/decide`,
        { method: "POST", body: JSON.stringify({ decision, ...(note ? { note } : {}) }) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: attributionKey(orderId) });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * WITHDRAW — the door back out of `approved` (0336).
 *
 * `'cancelled'` was legal since 0231 and unreachable from `approved`, so a
 * wrong approval could only be cleared by carrying it out. One verb, a
 * required reason, and the approver's own GATE 3 lane: the bar to take back is
 * never higher than the bar to grant.
 */
export function useWithdrawAttributionChange(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<{ id: string; status: string }, ApiError, { requestId: string; reason: string }>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ id: string; status: string }, ApiError, { requestId: string; reason: string }>({
    mutationFn: ({ requestId, reason }) =>
      apiFetch<{ id: string; status: string }>(
        `/api/operation/orders/attribution/${requestId}/withdraw`,
        { method: "POST", body: JSON.stringify({ reason }) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: attributionKey(orderId) });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * APPLY — the only verb that moves the order. Re-runs every floor first, so it
 * can still refuse here even though APPROVE succeeded. A second call is a
 * no-op and says so (`already_applied`).
 */
export interface AttributionApplyResult {
  id: string;
  revision?: number;
  changed?: string[];
  already_applied?: boolean;
}
export function useApplyAttributionChange(
  orderId: string,
  opts?: Partial<UseMutationOptions<AttributionApplyResult, ApiError, { requestId: string }>>,
) {
  const qc = useQueryClient();
  return useMutation<AttributionApplyResult, ApiError, { requestId: string }>({
    mutationFn: ({ requestId }) =>
      apiFetch<AttributionApplyResult>(
        `/api/operation/orders/attribution/${requestId}/apply`,
        { method: "POST" },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.operation.order(orderId) }),
        qc.invalidateQueries({ queryKey: ["operation", "orders"] }),
      ]);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/* ─── STAGE 3 · card 3.4 — durable correction work ──────────────────────────
 *
 * Raised BY a sales order change, owned BY the receiving module. There is no
 * "raise" hook: raising happens in the database at revision-mint time, because
 * a consequence follows from the document changing, not from a screen deciding
 * to report it. The browser only READS the work and CLOSES it — and the two
 * surfaces differ on purpose: the Sales Order shows what it caused and offers
 * no close, the receiving module's page offers it.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface CorrectionWorkRow {
  id: string;
  order_id: string;
  revision: number;
  module: "purchasing" | "operation" | "delivery" | "finance";
  consequence: string;
  fields_changed: string[];
  classification: "A" | "B";
  potentially_affected: { po_id?: string; state?: string };
  shared: boolean;
  /** The floor evaluator's OWN sentence, stored as raised. */
  evidence: string;
  state: "open" | "closed";
  raised_at: string;
  closed_at: string | null;
  closed_note: string | null;
  orders?: { so: number; customer_name: string | null } | null;
}

export function useCorrectionWork(
  args: { module?: CorrectionWorkRow["module"]; state?: "open" | "closed" | "all" } = {},
  opts?: Partial<UseQueryOptions<{ work: CorrectionWorkRow[] }>>,
) {
  const q = new URLSearchParams();
  if (args.module) q.set("module", args.module);
  if (args.state) q.set("state", args.state);
  const qs = q.toString();
  return useQuery({
    queryKey: ["operation", "correction-work", args.module ?? "all", args.state ?? "open"] as const,
    queryFn: () =>
      apiFetch<{ work: CorrectionWorkRow[] }>(
        `/api/operation/correction-work${qs ? `?${qs}` : ""}`,
      ),
    ...opts,
  });
}

/** What ONE sales order has raised — the read-only side of the handover. */
export function useOrderCorrectionWork(
  orderId: string | null,
  opts?: Partial<UseQueryOptions<{ work: CorrectionWorkRow[] }>>,
) {
  return useQuery({
    queryKey: orderId
      ? ([...qk.operation.order(orderId), "correction-work"] as const)
      : (["operation", "orders", "null", "correction-work"] as const),
    queryFn: () =>
      apiFetch<{ work: CorrectionWorkRow[] }>(
        `/api/operation/correction-work/order/${orderId}`,
      ),
    enabled: !!orderId,
    ...opts,
  });
}

export function useCloseCorrectionWork(
  opts?: Partial<
    UseMutationOptions<{ id: string; state?: string; already_closed?: boolean }, ApiError, { id: string; note?: string }>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ id: string; state?: string; already_closed?: boolean }, ApiError, { id: string; note?: string }>({
    mutationFn: ({ id, note }) =>
      apiFetch<{ id: string; state?: string; already_closed?: boolean }>(
        `/api/operation/correction-work/${id}/close`,
        { method: "POST", body: JSON.stringify(note ? { note } : {}) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["operation", "correction-work"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/* ─── STAGE 3 · card 3.5 — the amendment spine ──────────────────────────────
 *
 * SUBMIT and READ only. There is no issue hook, no accept hook and no apply
 * hook that can succeed: the signing mechanism and the amendment document's
 * form are the owner's wall, and a hook here would be the first step toward
 * inventing one.
 *
 * `stale` is DERIVED by the server on every read, never stored — a stored flag
 * needs something to notice the change and write it, and whatever failed to
 * run would leave a stale document reading as valid.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface SalesOrderAmendment {
  id: string;
  status: "draft" | "submitted" | "issued" | "accepted";
  reason: string | null;
  base_revision: number;
  base_contractual_hash: string;
  current_contractual_hash: string;
  /** The contract moved since this was written. Re-propose from the new one. */
  stale: boolean;
  proposed_snapshot: Record<string, unknown>;
  submitted_at: string;
}

export function useSalesOrderAmendment(
  orderId: string | null,
  opts?: Partial<UseQueryOptions<{ amendment: SalesOrderAmendment | null }>>,
) {
  return useQuery({
    queryKey: orderId
      ? ([...qk.operation.order(orderId), "amendment"] as const)
      : (["operation", "orders", "null", "amendment"] as const),
    queryFn: () =>
      apiFetch<{ amendment: SalesOrderAmendment | null }>(
        `/api/operation/orders/${orderId}/amendment`,
      ),
    enabled: !!orderId,
    ...opts,
  });
}

export interface AmendmentProposal {
  lines?: Array<{ sku: string; qty: number; unit_price: number }>;
  delivery_date?: string | null;
  delivery_date_tbd?: boolean;
  installment_months?: number | null;
}

export function useSubmitSalesOrderAmendment(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<
      { id: string; base_revision: number; base_contractual_hash: string },
      ApiError,
      { proposed: AmendmentProposal; reason?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; base_revision: number; base_contractual_hash: string },
    ApiError,
    { proposed: AmendmentProposal; reason?: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ id: string; base_revision: number; base_contractual_hash: string }>(
        `/api/operation/orders/${orderId}/amendment`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: [...qk.operation.order(orderId), "amendment"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export interface SaveRevisionLineInput {
  id?: string;
  sku: string;
  qty: number;
  unit_price: number;
}
export interface SaveRevisionInput {
  header?: Record<string, unknown>;
  lines?: SaveRevisionLineInput[];
  /** CARD 1 — required by the RPC when the save moves the CONTRACTUAL fields
   *  (items · promised date): who asked for this change. */
  change?: { type: "staff_correction" | "customer_change"; note?: string };
}

/** POST /:id/save — the ONE edit door. The RPC whitelists the header, diffs
 *  the lines and mints Rev N+1; a no-op save is refused server-side. */
export function useSaveSalesOrderRevision(
  orderId: string,
  opts?: Partial<UseMutationOptions<{ revision: number; changed: string[] }, ApiError, SaveRevisionInput>>,
) {
  const qc = useQueryClient();
  return useMutation<{ revision: number; changed: string[] }, ApiError, SaveRevisionInput>({
    mutationFn: (input) =>
      apiFetch<{ revision: number; changed: string[] }>(
        `/api/operation/orders/${orderId}/save`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.operation.order(orderId) }),
        qc.invalidateQueries({ queryKey: ["operation", "orders"] }),
      ]);
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** POST / — the office birth door. Returns the new order id + SO number. */
export function useCreateSalesOrder(
  opts?: Partial<
    UseMutationOptions<
      { id: string; so: number; revision: number },
      ApiError,
      { header: Record<string, unknown>; lines: Omit<SaveRevisionLineInput, "id">[] }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { id: string; so: number; revision: number },
    ApiError,
    { header: Record<string, unknown>; lines: Omit<SaveRevisionLineInput, "id">[] }
  >({
    mutationFn: (input) =>
      apiFetch<{ id: string; so: number; revision: number }>("/api/operation/orders", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** GET /reference/dealers — the create form's dealer picker. */
export function useOperationDealersRef(
  opts?: Partial<UseQueryOptions<{ dealers: Array<{ id: string; name: string }> }>>,
) {
  return useQuery({
    queryKey: ["operation", "orders", "reference", "dealers"] as const,
    queryFn: () =>
      apiFetch<{ dealers: Array<{ id: string; name: string }> }>(
        "/api/operation/orders/reference/dealers",
      ),
    staleTime: 5 * 60_000,
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

/**
 * Q3 · Purchasing → Report — the whole "look at the numbers" layer, in one
 * read. It returns FACTS (one flat purchase-order line each) and no figures:
 * every number on screen is computed by `buildPoReport`, so the report and
 * Q4's dashboard cannot arrive at two answers.
 *
 * `staleTime` matches the register's 30s — a report that refetched on every
 * focus would flicker its own totals, and there is deliberately no Refresh
 * button (a report recomputes itself and states when it did).
 */
export function usePoReport(opts?: Partial<UseQueryOptions<PoReportResponse>>) {
  return useQuery({
    queryKey: qk.operation.poReport(),
    queryFn: () => apiFetch<PoReportResponse>("/api/operation/pos/report"),
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
/** GET /api/operation/pos/:id/units — the Item ID column's real data:
 *  `unit_code` per physical piece (0153), keyed back to lines by sku. */
export interface operationPoUnitRow {
  unit_code: string;
  sku: string;
  status: string;
}
export interface operationPoUnitsResponse {
  units: operationPoUnitRow[];
}
export function useOperationPoUnits(
  poId: string | null,
  opts?: Partial<UseQueryOptions<operationPoUnitsResponse>>,
) {
  return useQuery({
    queryKey: poId
      ? qk.operation.poUnits(poId)
      : (["operation", "pos", "null", "units"] as const),
    queryFn: () =>
      apiFetch<operationPoUnitsResponse>(
        `/api/operation/pos/${encodeURIComponent(poId ?? "")}/units`,
      ),
    enabled: !!poId,
    staleTime: 30_000,
    ...opts,
  });
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

/** What a successful confirmation returns. `partnerWarnings` (T9, 0283) is what
 *  the carrier's own rules say about the date that was just recorded — it
 *  arrives AFTER the booking is saved because these warn and never block.
 *  Optional: an older Worker simply doesn't send it. */
export interface ConfirmBookingResult {
  control: OpsOrderControl;
  partnerWarnings?: PartnerBookingWarningWire[];
  /** C7 — the goods + money sentences. They used to be a 422; since
   *  `docs/ORDERS-WORKING-FLOW.md` §5 moved the hard gate onto ISSUING the
   *  delivery order, agreeing a date only warns. Optional: an older Worker
   *  simply does not send it. */
  gateWarnings?: string[];
}

/** D1 booking confirm (migration 0277) — record the CUSTOMER's confirmed date
 *  + time slot. The server enforces the gates (goods ready + balance ready +
 *  no Sunday + date/slot both); a 422 carries the plain-English reason to show.
 *  Invalidates the overlay + orders tree, same as the control PUT. */
export function useConfirmBooking(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<ConfirmBookingResult, ApiError, ConfirmBookingInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<ConfirmBookingResult, ApiError, ConfirmBookingInput>({
    mutationFn: (input) =>
      apiFetch<ConfirmBookingResult>(
        `/api/operation/orders/${orderId}/booking/confirm`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.orderControl(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** C7 — the delivery order issues itself (Jess 2026-07-27).
 *
 *  One press: the SYSTEM produces the document and stamps the order's DO
 *  number, using the LOCKED numbering scheme. The server holds the hard gate
 *  (`docs/ORDERS-WORKING-FLOW.md` §5) — goods reserved, money collected, the
 *  date not a Sunday or a public holiday — and a 422 carries the plain-English
 *  reason. Idempotent: pressing twice returns the number already on file
 *  (`issued: false`), never a second document for one trip. */
export interface IssueDeliveryOrderResult {
  order: { id: string; do_number: string | null };
  /** true = this press minted it · false = it already existed. */
  issued: boolean;
}
export function useIssueDeliveryOrder(
  orderId: string,
  opts?: Partial<UseMutationOptions<IssueDeliveryOrderResult, ApiError, void>>,
) {
  const qc = useQueryClient();
  return useMutation<IssueDeliveryOrderResult, ApiError, void>({
    mutationFn: () =>
      apiFetch<IssueDeliveryOrderResult>(
        `/api/operation/orders/${orderId}/delivery-order`,
        { method: "POST", body: "{}" },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.orderControl(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** C8 — record the Delay planning decision (Jess 2026-07-27, migration 0304).
 *
 *  The supplier named a date later than the one we sold. Operations answers one
 *  question — *can we still make the promised date?* — and only `new_date`
 *  opens `Call {logistics} — arrange new delivery date`. `keep` means we solved
 *  it internally and **the customer is never told**.
 *
 *  `supplierEta` is the factory date the operator was looking at. The server
 *  refuses one this order does not hold, and the engine only treats a decision
 *  as current while it still points at the CURRENT date — so a factory that
 *  slips again re-opens Delay planning by itself, rather than being silenced by
 *  an answer given about a different date. */
export function useRecordDelayDecision(
  orderId: string,
  opts?: Partial<
    UseMutationOptions<{ control: unknown }, ApiError, DelayDecisionInput>
  >,
) {
  const qc = useQueryClient();
  return useMutation<{ control: unknown }, ApiError, DelayDecisionInput>({
    mutationFn: (input) =>
      apiFetch<{ control: unknown }>(
        `/api/operation/orders/${orderId}/delay-decision`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.orderControl(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** T9 (migration 0283) — what the order's carrier says about ONE candidate
 *  delivery date: the weekday it doesn't run, a blackout, its notice period,
 *  and how full that day already is. Advisory only — the Confirm button never
 *  reads it. Fails soft (retry:false, no throw path in the UI): a Worker that
 *  predates the route simply warns about nothing, which is the same thing an
 *  unconfigured partner does. */
export function usePartnerBookingCheck(
  orderId: string,
  date: string,
  opts?: Partial<UseQueryOptions<PartnerBookingCheckResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.partnerBookingCheck(orderId, date),
    queryFn: () =>
      apiFetch<PartnerBookingCheckResponse>(
        `/api/operation/orders/${orderId}/booking/partner-check?date=${encodeURIComponent(date)}`,
      ),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 60_000,
    retry: false,
    ...opts,
  });
}

/** T9 (migration 0283) — save a carrier's delivery rules. The WHOLE profile
 *  goes every time (a partial patch cannot distinguish "cleared the blackout
 *  dates" from "didn't mention them"). Invalidates the partners list every
 *  surface reads, plus any open date check. */
export function useSetPartnerDeliveryRules(
  partnerId: string,
  opts?: Partial<
    UseMutationOptions<
      { partner: DeliveryPartnerRow },
      ApiError,
      SetPartnerDeliveryRulesInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { partner: DeliveryPartnerRow },
    ApiError,
    SetPartnerDeliveryRulesInput
  >({
    mutationFn: (input) =>
      apiFetch<{ partner: DeliveryPartnerRow }>(
        `/api/operation/partners/${partnerId}/delivery-rules`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.partners() });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** T6 (migration 0280) — the order's delivery-photo ledger with short-lived
 *  signed view urls. Enabled only while the drawer shows the delivery card
 *  for a delivered order (the caller passes `enabled`). Fails soft
 *  (retry:false): a Worker that predates the route just leaves the row
 *  showing the ledger count without view links. */
export function useDeliveryPhotos(
  orderId: string,
  opts?: Partial<UseQueryOptions<DeliveryPhotoListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.deliveryPhotos(orderId),
    queryFn: () =>
      apiFetch<DeliveryPhotoListResponse>(
        `/api/operation/orders/${orderId}/delivery-photos`,
      ),
    // Signed urls live 1h; refresh well inside that.
    staleTime: 10 * 60_000,
    retry: false,
    ...opts,
  });
}

/** T6 (migration 0280) — upload ONE delivery photo: shrink → signed upload
 *  into the private proof-of-delivery bucket → attach to the order's ledger
 *  (the server gates on delivered + writes the activity line). Invalidates
 *  the control overlay (the spine tick), the photo ledger and the orders
 *  tree. */
export function useUploadDeliveryPhoto(
  orderId: string,
  opts?: Partial<UseMutationOptions<OpsOrderControl, Error, Blob>>,
) {
  const qc = useQueryClient();
  return useMutation<OpsOrderControl, Error, Blob>({
    mutationFn: (file) => uploadDeliveryPhoto(orderId, file),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.orderControl(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.deliveryPhotos(orderId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

// ===========================================================================
// Staff assignment pool (migration 0232, Jess model B 2026-07-18).
// ===========================================================================
/** Active operation accounts + their pool/availability state. Fails soft
 *  (retry off): on a Worker that predates the route the list page simply sees
 *  an empty pool and the whole assignment layer stays inert. */
/** PO duty rotation (0236) — this month's PO holder. Fails soft (retry:false):
 *  an old Worker (404) or a pre-0236 DB leaves data undefined → the whole
 *  duty layer stays dormant (Raise PO behaves as before, no badge/banner). */
export function useOperationPoDuty(
  opts?: Partial<UseQueryOptions<OpsPoDutyResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.poDuty,
    queryFn: () => apiFetch<OpsPoDutyResponse>(`/api/operation/po-duty`),
    staleTime: 5 * 60_000,
    retry: false,
    ...opts,
  });
}

/** Manager override of a month's PO-duty holder (0236, PUT — API 403s
 *  non-management). Invalidates the duty query so every surface (title chip,
 *  queue chips, Team board) flips together. */
export function useUpdatePoDuty(
  opts?: Partial<
    UseMutationOptions<
      { ok: boolean; month: string },
      ApiError,
      { userId: string; month?: string }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; month: string },
    ApiError,
    { userId: string; month?: string }
  >({
    mutationFn: (input) =>
      apiFetch<{ ok: boolean; month: string }>(`/api/operation/po-duty`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.poDuty, exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

export function useOperationStaff(
  opts?: Partial<UseQueryOptions<OpsStaffListResponse>>,
) {
  return useQuery({
    queryKey: qk.operation.staff,
    queryFn: () => apiFetch<OpsStaffListResponse>(`/api/operation/staff`),
    staleTime: 60_000,
    retry: false,
    ...opts,
  });
}

/** Upsert one account's pool membership / availability (MC toggle). */
export function useUpdateStaffSetting(
  opts?: Partial<
    UseMutationOptions<
      { ok: boolean; pooled: boolean },
      ApiError,
      { userId: string } & UpdateOpsStaffSettingInput
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; pooled: boolean },
    ApiError,
    { userId: string } & UpdateOpsStaffSettingInput
  >({
    mutationFn: ({ userId, ...input }) =>
      apiFetch<{ ok: boolean; pooled: boolean }>(
        `/api/operation/staff/${userId}`,
        { method: "PUT", body: JSON.stringify(input) },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.staff, exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/** Set (or clear) one order's staff owner via the generic control PUT — the
 *  server stamps assigned_by/assigned_at. Plain function so the auto-assign
 *  sweep + redistribute can batch it; callers invalidate the list once after
 *  the batch. */
export function assignOrderStaffRequest(orderId: string, staff: string | null) {
  return apiFetch<{ control: OpsOrderControl }>(
    `/api/operation/orders/${orderId}/control`,
    { method: "PUT", body: JSON.stringify({ assigned_staff: staff }) },
  );
}

/** Single-order reassign (the row owner-chip popover). */
export function useAssignOrderStaff(
  opts?: Partial<
    UseMutationOptions<
      { control: OpsOrderControl },
      ApiError,
      { orderId: string; staff: string | null }
    >
  >,
) {
  const qc = useQueryClient();
  return useMutation<
    { control: OpsOrderControl },
    ApiError,
    { orderId: string; staff: string | null }
  >({
    mutationFn: ({ orderId, staff }) => assignOrderStaffRequest(orderId, staff),
    ...opts,
    onSuccess: async (...args) => {
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

/* ⭐ CARD 4B · SINGLE PO CREATION AUTHORITY (2026-08-11).
 *
 * `useCreatePoMutation` and `useCreatePosBatch` were deleted from this file.
 * They posted to `POST /api/operation/pos` and `POST /api/operation/pos/batch`,
 * which called `operation_create_po` / `operation_create_pos_batch` — two of the
 * four extra PO creation authorities the Card 4 audit found reachable from the
 * browser. Both routes are retired and both RPCs are revoked from every browser
 * role (migration 0339).
 *
 * `purchasing_issue_pos_batch(jsonb)` is now the ONLY authority that may create
 * a Purchase Order. Its one caller is Batch Purchase's
 * `POST /api/operation/purchase/to-order/issue`.
 * There is deliberately no replacement hook: a hook is a door, and this card
 * exists to leave exactly one. */

/**
 * Chase-event log (Jess 2026-07-23) — Purchase cockpit's ② Chase button now
 * records every WhatsApp/phone follow-up via audit_log. Fires ONE POST to
 * /api/operation/pos/:poId/chase-event alongside the wa.me deep-link open,
 * so ops has a record of who chased what supplier when — no new table,
 * server writes an audit_log row keyed to the PO ref. Best-effort: caller
 * still opens WA even if the log write fails.
 */
export interface ChaseEventResponse {
  ok: true;
  chasedAt: string;
}
export interface ChaseEventInput {
  poId: string;
  note?: string;
}
export function useChasePoEventMutation(
  opts?: Partial<UseMutationOptions<ChaseEventResponse, ApiError, ChaseEventInput>>,
) {
  const qc = useQueryClient();
  return useMutation<ChaseEventResponse, ApiError, ChaseEventInput>({
    mutationFn: ({ poId, note }) =>
      apiFetch<ChaseEventResponse>(
        `/api/operation/pos/${encodeURIComponent(poId)}/chase-event`,
        {
          method: "POST",
          body: JSON.stringify(note ? { note } : {}),
        },
      ),
    ...opts,
    onSuccess: async (...args) => {
      // Refresh the cockpit's chase list — the row's "last chased" surface
      // reads from this same query in a future iteration.
      await qc.invalidateQueries({ queryKey: qk.operation.purchaseToday() });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * Q14 — `useRecordTomorrowDeliveryMutation` STOOD HERE and is deleted.
 *
 * It was the SECOND hook writing `POST /pos/:id/tomorrow-delivery`, and its
 * only caller was `RecordSupplierAnswerModal` on the Receiving tab. Loo's
 * role-anchor (2026-08-05) gives every supplier call to the buyer, so the
 * surviving door is `useRecordSupplierDate` on the Purchase Orders register —
 * the richer one, carrying the delay reason, the remarks and the day-shift.
 *
 * **Its cache invalidation was NOT deleted with it, and that is the half a
 * straight removal would have lost.** This hook re-read the ORDERS queries
 * because a `delayed` answer opens Delay planning on every customer order the
 * PO covers; `useRecordSupplierDate` re-read only the PO list. Consolidating
 * onto the narrower door would have left a recorded delay showing a stale
 * Orders board — so the wider set moved up to the surviving hook.
 */
export interface SupplierCallResponse {
  ok: boolean;
  result: Record<string, unknown>;
}

/**
 * P3 · `Call {supplier} — confirm balance delivery date` — record the date.
 *
 * Keyed on the PO LINE, because that is what §3 counts this action per. PM
 * decision A (2026-07-29): the date reaches the ladder too, so a balance that
 * lands after the promised date opens Delay planning by itself.
 */
export interface RecordBalanceDateVars {
  poLineId: string;
  newDate: string;
  reason?: string;
}

export function useRecordBalanceDateMutation(
  opts?: Partial<
    UseMutationOptions<SupplierCallResponse, ApiError, RecordBalanceDateVars>
  >,
) {
  const qc = useQueryClient();
  return useMutation<SupplierCallResponse, ApiError, RecordBalanceDateVars>({
    mutationFn: ({ poLineId, newDate, reason }) =>
      apiFetch<SupplierCallResponse>(
        `/api/operation/pos/lines/${encodeURIComponent(poLineId)}/balance-date`,
        {
          method: "POST",
          body: JSON.stringify({ newDate, ...(reason ? { reason } : {}) }),
        },
      ),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.pos() });
      await qc.invalidateQueries({ queryKey: qk.operation.purchaseToday() });
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
/* `useReceivePoWithDoMutation` was deleted on 2026-08-03 (Card C1). It posted
 * to the Office's legacy `/receive` route, which moved stock and opened NO
 * Receiving Session. `useOfficeReceiveMutation` below is the Office's one
 * receiving door. The PARTNER variant further down is a different leg — the
 * partner confirming goods at a warehouse — and is untouched. */

/* ── Slice B · the Office Receiving Workspace ────────────────────────────── */

/** One line of a stored Receiving Session — the DELTA this delivery brought. */
export interface ReceivingSessionLine {
  id: string;
  sku: string;
  received_now: number;
  damaged_qty: number;
  wrong_item_qty: number;
  wrong_item_claim_type: string | null;
}

/** A Receiving Session as the Workspace reads it. */
export interface ReceivingSession {
  id: string;
  po_id: string;
  do_number: string | null;
  do_file_path: string | null;
  note: string | null;
  lines: ReceivingSessionLine[];
  status: "draft" | "submitted" | "returned" | "posted" | "voided";
  submitted_from: "office" | "warehouse";
  goods_received_at: string;
  submitted_at: string | null;
  posted_at: string | null;
  posted_by_name: string | null;
  submitted_by_name: string | null;
  return_reason: string | null;
}

/** One entry of the ONE history (RECEIVING-INFORMATION-MODEL §6). */
export interface ReceivingEvent {
  id: string;
  receipt_id: string;
  event:
    | "submitted"
    | "returned"
    | "resubmitted"
    | "posted"
    | "voided"
    | "amended";
  event_at: string;
  actor_name: string | null;
  payload: {
    do_number?: string;
    goods_received_at?: string;
    units_counted?: number;
    entry_source?: "office" | "warehouse";
    claims_linked?: number;
    reason?: string;
  };
}

export interface PoReceivingResponse {
  sessions: ReceivingSession[];
  events: ReceivingEvent[];
}

/** GET /api/operation/pos/:id/receiving — the Workspace's Summary + Activity. */
export function usePoReceiving(poId: string | null) {
  return useQuery<PoReceivingResponse>({
    queryKey: qk.operation.poReceiving(poId ?? ""),
    queryFn: () =>
      apiFetch<PoReceivingResponse>(`/api/operation/pos/${poId}/receiving`),
    enabled: !!poId,
  });
}

/**
 * POST /api/operation/pos/:id/office-receive — Save, in Receiving Mode.
 *
 * Invalidates exactly what the retired `/receive` mutation invalidated (the same
 * engine moved the same stock and opened the same claims) PLUS this PO's
 * Receiving Sessions, so the Workspace's Activity shows the new entry without
 * a reload.
 */
export function useOfficeReceiveMutation(
  poId: string,
  opts?: Partial<UseMutationOptions<unknown, ApiError, OfficeReceiveInput>>,
) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, OfficeReceiveInput>({
    mutationFn: (input) =>
      apiFetch<unknown>(`/api/operation/pos/${poId}/office-receive`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: qk.operation.poReceiving(poId) });
      await qc.invalidateQueries({ queryKey: qk.operation.po(poId), exact: true });
      await qc.invalidateQueries({ queryKey: ["operation", "pos"] });
      await qc.invalidateQueries({ queryKey: qk.operation.warehouse(), exact: true });
      await qc.invalidateQueries({ queryKey: qk.operation.stockAlerts() });
      await qc.invalidateQueries({ queryKey: ["operation", "movements"] });
      await qc.invalidateQueries({ queryKey: ["operation", "supplier-claims"] });
      await qc.invalidateQueries({ queryKey: ["operation", "orders"] });
      await qc.invalidateQueries({ queryKey: qk.operation.dashboard(), exact: true });
      opts?.onSuccess?.(...(args as Parameters<NonNullable<typeof opts.onSuccess>>));
    },
  });
}

/**
 * The PARTNER leg of receiving — a partner confirming goods at a warehouse.
 * (Was "the partner-side variant of useReceivePoWithDoMutation"; that Office
 * hook was retired 2026-08-03, Card C1.) Loo 2026-05-11.
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
// BD namespace (2026-07-19) — the BD POS: network dealer stats + audit-log
// activity + the dealer-account create door. The Phase-8 Inquiries hooks died
// with the ERP-style BD portal (API route kept — restore a panel if ever
// needed).
// ---------------------------------------------------------------------------

/** Row shape of GET /api/bd/dealers (dealers_with_stats_list — all-time). */
export interface BdDealerRow {
  id: string;
  name: string;
  region: string | null;
  contact: string | null;
  status: string;
  joinedDate: string | null;
  orderCount: number;
  gmv: number;
  outstanding: number;
  /** 'showroom' = one of Carres' own stores; 'dealer' = external reseller.
   *  BD's on-behalf store picker groups by it (Loo 2026-07-19). */
  channel: StoreChannel;
}

export function useBdDealers(
  opts?: Partial<UseQueryOptions<{ dealers: BdDealerRow[] }, ApiError>>,
) {
  return useQuery<{ dealers: BdDealerRow[] }, ApiError>({
    queryKey: qk.bd.dealers(),
    queryFn: () => apiFetch<{ dealers: BdDealerRow[] }>("/api/bd/dealers"),
    staleTime: 30_000,
    ...opts,
  });
}

/** Row shape of GET /api/bd/dealers/activity (dealer-touching audit_log). */
export interface BdActivityRow {
  id: string;
  role: string;
  actor: string | null;
  action: string;
  dealerId: string | null;
  dealerName: string | null;
  occurredAt: string;
}

export function useBdActivity(
  limit = 12,
  opts?: Partial<UseQueryOptions<{ rows: BdActivityRow[] }, ApiError>>,
) {
  return useQuery<{ rows: BdActivityRow[] }, ApiError>({
    queryKey: qk.bd.activity(limit),
    queryFn: () => apiFetch<{ rows: BdActivityRow[] }>(`/api/bd/dealers/activity?limit=${limit}`),
    staleTime: 30_000,
    ...opts,
  });
}

/** POST /api/bd/accounts — BD opens a DEALER account (principal-parity door,
 *  role pinned to dealer server-side). */
export interface BdCreateAccountResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  dealerId: string | null;
}

export function useBdCreateAccount(
  opts?: Partial<UseMutationOptions<BdCreateAccountResponse, ApiError, CreateAccountInput>>,
) {
  const qc = useQueryClient();
  return useMutation<BdCreateAccountResponse, ApiError, CreateAccountInput>({
    mutationFn: (input) =>
      apiFetch<BdCreateAccountResponse>("/api/bd/accounts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    ...opts,
    onSuccess: async (...args) => {
      await qc.invalidateQueries({ queryKey: ["bd"] });
      await qc.invalidateQueries({ queryKey: ["staff"] });
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

// Master reconcile append (Option A, 2026-07-18) — after a Master import, the
// sheet can carry a line an EXISTING AutoCount order is missing (0214 re-import
// is create-only). dryRun detects the candidates for the result-screen
// tick-list; the commit call sends ONLY the ticked rows and appends via the
// 0237 RPC (raw sku, unit_price 0, items_edited flips).
export function useAppendMissingLines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AppendMissingLinesInput) =>
      apiFetch<{ result: AppendMissingLinesResult }>(
        "/api/operation/orders/append-missing-lines",
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

// ── Reorder alert · Ready Stock K1 (migration 0286) ──────────────────────────
// Pillow / mattress protector come from China on a ~2-month lead, so the alert
// has to fire while stock is still on the shelf. The SERVER decides the state
// (one shared engine, `computeReorderRows`); these hooks only carry the answer.

const reorderKey = ["operation", "ops-stock", "reorder"] as const;

/** current · reorder point · incoming, per watched SKU, + the alert count. */
export function useReorderStock(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: reorderKey,
    queryFn: () => apiFetch<OpsReorderResponse>("/api/ops/stock/reorder"),
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
  });
}

/** Set (or switch off, with 0) one SKU's reorder point. COO / principal —
 *  the server re-gates in SQL, so `canEdit` only decides what renders. */
export function useSetReorderPoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpsReorderPointInput) =>
      apiFetch<{ sku: string; reorderPoint: number }>(
        "/api/ops/stock/reorder",
        catalogJson("PUT", input),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reorderKey });
    },
  });
}

// ── Pool usage + reserve levels · Ready Stock K4 (migration 0292) ───────────
// Where the ready stock went, and how low each SKU may go. The SERVER decides
// every number (one shared engine, `summarisePoolUsage` +
// `computeReserveLevelRows`); these hooks only carry the answer.
//
// Keyed by MONTH: the usage question is always "this month", and a shared key
// would make switching months show the previous month's split for a beat.

const stockUsageKey = (period?: string) =>
  ["operation", "ops-stock", "usage", period ?? "current"] as const;

export function useStockUsage(period?: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: stockUsageKey(period),
    queryFn: () =>
      apiFetch<OpsStockUsageResponse>(
        `/api/ops/stock/usage${period ? `?period=${period}` : ""}`,
      ),
    enabled: opts?.enabled ?? true,
    staleTime: 30_000,
  });
}

/** Set (or switch off, with 0) one SKU's reserve level. COO / principal —
 *  the server re-gates in SQL, so `canEdit` only decides what renders. */
export function useSetReserveLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OpsReserveLevelInput) =>
      apiFetch<{ sku: string; reserveLevel: number }>(
        "/api/ops/stock/reserve-level",
        catalogJson("PUT", input),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operation", "ops-stock", "usage"] });
    },
  });
}

// ── Stock health + proposal accuracy · Ready Stock K5 (no migration) ────────
// The review layer. It READS the numbers K1 and K4 already collect and K2's own
// cycles — there is no mutation hook here because K5 sets nothing.
//
// Its own key rather than a slice of `usage`: the health read reaches back 200
// days of sales lines and every plan cycle, so hanging it off a month-keyed
// query would re-fetch all of that every time somebody changes the month.

const stockHealthKey = ["operation", "ops-stock", "health"] as const;

export function useStockHealth(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: stockHealthKey,
    queryFn: () => apiFetch<OpsStockHealthResponse>("/api/ops/stock/health"),
    enabled: opts?.enabled ?? true,
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Ready stock plan — card K2 (migration 0287)
// ---------------------------------------------------------------------------
// The monthly lane: propose → consolidate → approve → PO list. Every number on
// the screen (run rate, suggestion, coverage, the ⚠ warning, the PO list) is
// decided SERVER-side by the shared engine; these hooks only carry the answer,
// so the browser can never present a different arithmetic from the API.

const stockPlanKey = (period?: string) =>
  ["operation", "ops-stock", "plan", period ?? "current"] as const;

export function useStockPlan(period?: string) {
  return useQuery({
    queryKey: stockPlanKey(period),
    queryFn: () =>
      apiFetch<OpsStockPlanResponse>(
        `/api/ops/stock-plan${period ? `?period=${encodeURIComponent(period)}` : ""}`,
      ),
    staleTime: 15_000,
  });
}

/** Every plan mutation refreshes the whole cycle — one stage can change another
 *  (the first cut closes proposals), so a partial invalidation would leave the
 *  screen showing a stage that has already moved on. */
function useStockPlanMutation<TInput>(
  path: (input: TInput) => string,
  body: (input: TInput) => unknown,
  method: "POST" = "POST",
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<unknown>(path(input), catalogJson(method, body(input))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["operation", "ops-stock", "plan"] });
    },
  });
}

export function useOpenStockPlan() {
  return useStockPlanMutation<OpsStockPlanOpenInput>(
    () => "/api/ops/stock-plan",
    (i) => i,
  );
}

export function useProposeStockPlan(planId: string) {
  return useStockPlanMutation<OpsStockPlanProposeInput>(
    () => `/api/ops/stock-plan/${planId}/propose`,
    (i) => i,
  );
}

export function useConsolidateStockPlan(planId: string) {
  return useStockPlanMutation<OpsStockPlanConsolidateInput>(
    () => `/api/ops/stock-plan/${planId}/consolidate`,
    (i) => i,
  );
}

export function useSetStockPlanFinal(planId: string) {
  return useStockPlanMutation<OpsStockPlanFinalInput>(
    () => `/api/ops/stock-plan/${planId}/final`,
    (i) => i,
  );
}

export function useDecideStockPlan(planId: string) {
  return useStockPlanMutation<OpsStockPlanDecideInput>(
    () => `/api/ops/stock-plan/${planId}/decide`,
    (i) => i,
  );
}

// ---------------------------------------------------------------------------
// Urgent restock — card K3 (migration 0290)
// ---------------------------------------------------------------------------
// raise → the COO decides → somebody raises the PO. No month, no consolidation.
// Its own query key on purpose: the urgent lane and the monthly plan share a
// screen but never a number, and a shared cache key would be the first place
// that stops being true.

const urgentStockKey = ["operation", "ops-stock", "urgent"] as const;

export function useUrgentStock() {
  return useQuery({
    queryKey: urgentStockKey,
    queryFn: () => apiFetch<OpsStockEmergencyResponse>("/api/ops/stock-emergency"),
    staleTime: 15_000,
  });
}

function useUrgentStockMutation<TInput>(
  path: (input: TInput) => string,
  body: (input: TInput) => unknown,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<unknown>(path(input), catalogJson("POST", body(input))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: urgentStockKey });
    },
  });
}

export function useRaiseUrgentStock() {
  return useUrgentStockMutation<OpsStockEmergencyRaiseInput>(
    () => "/api/ops/stock-emergency",
    (i) => i,
  );
}

export function useDecideUrgentStock() {
  return useUrgentStockMutation<OpsStockEmergencyDecideInput & { id: string }>(
    (i) => `/api/ops/stock-emergency/${i.id}/decide`,
    ({ decision, qty, remark }) => ({ decision, qty, remark }),
  );
}

export function useMarkUrgentStockOrdered() {
  return useUrgentStockMutation<{ id: string }>(
    (i) => `/api/ops/stock-emergency/${i.id}/ordered`,
    () => ({}),
  );
}

// D2 (2026-08-06) — `useReceiveLine` STOOD HERE and is deleted with
// `POST /operation/orders/:id/receive-line`.
//
// It booked units into the stock register and stamped `line_received` WITHOUT
// opening a Receiving Session: no `warehouse_receipts` row, no
// `receiving_events` entry, and it never touched
// `purchase_order_lines.received_qty`. That is a second RECORD of one act, not
// a second door onto it. Measured before removal: used ZERO times, while the
// Receiving Workspace had posted 3 sessions.
//
// Receiving happens in ONE place. Do not add this hook back.

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

/** Edit an existing loan's leg fields (0242) — change the OUT route or set/clear
 *  the supplier return-by override. */
export function useUpdateLoan(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateLoanInput) =>
      apiFetch<{ loan: SofaLoanDto }>(
        `/api/operation/orders/${orderId}/loan-update`,
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

// ---------------------------------------------------------------------------
// 0239 — Product bundles (bundle pricing). Principal-only CRUD from the
// Promo/GWP tab; every mutation invalidates ["catalog"] so the tab list + the
// POS bundle cards re-read. Mirrors the 0186 pwp-rule hooks.
// ---------------------------------------------------------------------------

export function useCreateBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductBundleInput) =>
      apiFetch<{ bundle: ProductBundleDto }>("/api/catalog/bundles", catalogJson("POST", input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpdateBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ProductBundleInput> }) =>
      apiFetch<{ bundle: ProductBundleDto }>(`/api/catalog/bundles/${id}`, catalogJson("PATCH", patch)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteBundle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ ok: true }>(`/api/catalog/bundles/${id}`, catalogJson("DELETE")),
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

/* ── 0247-0249 · Rental + Service Plan base (Loo 2026-07-25) ─────────────────
 * Config (service packages + rent-to-own plans, authored in the P&M Rental
 * tab, principal-only server-side) and the read-only registry (agreements +
 * deployed units) for the internal Rental page. Every config mutation blasts
 * the ["rental"] sub-tree. */

export interface RentalConfigResponse {
  servicePackages: ServicePackage[];
  rentalPlans: RentalPlan[];
  /** 0264 — the offer layer: one offer per model, its outright prices and the
   *  service packages it attaches. Absent on a pre-0264 API (defaults []). */
  rentalOffers?: RentalOffer[];
  buyPrices?: RentalBuyPrice[];
  offerServices?: RentalOfferService[];
  /** 0267 — the agreement wording, newest version of each document first. */
  agreementTemplates?: RentalAgreementTemplate[];
}

/** Agreements list item — the API embeds the customer's name/phone. */
export type RentalAgreementListItem = RentalAgreement & {
  customerName: string | null;
  customerPhone: string | null;
  /**
   * Unresolved refused-card attempts (0295). `undefined` means the API could
   * not answer — an older Worker, or the read failed — and the list says
   * nothing rather than claiming a clean card. 0 means genuinely none.
   */
  openDeclines?: number;
  lastDeclineAt?: string | null;
};

export function useRentalConfig(opts?: Partial<UseQueryOptions<RentalConfigResponse>>) {
  return useQuery({
    queryKey: qk.rental.config(),
    queryFn: () => apiFetch<RentalConfigResponse>("/api/rental/config"),
    staleTime: 60_000,
    ...opts,
  });
}

export function useRentalAgreements(
  opts?: Partial<UseQueryOptions<{ agreements: RentalAgreementListItem[] }>>,
) {
  return useQuery({
    queryKey: qk.rental.agreements(),
    queryFn: () =>
      apiFetch<{ agreements: RentalAgreementListItem[] }>("/api/rental/agreements"),
    staleTime: 30_000,
    ...opts,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 0268 — the Approver gate. A rent-to-own agreement is born `pending_approval`
// and materialises nothing (no billing schedule, no asset, no entitlement, and
// no chargeable Stripe checkout) until finance decides. This is that desk.
// ─────────────────────────────────────────────────────────────────────────────

/** One row of `rental_pending_approvals()` — an application awaiting credit
 *  assessment, plus the particulars a human needs to judge it. */
export interface RentalApproval {
  id: string;
  agreementNo: string;
  status: string;
  sku: string;
  termMonths: number;
  monthlyFee: number;
  oneOffTotal: number;
  /** monthlyFee × termMonths — the credit this one decision extends. */
  termTotal: number;
  startDate: string;
  createdAt: string;
  notes: string | null;
  /** 0279 — the signature, captured at the counter and stamped by
   *  `create_rental_agreement`. Every application created from 0279 onward
   *  carries one (approve now REFUSES an unsigned row), but these stay nullable:
   *  a row created before 0279 has none, and the page must be able to say so
   *  rather than imply a signature exists. `templateVersion` is what makes it
   *  evidence — it names the exact wording the customer agreed to. */
  signedAt: string | null;
  signedName: string | null;
  signedNric: string | null;
  signaturePath: string | null;
  signedDocPath: string | null;
  templateVersion: number | null;
  /** The CBM hook's landing strip — planned, not built. */
  creditCheckedAt: string | null;
  creditReference: string | null;
  orderId: string | null;
  orderSo: number | null;
  customer: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  dealer: { id: string; name: string; channel: string | null } | null;
  salesperson: { id: string; name: string } | null;
}

export function useRentalApprovals(
  opts?: Partial<UseQueryOptions<{ approvals: RentalApproval[] }>>,
) {
  return useQuery({
    queryKey: qk.rental.approvals(),
    queryFn: () => apiFetch<{ approvals: RentalApproval[] }>("/api/rental/approvals"),
    staleTime: 15_000,
    ...opts,
  });
}

/** Approve or reject one application. Blasts the whole ["rental"] sub-tree:
 *  an approval mints the schedule + asset + entitlement, so the agreements
 *  list and the unit registry are both stale the moment it lands. */
export function useDecideRentalAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; approve: boolean; note?: string }) =>
      apiFetch<{ agreement: RentalAgreementListItem }>(
        `/api/rental/agreements/${v.id}/decide`,
        { method: "POST", body: JSON.stringify({ approve: v.approve, note: v.note }) },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rental"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 0244/0245 — HR commission portal (2026-07-25). One report read + eight writes
// (0250 adds the BD-rate + dealer-portfolio pair).
// All writes invalidate the whole ["hr"] sub-tree: every month report embeds
// the live config, so any config change must re-derive whichever month is on
// screen.
// ─────────────────────────────────────────────────────────────────────────────

export interface HrModelOption {
  id: string;
  name: string;
  category: string;
}

/** GET /api/hr/report?year&month response envelope. */
export interface HrReportResponse {
  year: number;
  month: number;
  report: CommissionReport;
  /** 0250 — BD commission: a BD earns a % of what their assigned dealers sell. */
  bdReport: BdCommissionReport;
  /** 0251 — the ONE global BD calculation method (absent config = percentage). */
  bdMethod: CommissionMethod;
  /** 0265 — how many imported archive orders the month EXCLUDES. The rows
   *  themselves predate the portal and carry no salesperson, so they are left
   *  out of every figure on the page; this is the count that says so out loud,
   *  and it is the only surviving reader of that idea. */
  /** OPTIONAL on purpose: web and api deploy separately, so a browser can be
   *  running this build against a Worker that predates 0265. Typed optional
   *  forces every reader to say what it does in that window instead of
   *  crashing on `undefined`. */
  legacyUnattributed?: number;
  /** 0265 / O1 — the month's showroom item revenue (all orders, attributed or
   *  not; services and cancellations excluded). NOT report.totalBasis, which
   *  only covers percentage-method stores. Optional for the same reason. */
  monthSold?: { amount: number; orderCount: number };
  staff: CommissionStaff[];
  models: HrModelOption[];
  /** BD accounts (app_users role='bd') — the setup rate rows + owner selects. */
  bdUsers: BdUser[];
  /** Dealer-channel stores only, each carrying its current BD owner (or null). */
  dealers: BdDealer[];
  config: CommissionConfig & { bdRates?: BdRateRow[] };
}

export function useHrReport(
  year: number,
  month: number,
  opts?: Partial<UseQueryOptions<HrReportResponse>>,
) {
  return useQuery({
    queryKey: qk.hr.report(year, month),
    queryFn: () =>
      apiFetch<HrReportResponse>(`/api/hr/report?year=${year}&month=${month}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    ...opts,
  });
}

export function useRentalUnits(
  opts?: Partial<UseQueryOptions<{ units: RentalStockUnit[] }>>,
) {
  return useQuery({
    queryKey: qk.rental.units(),
    queryFn: () => apiFetch<{ units: RentalStockUnit[] }>("/api/rental/units"),
    staleTime: 30_000,
    ...opts,
  });
}

function useRentalConfigMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
) {
  const qc = useQueryClient();
  return useMutation<TData, ApiError, TVars>({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rental"] });
    },
  });
}

export function useCreateServicePackage() {
  return useRentalConfigMutation((input: ServicePackageInput) =>
    apiFetch<{ servicePackage: ServicePackage }>("/api/rental/service-packages", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export function usePatchServicePackage() {
  return useRentalConfigMutation(
    ({ id, patch }: { id: string; patch: Partial<ServicePackageInput> }) =>
      apiFetch<{ servicePackage: ServicePackage }>(`/api/rental/service-packages/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  );
}

export function useDeleteServicePackage() {
  return useRentalConfigMutation((id: string) =>
    apiFetch<{ ok: boolean }>(`/api/rental/service-packages/${id}`, {
      method: "DELETE",
    }),
  );
}

export function useCreateRentalPlan() {
  return useRentalConfigMutation((input: RentalPlanInput) =>
    apiFetch<{ plan: RentalPlan }>("/api/rental/plans", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export function usePatchRentalPlan() {
  return useRentalConfigMutation(
    ({ id, patch }: { id: string; patch: Partial<RentalPlanInput> }) =>
      apiFetch<{ plan: RentalPlan }>(`/api/rental/plans/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  );
}

export function useDeleteRentalPlan() {
  return useRentalConfigMutation((id: string) =>
    apiFetch<{ ok: boolean }>(`/api/rental/plans/${id}`, {
      method: "DELETE",
    }),
  );
}

/* ── 0264 · the offer layer (P&M Rental tab) ─────────────────────────────────
 * One offer per model owns the option/fabric price overlay, the surcharge
 * slots and the split; its money hangs off it as rent lines (rental_plans,
 * above) and buy prices, plus the service packages it attaches. Every write
 * invalidates the whole ["rental"] sub-tree like the rest of the config. */

export function useCreateRentalOffer() {
  return useRentalConfigMutation((input: RentalOfferInput) =>
    apiFetch<{ offer: RentalOffer }>("/api/rental/offers", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

export function usePatchRentalOffer() {
  return useRentalConfigMutation(({ id, patch }: { id: string; patch: RentalOfferPatchInput }) =>
    apiFetch<{ offer: RentalOffer }>(`/api/rental/offers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );
}

export function useDeleteRentalOffer() {
  return useRentalConfigMutation((id: string) =>
    apiFetch<{ ok: boolean }>(`/api/rental/offers/${id}`, { method: "DELETE" }),
  );
}

export function useCreateRentalBuyPrice() {
  return useRentalConfigMutation(
    ({ offerId, input }: { offerId: string; input: RentalBuyPriceInput }) =>
      apiFetch<{ buyPrice: RentalBuyPrice }>(`/api/rental/offers/${offerId}/buy-prices`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );
}

export function usePatchRentalBuyPrice() {
  return useRentalConfigMutation(
    ({ id, patch }: { id: string; patch: RentalBuyPricePatchInput }) =>
      apiFetch<{ buyPrice: RentalBuyPrice }>(`/api/rental/buy-prices/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  );
}

export function useDeleteRentalBuyPrice() {
  return useRentalConfigMutation((id: string) =>
    apiFetch<{ ok: boolean }>(`/api/rental/buy-prices/${id}`, { method: "DELETE" }),
  );
}

export function useCreateRentalOfferService() {
  return useRentalConfigMutation(
    ({ offerId, input }: { offerId: string; input: RentalOfferServiceInput }) =>
      apiFetch<{ offerService: RentalOfferService }>(`/api/rental/offers/${offerId}/services`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  );
}

export function usePatchRentalOfferService() {
  return useRentalConfigMutation(
    ({ id, patch }: { id: string; patch: RentalOfferServicePatchInput }) =>
      apiFetch<{ offerService: RentalOfferService }>(`/api/rental/offer-services/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  );
}

/** Author a NEW version of an agreement's wording (the version is server-
 *  assigned; a version already signed against is never edited). */
export function useCreateAgreementTemplate() {
  return useRentalConfigMutation((input: AgreementTemplateInput) =>
    apiFetch<{ template: RentalAgreementTemplate }>("/api/rental/agreement-templates", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
}

/** Patch what a version binds to / whether it is live — never its wording. */
export function usePatchAgreementTemplate() {
  return useRentalConfigMutation(
    ({ id, patch }: { id: string; patch: AgreementTemplatePatchInput }) =>
      apiFetch<{ template: RentalAgreementTemplate }>(`/api/rental/agreement-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
  );
}

export function useDeleteRentalOfferService() {
  return useRentalConfigMutation((id: string) =>
    apiFetch<{ ok: boolean }>(`/api/rental/offer-services/${id}`, { method: "DELETE" }),
  );
}

/* ── 0255 · POS rental sell lane ─────────────────────────────────────────────
 * Store-side: the stripped offer list (rental_plans_pos — NO split fields),
 * the signup RPC and the Stripe subscription checkout pair. Principal-side:
 * the manual plan → Stripe sync retry. */

export interface RentalStripeSyncOutcome {
  status: "synced" | "skipped" | "error";
  message?: string;
}

export interface CreateRentalAgreementResponse {
  agreement: RentalAgreement;
  customer: Customer;
  /** NULL since 0268 — the unit is only allocated when finance approves, so a
   *  fresh signup has no asset yet. Same for the entitlement and its visits. */
  unit: RentalStockUnit | null;
  entitlementId: string | null;
  visitsTotal: number;
  /** 0268 — true while the application waits on the finance Approver page.
   *  Optional so a browser on this build against a pre-0268 Worker degrades
   *  rather than crashing. */
  pendingApproval?: boolean;
  /** 0275 — the Sales Order minted with the agreement, so the rented item has
   *  a document and a path into operations. Optional for the same reason. */
  orderId?: string | null;
  so?: number | null;
}

/**
 * The rental wording the customer is about to sign (0279).
 *
 * `rental_agreement_templates` is RLS internal-only, so a store JWT cannot read
 * the paper directly — this goes through the same definer function
 * `create_rental_agreement` uses to stamp `template_version`, which is what
 * keeps the document on screen and the version on the contract identical.
 *
 * `template: null` is a real answer: the principal has not published wording,
 * so no rental can be signed at all. The confirm step says that in words rather
 * than leaving the operator with a Complete button that always fails.
 */
export function useRentalAgreementTemplate(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.rental.agreementTemplate(),
    queryFn: () =>
      apiFetch<{ template: RentalAgreementTemplate | null }>("/api/rental/agreement-template"),
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  });
}

/** One scheduled instalment and whatever money has landed on it (0281). */
export interface RentalCollectionRow {
  id: string;
  seq: number;
  dueDate: string;
  amountDue: number;
  status: string;
  paidAt: string | null;
  paidAmount: number | null;
  method: string | null;
  reference: string | null;
  supplierShare: number | null;
  commissionShare: number | null;
  stripeInvoiceId: string | null;
  lateInterest: number | null;
  /** Derived server-side from the date, never stored — so it cannot go stale. */
  late: boolean;
  /**
   * The most recent refused card attempt on this month (0295), or null. Derived
   * the same way `late` is, and only ever present on an UNPAID month — paying
   * is what clears it, so there is no flag to forget.
   *
   * Optional so a browser on this build talking to a pre-0295 Worker degrades
   * to "no decline shown" instead of crashing.
   */
  lastDecline?: { at: string; reason: string | null } | null;
  /** How many times the card was refused for this month. */
  declineCount?: number;
  /**
   * 0300 — the 8%/month penalty that HAS accrued on this month as of today.
   * Derived server-side, never stored, so it is never a day out of date.
   * Zero once the month is collected.
   */
  accruedInterest?: number;
  /** When the penalty above was last actually CHARGED, or null if never. */
  interestChargedAt?: string | null;
}

/** 0300 — what settling the whole thing today would cost. */
export interface RentalSettlementQuote {
  agreementNo: string;
  status: string;
  monthsLeft: number;
  rentRemaining: number;
  /** Interest already charged on those months — not accrued-but-uncharged. */
  interestCharged: number;
  total: number;
}

export interface RentalCollections {
  agreement: {
    id: string;
    agreementNo: string;
    sku: string;
    termMonths: number;
    monthlyFee: number;
    startDate: string;
    status: string;
    supplierRatePct: number;
    commissionBasePct: number;
  };
  totals: {
    contractValue: number;
    collected: number;
    outstanding: number;
    paidCount: number;
    lateCount: number;
    supplierShare: number;
    commissionShare: number;
    /** Unpaid months currently sitting on a refused card (0295). */
    declinedCount?: number;
    /** Refusals we could not attach to any month — always worth a human look. */
    unattachedDeclines?: number;
  };
  billings: RentalCollectionRow[];
  events: Array<Record<string, unknown>>;
}

/**
 * What has actually been collected on one agreement (0281).
 *
 * Before this, `rental_billings` had rows and no writer, so the only true
 * answer lived in the Stripe dashboard and finance had two systems, one of
 * which lied. Internal-only.
 */
export function useRentalCollections(agreementId: string | null) {
  return useQuery({
    queryKey: qk.rental.collections(agreementId ?? ""),
    queryFn: () => apiFetch<RentalCollections>(`/api/rental/agreements/${agreementId}/collections`),
    enabled: !!agreementId,
    staleTime: 15_000,
  });
}

/** Record a collection that never touched Stripe (bank transfer, cash). */
export function useRecordRentalPayment(agreementId: string) {
  const qc = useQueryClient();
  return useMutation<
    { recorded: unknown },
    ApiError,
    { seq: number } & RecordRentalPaymentInput
  >({
    mutationFn: ({ seq, ...body }) =>
      apiFetch<{ recorded: unknown }>(
        `/api/rental/agreements/${agreementId}/collections/${seq}/record`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rental"] }),
  });
}

/**
 * 0300 — charge the 8%/month penalty on one overdue month.
 *
 * No amount crosses the wire: the server recomputes it from the instalment and
 * the date. A client that could name the penalty could name any penalty.
 */
export function useChargeRentalInterest(agreementId: string) {
  const qc = useQueryClient();
  return useMutation<{ charged: unknown }, ApiError, { seq: number } & ChargeRentalInterestInput>({
    mutationFn: ({ seq, ...body }) =>
      apiFetch<{ charged: unknown }>(
        `/api/rental/agreements/${agreementId}/collections/${seq}/interest`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rental"] }),
  });
}

/** 0300 — the server's own figure for settling early. */
export function useRentalSettlementQuote(agreementId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: qk.rental.settlementQuote(agreementId ?? ""),
    queryFn: () =>
      apiFetch<{ quote: RentalSettlementQuote }>(
        `/api/rental/agreements/${agreementId}/settlement-quote`,
      ),
    enabled: !!agreementId && enabled,
    staleTime: 15_000,
  });
}

/** 0300 — settle the remaining term in one payment. Needs the signed document. */
export function useSettleRentalAgreement(agreementId: string) {
  const qc = useQueryClient();
  return useMutation<{ settled: unknown }, ApiError, SettleRentalAgreementInput>({
    mutationFn: (body) =>
      apiFetch<{ settled: unknown }>(`/api/rental/agreements/${agreementId}/settle`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rental"] }),
  });
}

export function useRentalPosPlans(opts?: Partial<UseQueryOptions<{ plans: PosRentalPlan[] }>>) {
  return useQuery({
    queryKey: qk.rental.posPlans(),
    queryFn: () => apiFetch<{ plans: PosRentalPlan[] }>("/api/rental/pos-plans"),
    staleTime: 60_000,
    ...opts,
  });
}

export function useCreateRentalAgreement() {
  const qc = useQueryClient();
  return useMutation<CreateRentalAgreementResponse, ApiError, CreateRentalAgreementInput>({
    mutationFn: (input) =>
      apiFetch<CreateRentalAgreementResponse>("/api/rental/agreements", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["rental"] }),
  });
}

/** Mint the Stripe SUBSCRIPTION checkout link for an agreement (amount = the
 *  monthly fee; card saved for auto-debit). 422 codes: plan_not_synced /
 *  plan_repriced / fee_missing / wrong_status; 409 already_subscribed. */
export function useCreateRentalCheckout(agreementId: string) {
  return useMutation<{ session: StripeCheckoutSessionInfo }, ApiError, void>({
    mutationFn: () =>
      apiFetch<{ session: StripeCheckoutSessionInfo }>(
        `/api/rental/agreements/${agreementId}/stripe/checkout`,
        { method: "POST" },
      ),
  });
}

/** Poll one rental checkout link; while open the SERVER live-reconciles, so a
 *  counter payment wraps the schedule + links the ids within one poll. */
export function useRentalCheckoutStatus(
  agreementId: string,
  sessionId: string | null,
  opts?: { enabled?: boolean },
) {
  return useQuery<{ session: StripeCheckoutSessionInfo }, ApiError>({
    queryKey: qk.rental.checkoutSession(agreementId, sessionId ?? ""),
    queryFn: () =>
      apiFetch<{ session: StripeCheckoutSessionInfo }>(
        `/api/rental/agreements/${agreementId}/stripe/checkout/${sessionId}`,
      ),
    enabled: !!sessionId && (opts?.enabled ?? true),
    refetchInterval: 4000,
    refetchIntervalInBackground: false,
  });
}

/** Manual plan → Stripe sync retry (principal; the Rental tab's Sync button). */
export function useSyncRentalPlanStripe() {
  return useRentalConfigMutation((id: string) =>
    apiFetch<{ plan: RentalPlan; stripeSync: RentalStripeSyncOutcome }>(
      `/api/rental/plans/${id}/stripe-sync`,
      { method: "POST" },
    ),
  );
}

function useHrInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ["hr"] });
}

// ── HR-P6 (0276) — targets + scoreboard ─────────────────────────────────────

export interface HrKpiResponse {
  source: KpiSource;
  scorecards: Scorecards;
  /** The commission run for this month is approved — the money is settled. */
  monthLocked: boolean;
  runStatus: string | null;
}

export function useHrKpi(
  year: number,
  month: number,
  kpiKey: KpiKey,
  opts?: Partial<UseQueryOptions<HrKpiResponse>>,
) {
  return useQuery({
    queryKey: qk.hr.kpi(year, month, kpiKey),
    queryFn: () =>
      apiFetch<HrKpiResponse>(
        `/api/hr/kpi?year=${year}&month=${month}&kpi=${kpiKey}`,
      ),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    ...opts,
  });
}

/** Set or correct one dated target. Same date = correction, new date = history. */
export function useHrSetKpiTarget() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true; id: string }, ApiError, SetKpiTargetInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true; id: string }>("/api/hr/kpi/target", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrDeleteKpiTarget() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) =>
      apiFetch<{ ok: true }>(`/api/hr/kpi/target/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

// ── HR-P7 (0278) — people cost ──────────────────────────────────────────────

export interface HrCompResponse {
  source: StaffCompSource;
  /** fixedCost and commissionCost are SEPARATE by ruling — there is deliberately
   *  no combined field. Do not add one here either. */
  cost: PeopleCost;
}

export function useHrComp(
  year: number,
  month: number,
  opts?: Partial<UseQueryOptions<HrCompResponse>>,
) {
  return useQuery({
    queryKey: qk.hr.comp(year, month),
    queryFn: () => apiFetch<HrCompResponse>(`/api/hr/comp?year=${year}&month=${month}`),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    ...opts,
  });
}

/** Record or correct one dated salary row. Same date = correction, new = history. */
export function useHrSetStaffComp() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true; id: string }, ApiError, SetStaffCompInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true; id: string }>("/api/hr/comp", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrDeleteStaffComp() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, string>({
    mutationFn: (id) => apiFetch<{ ok: true }>(`/api/hr/comp/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

/** Who owns a store's number — the switch that turns the manager view on. */
export function useHrSetStoreManager() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetStoreManagerInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/kpi/store-manager", {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** Set the commission method for a store (outletId null) / one outlet. */
export function useHrSetScheme() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetCommissionSchemeInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/scheme", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** Append an effective-dated staff % rate row. */
export function useHrSetStaffRate() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetStaffRateInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/staff-rate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** Upsert (or null = remove) a model's per-unit RM rate. */
export function useHrSetModelRate() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetModelRateInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/model-rate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** Replace one model's volume tier ladder. */
export function useHrSetModelTiers() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetModelTiersInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/model-tiers", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** Replace the overall milestone list. */
export function useHrSetMilestones() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetMilestonesInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/milestones", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** 0250 — append an effective-dated BD % rate row. */
export function useHrSetBdRate() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetBdRateInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/bd-rate", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** 0251 — flip the ONE global BD calculation method (percentage | per_model). */
export function useHrSetBdMethod() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetBdMethodInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/bd-method", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** 0251 — set a BD user's position (executive | cbo). CBO earns the rate
 *  difference as override on BD Executives' dealer sales. */
export function useHrSetBdPosition() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetBdPositionInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/config/bd-position", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** 0250 — set/clear a dealer's BD owner (userId null clears; audited RPC). */
export function useHrAssignDealerBd() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, AssignDealerBdInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/assign-dealer-bd", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HR Team hierarchy (Phase 1, 2026-07-25) — org registry + THE account door.
// Reads go through the gated hr_team_source RPC; every write invalidates the
// whole ["hr"] sub-tree (the commission report joins the same staff universe).
// ─────────────────────────────────────────────────────────────────────────────

export function useHrTeam(opts?: Partial<UseQueryOptions<HrTeamSource>>) {
  return useQuery({
    queryKey: qk.hr.team(),
    queryFn: () => apiFetch<HrTeamSource>("/api/hr/team"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useHrSetTeamPosition() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetTeamPositionInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/team/position", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrSetReportsTo() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetReportsToInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/team/reports-to", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrSetStaffCode() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetStaffCodeInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/team/staff-code", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrUpsertPosition() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true; id: string }, ApiError, UpsertOrgPositionInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true; id: string }>("/api/hr/team/positions", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** 0260 (HR-P2) — grant / revoke one duty key on one position. This is the
 *  whole point of the phase: a promotion in the Team tab moves the permission,
 *  no code change and no redeploy. */
export function useHrSetPositionDuty() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, SetPositionDutyInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>("/api/hr/team/position-duty", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** 0259 — create / rename / retire a department (the chart's columns). */
export function useHrUpsertDepartment() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true; id: string }, ApiError, UpsertOrgDepartmentInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true; id: string }>("/api/hr/team/departments", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrCreateTeamAccount() {
  const invalidate = useHrInvalidate();
  return useMutation<
    { id: string; email: string; name: string; role: string; staffCode: string | null },
    ApiError,
    HrCreateTeamAccountInput
  >({
    mutationFn: (input) =>
      apiFetch("/api/hr/team/accounts", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrCreateShowroomStaff() {
  const invalidate = useHrInvalidate();
  return useMutation<{ id: string; staffCode: string }, ApiError, HrCreateShowroomStaffInput>({
    mutationFn: (input) =>
      apiFetch<{ id: string; staffCode: string }>("/api/hr/team/showroom-staff", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Guarantee packages (0261-0263)
// ---------------------------------------------------------------------------

/**
 * Every guarantee sold on one order — powers the "Guarantee" strip inside the
 * Customer block of BOTH order-detail surfaces (ops drawer + POS).
 *
 * The hook lives HERE rather than inside the strip on purpose: the strip is a
 * leaf that mounts inside drawers whose tests fully mock this module and
 * therefore never install a QueryClientProvider. A raw useQuery in the leaf
 * takes the whole drawer down in those tests; a hook here is stubbed with the
 * rest of the module.
 *
 * `retry: false` — the strip is silent-when-absent, so a failed read must
 * degrade to "no guarantee shown", never to a broken customer card.
 */
export function useOrderGuarantees(
  orderId: string,
  opts?: Partial<UseQueryOptions<GuaranteeListResponse>>,
) {
  return useQuery<GuaranteeListResponse>({
    queryKey: qk.guarantees.byOrder(orderId),
    queryFn: () => apiFetch<GuaranteeListResponse>(`/api/guarantees/order/${orderId}`),
    staleTime: 30_000,
    retry: false,
    ...opts,
  });
}

/**
 * J2 — every service case that names this order. Powers the order drawer's
 * Cases tab (the order→case half of the cross-link).
 *
 * Filtered server-side by `?orderId=`, not fetched-then-filtered: the case list
 * is company-wide and would only grow.
 *
 * `retry: false` mirrors useOrderGuarantees — the Cases tab is silent-when-
 * absent, so a failed read must degrade to "no cases shown" rather than
 * blocking the drawer with an error the operator can do nothing about.
 */
export function useOrderServiceCases(
  orderId: string,
  opts?: Partial<UseQueryOptions<ServiceCaseListResponse>>,
) {
  return useQuery<ServiceCaseListResponse>({
    queryKey: qk.serviceCases.byOrder(orderId),
    queryFn: () =>
      apiFetch<ServiceCaseListResponse>(
        `/api/ops/service-cases?orderId=${encodeURIComponent(orderId)}`,
      ),
    staleTime: 30_000,
    retry: false,
    ...opts,
  });
}

/**
 * Author a guarantee PRODUCT — model + SKU + terms in one server call (0270).
 *
 * A mutation hook rather than a bare apiFetch + useQueryClient inside the modal:
 * NewSkuModal's tests fully mock this module and install no QueryClientProvider,
 * so touching the client directly in the component takes the whole modal down.
 * Same rule as useOrderGuarantees — data access lives here.
 */
export function useCreateGuaranteeProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GuaranteeProductInput) =>
      apiFetch<{ ok: true; sku: string; label: string; covers: string }>(
        "/api/guarantees/products",
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      // The catalog bundle carries models, skus AND guaranteeTerms — one blast.
      void qc.invalidateQueries({ queryKey: ["catalog"] });
      void qc.invalidateQueries({ queryKey: ["guarantees"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HR-P4 (0269) — the employee master. `hr_employees` is an HR-private satellite
// of app_users/salespersons: identity is read THROUGH the join, so a name or a
// position edited in the Team tab is already correct here. Every write
// invalidates the whole ["hr"] sub-tree because Team, Overview and People all
// read the same staff universe.
// ─────────────────────────────────────────────────────────────────────────────

export function useHrPeople(opts?: Partial<UseQueryOptions<HrPeopleSource>>) {
  return useQuery({
    queryKey: qk.hr.people(),
    queryFn: () => apiFetch<HrPeopleSource>("/api/hr/people"),
    staleTime: 30_000,
    ...opts,
  });
}

export function useHrEmployee(
  employeeId: string | null,
  opts?: Partial<UseQueryOptions<HrEmployeeDetail>>,
) {
  return useQuery({
    queryKey: qk.hr.person(employeeId ?? "none"),
    queryFn: () => apiFetch<HrEmployeeDetail>(`/api/hr/people/${employeeId}`),
    enabled: employeeId !== null,
    staleTime: 15_000,
    ...opts,
  });
}

export function useHrPatchEmployee(employeeId: string) {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, HrEmployeePatchInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>(`/api/hr/people/${employeeId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/**
 * Reveal ONE masked value. Deliberately a mutation, not a query: the server
 * writes an audit row in the same transaction that reads the number, so this
 * must never be cached, retried in the background, or prefetched on hover.
 */
export function useHrRevealField(employeeId: string) {
  return useMutation<
    { field: string; value: string },
    ApiError,
    { field: "ic_number" | "bank_account_no" }
  >({
    mutationFn: (input) =>
      apiFetch<{ field: string; value: string }>(`/api/hr/people/${employeeId}/reveal`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}

export function useHrRecordExit(employeeId: string) {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, HrRecordExitInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>(`/api/hr/people/${employeeId}/exit`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

export function useHrToggleChecklist(employeeId: string) {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, HrChecklistToggleInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true }>(`/api/hr/people/${employeeId}/checklist`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** The door Loo approved 2026-07-26: HR may disable a login. Separate from the
 *  exit record on purpose — writing a date must never look like revoking access. */
export function useHrSetAccess(employeeId: string) {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true; status: string }, ApiError, HrSetAccessInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true; status: string }>(`/api/hr/people/${employeeId}/access`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HR-P5 (0272/0273) — commission runs. Closing a month freezes the engine's output;
// from then on the statement is READ from those rows and never recomputed. Every
// mutation invalidates the whole ["hr"] sub-tree because the run, the report and the
// attribution worklist are all views of the same month.
// ─────────────────────────────────────────────────────────────────────────────

export function useCommissionRunState(
  year: number,
  month: number,
  opts?: Partial<UseQueryOptions<CommissionRunStateWithChecks>>,
) {
  return useQuery({
    queryKey: qk.hr.runState(year, month),
    queryFn: () =>
      apiFetch<CommissionRunStateWithChecks>(
        `/api/hr/runs/state?year=${year}&month=${month}`,
      ),
    staleTime: 15_000,
    ...opts,
  });
}

export function useCommissionRuns(opts?: Partial<UseQueryOptions<{ runs: CommissionRunSummary[] }>>) {
  return useQuery({
    queryKey: qk.hr.runs(),
    queryFn: () => apiFetch<{ runs: CommissionRunSummary[] }>("/api/hr/runs"),
    staleTime: 30_000,
    ...opts,
  });
}

/** The FROZEN statement. Enabled only once a run exists. */
export function useCommissionRun(
  runId: string | null,
  opts?: Partial<UseQueryOptions<CommissionRunDetail>>,
) {
  return useQuery({
    queryKey: qk.hr.run(runId ?? "none"),
    queryFn: () => apiFetch<CommissionRunDetail>(`/api/hr/runs/${runId}`),
    enabled: runId !== null,
    staleTime: 60_000,
    ...opts,
  });
}

export function useCloseCommissionMonth() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true; runId: string }, ApiError, CloseMonthInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true; runId: string }>("/api/hr/runs/close", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}

/** approve | reopen | discard | paid — one hook, the action is the path. */
export function useCommissionRunAction(
  action: "approve" | "reopen" | "discard" | "paid",
) {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true }, ApiError, { runId: string; reason?: string }>({
    mutationFn: ({ runId, reason }) =>
      apiFetch<{ ok: true }>(`/api/hr/runs/${runId}/${action}`, {
        method: "POST",
        body: JSON.stringify(reason ? { reason } : {}),
      }),
    onSuccess: invalidate,
  });
}

export function useAddCommissionAdjustment() {
  const invalidate = useHrInvalidate();
  return useMutation<{ ok: true; id: string }, ApiError, AddAdjustmentInput>({
    mutationFn: (input) =>
      apiFetch<{ ok: true; id: string }>("/api/hr/runs/adjustments", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: invalidate,
  });
}
