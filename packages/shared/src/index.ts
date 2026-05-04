export const SHARED_VERSION = "0.0.0" as const;

// Sub-path imports also work, e.g.:
//   import type { DealerRow } from "@carres/shared/db-types";
//   import { dealerFromRow }   from "@carres/shared/adapters";
//   import { loginSchema }     from "@carres/shared/schemas/auth";

export * as DB       from "./db-types";
export * as Domain   from "./domain";
export * as Adapters from "./adapters";

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
  assignPartnerInput,
  attachDoInput,
  receivePoLineInput,
  adjustStockInput,
  abandonOrderInput,
  createPoInput,
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
  type AssignPartnerInput,
  type AttachDoInput,
  type ReceivePoLineInput,
  type AdjustStockInput,
  type AbandonOrderInput,
  type CreatePoInput,
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
} from "./schemas/logistics";
