/**
 * camelCase domain types — UI code uses these. Adapters in `adapters.ts`
 * convert from snake_case DB rows to these.
 */

import type { CostSource, OperationStage } from "./db-types";
import type { FabricTier } from "./fabric-tier";
import type { DefaultFreeGift } from "./free-gift";
import type { FreeItemCampaign } from "./free-item-campaign";
import type { RuleTarget } from "./rule-target";

// Re-exported so UI code can write `import type { CostSource } from
// "@carres/shared/domain"` alongside the rest of the camelCase surface.
// The enum labels themselves are 1:1 with DB (snake-cased like the other DB
// enums consumed in domain types — see Order.status, PartnerStage, etc.).
export type { CostSource };

// 0176 — fabric tier type re-exported for UI consumption.
export type { FabricTier };

// 0185 — Free Item Campaign is the camelCase domain shape (single source of
// truth in free-item-campaign.ts); re-exported here so UI code can reach it via
// `Domain.FreeItemCampaign` alongside the rest of the camelCase surface.
export type { FreeItemCampaign };

export type Role =
  | "principal" | "dealer" | "salesperson" | "showroom"
  | "operation" | "supplier" | "partner" | "finance" | "bd";

export interface Dealer {
  id: string;
  name: string;
  region: string | null;
  contact: string | null;
  joinedDate: string | null;
  status: "active" | "suspended" | "pending";
  creditLimit: number;
  paymentTerms: string | null;
  depositBalance: number;
  channel: string;
}

export interface Outlet {
  id: string;
  dealerId: string;
  name: string;
  address: string;
}

export interface Salesperson {
  id: string;
  dealerId: string;
  outletId: string | null;
  name: string;
  phone: string | null;
  userId: string | null;
}

export interface ProductModel {
  id: string;
  category: "mattress" | "bedframe" | "sofa" | "accessory" | "service"; // 0169
  modelKey: string;
  name: string;
  blurb: string | null;
  colors: string[] | null;
  gaps: string[] | null;
  sofaMode: "preset" | "custom" | "both" | null;
  // 0074 — soft-delete flag for the catalog admin UI (Loo 2026-05-09).
  discontinuedAt?: string | null;
  // 0171 — model photo (public URL) + generate-skus option pool.
  photoUrl?: string | null;
  allowedOptions?: Record<string, string[] | undefined>;
}

export interface ProductSku {
  id: string;
  modelId: string;
  sku: string;
  variant: string;
  variantKind: "size" | "preset" | "part";
  price: number;
  // 0074 — fixed procurement cost per unit; auto-fills onto every Create-PO
  // line. Null = not yet set (Create-PO refuses lines whose SKU has null cost).
  cost: number | null;
  // 2026-05-17 (Loo A→Z test bug A) — SKU-level supplier ownership. The DB
  // column has been NOT NULL since migration 0074; surfacing it on the DTO
  // lets CreatePOModal route lines to the right supplier group directly
  // instead of parsing a `category:model:variant` prefix from the SKU string
  // (the proto-era convention that's no longer how SKUs are formatted).
  supplierId: string | null;
  discontinuedAt?: string | null;
  // 0170 — sell-side ON/OFF (Modular toggle, DISTINCT from discontinuedAt) +
  // editable sell-side description.
  posActive?: boolean;
  description?: string | null;
  // 0178 (sofa engine Phase 1) — additive, nullable link to a sofa_compartments
  // type. NULL for every existing SKU; only future generated compartment SKUs
  // carry it.
  compartmentId?: string | null;
  // 0186 (PWP Phase 8a) — principal-only per-SKU PWP reward price (the price a
  // PWP-rule reward line is sold at). null = not set (mirrors cost). DORMANT.
  pwpPrice?: number | null;
}

export interface SofaFabric {
  id: string;
  modelId: string;
  fabricName: string;
  surcharge: number;
  // 0075 — fabric color options (Loo 2026-05-09). Mirrors bedframe
  // product_models.colors[] pattern.
  colors: string[] | null;
  discontinuedAt?: string | null;
  // 0176 — price tier. PRICE_1 = base (no delta), PRICE_2/3 = mid/premium.
  tier: FabricTier;
}

/**
 * Global fabric tier config singleton (migration 0176). Sourced from the
 * `fabric_tier_addon_config` table (id=1). Deltas are in RM and always >= 0.
 */
