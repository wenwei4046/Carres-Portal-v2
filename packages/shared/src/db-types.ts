/**
 * Database row types — match Postgres schema in supabase/migrations/0001_init.sql.
 * These are snake_case (Postgres convention). Use the camelCase domain types in
 * `domain.ts` for UI code.
 */
import type { DefaultFreeGift } from "./free-gift";
import type { RuleTarget } from "./rule-target";

export type Role =
  | "principal" | "dealer" | "salesperson" | "showroom"
  | "operation" | "supplier" | "partner" | "finance" | "bd";

export type OrderStatus       = "place" | "proceed_order" | "delivered" | "cancelled";
// `in_production` and `waiting` added in migration 0028 (v3-S3).
// Phase 4.5a T5 (2026-05-05): legacy `awaiting_stock` alias removed from FE
// vocabulary in lockstep with migrations 0038/0038b/0039 (RPC body sweep).
// Phase 4.5a T6 (2026-05-05): migration 0040 dropped `awaiting_stock` from the
// DB-side enum via DROP TYPE … CASCADE recreate. DB and FE vocabularies are
// now back in sync. Tuple matches Supabase-generated types verbatim.
export type OperationStage    =
  | "placed" | "confirmed"
  | "in_production"
  | "ready_to_dispatch" | "dispatched"
  | "waiting" | "delivered";
export type PartnerStage      = "assigned" | "picked_from_wh" | "en_route" | "delivered";
export type POStatus          = "open" | "received" | "cancelled";
// 6 new values appended in migration 0030 (v3-S3) for the Ohana Sofa flow:
// ready_confirm -> partner confirm -> (customer_rejected -> relocated)? ->
// at_partner_wh | at_own_wh_waiting.
// Phase 4.5 Chunk 1 (migration 0043): `at_warehouse_waiting` appended for the
// Sofa Reject + Relocate + Receive flow. The earlier v3 value `at_own_wh_waiting`
// stays in the enum (deprecated) — cleanup deferred per carry-forward
// `phase-4.5-cleanup-at-own-wh-waiting-rename`.
export type POSupStatus       =
  | "pending" | "acknowledged" | "in_production"
  | "shipped" | "delivered"
  | "ready_for_pickup" | "pickup_assigned" | "pickup_accepted" | "picked_up" | "reassign_needed"
  | "ready_confirm_sent" | "partner_confirmed" | "customer_rejected"
  | "relocated" | "at_partner_wh" | "at_own_wh_waiting"
  | "at_warehouse_waiting";
export type POPayStatus       = "unpaid" | "scheduled" | "paid";
export type PaymentMethod     =
  | "cash" | "bank_transfer" | "cheque" | "credit_card"
  | "debit_card" | "duitnow_qr" | "dealer_deposit";
export type PaymentDir        = "in" | "out";
export type RefundStatus      = "pending" | "approved" | "rejected" | "paid";
export type ApprovalKind      = "refund" | "discount" | "new_dealer" | "top_up" | "price_change" | "other";
export type ApprovalStatus    = "pending" | "approved" | "rejected";
export type InquiryKind       = "new_dealer" | "expansion" | "product";
export type InquiryStage      = "new" | "contacted" | "qualified" | "converted" | "lost";
export type ProductCategory   = "mattress" | "bedframe" | "sofa" | "accessory" | "service"; // 0169
export type VariantKind       = "size" | "preset" | "part";
export type StockMovementKind = "in" | "out" | "adjust";
// Migration 0027 (v3-S3). 'own' = HQ-controlled warehouse (default for legacy
// rows). 'operation_partner' = partner-owned WH; pairs with owning_partner_id
// on warehouses (CHECK constraint warehouses_partner_kind_check).
export type WarehouseKind     = "own" | "operation_partner";
// Phase 4.5 Chunk 2 Sprint E migration 0055 (T24). Enum labels matching
// `cost_source_enum` in DB. Drives `purchase_order_lines.cost_source`:
//   - 'hand_entered'      operation user typed the cost manually.
//   - 'prev_po'           auto-filled from the most-recent received PO for the
//                         same SKU (operation_recent_po_cost RPC, T27).
//   - 'system_suggested'  heuristic suggestion (e.g. 110% of prev_po).
//   - 'auto_issued'       sentinel for system-issued PO lines from
//                         operation_issue_pos_for_order when no historical cost
//                         existed (migration 0057 — T42 codex C1 fix). When a
//                         recent received-PO cost IS found, the auto-issue RPC
//                         persists 'prev_po' instead. 'auto_issued' rows always
//                         have cost = NULL and surface for Finance reconciliation.
// Both `cost` + `cost_source` are NULLABLE on the row (legacy rows pre-0055
// have no historical cost recorded — CQ3: backfill NULL, do not invent). New
// PO creates enforce non-NULL via zod (T25) + RPC validation (T26). The
// auto-issue path predates that gate and uses 'auto_issued' instead.
// 0074 added 'catalog' (Loo 2026-05-09): Create-PO auto-stamps every line
// with cost_source='catalog' since cost auto-reads from product_skus.cost.
// The other 4 values stay live for legacy + auto-issue paths.
export type CostSource        = "hand_entered" | "prev_po" | "system_suggested" | "auto_issued" | "catalog";

