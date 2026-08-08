/**
 * Order-line classification — MOVED to packages/shared (D1, 2026-07-26) so the
 * API's booking-confirm gate can ask the same goods-ready question the drawer
 * badge shows (no second engine — the HR-P5 lesson). This shim keeps every
 * existing `@/lib/line-category` import working; the one copy lives in
 * packages/shared/src/line-category.ts.
 */
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
  STOCK_LOCATIONS,
  type CoreCat,
  type LineClass,
  type ItemKind,
} from "@carres/shared";