export interface FabricTierConfig {
  sofaTier2Delta: number;
  sofaTier3Delta: number;
}

/**
 * Per-model fabric tier delta override (migration 0176). Keyed by model UUID.
 * Nullable deltas mean "inherit from global config" — 0 is a valid set value.
 */
export interface ModelFabricTierOverride {
  modelId: string;
  tier2Delta: number | null;
  tier3Delta: number | null;
}

export interface Addon {
  key: string;
  name: string;
  price: number;
  active: boolean;
  // 0172 — links the add-on to a real Service-category SKU (bare SVC- code).
  serviceSku?: string | null;
}

/**
 * Special Add-on (migration 0181) — a per-model SELLING surcharge with optional
 * one-level follow-up question groups. `sellingPrice` + a chosen choice's `extra`
 * may be NEGATIVE (a deduction). Attached per-model via allowed_options.specials;
 * folds into the line unitPrice (no separate SKU).
 */
export interface SpecialAddonOptionGroup {
  label: string;
  required: boolean;
  choices: { label: string; extra: number }[];
}
export interface SpecialAddon {
  id: string;
  code: string;
  label: string;
  soDescription: string;
  categories: string[];
  sellingPrice: number;
  cost: number | null;
  optionGroups: SpecialAddonOptionGroup[];
  active: boolean;
  sortOrder: number;
}

/**
 * A principal-curated global option pool entry (migration 0182, 2990s Products
 * parity Phase 4). `pool` discriminates which pool the entry belongs to;
 * `value` is the canonical code, `label` + `dimensions` enrich the size pools
 * (null for supplier_category). Read-only reference list — these do NOT drive
 * any order-side behaviour (sizes stay per-model in allowedOptions; supplier
 * scope stays in suppliers.cat_covered).
 */
export type CatalogOptionPoolName =
  | "supplier_category"
  | "bedframe_size"
  | "mattress_size"
  | "divan_height"
  | "total_height"
  | "gap"
  | "bedframe_leg_height"
  | "sofa_size"
  | "sofa_leg_height";
export interface CatalogOptionPool {
  id: string;
  pool: CatalogOptionPoolName;
  value: string;
  label: string | null;
  dimensions: string | null;
  /** 0201 — RM selling surcharge for priced pools; null renders as "—". */
  surcharge: number | null;
  active: boolean;
  sortOrder: number;
}

/**
 * 0202 — one global procurement fabric (2990s fabric_trackings port). Read-only
 * reference list; no order-side consumer (the SELLING fabric path stays
 * per-model sofaFabrics + the 0176 tier deltas). `series` is the free-text
 * collection name the "+ Add series" chip edits.
 */
export interface CatalogFabric {
  id: string;
  fabricCode: string;
  series: string | null;
  description: string | null;
  supplierCode: string | null;
  sofaTier: FabricTier;
  bedframeTier: FabricTier;
  active: boolean;
  sortOrder: number;
}

/**
 * 0202 — one section='fabrics' catalog_config_history row: the snapshot a
 * fabric-master Edit-save writes (fabric-shaped entries; same lightweight
 * effective-from-save-date model as the pool history).
 */
export interface CatalogFabricsHistory {
  id: string;
  entries: {
    fabricCode: string;
    series: string | null;
    description: string | null;
    supplierCode: string | null;
    sofaTier: FabricTier;
    bedframeTier: FabricTier;
    active: boolean;
    sortOrder: number;
  }[];
  effectiveFrom: string;
  notes: string | null;
  createdAt: string;
}

/**
 * 0201 — one catalog_config_history row: the lightweight append-only snapshot
 * a pool Edit-save writes (effective_from = the save date; no future-dating).
 */
export interface CatalogConfigHistory {
  id: string;
  // 0202 widened the DB CHECK with 'fabrics' — the POOL history adapter can
  // technically see it, though the fabrics log is read via its own endpoint
  // + CatalogFabricsHistory shape.
  section: CatalogOptionPoolName | "fabrics";
  entries: {
    value: string;
    label: string | null;
    dimensions: string | null;
    surcharge: number | null;
    active: boolean;
    sortOrder: number;
  }[];
  effectiveFrom: string;
  notes: string | null;
  createdAt: string;
}

/**
 * One component SKU inside a combo (migration 0177). `qty` = how many of this
 * SKU the bundle contains; `sortOrder` drives the deterministic explode order
 * (the last component absorbs the rounding residue in explodeCombo).
 */
