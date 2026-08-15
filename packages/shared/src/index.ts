export const SHARED_VERSION = "0.0.0" as const;

export * from "./issue-tracker";

export {
  resolveSalesOrderRoute,
  type RouteDeliveryAttempt,
  type RouteLoan,
  type RoutePurchaseOrder,
  type SalesOrderRoute,
  type SalesOrderRouteDocument,
  type SalesOrderRouteFact,
  type SalesOrderRouteFactState,
  type SalesOrderRouteGroup,
  type SalesOrderRouteInput,
  type SalesOrderRouteLane,
  type SalesOrderRouteLaneKey,
} from "./sales-order-route";

export {
  MAX_DELIVERY_FLOOR,
  EARLIEST_SELL_GATED_CATEGORIES,
  maxLeadDaysFor,
  // Owner ruling 2026-08-15 — a Sales Order must contain goods.
  ATTACHED_ONLY_CATEGORIES,
  cartHasGoods,
  minDeliveryDateISO,
  // 0169-0173 — Product & Maintenance rebuild.
  PRODUCT_CATEGORIES,
  SERVICE_SKU,
  SERVICE_SKU_REGEX,
  CARRES_INTERNAL_SUPPLIER_SLUG,
  PRODUCT_MODEL_PHOTOS_BUCKET,
  SUPPLIERLESS_CATEGORIES,
  SIZELESS_CATEGORIES,
  categoryHasSizeAxis,
} from "./constants";

// P1 (0303) — the purchasing numbers become settings. One home for every
// number the ordering engine reads.
export {
  PURCHASING_CATEGORIES,
  PURCHASING_NUMBER_KEYS,
  PURCHASING_NUMBER_RANGE,
  PRODUCTION_WORKING_DAYS_RANGE,
  WEEKDAYS,
  SUNDAY,
  expectedArrivalOf,
  arrivalFromReadyDate,
  isPurchasingCategory,
  isPurchasingNumberKey,
  productionWorkingDaysFor,
  transitDaysFor,
  workWeekOffDaysFor,
  purchasingUrgentWindowDays,
  unratedPairs,
  lastChangeFor,
  workWeekLabel,
  weekdayListLabel,
  parsePgIntArray,
  settingValueLabel,
  purchasingCategorySchema,
  purchasingSettingsResponseSchema,
  purchasingSetNumberInput,
  purchasingSetPoDaysInput,
  purchasingSetProductionDaysInput,
  purchasingSetWorkWeekInput,
  type PurchasingCategory,
  type PurchasingNumberKey,
  type PurchasingProductionDays,
  type PurchasingSupplierRow,
  type PurchasingSettingChange,
  type PurchasingSettings,
  type PurchasingSettingsResponse,
  type PurchasingSetNumberInput,
  type PurchasingSetPoDaysInput,
  type PurchasingSetProductionDaysInput,
  type PurchasingSetWorkWeekInput,
} from "./purchasing-settings";

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
  addOrderLinesInputSchema,
  replaceOrderLinesInputSchema,
  editOrderAddonInputSchema,
  decideOrderChangeRequestInputSchema,
  submitOrderChangeRequestInputSchema,
  orderChangeRequestSchema,
  orderChangeRequestStatusSchema,
  orderChangeRequestKindSchema,
  createOrderInputSchema,
  rawCreateOrderInputSchema,
  topUpOrderInputSchema,
  setOrderAddressInputSchema,
  setOrderDateInputSchema,
  updateOrderInputSchema,
  cancelOrderInputSchema,
  setOpsAssignedLogisticInputSchema,
  type AddOrderLinesInput,
  type ReplaceOrderLinesInput,
  type EditOrderAddonInput,
  type DecideOrderChangeRequestInput,
  type SubmitOrderChangeRequestInput,
  type ServiceAddonInputItem,
  type OrderChangeRequestDto,
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
  catalogFabricCostInput,
  catalogFabricsHistorySchema,
  type CatalogFabricDto,
  type CatalogFabricEntryInput,
  type CatalogFabricsBatchSaveInput,
  type CatalogFabricCostInput,
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
  // 0239 — Product bundle (bundle pricing) schemas/inputs/Dtos. 0241 adds
  // kind + slots (customizable bundles).
  bundleComponentSchema,
  bundleSlotSchema,
  productBundleSchema,
  productBundleInput,
  productBundlePatchInput,
  type BundleComponentDto,
  type BundleSlotDto,
  type ProductBundleDto,
  type ProductBundleInput,
  type ProductBundlePatchInput,
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

// 0219 — Order Entry config (payment methods + form fields).
export {
  paymentFollowUpSchema,
  paymentMethodConfigSchema,
  customFieldSchema,
  customFieldTypeSchema,
  builtinOverrideSchema,
  formTabConfigSchema,
  formFieldsConfigSchema,
  orderEntryConfigSchema,
  setOrderEntryConfigInput,
  MY_BANKS,
  DEFAULT_PAYMENT_METHODS,
  STRIPE_METHOD_KEY,
  STRIPE_PAYMENT_METHOD,
  ORDER_ENTRY_TABS,
  POS_FORM_BUILTINS,
  resolvePaymentMethods,
  resolveFormTab,
  allCustomFields,
  parseOrderEntryConfigRow,
  type PaymentFollowUp,
  type PaymentMethodConfig,
  type CustomField,
  type CustomFieldType,
  type BuiltinOverride,
  type FormTabConfig,
  type FormFieldsConfig,
  type OrderEntryConfigDto,
  type SetOrderEntryConfigInput,
  type OrderEntryTab,
  type PosBuiltinField,
  type ResolvedBuiltin,
  type ResolvedFormTab,
} from "./schemas/order-entry";

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
  CREATABLE_APP_ROLES,
  initialStaffInput,
  type CreatableAppRole,
  type InitialStaffInput,
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
  chasePoEventInput,
  // P3 (0306) — the two supplier calls' answer bodies.
  recordTomorrowDeliveryInput,
  // Q5 (0318) — the supplier's promised READY date, the third answer body.
  recordReadyDateInput,
  recordSendInput,
  setMessageTemplateInput,
  setLineDestinationInput,
  setLineOpsRemarkInput,
  splitLineDestinationInput,
  recordBalanceDateInput,
  attachDoInput,
  receivePoWithDoInput,
  // Slice B (0315) — the Office Receiving Workspace's one write door.
  officeReceiveInput,
  adjustStockInput,
  abandonOrderInput,
  warehousePickInput,
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
  type ChasePoEventInput,
  type RecordTomorrowDeliveryInput,
  type RecordBalanceDateInput,
  type RecordReadyDateInput,
  type AttachDoInput,
  type ReceivePoWithDoInput,
  type OfficeReceiveInput,
  type AdjustStockInput,
  type AbandonOrderInput,
  type WarehousePickInput,
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
  // CARD 2 (0341) — the inspection hold doors.
  opsStockHoldUnitInputSchema,
  opsStockResolveUnitHoldInputSchema,
  opsStockFlagRepairInputSchema,
  opsStockRefurbishInputSchema,
  opsStockRefurbishCompleteInputSchema,
  opsStockUpdateConditionInputSchema,
  opsStockCreateInputSchema,
  opsStockItemSchema,
  opsStockListResponseSchema,
  opsReorderPointInputSchema,
  opsReorderStateSchema,
  opsReorderRowSchema,
  opsReorderResponseSchema,
  // Ready Stock K4 (0292) — pool usage + reserve levels.
  opsReserveLevelInputSchema,
  opsPoolUseReasonSchema,
  opsReserveLevelStateSchema,
  opsReserveLevelRowSchema,
  opsUsageReasonSliceSchema,
  opsUsageSkuSliceSchema,
  opsPoolUsageEntrySchema,
  opsStockUsageResponseSchema,
  opsStockHealthStateSchema,
  opsStockHealthRowSchema,
  opsSlowMoverSchema,
  opsStockHealthCountsSchema,
  opsMonthAccuracySchema,
  opsStockHealthResponseSchema,
  type OpsStockHealthRow,
  type OpsMonthAccuracy,
  type OpsStockHealthResponse,
  type OpsReorderPointInput,
  type OpsReorderRow,
  type OpsReorderResponse,
  type OpsReserveLevelInput,
  type OpsReserveLevelRow,
  type OpsPoolUsageEntry,
  type OpsStockUsageResponse,
  type OpsStockReserveReason,
  type OpsStockCondition,
  type OpsStockStatus,
  type OpsStockReserveInput,
  type OpsStockReleaseInput,
  type OpsStockReassignInput,
  type OpsStockReserveItemInput,
  type OpsStockTakeoutInput,
  type OpsStockHoldUnitInput,
  type OpsStockResolveUnitHoldInput,
  type OpsStockFlagRepairInput,
  type OpsStockRefurbishInput,
  type OpsStockRefurbishCompleteInput,
  type OpsStockUpdateConditionInput,
  type OpsStockCreateInput,
  type OpsStockItem,
  type OpsStockListResponse,
} from "./schemas/ops-stock";

