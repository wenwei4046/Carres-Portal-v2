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
  rawCreateOrderInputSchema,
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
  type RawCreateOrderInput,
  type RawOrderLineInput,
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
  // 0178 — sofa compartment pool + per-model offered schemas.
  sofaCompartmentSchema,
  sofaCompartmentCreateInput,
  sofaCompartmentPatchInput,
  modelSofaCompartmentSchema,
  modelSofaCompartmentInput,
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
  // 0178 — sofa compartment Dto + input types.
  type SofaCompartmentDto,
  type SofaCompartmentCreateInput,
  type SofaCompartmentPatchInput,
  type ModelSofaCompartmentDto,
  type ModelSofaCompartmentInput,
  // 0179 — sofa combo pricing schemas + input/Dto types.
  sofaComboSchema,
  sofaComboCreateInput,
  sofaComboPatchInput,
  type SofaComboDto,
  type SofaComboCreateInput,
  type SofaComboPatchInput,
  // 0181 — special add-ons schemas + input/Dto types.
  specialAddonSchema,
  specialAddonOptionGroupSchema,
  specialAddonCreateInput,
  specialAddonPatchInput,
  type SpecialAddonDto,
  type SpecialAddonOptionGroupDto,
  type SpecialAddonCreateInput,
  type SpecialAddonPatchInput,
  // 0182 — global option pool schemas + input/Dto types.
  CATALOG_OPTION_POOL_NAMES,
  catalogOptionPoolNameSchema,
  catalogOptionPoolSchema,
  catalogOptionPoolCreateInput,
  catalogOptionPoolPatchInput,
  type CatalogOptionPoolName,
  type CatalogOptionPoolDto,
  type CatalogOptionPoolCreateInput,
  type CatalogOptionPoolPatchInput,
  // 0201 — pool batch-save + config history schemas/Dto types.
  catalogPoolEntryInput,
  catalogPoolBatchSaveInput,
  catalogPoolSnapshotEntrySchema,
  catalogConfigHistorySchema,
  type CatalogPoolEntryInput,
  type CatalogPoolBatchSaveInput,
  type CatalogPoolSnapshotEntryDto,
  type CatalogConfigHistoryDto,
  // 0202 — global fabric master schemas + input/Dto types.
  fabricTierValueSchema,
  catalogFabricSchema,
  catalogFabricEntryInput,
  catalogFabricsBatchSaveInput,
  catalogFabricsHistorySchema,
  type CatalogFabricDto,
  type CatalogFabricEntryInput,
  type CatalogFabricsBatchSaveInput,
  type CatalogFabricsHistoryDto,
  // 0184 — delivery fee config + special rules + RuleTarget schemas/inputs.
  deliveryFeeConfigSchema,
  deliveryFeeConfigPatchInput,
  ruleTargetScopeSchema,
  ruleTargetSchema,
  specialDeliveryFeeRuleSchema,
  specialDeliveryFeeRuleInput,
  type DeliveryFeeConfigDto,
  type DeliveryFeeConfigPatchInput,
  type RuleTargetScopeValue,
  type RuleTargetDto,
  type SpecialDeliveryFeeRuleDto,
  type SpecialDeliveryFeeRuleInput,
  // 0185 — Default Free Gifts + Free Item Campaigns (GWP) schemas/inputs/Dtos.
  targetRefinementSchema,
  defaultFreeGiftSchema,
  modelDefaultFreeGiftsSchema,
  modelDefaultFreeGiftsInput,
  freeItemCampaignSchema,
  freeItemCampaignInput,
  type TargetRefinementDto,
  type DefaultFreeGiftDto,
  type ModelDefaultFreeGiftsDto,
  type ModelDefaultFreeGiftsInput,
  type FreeItemCampaignDto,
  type FreeItemCampaignInput,
  // 0186 — PWP & Promo rule schemas/inputs/Dtos.
  pwpRuleSchema,
  pwpRuleInput,
  type PwpRuleDto,
  type PwpRuleInput,
  // 0187 — PWP voucher ledger (Phase 8c) schemas/inputs/Dtos.
  pwpCodeStatusSchema,
  pwpCodeSchema,
  pwpReserveInputSchema,
  pwpCodesResponseSchema,
  attrsPwpMarkerSchema,
  type PwpCodeStatusValue,
  type PwpCodeDto,
  type PwpReserveInput,
  type PwpCodesResponse,
  type AttrsPwpMarker,
  // 0188 — PWP cross-order DISCOVERY (Phase 8d) — the STRIPPED projection
  // (no PII) the /available route returns.
  pwpDiscoverDtoSchema,
  pwpDiscoverResponseSchema,
  type PwpDiscoverDto,
  type PwpDiscoverResponse,
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
  opsStockReserveItemInputSchema,
  opsStockTakeoutInputSchema,
  opsStockFlagRepairInputSchema,
  opsStockUpdateConditionInputSchema,
  opsStockCreateInputSchema,
  opsStockItemSchema,
  opsStockListResponseSchema,
  type OpsStockCondition,
  type OpsStockStatus,
  type OpsStockReserveInput,
  type OpsStockReleaseInput,
  type OpsStockReassignInput,
  type OpsStockReserveItemInput,
  type OpsStockTakeoutInput,
  type OpsStockFlagRepairInput,
  type OpsStockUpdateConditionInput,
  type OpsStockCreateInput,
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
  STORAGE_WAIVER_STATUSES,
  computeStorageFee,
  storageCategoryForSku,
  orderStorageScope,
  computeOrderStorage,
  opsOrderControlSchema,
  updateOpsOrderControlInput,
  opsOrderControlResponseSchema,
  requestStorageWaiverInput,
  decideStorageWaiverInput,
  STORAGE_EXTENSION_REASONS,
  recordStorageExtensionInput,
  type OpsOrderControl,
  type UpdateOpsOrderControlInput,
  type OpsOrderControlResponse,
  type StorageWaiverStatus,
  type StorageCategory,
  type RequestStorageWaiverInput,
  type DecideStorageWaiverInput,
  type StorageExtensionReason,
  type RecordStorageExtensionInput,
} from "./schemas/ops-order-control";
export * from "./schemas/ops-cockpit";
// Sofa engine Phase 4 — build-line attrs schema + guard (server-recompute trust
// gate re-parses the build out of order_lines.attrs free jsonb before pricing).
export * from "./schemas/sofa-build";