export interface ComboComponent {
  sku: string;
  qty: number;
  sortOrder: number;
}

/**
 * A fixed-set combo / bundle (套餐, migration 0177) sold at one `comboPrice`.
 * `comboFromRow` maps the `combos` row; `components` is attached by the caller
 * (the API assembles the nested `combo_components` rows, the same way other
 * nested domain objects are composed).
 */
export interface Combo {
  id: string;
  comboKey: string;
  name: string;
  comboPrice: number;
  // 0183 — principal-only cost benchmark companion to comboPrice; null = unset.
  cost: number | null;
  active: boolean;
  effectiveFrom: string;
  components: ComboComponent[];
}

/**
 * A sofa compartment type from the principal-owned pool (migration 0178, sofa
 * engine Phase 1). `defaultPrice` is the pool RM price; a model may override it
 * per compartment via `ModelSofaCompartment`. `code` is the stable unique key.
 */
export interface SofaCompartment {
  id: string;
  code: string;
  description: string | null;
  seatCount: number | null;
  armConfig: string | null;
  iconUrl: string | null;
  defaultPrice: number;
  sortOrder: number;
  active: boolean;
}

/**
 * A per-model offered compartment (migration 0178). Row present = the model
 * offers this compartment.
 *
 * PRICE SOURCE (Loo, 2026-07-05): the authoritative à-la-carte price is the
 * synced compartment SKU's `product_skus.price` (`{MODEL_KEY}-{code}`, set in
 * SKU Master). `skuPrice` carries that price — joined in by the catalog bundle
 * / server recompute, NOT a DB column on `model_sofa_compartments`. The legacy
 * `priceOverride` → pool `defaultPrice` chain remains only as a fallback for
 * rows whose synced SKU is missing (pre-cutover data).
 */
export interface ModelSofaCompartment {
  modelId: string;
  compartmentId: string;
  priceOverride: number | null;
  sortOrder: number;
  /** The synced `{MODEL_KEY}-{code}` SKU's price (SKU Master). Enriched by the
   *  bundle/recompute; absent/null = no synced sku → legacy fallback. */
  skuPrice?: number | null;
}

/**
 * A sofa combo (migration 0179, sofa engine Phase 2). A base model + an ordered
 * list of `slots` (each slot an OR-set of compartment `code` strings) priced per
 * seat height in `pricesByHeight` (height-string → RM | null; a null/absent key
 * = the combo does not apply at that height). `tier` null = applies to any
 * fabric tier. Principal-owned; soft-deleted via active/discontinuedAt.
 */
export interface SofaCombo {
  id: string;
  modelId: string;
  slots: string[][];
  tier: FabricTier | null;
  pricesByHeight: Record<string, number | null>;
  // 0183 — principal-only per-seat-height cost benchmark (same shape as
  // pricesByHeight); null = unset. Benchmark only, never in the selling compute.
  costByHeight: Record<string, number | null> | null;
  // 0186 — principal-only per-seat-height PWP reward price (same shape as
  // pricesByHeight); null = unset. DORMANT — no order consumer yet.
  pwpPricesByHeight: Record<string, number | null> | null;
  label: string | null;
  effectiveFrom: string;
  active: boolean;
  discontinuedAt: string | null;
}

export interface FloorConfig {
  id: number;
  freeUpToFloor: number;
  perFloorPerItem: number;
}

/**
 * `delivery_fee_config` singleton (migration 0184, 2990s Products parity Phase
 * 6). The delivery TRIP fee — distinct from the floor STAIR surcharge in
 * `FloorConfig` (both coexist + fold into the order total). `baseFee` is charged
 * once per order that contains ≥1 charged-category line; `crossCategoryFee` is
 * added once when an order mixes sofa with mattress/bedframe; `chargedCategories`
 * is which product categories incur the base fee (principal-selected). The lead
 * days are surfaced for principal editing (Carres's current lead-time rule).
 * Dormant by default: seeds `baseFee=0`/`crossCategoryFee=0` → byte-identical
 * totals until the principal sets rates. (The singleton `id` is dropped — the
 * domain shape doubles as the pure `computeDeliveryFee` config.)
 */
export interface DeliveryFeeConfig {
  baseFee: number;
  crossCategoryFee: number;
  chargedCategories: string[];
  mattressBedframeLeadDays: number;
  sofaLeadDays: number;
}