// T42-C1 — narrower form-state variant excluding the server-only `auto_issued`
// label. The auto-issue path predates the Sprint E (T25) manual-create gating
// and emits `auto_issued` to mark cost values inferred at PO-issue time.
export type ManualCostSource  = Exclude<CostSource, "auto_issued">;

export interface DealerRow {
  id: string;
  name: string;
  region: string | null;
  contact: string | null;
  joined_date: string | null;
  status: "active" | "suspended" | "pending";
  credit_limit: number;
  payment_terms: string | null;
  deposit_balance: number;
  channel: string;
  created_at: string;
  updated_at: string;
}

export interface OutletRow {
  id: string;
  dealer_id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface SalespersonRow {
  id: string;
  dealer_id: string;
  outlet_id: string | null;
  name: string;
  phone: string | null;
  user_id: string | null;
  created_at: string;
}

export interface ProductModelRow {
  id: string;
  category: ProductCategory;
  model_key: string;
  name: string;
  blurb: string | null;
  colors: string[] | null;
  gaps: string[] | null;
  sofa_mode: "preset" | "custom" | "both" | null;
  discontinued_at: string | null;
  // 0171 — model photo (public URL) + generate-skus option pool.
  photo_url: string | null;
  allowed_options: Record<string, string[] | undefined>;
}

export interface ProductSkuRow {
  id: string;
  model_id: string;
  sku: string;
  variant: string;
  variant_kind: VariantKind;
  price: number;
  // Added in migration 0026 (v3-S3). FK to suppliers; NOT NULL after seed
  // populates it (staging/prod), but stays nullable in fresh-dev until the
  // follow-up tightening migration runs (carry-forward
  // phase-4-v3-skus-supplier-id-not-null-tighten).
  supplier_id: string | null;
  // 0074 — fixed procurement cost per unit. NULL = "not yet set" (Create-PO
  // refuses lines whose SKU has cost=null until operation sets a value via
  // the catalog admin UI).
  cost: number | null;
  // 0074 — soft-delete flag for the catalog admin UI.
  discontinued_at: string | null;
  // 0170 — sell-side ON/OFF (DISTINCT from discontinued_at) + editable description.
  pos_active: boolean;
  description: string | null;
  // 0178 (sofa engine Phase 1) — additive, nullable FK to sofa_compartments.
  // Only future generated compartment SKUs set it; links a compartment SKU to
  // its pool type. NULL for every existing (non-compartment) SKU.
  compartment_id: string | null;
  // 0186 (PWP Phase 8a) — principal-only per-SKU PWP reward price. NULL = "no
  // PWP price set" (mirrors `cost`). Economic field; the 0175 trigger is
  // extended to lock it to the principal. DORMANT — no order consumer yet.
  pwp_price: number | null;
}

export interface SofaFabricRow {
  id: string;
  model_id: string;
  fabric_name: string;
  surcharge: number;
  // 0075 — list of available colors for this fabric (Loo 2026-05-09).
  // NULL means "no colors configured yet"; the catalog admin fills via
  // comma-separated input. Mirrors product_models.colors[] on bedframe.
  colors: string[] | null;
  // 0074 — soft-delete flag for the catalog admin UI.
  discontinued_at: string | null;
  // 0176 — price tier (PRICE_1|PRICE_2|PRICE_3). DEFAULT 'PRICE_1' in DB;
  // the adapter falls back to 'PRICE_1' if absent for safety.
  tier: string;
}

/**
 * `fabric_tier_addon_config` (migration 0176). Singleton row (id=1) that holds
 * the global tier price delta for mid and premium sofa fabrics. `updated_at` +
 * `updated_by` track who last changed the config in the Catalog admin UI.
 */
export interface FabricTierAddonConfigRow {
  id: number;
  sofa_tier2_delta: number;
  sofa_tier3_delta: number;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `model_fabric_tier_overrides` (migration 0176). Optional per-model tier delta
 * override keyed by `model_id` (PK). `tier2_delta` / `tier3_delta` are nullable —
 * NULL means "inherit from global config"; 0 means "explicitly no premium".
 */
export interface ModelFabricTierOverrideRow {
  model_id: string;
  tier2_delta: number | null;
  tier3_delta: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AddonRow {
  key: string;
  name: string;
  price: number;
  active: boolean;
  // 0172 — links the add-on to a real Service-category SKU (bare SVC- code).
  service_sku: string | null;
}

/** `special_addons` (migration 0181). Per-model selling surcharge + one-level
 *  follow-up question groups (jsonb). selling_price/extra may be negative. */
export interface SpecialAddonRow {
  id: string;
  code: string;
  label: string;
  so_description: string;
  categories: string[];
  selling_price: number;
  cost: number | null;
  option_groups: { label: string; required: boolean; choices: { label: string; extra: number }[] }[];
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/** `catalog_option_pools` (migration 0182, 2990s Products parity Phase 4). One
 *  GENERIC table for the principal-curated Maintenance pools, discriminated by
 *  `pool`. `value` is the canonical code (unique within its pool); `label` +
 *  `dimensions` are populated for the size pools only (null for
 *  supplier_category). Read-only reference list — no order-side consumer. */
export interface CatalogOptionPoolRow {
  id: string;
  pool:
    | "supplier_category"
    | "bedframe_size"
    | "mattress_size"
    | "divan_height"
    | "total_height"
    | "gap"
    | "bedframe_leg_height"
    | "sofa_size"
    | "sofa_leg_height";
  value: string;
  label: string | null;
  dimensions: string | null;
  /** 0201 — RM selling surcharge (numeric arrives as number|string). */
  surcharge: number | string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/** `catalog_config_history` (migration 0201). Lightweight append-only snapshot
 *  log for the option pools — one row per pool Edit-save; `snapshot` holds the
 *  FULL pool contents at save time (camelCase entries). */
export interface CatalogConfigHistoryRow {
  id: string;
  section: CatalogOptionPoolRow["pool"];
  snapshot: unknown;
  effective_from: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

/**
 * `combos` (migration 0177). A fixed-set bundle (套餐) sold at one
 * `combo_price`. Components live in `combo_components`. `combo_key` is the
 * stable kebab-case identifier; `active` + `discontinued_at` mirror the
 * sell-side ON/OFF + soft-delete convention used elsewhere in the catalog.
 */
export interface ComboRow {
  id: string;
  combo_key: string;
  name: string;
  combo_price: number;
  // 0183 — principal-only cost benchmark (RM) companion to combo_price.
  // null = unset. Benchmark only — never charged, no order/finance/PO consumer.
  cost: number | null;
  active: boolean;
  effective_from: string;
  discontinued_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `combo_components` (migration 0177). One component SKU of a combo. `qty` is
 * how many of that SKU the combo bundles; `sort_order` drives the deterministic
 * order explodeCombo() uses (last component absorbs the rounding residue).
 */
export interface ComboComponentRow {
  combo_id: string;
  sku: string;
  qty: number;
  sort_order: number;
}

/**
 * `sofa_compartments` (migration 0178, sofa engine Phase 1). The principal-owned
 * compartment pool / type catalog — every sofa segment type (e.g. `1A(LHF)`,
 * `1NA`, `2A(RHF)`) with a description + default price. A model declares which
 * of these it offers via `model_sofa_compartments`. `default_price` is the pool
 * RM price; a per-model `price_override` may supersede it. `code` is unique.
 */
export interface SofaCompartmentRow {
  id: string;
  code: string;
  description: string | null;
  seat_count: number | null;
  arm_config: string | null;
  icon_url: string | null;
  default_price: number;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `model_sofa_compartments` (migration 0178). One row = the model offers this
 * compartment. PK is (model_id, compartment_id). `price_override` NULL means
 * "use the pool's default_price"; a value (>= 0) supersedes it for this model.
 */
export interface ModelSofaCompartmentRow {
  model_id: string;
  compartment_id: string;
  price_override: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `sofa_combo_pricing` (migration 0179, sofa engine Phase 2). A sofa combo =
 * a base model + ordered SLOTS (each slot an OR-set of compartment `code`
 * strings) priced per seat height. `slots` is a jsonb `string[][]`;
 * `prices_by_height` is a jsonb map height-string → numeric MYR | null (key
 * absent / null = the combo does not apply at that height). `tier` NULL =
 * applies to any fabric tier. Soft-delete via active/discontinued_at.
 */
export interface SofaComboPricingRow {
  id: string;
  model_id: string;
  slots: string[][];
  tier: string | null;
  prices_by_height: Record<string, number | null>;
  // 0183 — principal-only per-seat-height cost benchmark, same shape as
  // prices_by_height. null (or absent keys) = unset. Benchmark only.
  cost_by_height: Record<string, number | null> | null;
  // 0186 — principal-only per-seat-height PWP reward price, same shape as
  // prices_by_height. null (or absent keys) = unset. DORMANT — no order
  // consumer yet.
  pwp_prices_by_height: Record<string, number | null> | null;
  label: string | null;
  effective_from: string;
  active: boolean;
  discontinued_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface FloorConfigRow {
  id: number;
  free_up_to_floor: number;
  per_floor_per_item: number;
  updated_at: string;
}

/**
 * `delivery_fee_config` (migration 0184, 2990s Products parity Phase 6). The
 * principal-owned delivery TRIP fee singleton (`id` always 1). `base_fee` is
 * charged once per order with ≥1 charged-category line; `cross_category_fee` is
 * added once for a sofa × (mattress|bedframe) cart; `charged_categories` selects
 * which categories incur the base fee. Numeric MYR (Postgres numeric → `Number()`
 * in the adapter). Seeds 0/0 → dormant.
 */
export interface DeliveryFeeConfigRow {
  id: number;
  base_fee: number;
  cross_category_fee: number;
  charged_categories: string[];
  mattress_bedframe_lead_days: number;
  sofa_lead_days: number;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `special_delivery_fee_rules` (migration 0184). A per-RuleTarget override of the
 * base delivery fee. `target` is a RuleTarget[] jsonb (scopes
 * model|variant|combo|compartment); the adapter runs `parseRuleTargets` to drop
 * malformed entries. Fees are numeric MYR. Principal-owned; `active` + `sort_order`
 * mirror the catalog convention.
 */
export interface SpecialDeliveryFeeRuleRow {
  id: string;
  target: RuleTarget[];
  standalone_fee: number;
  cross_cat_followup_fee: number;
  label: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `model_default_free_gifts` (migration 0185, 2990s Products parity Phase 7).
 * Per-model deterministic free gift(s). PK is `model_id`. `gifts` is a jsonb
 * array of `DefaultFreeGift` ({ giftSku, qty, label?, condition? }); the adapter
 * runs `parseDefaultFreeGifts` to drop malformed entries. Principal-owned.
 */
export interface ModelDefaultFreeGiftsRow {
  model_id: string;
  gifts: DefaultFreeGift[];
  updated_at: string;
  updated_by: string | null;
}

/**
 * `free_item_campaigns` (migration 0185). A named GWP campaign: a salesperson
 * "Make Free"s an ELIGIBLE cart line (up to `max_free_qty`). `eligible` is a
 * RuleTarget[] jsonb (scopes model|variant|combo|compartment); the adapter runs
 * `parseFreeItemEligible` to drop malformed entries. `active` defaults false.
 * Principal-owned; `created_at` / `updated_at` / `updated_by` mirror the catalog
 * convention.
 */
export interface FreeItemCampaignRow {
  id: string;
  name: string;
  active: boolean;
  max_free_qty: number;
  eligible: RuleTarget[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `pwp_rules` (migration 0186, 2990s Products parity Phase 8a). A principal-owned
 * PWP/Promo RULE: a trigger category/scope unlocks a reward category/scope at the
 * ratio `qty_per_trigger`. `type` 'pwp' = the reward is sold at its per-SKU
 * pwp_price; 'promo' = the reward is FREE. `trigger_targets` / `reward_targets`
 * are RuleTarget[] jsonb (scopes model|variant|combo|compartment); the adapter
 * runs `parseRuleTargets` to drop malformed entries ([] = the whole category).
 * The reward PRICE is NOT on the row (it lives on product_skus.pwp_price /
 * sofa_combo_pricing.pwp_prices_by_height). `active` defaults false. DORMANT.
 *
 * P8d (0188) adds `carry_forward` (default true — when an unclaimed RESERVED
 * voucher minted by this rule reaches Confirm it flips to AVAILABLE for the
 * customer's next order instead of being deleted) + `carry_forward_days` (optional
 * expiry window, NULL = perpetual). `pwpRuleFromRow` reads them with defaults so a
 * pre-0188 row / mock still maps cleanly.
 */
export interface PwpRuleRow {
  id: string;
  type: "pwp" | "promo";
  trigger_category: string;
  trigger_targets: RuleTarget[];
  reward_category: string;
  reward_targets: RuleTarget[];
  qty_per_trigger: number;
  active: boolean;
  // ── P8d (0188) cross-order carry-forward policy ──
  carry_forward: boolean;
  carry_forward_days: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `pwp_codes` (migration 0187, 2990s Products parity Phase 8c). One row = one
 * reserved/claimed PWP voucher slot — the SAME-CART redemption LEDGER on top of
 * P8b's stateless pricing. `code` is the PK ("occupy-the-number" guarantee: two
 * carts can never reserve the same string). `status` machine: RESERVED → USED
 * (claim via pwp_claim_code) | DELETE (free); 'AVAILABLE' is in the CHECK but
 * written by NOBODY in P8c (it + source_order_id + customer_id ship dormant so
 * the P8d cross-order carry-forward needs no migration). `claim_group` is the
 * per-order correlation uuid the POS mints — the cancel/recovery join key that
 * exists at claim time (vs. redeemed_order_id, stamped only after create_order
 * returns). Owner-scoped RLS (`owner_staff_id` NULLABLE + ON DELETE SET NULL so
 * a deleted staff's USED-audit rows survive). `pwpCodeFromRow` maps it. DORMANT.
 *
 * P8d (0188) turns ON the cross-order path: an unclaimed RESERVED voucher carries
 * forward to AVAILABLE, bound to the carrying order's CANONICAL customer phone
 * (`bound_customer_phone` = pwp_phone_key, the MY-aware digits/strip-60/strip-0
 * key) + the minting salesperson's `owner_dealer_id` (dealer-scope snapshot for
 * the same-dealer AVAILABLE RLS clause) + an optional `expires_at`. The cross-
 * order claim asserts the redeeming order's canonical phone matches. These three
 * are NULL for every RESERVED / same-cart USED code. `bound_customer_phone` is
 * NEVER returned to a non-owner client (discovery uses the stripped PwpDiscoverRow
 * with a server-side phone match). `customer_id` (uuid) stays permanently unused.
 */
export interface PwpCodeRow {
  code: string;
  rule_id: string | null;
  type: "pwp" | "promo";
  reward_category: string;
  reward_targets: RuleTarget[];
  status: "RESERVED" | "USED" | "AVAILABLE";
  owner_staff_id: string | null;
  cart_line_key: string | null;
  trigger_item_code: string | null;
  claim_group: string | null;
  redeemed_order_id: string | null;
  redeemed_item_sku: string | null;
  // ── P8d cross-order columns ──
  source_order_id: string | null;
  /** Permanently unused (P8c dormant artifact; the phone binding uses
   *  `bound_customer_phone`). CF `pwp-customer-id-dead-column`. */
  customer_id: string | null;
  // ── P8d (0188) cross-order carry-forward binding ──
  bound_customer_phone: string | null;
  owner_dealer_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `pwp_discover_available(text,text)` RETURNS-TABLE row (migration 0188, the P8d
 * cross-order DISCOVERY read). The STRIPPED projection: it deliberately carries NO
 * `bound_customer_phone` / `owner_staff_id` / `trigger_item_code` /
 * `redeemed_item_sku` / `customer_id` — the structural guarantee that discovery
 * cannot leak another customer's PII. The phone match is computed SERVER-SIDE
 * (`phone_matches` boolean) so the stored phone is never returned, killing the
 * `?code=` enumeration/PII oracle. `pwpDiscoverFromRow` maps it.
 */
export interface PwpDiscoverRow {
  code: string;
  rule_id: string | null;
  type: "pwp" | "promo";
  reward_category: string;
  reward_targets: RuleTarget[];
  source_order_id: string | null;
  expires_at: string | null;
  phone_matches: boolean;
}

export interface WarehouseRow {
  id: string;
  name: string;
  address: string | null;
  // Added in migration 0027 (v3-S3). NOT NULL with default 'own' so legacy
  // rows fall back to 'own'. owning_partner_id required when kind =
  // 'operation_partner' (CHECK constraint warehouses_partner_kind_check).
  kind: WarehouseKind;
  owning_partner_id: string | null;
}

export interface SupplierRow {
  id: string;
  name: string;
  contact: string | null;
  lead_time: string | null;
  kind: "own_logistics" | "factory_pickup";
  cat_covered: string[];
  // Stable slug for cross-env supplier identification (migration 0032, v3-S4).
  // NOT NULL UNIQUE in DB. Seeded values: 'hookka' (Ohana), 'nice-future'
  // (Nice Future). Used by SUPPLIER_SOP keying in `sops.ts` so SOP routing
  // survives env reseeds where supplier UUIDs differ.
  slug: string;
}

export interface DeliveryPartnerRow {
  id: string;
  name: string;
  contact: string | null;
  // Postal address — added in migration 0048 (Phase 4.5 Chunk 1 carry-forward
  // `lp-address-column`). NULL for legacy rows that pre-date the LP creation
  // form; new rows from POST /api/principal/partners always populate it.
  address: string | null;
  zones: string | null;
  onboarded_date: string | null;
  rate_card: Record<string, { base: number; per_floor_walk_up: number; per_km: number }> | null;
}

export interface PartnerFleetRow {
  id: string;
  partner_id: string;
  plate: string;
  vehicle_type: string;
  capacity: string | null;
  driver_name: string | null;
  driver_phone: string | null;
}

export interface StockBalanceRow {
  sku: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  updated_at: string;
  /** Migration 0054 (Phase 4.5 Chunk 2 Sprint D Task 17). NULL = no alert
   *  configured for this (sku, warehouse) pair. Alert fires when
   *  (qty - reserved) < low_threshold. */
  low_threshold: number | null;
  /** Migration 0054. Replenishment ceiling used by CreatePOModal "Suggest from
   *  alerts" — gap = high_threshold - effective. NULL = use low * 2 fallback. */
  high_threshold: number | null;
}

export interface StockMovementRow {
  id: string;
  sku: string;
  warehouse_id: string;
  qty: number;
  kind: StockMovementKind;
  ref: string | null;
  note: string | null;
  by_role: Role | null;
  by_user_id: string | null;
  occurred_at: string;
}

export interface OrderRow {
  id: string;
  so: number;
  status: OrderStatus;
  channel: string;
  dealer_id: string;
  outlet_id: string | null;
  salesperson_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  customer_address_unknown: boolean;
  customer_billing: string | null;
  customer_billing_same: boolean;
  customer_emergency: string | null;
  // 0200 — POS-parity demographics (all nullable; POS-required, server-lenient).
  customer_email: string | null;
  customer_race: string | null;
  customer_gender: string | null;
  customer_birthday: string | null;
  delivery_date: string | null;
  delivery_date_tbd: boolean;
  // Phase 11.1 (migration 0165) — salesperson-entered planned production-start
  // ("Proceed") date. Pairs with delivery_date via delivery_date_tbd
  // (both-or-neither). NULL when TBD. Must be <= delivery_date.
  proceed_date: string | null;
  delivery_floor: number;
  delivery_has_lift: boolean;
  delivery_stair_items: number | null;
  paid: number;
  signature_url: string | null;
  payment_slip_url: string | null;
  terms_accepted: boolean;
  payment_method: "online" | "credit" | "installment" | null;
  approval_code: string | null;
  installment_months: 6 | 12 | null;
  operation_stage: OperationStage | null;
  warehouse_id: string | null;
  delivery_partner_id: string | null;
  partner_stage: PartnerStage | null;
  partner_picked_at: string | null;
  partner_eta: string | null;
  do_number: string | null;
  do_note: string | null;
  // operation timestamps (migration 0019). `dispatched_at` set by
  // operation_assign_partner; `delivered_at` set by operation_attach_do_and_deliver.
  dispatched_at: string | null;
  delivered_at: string | null;
  invoice_no: string | null;
  invoiced_at: string | null;
  // AutoCount import (migration 0132). Optional + NULL for portal-native
  // orders; optional so existing OrderRow constructors/fixtures don't break.
  source_system?: string | null;
  source_ref?: string[] | null;
  // Portal-wins-AutoCount guard (migration 0135). true once order_lines was
  // edited in portal; subsequent imports preserve the portal version.
  // Optional + NOT NULL DEFAULT false on the DB; optional in TS so legacy
  // fixtures/constructors don't break.
  items_edited?: boolean;
  // Inbox triage pre-assignment (migration 0136). FK to delivery_partners.id.
  // NULL = still in Inbox. Separate from delivery_partner_id (formal LP
  // set later by the proceed/assign flow).
  ops_assigned_logistic?: string | null;
  placed_at: string;
  created_at: string;
  updated_at: string;
}

export interface OrderLineRow {
  id: string;
  order_id: string;
  sku: string;
  qty: number;
  attrs: Record<string, unknown> | null;
  unit_price: number;
  // AutoCount "PO Doc No." (migration 0132). Optional so existing
  // OrderLineRow constructors/fixtures don't break.
  source_po?: string | null;
}

export interface OrderAddonRow {
  id: string;
  order_id: string;
  addon_key: string;
  qty: number;
  unit_price: number;
  // Migration 0133 — free-form addon attrs (e.g. disposal size tag).
  // Optional + nullable: existing rows pre-0133 have NULL, fixtures don't break.
  attrs?: Record<string, unknown> | null;
}

export interface OrderHistoryRow {
  id: string;
  order_id: string;
  text: string;
  by_role: Role | null;
  by_user_id: string | null;
  occurred_at: string;
}

/**
 * `order_supplier_threads` (migration 0033, v3-S4). One row per
 * (order, supplier, category) — UNIQUE constraint enforces this. Drives the
 * v3 operation pipeline so each fulfillment slice of an order has its own
 * SOP-driven kanban presence (a single order with mattress + sofa lines from
 * different suppliers spawns 2 threads, one per supplier×category).
 *
 * `po_id` is `text` because `purchase_orders.id` is `text` (not uuid). `sop_name`
 * mirrors `SopName` from `sops.ts` ('STANDARD' | 'SOFA_SPECIAL'). `history` is
 * a jsonb append log defaulting to `[]`.
 */
export interface OrderSupplierThreadRow {
  id: string;
  order_id: string;
  supplier_id: string;
  category: string;
  sop_name: "STANDARD" | "SOFA_SPECIAL";
  operation_stage: OperationStage;
  po_id: string | null;
  warehouse_id: string | null;
  reserved_at: string | null;
  delivered_at: string | null;
  // Phase 4.5 Chunk 2 customer-leg LP fields (migration 0049). Per-leg split
  // per Chunk 2 design spec §3 (CQ1 = option (b)): customer-leg LP +
  // RFD/accept/reject timestamps live on the thread, while the procurement-leg
  // LP lives on `purchase_orders.procurement_partner_id` (renamed from
  // `delivery_partner_id` in Sprint C migration 0052). Closes carry-forward
  // `phase-4.5-procurement-vs-delivery-partner-field-split`. Backfilled from
  // PO columns by migration 0050; the legacy PO customer-leg columns were
  // dropped by migration 0052. Partial index `ost_partner_rfd_pending_idx`
  // backs the "RFD pending" LP queue.
  delivery_partner_id: string | null;
  confirm_delivery_date: string | null;
  request_for_delivery_at: string | null;
  partner_accepted_at: string | null;
  partner_rejected_at: string | null;
  // Supplier per-thread pickup feature (migration 0107). All nullable — legacy
  // threads pre-0107 have no per-thread readiness signal (the supplier marked
  // the whole PO ready instead). `supplier_ready_at` flips when a supplier
  // calls supplier_mark_thread_ready; `pickup_event_id` is stamped when a
  // partner / operation batch-picks the thread off its PO.
  supplier_ready_at: string | null;
  supplier_ready_by: string | null;
  pickup_event_id: string | null;
  history: unknown[];
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderRow {
  id: string;
  so: number | null;
  // Cross-order PO bundle backrefs (migration 0017). Combined POs that group
  // SKUs across N source orders populate this; single-order POs use `so`.
  // GIN-indexed for `= ANY(so_refs)` lookups (drawer + linked-PO queries).
  so_refs: number[] | null;
  supplier_id: string;
  warehouse_id: string;
  // Single-line `sku` + `qty` columns were dropped in migration 0017; lines
  // now live in the `purchase_order_lines` child table — see PurchaseOrderLineRow.
  status: POStatus;
  sup_status: POSupStatus;
  // Procurement-leg LP — the supplier→warehouse pickup partner.
  // Renamed from `delivery_partner_id` → `procurement_partner_id` in Phase 4.5
  // Chunk 2 Sprint C migration 0052 to disambiguate from the customer-leg LP,
  // which now lives on `order_supplier_threads.delivery_partner_id` (migration
  // 0049). The PO holds ONLY procurement-leg state from 0052 forward.
  procurement_partner_id: string | null;
  expected_ready_date: string | null;
  pickup_date: string | null;
  eta_date: string | null;
  customer_rejection: Record<string, unknown> | null;
  // v3-S3 audit / DO-upload trail (migration 0030). Sofa-flow audit timestamps
  // and Supabase Storage path for the delivery order PDF.
  ready_confirm_at: string | null;
  partner_confirmed_at: string | null;
  do_file_path: string | null;
  do_uploaded_at: string | null;
  do_uploaded_by: string | null;
  // do_number text added in migration 0035 (hotfix for 0034 RPC reference).
  do_number: string | null;
  // v3-S3 outsource fields (migration 0030). Used when a PO is delivered by a
  // one-shot outsourced partner (not a registered delivery_partners row); the
  // CHECK constraint po_outsource_xor_partner enforces these are mutually
  // exclusive with procurement_partner_id (renamed in 0052).
  outsource_partner_name: string | null;
  outsource_partner_contact: string | null;
  outsource_partner_zones: string | null;
  // Phase 4.5 Chunk 2 Sprint C migration 0052 DROPPED the 4 customer-leg fields
  // (`confirm_delivery_date`, `request_for_delivery_at`, `partner_accepted_at`,
  // `partner_rejected_at`) from `purchase_orders` — they were backfilled to
  // `order_supplier_threads` by migration 0050 and now live there exclusively.
  pay_status: POPayStatus;
  placed_at: string;
}

/**
 * `purchase_order_lines` child table (migration 0017). Composite PK on
 * (po_id, sku); CHECK constraint enforces received_qty <= qty so over-receipt
 * is impossible at the DB layer.
 *
 * Phase 4.5 Chunk 2 Sprint E migration 0055 added `cost` + `cost_source`. Both
 * NULLABLE because legacy rows from 0019/0025-era PO creates have no historical
 * cost recorded (CQ3 locked: backfill NULL, do not invent). New PO creates
 * enforce non-NULL via zod schema (T25) + RPC validation (T26).
 */
export interface PurchaseOrderLineRow {
  po_id: string;
  sku: string;
  qty: number;
  received_qty: number;
  // Migration 0055. numeric(14,2) — passed through as `number`; CHECK enforces
  // non-negative when set (NULL allowed for legacy rows).
  cost: number | null;
  // Migration 0055. cost_source_enum — which heuristic produced the cost
  // value above (see `CostSource` definition for label semantics).
  cost_source: CostSource | null;
}

export interface POHistoryRow {
  id: string;
  po_id: string;
  text: string;
  by_role: Role | null;
  occurred_at: string;
}

export interface PaymentRow {
  id: string;
  direction: PaymentDir;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  paid_at: string;
  order_id: string | null;
  po_id: string | null;
  refund_id: string | null;
  receipt_url: string | null;
  recorded_by: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  invoice_no: string;
  order_id: string;
  amount: number;
  tax_amount: number;
  issued_at: string;
  voided_at: string | null;
  pdf_url: string | null;
}

export interface RefundRow {
  id: string;
  order_id: string;
  dealer_id: string | null;
  amount: number;
  reason: string | null;
  status: RefundStatus;
  approval_id: string | null;
  approved_at: string | null;
  paid_at: string | null;
  credit_note_no: string | null;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  kind: ApprovalKind;
  title: string;
  actor: string | null;
  refers_to: string | null;
  amount: number | null;
  dealer_id: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  status: ApprovalStatus;
  decided_at: string | null;
  decided_by: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  role: Role | null;
  actor_text: string | null;
  action: string;
  dealer_id: string | null;
  ref: string | null;
  occurred_at: string;
}

export interface InquiryRow {
  id: string;
  kind: InquiryKind;
  company: string;
  region: string | null;
  contact: string | null;
  stage: InquiryStage;
  owner_user_id: string | null;
  note: string | null;
  linked_dealer_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * `po_pickup_events` (migration 0107). One row = one physical DO paper = one
 * trip. Created when a partner (factory_pickup flow) or operation (own_logistics
 * delivers to HQ warehouse) batch-acks 1+ ready threads off a PO. Threads
 * involved in the same trip share the same `pickup_event_id`, which is the
 * grouping key for "1 DO covers N threads".
 *
 * `ack_role` records which side captured the pickup — 'partner' or 'operation'.
 * `do_file_path` is the canonical Storage path in the `delivery-orders` bucket;
 * `do_note` is an optional free-text field for the picker.
 */
export interface PoPickupEventsRow {
  id: string;
  po_id: string;
  do_number: string;
  do_file_path: string | null;
  do_note: string | null;
  picked_up_at: string;
  picked_up_by: string | null;
  ack_role: "partner" | "operation";
  created_at: string;
}
