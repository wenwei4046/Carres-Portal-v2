export const SHARED_VERSION = "0.0.0" as const;

export {
  MAX_DELIVERY_FLOOR,
  DELIVERY_LEAD_DAYS,
  maxLeadDaysFor,
  minDeliveryDateISO,
  // 0169-0173 — Product & Maintenance rebuild.
  PRODUCT_CATEGORIES,
  SERVICE_SKU,
  SERVICE_SKU_REGEX,
  CARRES_INTERNAL_SUPPLIER_SLUG,
  PRODUCT_MODEL_PHOTOS_BUCKET,
  SUPPLIERLESS_CATEGORIES,
  type DeliveryLeadCategory,
} from "./constants";

// Sub-path imports also work, e.g.:
//   import type { DealerRow } from "@carres/shared/db-types";
//   import { dealerFromRow }   from "@carres/shared/adapters";
//   import { loginSchema }     from "@carres/shared/schemas/auth";

export * as DB       from "./db-types";
export * as Domain   from "./domain";
export * as Adapters from "./adapters";

// Phase 4.5 Chunk 2 Sprint E migration 0055 (T25). Top-level type re-export
// so consumers can `import type { CostSource } from "@carres/shared"` without
// having to dip into the DB.* namespace. Mirrors how Role + operationStage are
// implicitly available via DB.* — but CostSource is referenced widely enough
// (CreatePoInput line shape, CogsLineEditor T28, recent-cost RPC T27) to
// warrant the top-level alias.
//
// T42-C1 — `ManualCostSource` is the narrower 3-value variant for the FE
// manual-create surface (CreatePOModal form state + CogsLineEditor prop).
// Excludes the server-only `auto_issued` label.
export type { CostSource, ManualCostSource } from "./db-types";

export {
  loginSchema,
  meResponseSchema,
  type LoginPayload,
  type MeResponse,
} from "./schemas/auth";

export {
  orderSchema,
  orderStatusSchema,
  ordersListResponseSchema,
  dealerSelfSchema,
  createOrderInputSchema,
  topUpOrderInputSchema,
  setOrderAddressInputSchema,
  setOrderDateInputSchema,
  updateOrderInputSchema,
  cancelOrderInputSchema,
  setOpsAssignedLogisticInputSchema,
  type Order,
  type OrderLine,
  type OrderAddon,
  type OrderHistory,
  type OrderStatus,
  type OrdersListResponse,
  type DealerSelf,
  type CreateOrderInput,
  type OrderLineInput,
  type OrderAddonInput,
  type TopUpOrderInput,
  type SetOrderAddressInput,
  type SetOrderDateInput,
  type UpdateOrderInput,
  type CancelOrderInput,
  type SetOpsAssignedLogisticInput,
} from "./schemas/orders";

export {
  PROCEED_BLOCKER_CODES,
  PROCEED_BLOCKER_LABEL,
  isProceedBlockerCode,
  type ProceedBlockerCode,
  type ProceedBlocker,
} from "./blockers";

export {
  SOP_STANDARD,
  SOP_SOFA_SPECIAL,
  SUPPLIER_SOP,
  sopFor,
  PROCUREMENT_TAB_SLUGS,
  deriveProcurementSlug,
  type OperationStageV3,
  type SopName,
  type SopDef,
  type ProcurementTabSlug,
} from "./sops";