/**
 * One `special_delivery_fee_rules` row (migration 0184). A per-RuleTarget
 * override of the base delivery fee. `target` is a RuleTarget[] (scopes
 * model/variant/combo/compartment) — a matched line's `standaloneFee` supersedes
 * the config `baseFee` (highest wins, folded by `computeDeliveryFee`);
 * `crossCategoryFollowupFee` is the reduced rate when THIS order is a
 * cross-category follow-up linked to the customer's earlier SO. Principal-owned.
 */
export interface SpecialDeliveryFeeRule {
  id: string;
  target: RuleTarget[];
  standaloneFee: number;
  crossCategoryFollowupFee: number;
  label: string | null;
  active: boolean;
  sortOrder: number;
}

/**
 * A model's configured default free gift set (migration 0185, 2990s Products
 * parity Phase 7). `modelDefaultFreeGiftsFromRow` maps the
 * `model_default_free_gifts` row; `gifts` is parsed (malformed entries dropped)
 * via `parseDefaultFreeGifts`. When a model has no row (or an empty `gifts`) it
 * triggers no gift — the feature is DORMANT until the principal authors gifts.
 */
export interface ModelDefaultFreeGifts {
  modelId: string;
  gifts: DefaultFreeGift[];
}

/**
 * One `pwp_rules` row (migration 0186, 2990s Products parity Phase 8a). The
 * camelCase row shape: a trigger category/scope → reward category/scope @
 * `qtyPerTrigger`. `pwpRuleFromRow` maps it; `triggerTargets` / `rewardTargets`
 * are parsed (malformed entries dropped) via `parseRuleTargets`. The reward PRICE
 * is NOT here — it lives on product_skus.pwpPrice / sofa_combo_pricing
 * .pwpPricesByHeight. The pure engine (`resolvePwp`) consumes the
 * `{type, triggerCategory, triggerTargets, rewardCategory, rewardTargets,
 * qtyPerTrigger}` subset (the engine's `PwpRule` in pwp.ts); this domain row adds
 * the `id` + `active` columns. DORMANT — no order consumer in P8a.
 *
 * P8d (0188) adds `carryForward` (default true — an unclaimed RESERVED voucher
 * minted by this rule carries forward to the customer's next order instead of
 * being deleted) + `carryForwardDays` (optional expiry window, null = perpetual).
 */
export interface PwpRule {
  id: string;
  type: "pwp" | "promo";
  triggerCategory: string;
  triggerTargets: RuleTarget[];
  rewardCategory: string;
  rewardTargets: RuleTarget[];
  qtyPerTrigger: number;
  active: boolean;
  // ── P8d (0188) cross-order carry-forward policy ──
  carryForward: boolean;
  carryForwardDays: number | null;
}

/**
 * One `pwp_codes` row (migration 0187, 2990s Products parity Phase 8c). The
 * camelCase voucher-ledger shape: a reserved/claimed PWP voucher slot. P8c was
 * SAME-CART; P8d (0188) turns ON the cross-order carry-forward. `pwpCodeFromRow`
 * maps it; `rewardTargets` is parsed (malformed entries dropped) via
 * `parseRuleTargets`. `status` RESERVED → USED (same-cart) | RESERVED → AVAILABLE
 * → USED (cross-order). `claimGroup` is the per-order correlation uuid threaded
 * onto BOTH the code and the order line's `attrs.pwp.claimGroup`. An AVAILABLE
 * carry-forward voucher binds to `boundCustomerPhone` (the canonical phone key) +
 * `ownerDealerId` + optional `expiresAt`. `customerId` (uuid) stays permanently
 * unused (the binding uses `boundCustomerPhone`). DORMANT — no codes minted until
 * the principal authors active pwp_rules.
 */