// Migration 0184 — order payment ledger (balance job foundation).
export {
  PAYMENT_METHODS,
  PAYMENT_KINDS,
  recordPaymentInputSchema,
  collectStorageInput,
  summarizePayments,
  type OrderPaymentMethod,
  type PaymentKind,
  type RecordPaymentInput,
  type CollectStorageInput,
  type OrderPaymentRow,
  type PaymentSummary,
} from "./schemas/order-payments";

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

// 0178 — sofa compartment domain types (camelCased). Top-level alias so the API
// + web can `import type { SofaCompartment } from "@carres/shared"` without
// dipping into Domain.* (mirrors the Combo alias above). The zod schemas + Dto
// types live in the schemas/catalog export block; the adapters are reached via
// Adapters.* like comboFromRow / fabricTierConfigFromRow.
export type { SofaCompartment, ModelSofaCompartment } from "./domain";

// 0179 — sofa engine Phase 2: sofa combo domain type + the row→domain adapter +
// the canonical seat-height axis. `sofaComboFromRow` is also reachable via
// `Adapters.*` (like comboFromRow); the top-level alias mirrors the Combo/
// SofaCompartment surfacing above so the API + web can import it directly.
export type { SofaCombo } from "./domain";
export { sofaComboFromRow } from "./adapters";

// 0181 — Special Add-ons: the pure surcharge resolver (shared by the POS picker
// + the Hono server-recompute) + the domain type. Schemas live in the
// schemas/catalog export block; the adapter is reached via Adapters.specialAddonFromRow.
export {
  resolveSpecialAddonSurcharge,
  resolveSpecialsTotal,
  specialPickComplete,
  type SpecialAddonChoice,
  type SpecialAddonOptionGroup,
  type SpecialAddonDef,
  type SpecialAddonPick,
  type ResolvedSpecialLine,
  type SpecialsTotalResult,
} from "./special-addons";
export type { SpecialAddon } from "./domain";
// 0182 — global option pool domain type (the name union is re-exported from the
// schemas/catalog block above as CatalogOptionPoolName). 0201 adds the
// config-history domain type + its adapter.
export type { CatalogOptionPool, CatalogConfigHistory } from "./domain";
export { catalogConfigHistoryFromRow } from "./adapters";
// 0202 — global fabric master domain type + adapters.
export type { CatalogFabric, CatalogFabricsHistory } from "./domain";
export { catalogFabricFromRow, catalogFabricsHistoryFromRow } from "./adapters";
export { SOFA_HEIGHTS, type SofaHeight } from "./sofa-constants";

// 0201/0202-wiring (2026-07-06) — Maintenance option pools → Modular per-model
// gating → POS → Hono recompute. PURE: the POS preview and the server
// option-picks recompute share `resolveOptionsTotal` (honest pricing, one
// resolver both sides — the specials/sofa pattern).
export {
  poolTicksFor,
  tickKeyFor,
  allowedPoolValues,
  allowedFabricsFor,
  fabricTierFor,
  activeSofaHeights,
  resolveOptionsTotal,
  inchesOf,
  computedTotalHeight,
  optionPickAttrSchema,
  optionsAttrsSchema,
  OPTION_PICK_KINDS,
  type OptionPoolPickKind,
  type OptionPickKind,
  type OptionPickAttr,
  type OptionsAttrs,
  type OptionPick,
  type OptionResolveContext,
  type ResolvedOptionLine,
  type OptionsTotalResult,
} from "./option-picks";