export {
  catalogResponseSchema,
  productModelSchema,
  productSkuSchema,
  sofaFabricSchema,
  addonSchema,
  floorConfigSchema,
  outletSchema,
  outletsListResponseSchema,
  createOutletInput,
  salespersonSchema,
  salespersonsListResponseSchema,
  salespersonCreateInputSchema,
  productCategorySchema,
  variantKindSchema,
  productModelCreateInput,
  productModelPatchInput,
  productSkuCreateInput,
  productSkuPatchInput,
  sofaFabricCreateInput,
  sofaFabricPatchInput,
  // 0169-0173 — Product & Maintenance rebuild.
  allowedOptionsSchema,
  // 0176 — fabric tier pricing schemas.
  fabricTierSchema,
  fabricTierConfigSchema,
  modelFabricTierOverrideSchema,
  // 0177 — combo (套餐) schemas.
  comboComponentSchema,
  comboSchema,
  comboCreateInput,
  comboPatchInput,
  serviceSkuCodeSchema,
  sizesActiveInput,
  generateSkusInput,
  skuMasterListQuery,
  floorConfigPatchInput,
  addonCreateInput,
  addonPatchInput,
  type AllowedOptions,
  type SizesActiveInput,
  type GenerateSkusInput,
  type SkuMasterListQuery,
  type FloorConfigPatchInput,
  type AddonCreateInput,
  type AddonPatchInput,
  type CatalogResponse,
  type ProductModelDto,
  type ProductSkuDto,
  type SofaFabricDto,
  type AddonDto,
  type FloorConfigDto,
  type OutletDto,
  type OutletsListResponse,
  type CreateOutletInput,
  type SalespersonDto,
  type SalespersonsListResponse,
  type SalespersonCreateInput,
  type ProductCategory,
  type VariantKind,
  type ProductModelCreateInput,
  type ProductModelPatchInput,
  type ProductSkuCreateInput,
  type ProductSkuPatchInput,
  type SofaFabricCreateInput,
  type SofaFabricPatchInput,
  type FabricTierValue,
  type FabricTierConfigDto,
  type ModelFabricTierOverrideDto,
  // 0177 — combo (套餐) Dto types.
  type ComboComponentDto,
  type ComboDto,
  type ComboCreateInput,
  type ComboPatchInput,
} from "./schemas/catalog";

export {
  decideApprovalInput,
  listApprovalsQuery,
  type DecideApprovalInput,
  type ListApprovalsQuery,
} from "./schemas/approvals";

export {
  inviteDealerInput,
  setDealerStatusInput,
  updateDealerInput,
  type InviteDealerInput,
  type SetDealerStatusInput,
  type UpdateDealerInput,
} from "./schemas/principal-dealers";

export {
  createLpAccountSchema,
  type CreateLpAccountInput,
} from "./schemas/lp-account";

export {
  APP_ROLES,
  createAccountInput,
  setAccountStatusInput,
  resetPasswordInput,
  type AppRole,
  type CreateAccountInput,
  type SetAccountStatusInput,
  type ResetPasswordInput,
} from "./schemas/principal-accounts";

export {
  assignPartnerInput,
  attachDoInput,
  receivePoWithDoInput,
  adjustStockInput,
  abandonOrderInput,
  createPoInput,
  createPosBatchInput,
  createPosBatchResponse,
  warehousePickInput,
  issuePosForOrderInput,
  recheckStockInput,
  assignPickupPartnerInput,
  reassignPoWarehouseInput,
  ListOperationOrdersQuery,
  listPurchaseOrdersQuery,
  cancelPoInput,
  listMovementsQuery,
  confirmProceedRequestInputSchema,
  reselectPartnerInput,
  lpAcceptOrderInput,
  lpRejectOrderInput,
  transferReadyInputSchema,
  reservedDrilldownQuery,
  reservedDrilldownResponse,
  awaitingStockShortageResponse,
  OperationBadgesResponse,
  partnerAcceptRfdInput,
  partnerRejectRfdInput,
  dispatchCustomerLegInput,
  resumeDispatchInput,
  setThresholdInput,
  // Migration 0107 — supplier per-thread pickup feature.
  OperationReceiveThreadsInput,
  type AssignPartnerInput,
  type AttachDoInput,
  type ReceivePoWithDoInput,
  type AdjustStockInput,
  type AbandonOrderInput,
  type CreatePoInput,
  type CreatePosBatchInput,
  type CreatePosBatchResponse,
  type WarehousePickInput,
  type IssuePosForOrderInput,
  type RecheckStockInput,
  type AssignPickupPartnerInput,
  type ReassignPoWarehouseInput,
  type ListPurchaseOrdersQuery,
  type CancelPoInput,
  type ListMovementsQuery,
  type ConfirmProceedRequestInput,
  type ReselectPartnerInput,
  type LpAcceptOrderInput,
  type LpRejectOrderInput,
  type TransferReadyInput,
  type ReservedDrilldownQuery,
  type ReservedDrilldownResponse,
  type AwaitingStockShortageResponse,
  type PartnerAcceptRfdInput,
  type PartnerRejectRfdInput,
  type DispatchCustomerLegInput,
  type ResumeDispatchInput,
  type SetThresholdInput,
} from "./schemas/operation";