export interface PwpCode {
  code: string;
  ruleId: string | null;
  type: "pwp" | "promo";
  rewardCategory: string;
  rewardTargets: RuleTarget[];
  status: "RESERVED" | "USED" | "AVAILABLE";
  ownerStaffId: string | null;
  cartLineKey: string | null;
  triggerItemCode: string | null;
  claimGroup: string | null;
  redeemedOrderId: string | null;
  redeemedItemSku: string | null;
  // ── P8d cross-order columns ──
  sourceOrderId: string | null;
  customerId: string | null;
  // ── P8d (0188) cross-order carry-forward binding ──
  // NOTE: pwpCodeFromRow (which maps boundCustomerPhone) is OWNER-scoped use only;
  // cross-order discovery uses the stripped PwpDiscover shape so a non-owner never
  // sees the bound phone.
  boundCustomerPhone: string | null;
  ownerDealerId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * The camelCase shape of a `pwp_discover_available` row (migration 0188, P8d
 * cross-order DISCOVERY). The STRIPPED projection — NO bound phone / owner /
 * trigger sku / customer id. The phone match is computed server-side
 * (`phoneMatches`), so the stored phone is never returned. `pwpDiscoverFromRow`
 * maps it; the POS auto-suggest + manual-entry affordance render from this shape.
 */
export interface PwpDiscover {
  code: string;
  ruleId: string | null;
  type: "pwp" | "promo";
  rewardCategory: string;
  rewardTargets: RuleTarget[];
  sourceOrderId: string | null;
  expiresAt: string | null;
  phoneMatches: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  address: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string | null;
  leadTime: string | null;
  kind: "own_logistics" | "factory_pickup";
  catCovered: string[];
  // Stable slug (migration 0032, v3-S4) — NOT NULL post-migration. Seeded as
  // 'hookka' / 'nice-future'; used by SUPPLIER_SOP routing in sops.ts.
  slug: string;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  contact: string | null;
  zones: string | null;
  onboardedDate: string | null;
  rateCard: Record<string, { base: number; perFloorWalkUp: number; perKm: number }> | null;
}

export interface PartnerFleet {
  id: string;
  partnerId: string;
  plate: string;
  vehicleType: string;
  capacity: string | null;
  driverName: string | null;
  driverPhone: string | null;
}

export interface StockBalance {
  sku: string;
  warehouseId: string;
  qty: number;
  // Reserved-against-pending-orders count (migration 0018). Phase 4 M5
  // warehouse + drawer views need it to compute available = qty - reserved.
  reserved: number;
}

export interface StockMovement {
  id: string;
  sku: string;
  warehouseId: string;
  qty: number;
  kind: "in" | "out" | "adjust";
  ref: string | null;
  note: string | null;
  byRole: Role | null;
  occurredAt: string;
}

export interface OrderLine {
  id: string;
  orderId: string;
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
  unitPrice: number;
}

/**
 * Order addon (e.g. disposal services). `attrs` is a free-form jsonb added
 * by migration 0133 — currently used for disposal size tag, e.g.
 * `{ size: "King" }` / `{ size: "2-seater" }`. Optional so old fixtures
 * still compile.
 */
export interface OrderAddon {
  id: string;
  orderId: string;
  addonKey: string;
  qty: number;
  unitPrice: number;
  attrs?: Record<string, unknown> | null;
}

export interface OrderHistory {
  id: string;
  orderId: string;
  text: string;
  byRole: Role | null;
  occurredAt: string;
}

export interface Order {
  id: string;
  so: number;
  status: "place" | "proceed_order" | "delivered" | "cancelled";
  channel: string;
  dealerId: string;
  outletId: string | null;
  salespersonId: string | null;

  customer: {
    name: string;
    phone: string | null;
    address: string | null;
    addressUnknown: boolean;
    billing: string | null;
    billingSame: boolean;
    emergency: string | null;
    /** 0200 — POS-parity demographics (POS-required, server-lenient). */
    email: string | null;
    race: string | null;
    gender: string | null;
    birthday: string | null;
  };

  delivery: {
    date: string | null;
    /** Phase 11.1 — salesperson-entered planned production-start ("Proceed")
     *  date. Pairs with `date` via `dateTbd` (both-or-neither). <= `date`. */
    proceedDate: string | null;
    dateTbd: boolean;
    floor: number;
    hasLift: boolean;
    /** Count of items the dealer marked as needing stair-carry. NULL = dealer
     *  left it auto, callers fall back to sum(line.qty) for backward compat. */
    stairItems: number | null;
  };

  paid: number;
  signatureUrl: string | null;
  paymentSlipUrl: string | null;
  termsAccepted: boolean;
  paymentMethod: "online" | "credit" | "installment" | null;
  approvalCode: string | null;
  installmentMonths: 6 | 12 | null;