// Ready Stock K2 (0287) — the monthly plan's wire contracts.
export {
  planStatusSchema,
  planPeriodSchema,
  opsStockPlanOpenInputSchema,
  opsStockPlanProposeInputSchema,
  opsStockPlanConsolidateInputSchema,
  opsStockPlanFinalInputSchema,
  opsStockPlanDecideInputSchema,
  opsStockPlanProposalSchema,
  opsStockPlanRowSchema,
  opsStockPlanCoverageSchema,
  opsStockPlanHeaderSchema,
  opsStockPlanResponseSchema,
  type PlanStatusValue,
  type OpsStockPlanOpenInput,
  type OpsStockPlanProposeInput,
  type OpsStockPlanConsolidateInput,
  type OpsStockPlanFinalInput,
  type OpsStockPlanDecideInput,
  type OpsStockPlanRow,
  type OpsStockPlanCoverage,
  type OpsStockPlanHeader,
  type OpsStockPlanResponse,
} from "./schemas/ops-stock-plan";

// Ready Stock K3 (0290) — the urgent lane's wire contracts.
export {
  emergencyReasonSchema,
  emergencyStatusSchema,
  opsStockEmergencyRaiseInputSchema,
  opsStockEmergencyDecideInputSchema,
  opsStockEmergencyOrderedInputSchema,
  opsStockEmergencyRowSchema,
  opsStockEmergencyResponseSchema,
  type OpsStockEmergencyRaiseInput,
  type OpsStockEmergencyDecideInput,
  type OpsStockEmergencyRow,
  type OpsStockEmergencyResponse,
} from "./schemas/ops-stock-emergency";

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

// Migration 0210 — Service Cases (case parent layer + config-driven type/status).
export {
  caseTypeSchema,
  caseStatusSchema,
  serviceCaseConfigSchema,
  serviceCaseSchema,
  serviceCaseListResponseSchema,
  createServiceCaseInputSchema,
  updateServiceCaseInputSchema,
  caseLookupLineSchema,
  caseLookupOrderSchema,
  caseLookupResponseSchema,
  // S2 (0289) — the evidence ledger.
  caseEvidenceEntrySchema,
  caseEvidenceListResponseSchema,
  caseEvidenceUploadedSchema,
  signCaseEvidenceUploadInputSchema,
  signCaseEvidenceUploadResponseSchema,
  // S3 (0291) — the recorded outcomes of the follow-up chain.
  caseProgressEntrySchema,
  recordCaseStepInputSchema,
  // S4 (0298) — the deadline's recorded events.
  caseSlaEventSchema,
  recordCaseSlaInputSchema,
  // S5 (no migration) — the Numbers tab's whole answer.
  serviceCaseNumbersResponseSchema,
  type ServiceCaseNumbersResponse,
  type CaseProgressEntryRecord,
  type RecordCaseStepInput,
  type CaseSlaEventRecord,
  type RecordCaseSlaInput,
  type CaseEvidenceEntry,
  type CaseEvidenceListResponse,
  type CaseEvidenceUploaded,
  type SignCaseEvidenceUploadInput,
  type SignCaseEvidenceUploadResponse,
  type CaseType,
  type CaseStatus,
  type ServiceCaseConfig,
  type ServiceCase,
  type ServiceCaseListResponse,
  type CreateServiceCaseInput,
  type UpdateServiceCaseInput,
  type CaseLookupOrder,
  type CaseLookupResponse,
} from "./schemas/service-cases";

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
  ROUTE_CARRIERS,
  orderRouteLegSchema,
  type OrderRouteLeg,
  PAYMENT_STATUSES,
  DELIVERY_TIME_SLOTS,
  STORAGE_RATES,
  STORAGE_WAIVER_STATUSES,
  computeStorageFee,
  defaultStorageStart,
  storageCategoryForSku,
  orderStorageScope,
  computeOrderStorage,
  opsOrderControlSchema,
  updateOpsOrderControlInput,
  opsOrderControlResponseSchema,
  opsStaffMemberSchema,
  opsStaffListResponseSchema,
  updateOpsStaffSettingInput,
  distributeOrders,
  seenTodayMYT,
  countsAsInToday,
  OPS_DAY_CUTOFF_HOUR_MYT,
  isOpsManager,
  OPS_GENERIC_EMAILS,
  isOpsGenericAccount,
  receiveLineInput,
  requestStorageWaiverInput,
  decideStorageWaiverInput,
  // C9 — the manager's three outcomes
  STORAGE_RELEASE_DECISIONS,
  type StorageReleaseDecision,
  recordStorageExtensionInput,
  confirmBookingInput,
  type ConfirmBookingInput,
  // T6 delivery photos (migration 0280)
  deliveryPhotoSchema,
  DELIVERY_PHOTO_MIMES,
  DELIVERY_PHOTO_MAX_BYTES,
  signDeliveryPhotoUploadInput,
  attachDeliveryPhotoInput,
  deliveryPhotoListResponseSchema,
  type DeliveryPhoto,
  type SignDeliveryPhotoUploadInput,
  type AttachDeliveryPhotoInput,
  type DeliveryPhotoListResponse,
  // T8 delivery groups (migration 0282)
  deliveryGroupKeySchema,
  deliveryTripSchema,
  type DeliveryTrip,
  // C8 delay planning (migration 0304)
  DELAY_DECISIONS,
  delayDecisionInput,
  type DelayDecision,
  type DelayDecisionInput,
  type OpsOrderControl,
  type UpdateOpsOrderControlInput,
  type OpsOrderControlResponse,
  type OpsStaffMember,
  type OpsStaffListResponse,
  type UpdateOpsStaffSettingInput,
  type ReceiveLineInput,
  type ReceiveLineResult,
  type StorageWaiverStatus,
  type StorageCategory,
  type RequestStorageWaiverInput,
  type DecideStorageWaiverInput,
  type RecordStorageExtensionInput,
} from "./schemas/ops-order-control";

// T4 · Delivery Reason Library v1 (structured reasons, hidden responsibility)
export {
  DELIVERY_REASONS,
  DELIVERY_REASON_KEYS,
  DELIVERY_REASON_CATEGORY_LABEL,
  deliveryReasonByKey,
  deliveryReasonLabel,
  type DeliveryReason,
  type DeliveryReasonKey,
  type DeliveryReasonCategory,
  type DeliveryResponsibility,
} from "./delivery-reasons";

// C11 · The ONE spelling of a ringgit amount — `RM 1,250.50`, two decimals
// always (Loo 2026-07-28). `apps/web/src/lib/format-currency.ts` re-exports it.
export { fmtMoney } from "./money-format";

// C1 · The words an order action may say — queue word (no party) + row line
// (party named). The ONE code home for COPY-STANDARD's action dictionary.
export {
  ORDER_ACTION_QUEUES,
  PURCHASING_ACTION_QUEUES,
  checkedInDone,
  collectPillLabel,
  deliveryDateGapFact,
  orderActionButton,
  orderActionDone,
  orderActionForQueue,
  orderActionLine,
  orderActionQueue,
  purchasingActionButton,
  purchasingActionDone,
  purchasingActionEmpty,
  purchasingActionLine,
  purchasingActionQueue,
  tomorrowDeliveryAnswerLabel,
  type OrderActionKey,
  type OrderActionParties,
  type PurchasingActionKey,
} from "./order-action-words";

