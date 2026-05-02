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
  type Order,
  type OrderLine,
  type OrderAddon,
  type OrderHistory,
  type OrderStatus,
  type OrdersListResponse,
  type DealerSelf,
} from "./schemas/orders";

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