export {
  paymentMethodEnum,
  financeTopupApproveInput,
  financeRecordReceiptInput,
  refundPayInput,
  paymentsListQuery,
  financeInvoiceIssueInput,
  financeInvoiceVoidInput,
  invoicesListQuery,
  refundCreateInput,
  refundsListQuery,
  financePoPayInput,
  financePoScheduleInput,
  bankStatementCreateInput,
  bankStatementsListQuery,
  reconciliationCreateInput,
  cashflowSeriesQuery,
  monthlyPlQuery,
  topSkusQuery,
  refundApplyInput,
  type PaymentMethod,
  type FinanceTopupApproveInput,
  type FinanceRecordReceiptInput,
  type RefundPayInput,
  type PaymentsListQuery,
  type FinanceInvoiceIssueInput,
  type FinanceInvoiceVoidInput,
  type InvoicesListQuery,
  type RefundCreateInput,
  type RefundsListQuery,
  type FinancePoPayInput,
  type FinancePoScheduleInput,
  type BankStatementCreateInput,
  type BankStatementsListQuery,
  type ReconciliationCreateInput,
  type CashflowSeriesQuery,
  type MonthlyPlQuery,
  type TopSkusQuery,
  type RefundApplyInput,
} from "./schemas/finance";

export {
  supplierMarkDeliveredInput,
  supplierPosListQuery,
  type SupplierMarkDeliveredInput,
  type SupplierPosListQuery,
} from "./schemas/supplier";

// Migration 0107 — supplier per-thread pickup feature. Path-only POST that
// flips `order_supplier_threads.supplier_ready_at` for a single thread.
export {
  markThreadReadyInput,
  type MarkThreadReadyInput,
} from "./schemas/supplier-threads";

// Migration 0107 — partner-side batch pickup of ready threads (factory_pickup
// flow). One DO covers N threads on a single PO.
export {
  partnerPickupBatchInput,
  type PartnerPickupBatchInput,
} from "./schemas/partner";

// Migration 0132 — AutoCount order-import door. See
// docs/autocount-import-contract.md.
export {
  autocountImportRowSchema,
  autocountImportInput,
  autocountImportResultSchema,
  autocountImportResponseSchema,
  type AutocountImportRow,
  type AutocountImportInput,
  type AutocountImportResult,
  type AutocountImportResponse,
} from "./schemas/autocount-import";

// Migration 0137 — per-unit stock register (Carres Klang).
export {
  opsStockConditionSchema,
  opsStockStatusSchema,
  opsStockReserveInputSchema,
  opsStockReleaseInputSchema,
  opsStockReassignInputSchema,
  opsStockTakeoutInputSchema,
  opsStockFlagRepairInputSchema,
  opsStockUpdateConditionInputSchema,
  opsStockItemSchema,
  opsStockListResponseSchema,
  type OpsStockCondition,
  type OpsStockStatus,
  type OpsStockReserveInput,
  type OpsStockReleaseInput,
  type OpsStockReassignInput,
  type OpsStockTakeoutInput,
  type OpsStockFlagRepairInput,
  type OpsStockUpdateConditionInput,
  type OpsStockItem,
  type OpsStockListResponse,
} from "./schemas/ops-stock";