// P3 · The two supplier calls — `Confirm tomorrow's delivery` (per PO) and
// `Confirm balance delivery date` (per PO LINE). Pure; names its calendar.
export {
  PURCHASING_OFFICE_OFF_DAYS,
  balanceDeliveryCallsOf,
  callCalendarBucketOf,
  purchasingCallCalendarDays,
  purchasingCallCalendarOf,
  purchasingSupplierCallCounts,
  purchasingSupplierCallsOf,
  readyDateCallOf,
  tomorrowDeliveryCallOf,
  type CallCalendarBucket,
  type PurchasingCallCalendar,
  type PurchasingOpenCall,
  type PurchasingSupplierCallKey,
  type ReadyDateDueInputs,
  type SupplierCallLine,
  type SupplierCallOptions,
  type SupplierCallPo,
} from "./purchasing-supplier-calls";

// Supplier Workspace (Jess, 2026-08-02) — the ONE Current Action source
// (Law 7: engine first, state word only when the engine is quiet) + the
// work-state vocabulary the register's rail counts by.
export {
  PO_DELAY_REASONS,
  PO_STATE_ACTION_SHORT,
  PO_STATE_ACTION_WORD,
  PO_WORK_STATES,
  PO_WORK_STATE_LABEL,
  comparePoRisk,
  ordinalLabel,
  poArrivalGapOf,
  poCurrentActionOf,
  poDateHistoryOf,
  poOverdueDays,
  poRiskRungOf,
  poWorkStateOf,
  type PoArrivalGap,
  type PoCurrentAction,
  type PoDateHistory,
  type PoDateHistoryEntry,
  type PoDatePromise,
  type PoRiskRow,
  type PoRiskRung,
  type PoWorkspacePo,
  type PoWorkState,
} from "./po-workspace";

// C6 · What closes one action — the steps, each of them one of the portal's own
// actions, each measured from the signals the ladder already reads.
export {
  orderActionChecklist,
  type OrderActionStep,
  type OrderActionStepState,
} from "./order-action-checklist";

// C2 · The order action engine — two layers (compute every track · display
// picks one). One track may never suppress another's action.
export {
  // How long one person's claim on an action survives. A TECHNICAL constant,
  // never a business setting — the working flows name no number.
  ACTION_CLAIM_TIMEOUT_MS,
  displayOrderAction,
  openOrderActions,
  orderActionsInDisplayOrder,
  // C3 — the FACT that replaced the retired `Confirm delivery` action.
  orderIsDelivering,
  type OrderActionSignals,
  type OrderActionTone,
  type OrderActionTrack,
  type OrderOpenAction,
} from "./order-actions";

// C8b · The two delay clocks — Delay planning gets 2 working days, the
// logistics call the SAME working day, both on Law 2A's OFFICE calendar.
export {
  OFFICE_OFF_DAYS,
  ORDER_ACTION_DUES,
  orderActionDueDef,
  orderActionDueIso,
  orderActionOverdue,
  type OfficeHolidays,
  type OrderActionDueAnchor,
  type OrderActionDueDef,
} from "./order-action-due";

// T7 · Delivery queues + auto-overdue (each step carries its own deadline)
export {
  DELIVERY_QUEUES,
  DELIVERY_QUEUE_LABELS,
  deliveryQueueByKey,
  deliveryQueueForLabel,
  deliveryStepDueIso,
  deliveryStepOverdue,
  deliveryQueueLeads,
  type DeliveryQueueLeads,
  type DeliveryQueueDef,
  type DeliveryQueueKey,
  type DeliveryQueueAnchor,
} from "./delivery-queue";

// R1 · Receiving speaks Pending-delivery (never "Missing") + PO progress state
export {
  poReceivingProgress,
  poLineReportable,
  type PoReceivingLine,
  type PoReceivingProgress,
  type PoReceivingState,
} from "./po-receiving";

// R2 · A receiving issue auto-becomes a supplier claim (S1's words + one)
export {
  SUPPLIER_CLAIM_TYPES,
  SUPPLIER_CLAIM_TYPE_KEYS,
  SUPPLIER_CLAIM_LATE,
  SUPPLIER_CLAIM_STATUSES,
  supplierClaimTypeLabel,
  supplierClaimStatusLabel,
  supplierClaimSummary,
  wrongItemClaimTypesFor,
  isWrongItemClaimTypeFor,
  claimNeedsEvidence,
  receiveLineClaimProblems,
  RECEIVE_LINE_CLAIM_PROBLEM_TEXT,
  type SupplierClaimType,
  type SupplierClaimStatus,
  type SupplierClaimRow,
  type SupplierClaimPhoto,
  type ReceiveLineClaimDraft,
  type ReceiveLineClaimProblem,
  // R3 · the lifecycle — what we asked, what they answered, who moves next
  SUPPLIER_CLAIM_REQUESTS,
  SUPPLIER_CLAIM_REQUEST_KEYS,
  SUPPLIER_CLAIM_REQUEST_REMAINING,
  SUPPLIER_CLAIM_RESPONSES,
  SUPPLIER_CLAIM_RESPONSE_KEYS,
  SUPPLIER_CLAIM_CLOSE_PROBLEM_TEXT,
  supplierClaimRequestLabel,
  supplierClaimResponseLabel,
  requestedActionsFor,
  isRequestedActionFor,
  responseNeedsNote,
  claimNextMove,
  claimMoveOwnerLabel,
  claimCloseProblems,
  type SupplierClaimRequest,
  type SupplierClaimResponse,
  type SupplierClaimMove,
  type SupplierClaimMoveInput,
  type SupplierClaimMoveOwner,
  type SupplierClaimCloseProblem,
  // Layer ③ · what are we doing for the CUSTOMER (Loo, 2026-08-05 · 0324)
  CUSTOMER_RESOLUTIONS,
  CUSTOMER_RESOLUTION_KEYS,
  CUSTOMER_RESOLUTION_MEANING,
  customerResolutionLabel,
  customerResolutionMeaning,
  isCustomerResolution,
  type CustomerResolution,
} from "./supplier-claim";

// R6 · The warehouse files its own receiving — a queued call to R1's engine
export {
  WAREHOUSE_RECEIPT_STATUS_LABEL,
  WAREHOUSE_RECEIPT_PROBLEM_TEXT,
  WAREHOUSE_DO_NUMBER_MIN,
  warehouseReceiptStatusLabel,
  // C2 — the Receiving Record's derived document number.
  receivingRecordNo,
  warehouseReceiptProblems,
  warehouseReceiptProblemText,
  warehouseReceiptTotals,
  warehouseReceiptSummary,
  warehouseReceiptOpensClaims,
  countedOnLine,
  type WarehouseReceiptStatus,
  type WarehouseReceiptDraft,
  type WarehouseReceiptLineDraft,
  type WarehouseReceiptProblem,
  type WarehouseReceiptLine,
  type WarehouseReceiptRow,
  type WarehouseReceiptTotals,
  type WarehouseIncomingLine,
  type WarehouseIncomingPo,
  type WarehouseIncomingResponse,
} from "./warehouse-receipt";
export {
  warehouseSubmitReceiptInput,
  warehouseReceiptReturnInput,
  type WarehouseSubmitReceiptInput,
  type WarehouseReceiptReturnInput,
} from "./schemas/warehouse";

// R4 · Problem stock is quarantined — on hold · returned · written off
export {
  OPS_STOCK_STATUS_LABEL,
  SELLABLE_STOCK_STATUSES,
  HELD_STOCK_STATUS,
  RETURNED_STOCK_STATUS,
  WRITTEN_OFF_STOCK_STATUS,
  TERMINAL_STOCK_STATUSES,
  STOCK_HOLD_REASONS,
  STOCK_HOLD_REASON_KEYS,
  STOCK_HOLD_OUTCOMES,
  STOCK_HOLD_OUTCOME_KEYS,
  STOCK_HOLD_OUTCOME_STATUS,
  STOCK_HOLD_RESOLVE_PROBLEM_TEXT,
  opsStockStatusLabel,
  isHeldStockStatus,
  isSellableStockStatus,
  stockHoldReasonLabel,
  stockHoldOutcomeLabel,
  holdOutcomeNeedsNote,
  holdResolveProblems,
  heldUnitsLine,
  type StockHoldReason,
  type StockHoldOutcome,
  type StockHoldResolveProblem,
} from "./stock-hold";