  // v3-S3 (migration 0028) added `in_production` + `waiting`.
  // Phase 4.5a (2026-05-05): legacy `awaiting_stock` value fully removed —
  // T5 swept FE/tests, T6 (migration 0040) dropped it from the DB enum.
  // operation_stage now matches this union 1:1.
  operationStage:
    | "placed" | "confirmed"
    | "in_production"
    | "ready_to_dispatch" | "dispatched"
    | "waiting" | "delivered"
    | null;
  // 0132 origin marker — 'autocount' for imported legacy rows (null = native).
  sourceSystem: string | null;
  warehouseId: string | null;
  deliveryPartnerId: string | null;
  partnerStage: "assigned" | "picked_from_wh" | "en_route" | "delivered" | null;
  partnerPickedAt: string | null;
  partnerEta: string | null;
  doNumber: string | null;
  doNote: string | null;
  // operation timestamps (migration 0019). dispatchedAt set on D1 step 1;
  // deliveredAt set on D1 step 2 (DO attach + sign).
  dispatchedAt: string | null;
  deliveredAt: string | null;

  invoiceNo: string | null;
  invoicedAt: string | null;

  placedAt: string;

  lines?: OrderLine[];
  addons?: OrderAddon[];
  history?: OrderHistory[];
}

/**
 * camelCase mirror of `OrderSupplierThreadRow` (migration 0033, v3-S4). One row
 * per (order, supplier, category). Drives the v3 operation pipeline so each
 * fulfillment slice of an order has its own SOP-driven kanban presence.
 *
 * `sopName` mirrors `SopName` from `sops.ts` ('STANDARD' | 'SOFA_SPECIAL').
 * `history` is a jsonb append log defaulting to `[]`.
 */
export interface OrderSupplierThread {
  id: string;
  orderId: string;
  supplierId: string;
  category: string;
  sopName: "STANDARD" | "SOFA_SPECIAL";
  // Mirrors `OrderSupplierThreadRow.operation_stage` which is non-null
  // (migration 0033 line 51 declares the column NOT NULL). Reuses the named
  // `operationStage` type from db-types.ts so FE and DB stay 1:1 if the enum
  // changes.
  operationStage: OperationStage;
  poId: string | null;
  warehouseId: string | null;
  reservedAt: string | null;
  deliveredAt: string | null;
  // Phase 4.5 Chunk 2 customer-leg LP fields (migration 0049). Per-leg split
  // per Chunk 2 design spec §3 (CQ1 = option (b)): customer-leg LP +
  // RFD/accept/reject timestamps live on the thread, while the procurement-leg
  // LP lives on `purchase_orders.procurement_partner_id` (renamed from
  // `delivery_partner_id` in Sprint C migration 0052). Mirrors
  // `OrderSupplierThreadRow` snake_case fields 1:1.
  deliveryPartnerId: string | null;
  confirmDeliveryDate: string | null;
  requestForDeliveryAt: string | null;
  partnerAcceptedAt: string | null;
  partnerRejectedAt: string | null;
  // Supplier per-thread pickup feature (migration 0107). Mirrors snake_case
  // `OrderSupplierThreadRow.supplier_ready_at` / `_by` / `pickup_event_id` 1:1.
  supplierReadyAt: string | null;
  supplierReadyBy: string | null;
  pickupEventId: string | null;
  history: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrder {
  id: string;
  so: number | null;
  // Cross-order bundle backrefs (migration 0017). See PurchaseOrderRow comment.
  soRefs: number[] | null;
  supplierId: string;
  warehouseId: string;
  // Single-sku/qty columns dropped in 0017 — lines live in purchase_order_lines.
  status: "open" | "received" | "cancelled";
  // v3-S3 (migration 0030) added 6 values for the Ohana Sofa flow.
  // Phase 4.5 Chunk 1 (migration 0043) appended `at_warehouse_waiting` for the
  // Sofa Reject + Relocate + Receive flow; mirrors DB.POSupStatus.
  supStatus:
    | "pending" | "acknowledged" | "in_production"
    | "shipped" | "delivered"
    | "ready_for_pickup" | "pickup_assigned" | "pickup_accepted" | "picked_up" | "reassign_needed"
    | "ready_confirm_sent" | "partner_confirmed" | "customer_rejected"
    | "relocated" | "at_partner_wh" | "at_own_wh_waiting"
    | "at_warehouse_waiting";
  // Procurement-leg LP — renamed from `deliveryPartnerId` in Phase 4.5 Chunk 2
  // Sprint C migration 0052. Customer-leg LP now lives on
  // `OrderSupplierThread.deliveryPartnerId` (per-leg split). Mirrors
  // `PurchaseOrderRow.procurement_partner_id`.
  procurementPartnerId: string | null;
  expectedReadyDate: string | null;
  pickupDate: string | null;
  etaDate: string | null;
  payStatus: "unpaid" | "scheduled" | "paid";
  placedAt: string;
  // Optionally hydrated by detail handlers via PostgREST nested fetch.
  lines?: PurchaseOrderLine[];
}

/**
 * Child rows of a PO (migration 0017). Phase 4.5 Chunk 2 Sprint E migration
 * 0055 added `cost` + `costSource` — both nullable because legacy rows have
 * no historical cost recorded (CQ3 backfill NULL).
 */
export interface PurchaseOrderLine {
  poId: string;
  sku: string;
  qty: number;
  receivedQty: number;
  // Migration 0055. numeric(14,2) → number passthrough; null on legacy rows.
  cost: number | null;
  // Migration 0055. Mirrors `PurchaseOrderLineRow.cost_source` 1:1.
  costSource: CostSource | null;
}

export interface Payment {
  id: string;
  direction: "in" | "out";
  amount: number;
  method:
    | "cash" | "bank_transfer" | "cheque" | "credit_card"
    | "debit_card" | "duitnow_qr" | "dealer_deposit";
  reference: string | null;
  note: string | null;
  paidAt: string;
  orderId: string | null;
  poId: string | null;
  refundId: string | null;
  receiptUrl: string | null;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  orderId: string;
  amount: number;
  taxAmount: number;
  issuedAt: string;
  voidedAt: string | null;
  pdfUrl: string | null;
}

export interface Refund {
  id: string;
  orderId: string;
  dealerId: string | null;
  amount: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected" | "paid";
  approvalId: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  creditNoteNo: string | null;
}

export interface Approval {
  id: string;
  kind: "refund" | "discount" | "new_dealer" | "top_up" | "price_change" | "other";
  title: string;
  actor: string | null;
  refersTo: string | null;
  amount: number | null;
  dealerId: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  status: "pending" | "approved" | "rejected";
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  role: Role | null;
  actorText: string | null;
  action: string;
  dealerId: string | null;
  ref: string | null;
  occurredAt: string;
}

export interface Inquiry {
  id: string;
  kind: "new_dealer" | "expansion" | "product";
  company: string;
  region: string | null;
  contact: string | null;
  stage: "new" | "contacted" | "qualified" | "converted" | "lost";
  ownerUserId: string | null;
  note: string | null;
  linkedDealerId: string | null;
  createdAt: string;
}

/**
 * Supplier per-thread pickup feature (migration 0107). Urgency is a derived
 * UI badge for `ThreadReadinessRow`, ranked by customer delivery date proximity:
 *   - critical  → delivery date is past or within 3 days
 *   - urgent    → 4-7 days out
 *   - normal    → 8+ days, null, or unset
 */
export type Urgency = "critical" | "urgent" | "normal";

/**
 * camelCase mirror of `PoPickupEventsRow` (migration 0107). One row per
 * physical DO paper / one trip. Created when a partner or operation user
 * batch-picks one or more ready threads off a PO; the new event id is then
 * stamped onto every collected thread (`OrderSupplierThread.pickupEventId`).
 *
 * `ackRole` records which side recorded the pickup — partner (factory_pickup
 * supplier) or operation (own_logistics supplier delivers to HQ warehouse).
 */
export type PickupEvent = {
  id: string;
  poId: string;
  doNumber: string;
  doFilePath: string | null;
  doNote: string | null;
  pickedUpAt: string;
  pickedUpBy: string | null;
  ackRole: "partner" | "operation";
  createdAt: string;
};

/**
 * Hydrated row shape for the per-thread readiness UI (supplier "Ready" tab +
 * partner pickup batch screen + operation receive-threads screen). Joins
 * `order_supplier_threads` with parent order customer fields + the optional
 * pickup event DO number.
 *
 * `skuLines` lists the per-thread SKU breakdown so users can verify the
 * physical goods match what they're acknowledging. Sourced from the threaded
 * subset of `order_lines` filtered by `(order_id, category)`.
 */
export type ThreadReadinessRow = {
  threadId: string;
  orderId: string;
  orderDl: number;
  customerName: string;
  customerDeliveryDate: string | null;
  supplierReadyAt: string | null;
  pickupEventId: string | null;
  pickupDoNumber: string | null;
  skuLines: Array<{ sku: string; qty: number }>;
};