// 0184 — 2990s Products parity Phase 6: the unified RuleTarget matcher (PURE,
// shared by the delivery-fee subsystem and any future rule consumer). Combo
// subset-matching delegates to the existing `matchSofaCombo`; compartment
// normalization to the existing `normalizeCompartmentCode`.
export {
  parseRuleTargets,
  parseTargetRefinement,
  refinementMatchesLine,
  lineMatchesTarget,
  lineMatchesTargets,
  type RuleTargetScope,
  type TargetRefinement,
  type RuleTarget,
  type RuleLineInput,
} from "./rule-target";

// 0184 — the PURE delivery TRIP fee engine + the special-rule matcher. The POS
// preview and the Hono server-recompute import the SAME `computeDeliveryFee`.
// `DeliveryFeeConfig` is the domain config (re-exported from delivery-fee, which
// pulls it from ./domain — single source of truth, no duplicate export).
export {
  computeDeliveryFee,
  specialModelsForLines,
  type DeliveryFeeConfig,
  type SpecialModelDeliveryFee,
  type DeliveryFeeInput,
  type DeliveryFeeResult,
  type SpecialDeliveryRule,
} from "./delivery-fee";

// 0184 — the special-delivery-rule domain row type (camelCased). The config
// domain type ships from the delivery-fee block above; the row→domain adapters
// (deliveryFeeConfigFromRow / specialDeliveryFeeRuleFromRow) are reached via
// `Adapters.*` like comboFromRow.
export type { SpecialDeliveryFeeRule } from "./domain";

// 0185 — 2990s Products parity Phase 7: Default Free Gifts + Free Item Campaigns
// (GWP). PURE resolvers shared by the POS preview + the Hono server-side
// SO-create resolver/validator (honest-pricing: same matching both sides). Both
// reuse the P6 RuleTarget matcher. A free line books as an RM0 order_line with an
// attrs marker — create_order / order_lines / DraftLine are UNTOUCHED. The
// row→domain adapters (modelDefaultFreeGiftsFromRow / freeItemCampaignFromRow)
// are surfaced top-level here too (mirrors sofaComboFromRow).
export {
  parseDefaultFreeGifts,
  resolveDefaultFreeGifts,
  type DefaultFreeGift,
  type DesiredFreeGift,
  type FreeGiftLineInput,
} from "./free-gift";
export {
  campaignsCoveringLine,
  parseFreeItemEligible,
  type FreeItemCampaign,
} from "./free-item-campaign";
export { modelDefaultFreeGiftsFromRow, freeItemCampaignFromRow } from "./adapters";
export type { ModelDefaultFreeGifts } from "./domain";

// 0186 — 2990s Products parity Phase 8a: PWP & Promo. The PURE engine
// (`resolvePwp`) — the SOLE source of truth for which reward lines get the PWP/
// promo price + which trigger they bind to. Will be shared by the POS preview +
// the Hono server recompute (P8b+) so the figure cannot drift. Reuses the P6
// RuleTarget matcher for trigger/reward scope. The row→domain adapter
// (`pwpRuleFromRow`) is surfaced top-level here too (mirrors sofaComboFromRow).
export {
  resolvePwp,
  parsePwpTargets,
  type PwpRule as PwpRuleEngine,
  type PwpLineInput,
  type PwpGrant,
} from "./pwp";
export { pwpRuleFromRow } from "./adapters";
export type { PwpRule } from "./domain";

// 0187 — 2990s Products parity Phase 8c: the PWP voucher LEDGER (SAME-CART state
// machine). The row→domain adapter (`pwpCodeFromRow`) + the camelCase domain
// type are surfaced top-level here (mirrors pwpRuleFromRow / sofaComboFromRow);
// the zod schemas + Dto/input types live in the schemas/catalog export block.
export { pwpCodeFromRow } from "./adapters";
export type { PwpCode } from "./domain";

// 0188 — 2990s Products parity Phase 8d: cross-order voucher carry-forward. The
// MY-aware phone canonicalizer (`phoneKeyMy`, JS twin of the SQL pwp_phone_key) +
// the legacy digits-only `phoneKey` (promoted from delivery-fee-recompute). The
// stripped DISCOVERY adapter (`pwpDiscoverFromRow`) + its camelCase domain type —
// the ONLY pwp_codes-derived shape a non-owner client receives (no PII).
export { phoneKey, phoneKeyMy } from "./phone";
export { pwpDiscoverFromRow } from "./adapters";
export type { PwpDiscover } from "./domain";