// T8 · Delivery groups — bed set never splits; the sofa may take a second trip
export {
  DELIVERY_GROUPS,
  DELIVERY_GROUP_KEYS,
  deliveryGroupDef,
  deliveryGroupLabel,
  deliveryGroupOf,
  orderDeliveryGroups,
  deliveryScopeSentence,
  isUnknownGood,
  isOutsideTheTrip,
  unknownGoodsSkus,
  type DeliveryGroupDef,
  type DeliveryGroupKey,
} from "./delivery-groups";

// T9 · Logistic partner profiles (0283) — the carrier's own working days,
// blackout dates, daily capacity and notice period. These WARN, never block.
export {
  DEFAULT_PARTNER_DELIVERY_RULES,
  earliestPartnerDate,
  partnerBookingWarnings,
  partnerDeliveryRules,
  partnerRunsOn,
  type PartnerBookingCheckInput,
  type PartnerBookingWarning,
  type PartnerDeliveryRules,
  type PartnerWarningKey,
} from "./partner-delivery-rules";
export {
  partnerDeliveryRulesSchema,
  setPartnerDeliveryRulesInput,
  partnerBookingWarningSchema,
  partnerBookingCheckResponseSchema,
  type PartnerDeliveryRulesWire,
  type SetPartnerDeliveryRulesInput,
  type PartnerBookingWarningWire,
  type PartnerBookingCheckResponse,
} from "./schemas/delivery-partner-rules";

// T10 · Delivery calendar — the ONE rule that decides which day an order's
// truck sits on (the D1 booking, never the promised date), the three day
// ranges, and the carrier's load on a day (T9 rules). The ranges carry DAYS
// and no word: `dayWord` was deleted by the no-relative-dates ruling (owner,
// 2026-08-15) and a caller prints the actual weekday + date through `fmtDate`.
export {
  bookingDayOf,
  carrierDayLoads,
  carrierDayNote,
  daysInRange,
  deliveryRange,
  DELIVERY_RANGE_KEYS,
  inRange,
  shiftDays,
  type BookingDay,
  type BookingKind,
  type BookingRead,
  type CarrierDayLoad,
  type DayBooking,
  type DeliveryRange,
  type DeliveryRangeKey,
} from "./delivery-calendar";

// T11 · The delivery board's ORDER — delivery risk, not the order's overall
// slack. The Delivery module's ranking law (ACTION-FLOW Law 5, narrowed).
export {
  compareDeliveryRows,
  deliveryDueState,
  sortDeliveryRows,
  type DeliveryBoardRow,
  type DeliveryDueState,
} from "./delivery-board";

export {
  monthKeyMYT,
  grnDutyMonth,
  isPoDayMYT,
  poUrgentBypass,
  opsPoDutySchema,
  opsPoDutyResponseSchema,
  opsPoDutyRosterEntrySchema,
  nextPoDayMYT,
  type OpsPoDutyRosterEntry,
  updateOpsPoDutyInput,
  pickNextDutyHolder,
  canRaisePo,
  isPoDutyEditor,
  type OpsPoDuty,
  type OpsPoDutyResponse,
  type UpdateOpsPoDutyInput,
} from "./schemas/ops-po-duty";

// HR-P2 (0260) — permissions that follow the position, not the person.
// `isOpsManager` / `isPoDutyEditor` are re-exported above from their original
// modules so no existing importer had to change; everything genuinely new to
// duty keys is exported here.
export {
  DUTY_KEYS,
  isDutyKey,
  checkDuty,
  usedLegacyFallback,
  isOpsManagerRow,
  isStockPlanner,
  LEGACY_OPS_MANAGER_EMAILS,
  LEGACY_PO_DUTY_EDITOR_EMAILS,
  type DutyKey,
  type DutyHolderMap,
  type DutyGrant,
  type DutyGrantVia,
} from "./schemas/org-duties";

// HR-P4 (0269) — the employee master. `hr_employees` is an HR-private satellite
// of app_users / salespersons, NOT a second roster: identity is read through the
// join. `employment` (HR's record) and `access` (the real login switch) are kept
// as two separate concepts on purpose — see the module header.
export {
  employmentStatusSchema,
  EMPLOYMENT_STATUS_LABEL,
  employeeAccessSchema,
  EMPLOYEE_ACCESS_LABEL,
  ONBOARDING_CHECKLIST,
  OFFBOARDING_CHECKLIST,
  checklistKindSchema,
  checklistFor,
  hrPersonRowSchema,
  hrPeopleSourceSchema,
  hrEmployeeDetailSchema,
  hrEmployeePatchInput,
  hrRevealFieldInput,
  hrRecordExitInput,
  EXIT_REASON_LABEL,
  hrChecklistToggleInput,
  hrSetAccessInput,
  employmentTone,
  accessTone,
  needsExitRecorded,
  revocationShape,
  type EmploymentStatus,
  type EmployeeAccess,
  type ChecklistItem,
  type ChecklistKind,
  type HrPersonRow,
  type HrPeopleSource,
  type HrEmployeeDetail,
  type HrEmployeePatchInput,
  type HrRevealFieldInput,
  type HrRecordExitInput,
  type HrChecklistToggleInput,
  type HrSetAccessInput,
} from "./schemas/hr-people";

// HR-P5 (0272) — commission runs. Closing a month snapshots the engine's output into
// commission_run_lines; from then on the statement is READ from those rows and never
// recomputed (only staff_commission_rates is effective-dated, so a later model-rate
// edit would otherwise change what a closed month appears to say).
export {
  commissionRunStatusSchema,
  COMMISSION_RUN_STATUS_LABEL,
  isMonthLocked,
  runStatusTone,
  adjustmentReasonSchema,
  ADJUSTMENT_REASON_LABEL,
  READINESS_KEYS,
  commissionReadiness,
  canClose,
  blockingFailures,
  commissionRunLineSchema,
  commissionRunSummarySchema,
  commissionRunDetailSchema,
  commissionRunStateSchema,
  closeMonthInput,
  runActionInput,
  addAdjustmentInput,
  COMMISSION_CSV_COLUMNS,
  commissionRunCsv,
  type CommissionRunStatus,
  type AdjustmentReason,
  type ReadinessKey,
  type ReadinessCheck,
  type ReadinessInput,
  type CommissionRunLine,
  type CommissionRunSummary,
  type CommissionRunDetail,
  type CommissionRunState,
  type CloseMonthInput,
  type RunActionInput,
  type AddAdjustmentInput,
} from "./schemas/commission-runs";

// HR-P6 (0276) — targets + the scoreboard. Sold is computed from the month's
// attributed lines here, NOT read from commission_run_lines.basis: `basis` is
// percentage-method only, so a per-model store freezes it at 0 (the trap O1 hit
// with report.totalBasis). P6 shows no commission, so it cannot contradict a
// frozen statement.
export {
  kpiKeySchema,
  KPI_METRICS,
  DEFAULT_KPI,
  kpiMetric,
  kpiKeysForMigration,
  kpiScopeKindSchema,
  kpiTargetRowSchema,
  kpiPersonSchema,
  kpiStoreSchema,
  kpiManualActualSchema,
  kpiManagerCoverageSchema,
  kpiManagerCandidateSchema,
  kpiSourceSchema,
  monthEndExclusive,
  resolveKpiTargets,
  attainment,
  kpiState,
  kpiTone,
  computeScorecards,
  managerViewReady,
  setKpiTargetInput,
  setManualActualInput,
  setStoreManagerInput,
  type KpiKey,
  type KpiMetric,
  type KpiScopeKind,
  type KpiTargetRow,
  type KpiPerson,
  type KpiStore,
  type KpiManualActual,
  type KpiManagerCoverage,
  type KpiManagerCandidate,
  type KpiSource,
  type KpiState,
  type ScorecardRow,
  type DepartmentRow,
  type Scorecards,
  type ScorecardInput,
  type SetKpiTargetInput,
  type SetManualActualInput,
  type SetStoreManagerInput,
} from "./schemas/hr-kpi";