// Migration 0140 — Service Notes (SN module / Issue Tracker).
export {
  snSectionASchema,
  snSectionBSchema,
  snSectionCSchema,
  snItemSchema,
  serviceNoteSchema,
  serviceNoteListItemSchema,
  serviceNoteListResponseSchema,
  createServiceNoteInputSchema,
  updateServiceNoteInputSchema,
  SN_CATEGORIES,
  SN_TYPES,
  SN_LOGISTICS,
  SN_STAGES,
  SN_STAGE_LABELS,
  SN_STAGE_NEXT,
  type SnStage,
  type SnSectionA,
  type SnSectionB,
  type SnSectionC,
  type SnItem,
  type ServiceNote,
  type ServiceNoteListItem,
  type ServiceNoteListResponse,
  type CreateServiceNoteInput,
  type UpdateServiceNoteInput,
} from "./schemas/service-notes";

// Migration 0156 — multi-leg delivery chain (γ architecture).
export {
  deliveryStopStatusSchema,
  deliveryStopSchema,
  setDeliveryChainInputSchema,
  patchDeliveryStopInputSchema,
  deliveryChainResponseSchema,
  type DeliveryStopStatus,
  type DeliveryStop,
  type SetDeliveryChainInput,
  type PatchDeliveryStopInput,
  type DeliveryChainResponse,
} from "./schemas/delivery-chain";

// Migration 0159 — Orders control-grid overlay (P2 editable drawer).
export {
  STOCK_LOCATIONS,
  PAYMENT_STATUSES,
  DELIVERY_TIME_SLOTS,
  STORAGE_RATES,
  computeStorageFee,
  opsOrderControlSchema,
  updateOpsOrderControlInput,
  opsOrderControlResponseSchema,
  type OpsOrderControl,
  type UpdateOpsOrderControlInput,
  type OpsOrderControlResponse,
} from "./schemas/ops-order-control";
export * from "./schemas/ops-cockpit";

// Migration 0176 — fabric tier pricing resolver + types.
export {
  resolveFabricDelta,
  type FabricTier,
  type FabricTierOverride,
  type FabricTierGlobalConfig,
} from "./fabric-tier";

// Migration 0177 — combo (套餐) price-split helper + types. `explodeCombo` is
// the pure split used by the POS (web Task 4) to fan a combo into N order lines.
export {
  explodeCombo,
  type ExplodedComboLine,
} from "./combo";

// 0177 — combo domain types (camelCased). Top-level alias so consumers can
// `import type { Combo } from "@carres/shared"` without dipping into Domain.*
// (mirrors how CostSource is surfaced above). The zod schemas + Dto types live
// in the schemas/catalog export block.
export type { Combo, ComboComponent } from "./domain";

// Table-name constants (prevents raw string literals in application code).
export * from "./tables";

// Sales Order Maintenance — AutoCount-style configurable SO grid (2026-06-16).
// See docs/superpowers/plans/2026-06-16-sales-order-maintenance.md.
export {
  SO_GRID_COLUMN_TYPES,
  SO_GRID_COLUMN_SOURCES,
  SO_GRID_COLUMN_GROUPS,
  SO_GRID_COLUMNS,
  SO_GRID_COLUMN_KEYS,
  SO_GRID_OPTION_KEYS,
  soGridColumnDef,
  soGridColumnConfigSchema,
  soGridConfigSchema,
  updateSoGridConfigSchema,
  soGridCellValueSchema,
  soGridRowSchema,
  soGridResponseSchema,
  defaultSoGridConfig,
  mergeSoGridConfig,
  type SoGridColumnType,
  type SoGridColumnSource,
  type SoGridColumnGroup,
  type SoGridColumnDef,
  type SoGridColumnConfig,
  type SoGridConfig,
  type UpdateSoGridConfigInput,
  type SoGridCellValue,
  type SoGridRow,
  type SoGridResponse,
} from "./schemas/sales-order-maintenance";
