export const SHARED_VERSION = "0.0.0" as const;

// Sub-path imports also work, e.g.:
//   import type { DealerRow } from "@carres/shared/db-types";
//   import { dealerFromRow }   from "@carres/shared/adapters";
//   import { loginSchema }     from "@carres/shared/schemas/auth";

export * as DB       from "./db-types";
export * as Domain   from "./domain";
export * as Adapters from "./adapters";

// Phase 4.5 Chunk 2 Sprint E migration 0055 (T25). Top-level type re-export
// so consumers can `import type { CostSource } from "@carres/shared"` without
// having to dip into the DB.* namespace. Mirrors how Role + LogisticsStage are
// implicitly available via DB.* — but CostSource is referenced widely enough
// (CreatePoInput line shape, CogsLineEditor T28, recent-cost RPC T27) to
// warrant the top-level alias.
export type { CostSource } from "./db-types";

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
  type LogisticsStageV3,
  type SopName,
  type SopDef,
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
  salespersonSchema,
  salespersonsListResponseSchema,
  productCategorySchema,
  variantKindSchema,
  type CatalogResponse,
  type ProductModelDto,
  type ProductSkuDto,
  type SofaFabricDto,
  type AddonDto,
  type FloorConfigDto,
  type OutletDto,
  type OutletsListResponse,
  type SalespersonDto,
  type SalespersonsListResponse,
  type ProductCategory,
  type VariantKind,
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
  type InviteDealerInput,
  type SetDealerStatusInput,
} from "./schemas/principal-dealers";

export {
  createLpAccountSchema,
  type CreateLpAccountInput,
} from "./schemas/lp-account";

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
  listLogisticsOrdersQuery,
  listPurchaseOrdersQuery,
  cancelPoInput,
  listMovementsQuery,
  confirmProceedRequestInputSchema,
  transferReadyInputSchema,
  reservedDrilldownQuery,
  reservedDrilldownResponse,
  awaitingStockShortageResponse,
  partnerAcceptRfdInput,
  partnerRejectRfdInput,
  dispatchCustomerLegInput,
  resumeDispatchInput,
  setThresholdInput,
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
  type ListLogisticsOrdersQuery,
  type ListPurchaseOrdersQuery,
  type CancelPoInput,
  type ListMovementsQuery,
  type ConfirmProceedRequestInput,
  type TransferReadyInput,
  type ReservedDrilldownQuery,
  type ReservedDrilldownResponse,
  type AwaitingStockShortageResponse,
  type PartnerAcceptRfdInput,
  type PartnerRejectRfdInput,
  type DispatchCustomerLegInput,
  type ResumeDispatchInput,
  type SetThresholdInput,
} from "./schemas/logistics";