// HR-P7 (0278) — what the team costs. Loo's ruling "separate, don't merge" is
// STRUCTURAL here: PeopleCost carries fixedCost and commissionCost as two fields
// and deliberately has NO field that sums them (a shared test asserts that).
// Revenue is an INPUT obtained from computeScorecards, so the Performance tab,
// O1's SOLD tile and this page cannot quote three different numbers.
export {
  staffCompRowSchema,
  compPersonSchema,
  compStoreSchema,
  compCoverageSchema,
  staffCompSourceSchema,
  loadedCost,
  resolveStaffComp,
  monthInProgress,
  compGroupOf,
  computePeopleCost,
  setStaffCompInput,
  MANAGEMENT_GROUP,
  SHOWROOMS_GROUP,
  REVENUE_ABSENCE_LABEL,
  type StaffCompRow,
  type CompPerson,
  type CompStore,
  type CompCoverage,
  type StaffCompSource,
  type RevenueAbsence,
  type CompGroupRow,
  type CompStoreCostRow,
  type CompRegisterRow,
  type PeopleCost,
  type PeopleCostInput,
  type SetStaffCompInput,
} from "./schemas/hr-comp";

export {
  LOAN_SOURCES,
  LOAN_OUT_ROUTES,
  loanSofaInput,
  borrowLoanInput,
  updateLoanInput,
  returnLoanInput,
  returnToSupplierInput,
  sofaLoanSchema,
  sofaLoansResponseSchema,
  type LoanSource,
  type LoanOutRoute,
  type LoanSofaInput,
  type BorrowLoanInput,
  type UpdateLoanInput,
  type ReturnLoanInput,
  type ReturnToSupplierInput,
  type SofaLoanDto,
  type SofaLoansResponse,
} from "./schemas/sofa-loan";
export * from "./schemas/ops-cockpit";
// Sofa engine Phase 4 — build-line attrs schema + guard (server-recompute trust
// gate re-parses the build out of order_lines.attrs free jsonb before pricing).
export * from "./schemas/sofa-build";
// Order activity history (P1) — canonical event taxonomy + the customer /
// operation / management visibility rule shared by all three views.
export * from "./order-activity";