// Sofa engine Phase 2 — the PURE pricing engine (computeSofaPrice + Kuhn combo
// match + explodeSofaBuild). No DB/IO; runs identically on web + (Phase 4) Hono.
export {
  resolveCompartmentPrice,
  mirrorCode,
  mirrorModules,
  canMirror,
  canonicalizeSofaSlots,
  matchSofaCombo,
  pickSofaCombo,
  computeSofaPrice,
  explodeSofaBuild,
  explodeSofaBuildToOrderLines,
  sofaPriceWithinTolerance,
  SOFA_PRICE_DRIFT_TOLERANCE,
  type SofaComboLike,
  type PickSofaComboArgs,
  type SofaComboPick,
  type SofaBuildCell,
  type SofaBuild,
  type SofaLegHeightOption,
  type SofaPricingSnapshot,
  type SofaPriceBasis,
  type SofaPriceResult,
  type ExplodedSofaLine,
  type ExplodedSofaOrderLine,
  type ExplodeSofaToLinesOpts,
} from "./sofa-pricing";

// The one derived-sku formula ({MODEL_KEY}-{variant}) shared by the api mint +
// generate-skus + the web maintenance read-back (no triplicated copies).
// `normalizeSkuKey` matches order_lines.sku ↔ ops_stock_items.sku across the
// cosmetic case/separator drift (the catalog is empty) — the ops stock-reserve link.
export { deriveSkuCode, normalizeSkuKey } from "./sku-code";

// 2990s Products parity Phase 1 — SKU Import: the one record->row mapper + zod
// shared by the staged-preview client and the import endpoint.
export {
  parseMoney,
  deriveModelKey,
  normalizeCategory,
  normalizeVariantKind,
  parseBoolish,
  csvRecordToImportRow,
  skuImportRowSchema,
  skuImportInput,
  hasPricingIntent,
  MAX_IMPORT_MONEY,
  type MoneyParse,
  type SkuImportRow,
  type ImportRowResult,
  type SkuImportRowParsed,
  type SkuImportInput,
  type SkuImportFailure,
  type SkuImportResult,
} from "./sku-import";

// Stock-ETA import: parse Jess's Master "Ops" sheet (Stock ETA col AA + Stock
// Status col Z) and fuzzy-join each row to a portal order line by PO + name.
// Shared by the staged-preview client (ImportStockEtaDialog) + the endpoint.
export {
  excelSerialToISO,
  normalizePoKey,
  splitPoKeys,
  parseEtaCell,
  normalizeMasterStockStatus,
  tokenizeName,
  masterRecordToStockRow,
  masterRecordToOrderRow,
  matchStockRows,
  stockEtaImportRowSchema,
  stockEtaImportInput,
  type LineStockStatus,
  type StockEtaImportRow,
  type StockRowResult,
  type OrderRowResult,
  type OrderLineRef,
  type StockEtaMatch,
  type StockMatchOutcome,
  type StockEtaImportRowParsed,
  type StockEtaImportInput,
  type StockEtaImportResult,
} from "./stock-eta-import";

// Sofa engine Phase 3 — the PURE plan-view geometry (footprint / snap / group /
// arm-cap closure). No DOM/React; cm-space math reused by the web builder + P4
// explode. `mirrorCode` / `computeSofaPrice` are NOT re-exported here — they
// already ship from `sofa-pricing`; the geometry module has no imports (the
// web auto-mirror-on-drop in Task 3 imports mirrorCode from `sofa-pricing`).
export {
  SOFA_MODULES,
  MODULE_EDGES_BASE,
  DEFAULT_FOOTPRINT,
  ROOM_W,
  ROOM_H,
  SNAP_CM,
  CONTACT_TOL,
  EDGE_W,
  EDGE_N,
  EDGE_E,
  EDGE_S,
  parseCompartmentStructure,
  familyRepresentative,
  findModule,
  normalizeCompartmentCode,
  representativeArtCode,
  isAccessoryModule,
  classifySofaCompartment,
  moduleFootprint,
  cellBbox,
  cellRenderBox,
  cellsBbox,
  centerCellsWithin,
  centerCellsInRoom,
  cellEdges,
  lCapEdgeOf,
  edgeContacts,
  groupSofas,
  orderSofaCellsLeftToRight,
  findSnap,
  hasArmConflict,
  analyzeSofa,
  type Rot,
  type Depth,
  type GeoCell,
  type SofaModuleSpec,
  type CompartmentStructure,
  type SofaCompartmentGroup,
  type EdgeType,
  type EdgeIdx,
  type Bbox,
  type SnapDelta,
  type ViolationReason,
  type ArmViolation,
  type ClosureFailure,
  type SofaAnalysis,
} from "./sofa-geometry";

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