// Migration 0184 — order payment ledger (balance job foundation).
export {
  PAYMENT_METHODS,
  PAYMENT_KINDS,
  recordPaymentInputSchema,
  collectStorageInput,
  summarizePayments,
  // CARD 4 closing slice (0347) — the ONE "is this a valid payment?" predicate.
  // A voided row stays in the history and counts toward nothing.
  isLivePayment,
  // CARD 7 (0345) — the refund lifecycle: an approved, unpaid refund means
  // Carres still owes the customer.
  refundRequestInputSchema,
  refundDecideInputSchema,
  refundMarkPaidInputSchema,
  type RefundRequestInput,
  type RefundDecideInput,
  type RefundMarkPaidInput,
  type OrderRefundRow,
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

// 0178 — sofa compartment domain types (camelCased). Top-level alias so the API
// + web can `import type { SofaCompartment } from "@carres/shared"` without
// dipping into Domain.* (mirrors the CostSource alias above). The zod schemas + Dto
// types live in the schemas/catalog export block; the adapters are reached via
// Adapters.* like fabricTierConfigFromRow.
export type { SofaCompartment, ModelSofaCompartment } from "./domain";

// 0179 — sofa engine Phase 2: sofa combo domain type + the row→domain adapter +
// the canonical seat-height axis. `sofaComboFromRow` is also reachable via
// `Adapters.*` (like fabricTierConfigFromRow); the top-level alias mirrors the
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
  activeSofaSizes,
  gatedSofaHeights,
  gatedSofaSizes,
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
// `Adapters.*` like sofaComboFromRow.
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

// 0239 — bundle pricing: the PURE explode engine (`explodeBundle`, Σ-exact
// split shared by the POS cart add + the ERP editor preview) + the components
// parser. The row→domain adapter (`productBundleFromRow`) is surfaced
// top-level too (mirrors pwpRuleFromRow); the zod schemas + Dto/input types
// live in the schemas/catalog export block.
export {
  explodeBundle,
  parseBundleComponents,
  parseBundleSlots,
  type BundleComponent,
  type BundleSlot,
  type BundleVariantPolicy,
  type ExplodedBundleLine,
  type ExplodeBundleResult,
} from "./product-bundle";
export { productBundleFromRow } from "./adapters";
export type { ProductBundle } from "./domain";

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
export { phoneKey, phoneKeyMy, nameKey } from "./phone";
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
  // 0186 — sofa-as-PWP-reward: the merged charged map + the snapshot swap.
  comboChargedPrices,
  pwpSwappedCombos,
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

// Order-line classification + readiness (D1, 2026-07-26) — moved from
// apps/web/src/lib so the API booking gate and the drawer badge read ONE rule.
export {
  lineClass,
  lineCategory,
  lineSize,
  stockMatchKey,
  accShort,
  accessoryType,
  lineKind,
  lineSortRank,
  defaultLineLocation,
  type CoreCat,
  type LineClass,
  type ItemKind,
} from "./line-category";
export {
  lineReadiness,
  readinessCounts,
  type LineReadiness,
  type LineReadinessInput,
} from "./line-readiness";
export {
  CASE_REPORTERS,
  CASE_REPORTER_KEYS,
  CASE_PRODUCT_CATEGORIES,
  CASE_PRODUCT_CATEGORY_KEYS,
  CASE_ISSUES,
  CASE_ISSUE_KEYS,
  CASE_ISSUES_BY_CATEGORY,
  CASE_USABLE_OPTIONS,
  CASE_USABLE_KEYS,
  CASE_PRIORITIES,
  CASE_WANTS,
  CASE_WANT_KEYS,
  caseProductCategory,
  caseProductCategoryLabel,
  caseIssuesFor,
  caseIssueLabel,
  casePriorityFor,
  caseNeedsManager,
  caseUsableLabel,
  caseWantLabel,
  composeCaseSummary,
  caseIntakeComplete,
  type CaseOption,
  type CaseReporterKey,
  type CaseProductCategory,
  type CaseIssueKey,
  type CaseUsableKey,
  type CasePriority,
  type CaseUsableOption,
  type CaseWantKey,
  type CaseIntakeAnswers,
} from "./service-case-intake";
export {
  CASE_EVIDENCE_SLOTS,
  CASE_EVIDENCE_SLOT_KEYS,
  CASE_EVIDENCE_BY_ISSUE,
  CASE_EVIDENCE_BUCKET,
  CASE_EVIDENCE_MAX_BYTES,
  CASE_EVIDENCE_MIME_TYPES,
  CASE_EVIDENCE_PHOTO_MIME_TYPES,
  CASE_EVIDENCE_VIDEO_MIME_TYPES,
  caseEvidenceSlot,
  caseEvidenceSlotLabel,
  caseEvidenceChecklist,
  caseEvidenceGaps,
  caseEvidenceComplete,
  caseEvidenceGapMessage,
  caseEvidenceAccept,
  caseEvidenceMimeFits,
  caseEvidenceExtension,
  type CaseEvidenceKind,
  type CaseEvidenceSlotKey,
  type CaseEvidenceSlot,
  type CaseEvidenceRule,
  type CaseEvidenceRequirement,
  type CaseEvidenceFile,
  type CaseEvidenceGap,
  type CaseEvidenceMimeType,
} from "./service-case-evidence";
// S3 — the case drives the follow-ups. The chain is DERIVED from the intake
// answers; only its outcomes are stored (service_cases.progress, 0291).
export {
  CASE_STEP_ORDER,
  CASE_STEP_KEYS,
  caseFollowUpPlan,
  caseStepCatalogue,
  caseStepDefinition,
  caseStepEntry,
  caseStepDone,
  caseOpenSteps,
  caseNextStep,
  caseMayClose,
  caseCloseBlockerMessage,
  caseTimeline,
  type CaseStepKey,
  type CaseStep,
  type CaseFollowUpInput,
  type CaseProgressEntry,
  type CaseTimelineRow,
} from "./service-case-plan";
// S4 — the deadline. 14 WORKING days from the report, derived and never stored;
// only the calls and the one allowed extension are (service_cases.sla_events,
// 0298). No case silently passes day 14.
export {
  CASE_SLA_WORKING_DAYS,
  CASE_SLA_NOTICE_WORKING_DAY,
  CASE_SLA_NOTICE_DAYS_BEFORE,
  CASE_SLA_EXTENSION_MAX_WORKING_DAYS,
  CASE_SLA_NOTE_MAX,
  CASE_DELAY_REASONS,
  CASE_DELAY_REASON_LABEL,
  CASE_DELAY_REASON_RESPONSIBILITY,
  caseDelayNeedsNote,
  caseDelayReasonLabel,
  caseSlaBaseDue,
  caseSlaClock,
  caseSlaExtension,
  caseSlaExtensionMax,
  caseSlaWorkingDay,
  caseSlaAction,
  caseSlaCountLabel,
  caseSlaRecordProblem,
  type CaseDelayReason,
  type CaseDelayResponsibility,
  type CaseSlaEvent,
  type CaseSlaEventKind,
  type CaseSlaInput,
  type CaseSlaState,
  type CaseSlaClock,
  type CaseSlaRecordInput,
} from "./service-case-sla";
// S5 — the monthly numbers. NO migration and no new table: the day a case ended
// is the `customer_confirmed` entry S3's own close gate already demands, so the
// review layer reads the cases exactly as the card asked.
export {
  CASE_NUMBERS_MONTHS,
  CASE_NUMBERS_CATEGORIES,
  CASE_UNCLASSIFIED,
  CASE_UNCLASSIFIED_LABEL,
  CASE_SUPPLIER_UNKNOWN_LABEL,
  caseNumbersMonths,
  caseCategoryBucketLabel,
  caseIssueBucketLabel,
  caseFinishedOn,
  caseNumbersHeadline,
  computeCaseNumbers,
  type CaseCategoryBucket,
  type CaseNumbersCase,
  type CaseNumbersInput,
  type CaseNumbers,
  type CaseMonthRow,
  type CaseIssueRow,
  type CaseSupplierRow,
  type CaseCoverage,
  type CaseFinishReport,
  type CaseOnTimeReport,
  type CaseResponsibilityCounts,
} from "./service-case-numbers";
export {
  orderMoney,
  type OrderMoneyInput,
  type OrderMoney,
} from "./order-money";
export {
  storageHold,
  type StorageHoldInput,
  type StorageHold,
} from "./storage-hold";
export {
  bookingConfirmGate,
  isSundayIso,
  type BookingGateInput,
  type BookingGateResult,
  type BookingGroupState,
} from "./booking-gate";
// C7 · The delivery order — the HARD gate (§5), asked out of the booking gate's
// own goods + money answers so the two surfaces cannot disagree.
export {
  deliveryOrderIssueGate,
  type DeliveryOrderIssueInput,
  type DeliveryOrderIssueResult,
} from "./delivery-order";
export {
  isWorkingDay,
  addWorkingDays,
  subtractWorkingDays,
  countWorkingDays,
  DEFAULT_OFF_DAYS,
  type IsoDate,
  type WorkingDayOptions,
} from "./working-days";
export {
  MY_HOLIDAYS_2026,
  MY_HOLIDAYS_2027_EARLY,
  myHolidaySet,
  type Holiday,
} from "./my-holidays";
export {
  computeNetRequirements,
  type DemandLine,
  type NetRequirementsSupply,
  type NetRequirementsOptions,
  type UrgencyBucket,
  type DemandLineResult,
  type SkuRequirement,
  type BundleRequirement,
  type NetRequirementsResult,
} from "./net-requirements";
// To Order — the Planning Workspace projection (2026-07-30).
export {
  TO_ORDER_WORDS,
  TO_ORDER_CATEGORIES,
  ISSUE_BATCH_MAX,
  // P15 — the Source a typed demand carries, mirroring the database's own list.
  DEMAND_PURPOSES,
  DEMAND_PURPOSE_DEFAULT,
  DEMAND_PURPOSE_VALUES,
  isDemandPurpose,
  type DemandPurpose,
  type DemandPickItem,
  buildToOrder,
  categoryLabel,
  countItems,
  countOrders,
  defaultDocuments,
  composeSummary,
  isOnePoPerOrder,
  isToOrderCategory,
  issuedHeadline,
  itemsCount,
  moveToTarget,
  pickSpecToken,
  ordersHeadline,
  pcsCount,
  planFromDocuments,
  planPurchaseOrders,
  poIndexLabel,
  poShortLabel,
  productionDaysLabel,
  purchaseOrderCount,
  railItemLabel,
  sizeShort,
  soCountLabel,
  selectedShort,
  issuePosShort,
  toOrderBuilds,
  posCreatedLine,
  validateIssuePlan,
  sortToOrderRows,
  unresolvedHeadline,
  unitsHeadline,
  categoryUnitsLine,
  freeStockLine,
  onPoLine,
  reserveFromStockLabel,
  reservedFromStockLabel,
  stockExpandLabel,
  readyStockRef,
  proceedWaitedDays,
  readyStockDrawNote,
  READY_STOCK_DRAW_REASON,
  unitLabel,
  poScheduleDays,
  snapToPoDay,
  poScheduleBucket,
  weekdayName,
  type PoScheduleBucket,
  type ToOrderOrderedRow,
  type BuildToOrderInput,
  type IssueDocument,
  type IssuePlanCheck,
  type IssuePlanError,
  type PoToCreate,
  type ToOrderBuildRef,
  type ToOrderBuild,
  type ToOrderLine,
  type ToOrderProposal,
  type ToOrderRow,
  type ToOrderSortKey,
  type ToOrderSupplier,
} from "./to-order";
export {
  IMPORT_ACCESSORY_KINDS,
  IMPORT_LEAD_DAYS_DEFAULT,
  importAccessoryKind,
  computeReorderRows,
  reorderAlertCount,
  reorderUnsetCount,
  type ImportAccessoryKind,
  type ReorderStockUnit,
  type ReorderPointConfig,
  type ReorderState,
  type ReorderStockRow,
} from "./reorder-alert";
// Ready Stock K2 (0287) — the monthly propose → consolidate → approve lane.
// The coverage rules are load-bearing, not cosmetic: see the file header for
// the live measurement that made them necessary.
export {
  MIN_HISTORY_DAYS_FOR_SUGGESTION,
  MIN_HISTORY_DAYS_FOR_BASELINE,
  OVER_SUGGESTION_MULTIPLE,
  SALES_WINDOW_DAYS,
  PLAN_STATUSES,
  PLAN_STATUS_LABEL,
  salesCoverage,
  computePlanView,
  planPoList,
  pendingConsolidation,
  planAcceptsProposals,
  planAcceptsConsolidation,
  planAwaitsDecision,
  isWeekendDate,
  daysBetween,
  aggregateStockUnits,
  type PlanSalesLine,
  type PlanStockUnit,
  type PlanProposal,
  type PlanLine,
  type PlanSkuStats,
  type PlanView,
  type PlanPoLine,
  type PlanStatus,
  type SalesCoverage,
} from "./ready-stock-plan";
// Ready Stock K3 (0290) — the urgent lane. A SEPARATE table and a separate
// engine on purpose: the card's "never mixes into the monthly plan's numbers"
// is structural here, not a filter somebody has to remember (see the header).
export {
  EMERGENCY_REASONS,
  EMERGENCY_REASON_LABEL,
  EMERGENCY_STATUSES,
  EMERGENCY_STATUS_LABEL,
  EMERGENCY_MAX_QTY,
  EMERGENCY_NOTE_MAX,
  reasonNeedsNote,
  emergencyDraftProblem,
  computeEmergencyView,
  emergencyPoList,
  type EmergencyReason,
  type EmergencyStatus,
  type EmergencyDraft,
  type EmergencyRequest,
  type EmergencyRow,
  type EmergencyPoLine,
  type EmergencyView,
} from "./emergency-stock-request";
// Ready Stock K4 (0292) — why the shared pool drained, and how low it may go.
// The reason lives in a DATED LEDGER, not on the unit: `ops_stock_items.
// reserve_reason` (0213) is overwritten on re-draw, carries no date and leaves
// the question entirely once the unit is sold. See the module header.
export {
  POOL_USE_REASONS,
  POOL_USE_REASON_LABEL,
  POOL_USE_NOTE_MAX,
  RESERVE_LEVEL_MAX,
  poolUseNeedsNote,
  poolDrawProblem,
  computeReserveLevelRows,
  reserveLevelWarning,
  summarisePoolUsage,
  type PoolUseReason,
  type PoolDraw,
  type ReserveLevelState,
  type ReserveLevelConfig,
  type ReserveLevelRow,
  type ReserveLevelWarning,
  type PoolUsageEntry,
  type UsageReasonSlice,
  type UsageSkuSlice,
  type PoolUsageSummary,
} from "./pool-usage";
// Ready Stock K5 — the review layer. NO migration: it reads the two numbers K1
// and K4 already ask the COO for and K2's own cycles, adds no third number and
// writes nothing. Its coverage gates are load-bearing, not cosmetic: live prod
// keeps 7 days of real sales records, so the naive build of this card flags all
// 49 warehouse SKUs as dead stock. See the module header.
export {
  OVER_STOCK_MULTIPLE,
  SLOW_MOVING_WINDOWS,
  STOCK_HEALTH_STATES,
  STOCK_HEALTH_LABEL,
  ACCURACY_WITHHELD_LABEL,
  computeStockHealthRows,
  stockHealthCounts,
  stockHealthHeadline,
  computeSlowMovers,
  computePlanAccuracy,
  type StockHealthState,
  type StockHealthRow,
  type StockHealthCounts,
  type SlowMovingWindow,
  type SlowMover,
  type SlowMovingWindowResult,
  type SlowMovingReport,
  type AccuracyPlanInput,
  type AccuracyRow,
  type AccuracyWithheld,
  type MonthAccuracy,
} from "./stock-health";
// R5 · the supplier scorecard — the review layer of the receiving & claim line.
// NO migration: it reads R1's three numbers on a PO line, R2/R3's claims and
// R4's quarantine, and stores nothing. Its withholding gates are load-bearing,
// not cosmetic: live prod holds 10 suppliers and ZERO purchase orders, so the
// naive build of this card opens every negotiation with a percentage nobody
// earned. See the module header.
export {
  MIN_JUDGED_POS,
  SCORECARD_UNKNOWN_TEXT,
  poVerdict,
  computeSupplierScorecard,
  scorecardHeadline,
  type ScorecardPo,
  type ScorecardLine,
  type ScorecardClaim,
  type ScorecardRate,
  type ScorecardUnknownReason,
  type ScorecardCoverage,
  type ScorecardClaimStats,
  type SupplierScorecard,
  type PoVerdict,
} from "./supplier-scorecard";
export {
  purchaseUrgencyBucketSchema,
  purchaseBundleItemSchema,
  purchaseBundleSchema,
  purchaseSkuLineSchema,
  purchasePlaceForOrderSchema,
  purchasePlaceGroupLineSchema,
  purchasePlaceGroupSchema,
  purchaseSummarySchema,
  purchaseTodayResponseSchema,
  purchasePoItemSchema,
  purchaseLinkedOrderSchema,
  purchaseChaseSchema,
  purchaseReceiveSchema,
  buildPurchaseTodayReport,
  buildPurchaseChaseReceive,
  PURCHASE_CHASE_STATUSES,
  PURCHASE_RECEIVE_STATUSES,
  type PurchaseUrgencyBucket,
  type PurchaseBundleItem,
  type PurchaseBundle,
  type PurchaseSkuLine,
  type PurchasePlaceForOrder,
  type PurchasePlaceGroupLine,
  type PurchasePlaceGroup,
  type PurchaseSummary,
  type PurchaseTodayResponse,
  type PurchasePoItem,
  type PurchaseLinkedOrder,
  type PurchaseChase,
  type PurchaseReceive,
  type PurchasePoInput,
  type PurchaseChaseReceiveOptions,
} from "./purchase-report";

// Q3 · Purchasing → Report — the "look at the numbers" layer. Pure, stores
// nothing, computes at read time, and carries NO money field at all so nothing
// downstream can print one. Q4's dashboard imports this rather than counting
// again (a figure computed twice is two answers).
export {
  PO_REPORT_WORDS,
  buildPoReport,
  poReportCategoryLabel,
  poReportEmpty,
  poReportRowDetail,
  type PoReportPo,
  type PoReport,
  type PoReportFacet,
  type PoReportFacetOption,
  type PoReportFilters,
  type PoReportLine,
  type PoReportResponse,
  type PoReportRow,
} from "./po-report";

// Canonical MY mattress/bedframe size table — the short code (SKU suffix) ↔ full
// name (the SIZE shown). Size auto-generation resolves through this so the code
// stays `-K` while the SIZE reads `King` (never the raw `K`).
export {
  CANONICAL_SIZES,
  canonicalSize,
  sizeName,
  type CanonicalSize,
} from "./mattress-sizes";

// Auto-generated SKU descriptions (Loo 2026-07-20): mattress/bedframe
// `{Category} {Model name} {dimensions}` (size-pool lookup) + sofa compartment
// `Sofa {Model} {code}`. Accessory/service stay manual.
export {
  autoBedSkuDescription,
  sofaSkuDescription,
  type SizePoolDimensions,
} from "./sku-description";

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
  parseMoneyCell,
  parseMoneyLoose,
  masterRecordToStockRow,
  masterRecordToOrderRow,
  masterRecordToStorageFee,
  aggregateStorageFeesByRef,
  masterRecordToBalance,
  aggregateBalancesByRef,
  matchStockRows,
  stockEtaImportRowSchema,
  storageFeeImportRowSchema,
  balanceImportRowSchema,
  stockEtaImportInput,
  type LineStockStatus,
  type StockEtaImportRow,
  type StockRowResult,
  type OrderRowResult,
  type StorageFeeImportRow,
  type StorageFeeRowResult,
  type StorageFeeImportRowParsed,
  type BalancePayStatus,
  type BalanceImportRow,
  type BalanceRowResult,
  type BalanceImportRowParsed,
  type OrderLineRef,
  type StockEtaMatch,
  type StockMatchOutcome,
  type StockEtaImportRowParsed,
  type StockEtaImportInput,
  type StockEtaImportResult,
} from "./stock-eta-import";

// Master append — "sheet has it, portal doesn't" reconcile (Option A,
// 2026-07-18): pure missing-line detector + zod shared by the Master-import
// result screen and POST /api/operation/orders/append-missing-lines.
export {
  normalizeRefTokens,
  detectMissingLines,
  masterAppendRowSchema,
  appendMissingLinesInput,
  type MasterAppendRow,
  type MasterAppendRowParsed,
  type AppendOrderRef,
  type MissingLineCandidate,
  type AppendMissingLinesInput,
  type AppendMissingLinesResult,
} from "./master-append";

// On Hand C+ P3 — parse the "Klg Warehouse" ready-stock sheet into
// ops_stock_items import rows (shared by the ImportStockDialog preview + the
// /api/ops/stock/import endpoint).
export {
  normalizeStockCondition,
  warehouseSheetRecordToImportRow,
  stockUnitKey,
  reconcileStockImport,
  opsStockImportRowSchema,
  opsStockImportInputSchema,
  type OpsStockImportRow,
  type OpsStockImportInput,
  type StockUnitKeyParts,
  type StockImportReconcileResult,
} from "./ops-stock-import";

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
  reflowCellsForDepth,
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

// Customer-facing sofa spec copy from exploded lines (Loo 2026-07-19) — one
// implementation for the POS receipt/detail regroup + the Sales Order PDF.
export { sofaBuildSpec, type SofaSpecLine } from "./sofa-spec";

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

// Stripe online collection — POS checkout links (QR / WhatsApp) + webhook
// auto-record (2026-07-14). See supabase/migrations/0223_stripe_checkout.sql.
export {
  createStripeCheckoutInputSchema,
  STRIPE_SESSION_STATUSES,
  type CreateStripeCheckoutInput,
  type StripeSessionStatus,
  type StripeCheckoutSessionInfo,
} from "./schemas/stripe-checkout";

// Staff PIN login (0233) — tiers, PIN, staff session token, palette.
// See docs/superpowers/plans/2026-07-18-staff-pin-login-plan.md.
export * from "./schemas/staff";

// Store-account self-service (0240) — dealer-principal password/email change.
export * from "./schemas/account";

// Guarantee packages (0261-0263) — the 6th SKU category, its terms config and
// the entitlement ledger ops claims against. Expiry is DERIVED
// (effectiveGuaranteeStatus), never a stored state.
export * from "./schemas/guarantee";

// Dealer vs Showroom — the naming rule for our own stores vs external
// resellers, and for their branches (showroom vs outlet).
export * from "./store-kind";

// Printable-document numbering (loan note / receipt / DO / invoice) — the ONE
// scheme: PREFIX-DDMMYY-NNNN, tail derived per-order (never a counter).
export { docNumber, docTail, amendmentSuffix, type DocNumberInput } from "./doc-number";

// `Jump to…` — the ONE global navigate-only command surface (ui/MASTER,
// APPROVED / LOCKED 2026-08-11). The PURE half: how a typed query is read, and
// the shape of a document result. Shared so the Worker's lookup and the
// browser's surface cannot disagree about the locked result contract.
export {
  JUMP_DOC_TYPES,
  JUMP_DOC_LABEL,
  parseJumpQuery,
  numericPrefixRanges,
  grnDateFromQuery,
  rankJumpDocuments,
  type JumpDocType,
  type JumpDocumentResult,
  type JumpSearchResponse,
  type ParsedJumpQuery,
} from "./jump-to";

// Rental + Service Plan base (0247-0249) — customers, service packages, rental
// plans, agreements/billings, the rented-asset registry + the service
// entitlement/visit engine. The PURE plan math (visit cadence + contract value
// + the Σ-exact monthly split) lives in ./rental; the row→domain adapters +
// camelCase domain types are surfaced top-level (mirrors pwpRuleFromRow /
// productBundleFromRow); the zod input schemas live in schemas/rental.
export {
  serviceVisitsTotal,
  serviceVisitIntervalMonths,
  rentalContractValue,
  rentalMonthlySplit,
  type RentalMonthlySplit,
  // 0281 landed the arithmetic and fired it nowhere; 0300 gave it a caller.
  // The SQL mirror `rental_late_interest()` asserts the same worked examples.
  rentalLateInterest,
  RENTAL_LATE_INTEREST_PCT_PER_MONTH,
  // 0264 — the offer layer: service SKU codes + the pick → money resolver
  // (shared by the P&M previews, the POS lanes and the signing recompute).
  serviceSkuCode,
  resolveRentalPick,
  quoteRental,
  compartmentBuildMonthly,
  mergeRentalGifts,
  // 0267 — the agreement wording: tokens, fill and paste-to-blocks.
  agreementTokens,
  fillAgreement,
  blocksFromText,
  type RentalPick,
  type RentalChargeLine,
  type RentalQuote,
  type RentalQuoteInput,
} from "./rental";
export {
  customerFromRow,
  servicePackageFromRow,
  rentalPlanFromRow,
  rentalOfferFromRow,
  rentalBuyPriceFromRow,
  rentalOfferServiceFromRow,
  rentalAgreementTemplateFromRow,
  posRentalPlanFromRow,
  rentalAgreementFromRow,
  rentalBillingFromRow,
  rentalStockUnitFromRow,
  serviceEntitlementFromRow,
  serviceVisitFromRow,
  rentalUnitEventFromRow,
} from "./adapters";
export type {
  Customer,
  ServicePackage,
  RentalPlan,
  RentalOffer,
  RentalBuyPrice,
  RentalOfferService,
  RentalAgreementTemplate,
  AgreementBlock,
  RentalOfferCategory,
  RentalPricingMode,
  RentalServiceFreeLane,
  RentalOptionValue,
  RentalFabricSeries,
  RentalOptionGroup,
  RentalSurcharge,
  RentalGift,
  PosRentalPlan,
  RentalAgreement,
  RentalBilling,
  RentalStockUnit,
  ServiceEntitlement,
  ServiceVisit,
  RentalUnitEvent,
  ServicePackageType,
  RentalAgreementStatus,
  RentalBillingStatus,
  RentalUnitStatus,
  ServiceEntitlementStatus,
  ServiceVisitStatus,
} from "./domain";
export * from "./schemas/rental";

// 0244/0245 — HR commission portal: the PURE month calculator (percentage w/
// manager override + per-model volume tiers + milestones) shared by the Hono
// report route and any web preview. Config comes from the 0245 tables via
// hr_commission_source.
export {
  computeCommission,
  resolveMethod,
  resolveRate,
  type CommissionMethod,
  type CommissionStaff,
  type CommissionLine,
  type CommissionSchemeRow,
  type StaffRateRow,
  type ModelRateRow,
  type ModelTierRow,
  type MilestoneRow,
  type CommissionConfig,
  type OverrideDetail,
  type PerModelDetail,
  type MilestoneHit,
  type StaffCommissionResult,
  type CommissionReport,
  // 0250/0251 — BD commission (paid by what their dealers sell; two methods
  // + executive/CBO positions).
  computeBdCommission,
  rowProgram,
  type CommissionProgram,
  type BdPosition,
  type BdDealerLine,
  type BdCommissionInput,
  type BdUser,
  type BdDealer,
  type DealerOrderAgg,
  type BdRateRow,
  type BdPortfolioRow,
  type BdCommissionResult,
  type BdCommissionReport,
} from "./commission";
export {
  commissionMethodSchema,
  hrReportQuerySchema,
  setCommissionSchemeInput,
  setStaffRateInput,
  setModelRateInput,
  setModelTiersInput,
  setMilestonesInput,
  setBdRateInput,
  assignDealerBdInput,
  commissionProgramSchema,
  setBdMethodInput,
  setBdPositionInput,
  type SetBdRateInput,
  type AssignDealerBdInput,
  type SetBdMethodInput,
  type SetBdPositionInput,
  type CommissionMethodValue,
  type HrReportQuery,
  type SetCommissionSchemeInput,
  type SetStaffRateInput,
  type SetModelRateInput,
  type SetModelTiersInput,
  type SetMilestonesInput,
} from "./schemas/hr";
export * from "./schemas/hr-team";
export * from "./sales-order-classification";
export * from "./sales-order-commitment";
// ONE FIELD CONTRACT — the choices the Sales Portal offers and the emergency
// contact's three-fields-⇄-one-column codec, shared with the object page so the
// two surfaces cannot drift (owner ruling 2026-08-15).
export * from "./sales-order-form";
// CARD 2 — unit/stock allocation truth: the one arithmetic for "which real
// Units are reserved/sold to this SO, and what is still unallocated".
export * from "./sales-order-allocation";
// CARD 3 — the booking brief: what Operations puts on the T−3 customer call
// (promised deadline · latest Stock ETA · expected scope · what is / is not
// expected in), and the three separate truths kept apart.
export * from "./booking-brief";
// CARD 4 — the collection clock: T−3 · T−2 · T−1 (final deadline) on working
// days before the delivery, one arithmetic for every surface that presses.
export * from "./collection-clock";
// CARD 5 — delivery attempts: every vehicle run leaves a record; a failure is
// ONE exception (Reason Library + where the goods are), units move with reality.
export * from "./schemas/delivery-attempt";
// CARD 8 — derived completion: Goods + Money(both directions) + Loan clear
// = No Action Required. Never a stored status, never a button.
export * from "./sales-order-completion";
// CARD 9 — the unified work engine: the five-part rule registry (Trigger ·
// Owner · Action · Due · Completion fact) + WHO/ACTION/working-day composition.
export * from "./work-engine";
