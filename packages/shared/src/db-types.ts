/**
 * Database row types — match Postgres schema in supabase/migrations/0001_init.sql.
 * These are snake_case (Postgres convention). Use the camelCase domain types in
 * `domain.ts` for UI code.
 */
import type { DefaultFreeGift } from "./free-gift";
import type { BundleComponent, BundleSlot } from "./product-bundle";
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
export type ProductCategory   = "mattress" | "bedframe" | "sofa" | "accessory" | "service" | "guarantee"; // 0169 + 0261
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

// 0233 — POS staff tier. Distinct from the app_role JWT `Role`: staff tiers
// live under ONE store login and are proven per-session by a 6-digit PIN.
export type StaffTier = "principal" | "manager" | "salesperson";

export interface SalespersonRow {
  id: string;
  dealer_id: string;
  outlet_id: string | null;
  name: string;
  phone: string | null;
  user_id: string | null;
  created_at: string;
  // 0233 staff PIN login
  staff_role: StaffTier;
  color: string | null;
  active: boolean;
  // 0241 staff profile (optional so pre-migration rows/mocks stay valid)
  email?: string | null;
  birthday?: string | null;
  gender?: "male" | "female" | null;
  // HR Team hierarchy — CRnnn code for Carres' OWN showroom staff (optional:
  // dealer-side staff never carry one)
  staff_code?: string | null;
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
  // 0204 (per-size pricing, Loo 2026-07-06) — {size → RM} selling-price map,
  // keys = the catalog_option_pools `sofa_size` values. Missing key / NULL map
  // → the flat `price` applies. Principal-only (0175/0204 trigger). Only sofa
  // compartment SKUs carry it today. DORMANT until authored.
  prices_by_size: Record<string, number | null> | null;
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
  // 0242 — optional size list (jsonb string array). NULL/[] = no size pick;
  // non-empty = the POS requires one size PER UNIT at checkout.
  size_options: string[] | null;
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
 *  FULL pool contents at save time (camelCase entries). 0202 widens `section`
 *  with 'fabrics' (fabric-master snapshots share the same log). */
export interface CatalogConfigHistoryRow {
  id: string;
  section: CatalogOptionPoolRow["pool"] | "fabrics";
  snapshot: unknown;
  effective_from: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
}

/** `catalog_fabrics` (migration 0202, 2990s fabric_trackings port). Global
 *  procurement fabric master — read-only reference; the SELLING fabric path
 *  stays per-model `sofa_fabrics` + the 0176 tier deltas (independent by
 *  design, mirroring 2990s). `sofa_tier` covers sofa+accessory contexts,
 *  `bedframe_tier` covers bedframe (no bedframe selling consumer yet). */
export interface CatalogFabricRow {
  id: string;
  fabric_code: string;
  series: string | null;
  description: string | null;
  supplier_code: string | null;
  sofa_tier: "PRICE_1" | "PRICE_2" | "PRICE_3";
  bedframe_tier: "PRICE_1" | "PRICE_2" | "PRICE_3";
  active: boolean;
  sort_order: number;
  /** 0226 — operation's recorded buying add-on (RM). Postgres numeric may
   *  arrive as a string; nullable = not recorded. */
  cost: number | string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
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
  // 0205 — per-compartment fabric-tier P2/P3 delta override (nullable = inherit
  // per-model / global). The highest-precedence fabric-delta layer.
  special_tier2_delta: number | null;
  special_tier3_delta: number | null;
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
  // 0206 — true = a Quick Pick layout preset (POS Quick pick tab, authored with
  // no price); false = a pricing-only matched combo (hidden from Quick pick).
  is_quick_pick: boolean;
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
 * `product_bundles` (migration 0239) — bundle pricing: a named set of catalog
 * SKUs sold together at one bundle price. `components` is [{sku, qty}] jsonb;
 * the adapter runs `parseBundleComponents` to drop malformed entries. `active`
 * defaults false (dormant until the principal flips it on). Principal-owned;
 * `created_at` / `updated_at` / `updated_by` mirror the catalog convention.
 */
export interface ProductBundleRow {
  id: string;
  name: string;
  price: number;
  // 0241 — bundle kinds; pre-0241 rows read via the adapter defaults.
  kind?: "fixed" | "custom";
  components: BundleComponent[];
  slots?: BundleSlot[];
  active: boolean;
  sort_order: number;
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
  /** 0204 — the NAME half of the 2990s name+phone binding, server-computed.
   *  A legacy (name-NULL) code reports true (phone-only binding). */
  name_matches: boolean;
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

/** 0231/0233 — the add-product change-request ledger (P3 submission flow). */
export interface OrderChangeRequestRow {
  id: string;
  order_id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  applied_at: string | null;
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
  // 0230 — structured MY address parts (always paired with the composed
  // customer_address; flat-only writers clear them). Optional so legacy
  // fixtures/constructors don't break.
  customer_address_line1?: string | null;
  customer_address_line2?: string | null;
  customer_address_state?: string | null;
  customer_address_city?: string | null;
  customer_address_postcode?: string | null;
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
  // 0219 — config-driven methods (the 3-value CHECK is gone; any configured
  // key e.g. 'cash' persists).
  payment_method: string | null;
  approval_code: string | null;
  installment_months: 6 | 12 | null;
  // 0219 — POS entry extras (payment follow-ups e.g. bank + custom fields).
  // Optional so legacy fixtures/constructors don't break.
  entry_data?: Record<string, unknown> | null;
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

// ---------------------------------------------------------------------------
// Rental + Service Plan base (migrations 0247-0249, 2026-07-25)
// ---------------------------------------------------------------------------

/**
 * `customers` (migration 0247) — the FIRST customer entity. `phone_key` is the
 * MY-aware canonical phone (same helper family as pwp_phone_key, computed
 * app-side) and is UNIQUE: one customer per canonical phone. Raw `phone` stays
 * as typed for display/callback. Internal-only RLS until the sell phase.
 */
export interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  phone_key: string;
  email: string | null;
  address: string | null;
  notes: string | null;
  /** One Stripe Customer per canonical phone (0255) — minted lazily at first
   *  rental checkout, reused for later agreements. */
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * `service_packages` (migration 0248) — a cleaning-service product: duration
 * (months) × visits-per-year, optionally linked to a sellable service-category
 * SKU and priced for standalone sale (price 0 = free-attach only).
 * Principal-owned; DORMANT until authored.
 */
export interface ServicePackageRow {
  id: string;
  name: string;
  service_type: "cleaning" | "repair" | "other";
  duration_months: number;
  visits_per_year: number;
  price: number;
  sku: string | null;
  active: boolean;
  sort_order: number;
  /** 0264 — the product family the plan serves. Drives the
   *  SVC-{MAT|BF|SOFA|ACC}-… SKU token and filters the offer picker. */
  category: RentalOfferCategory | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/* ── 0264: the rental OFFER config (the Setting closed loop) ────────────── */

/** Product families a rental offer / service package can belong to (0264). */
export type RentalOfferCategory = "mattress" | "bedframe" | "sofa" | "accessory";

/** How an offer reaches its base monthly figure (0264). */
export type RentalPricingMode = "variant" | "compartment" | "combo" | "both";

/** One priced option VALUE inside `rental_offers.option_prices` (0264). A
 *  fabric colour omits both prices to inherit its series. */
export interface RentalOptionValueJson {
  on?: boolean;
  oneTime?: number | null;
  monthly?: number | null;
}

/** One fabric SERIES inside `option_prices.fabrics` — its own price plus the
 *  per-colour overrides (colour code → value, e.g. "CG-008"). */
export interface RentalFabricSeriesJson extends RentalOptionValueJson {
  colors?: Record<string, RentalOptionValueJson>;
}

/** One option GROUP (leg_heights / divan_heights / gaps / specials) or the
 *  fabrics group, keyed by the SAME `allowed_options` vocabulary the Modular
 *  editor writes — a rental overlay can only NARROW what the model allows. */
export interface RentalOptionGroupJson {
  /** true = the customer must pick one of the ON values; false = optional add. */
  required?: boolean;
  values?: Record<string, RentalOptionValueJson>;
  series?: Record<string, RentalFabricSeriesJson>;
}

export type RentalOptionPricesJson = Record<string, RentalOptionGroupJson>;

/** One manual surcharge slot (`rental_offers.surcharges`, 0264). `required`
 *  = charged on every agreement; otherwise the store may TICK it (never type
 *  an amount — guardrail #4). */
export interface RentalSurchargeJson {
  code: string;
  label: string;
  oneTime?: number | null;
  monthly?: number | null;
  required?: boolean;
}

/** One free gift (GWP) — a real SKU + qty so stock / delivery / the supplier
 *  PO all see it (`rental_plans.gifts`, `rental_buy_prices.gifts`, 0264). */
export interface RentalGiftJson {
  sku: string;
  qty: number;
}

/**
 * `rental_offers` (migration 0264) — ONE row per product model: which lanes
 * are open (rent / buy), how the monthly base is reached (`pricing_mode`),
 * the option + fabric price overlay, the manual surcharge slots and the
 * revenue split. The per-variant money lives in `rental_plans` (rent) and
 * `rental_buy_prices` (buy). Principal-owned; `active` defaults false.
 */
export interface RentalOfferRow {
  id: string;
  model_id: string;
  pricing_mode: RentalPricingMode;
  rent_enabled: boolean;
  buy_enabled: boolean;
  terms_months: number[];
  option_prices: RentalOptionPricesJson;
  surcharges: RentalSurchargeJson[];
  supplier_rate_pct: number;
  commission_base_pct: number;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/** One block of an agreement's wording (0267). `li` renders as a bullet. */
export interface AgreementBlockJson {
  kind: "title" | "subtitle" | "h2" | "p" | "li";
  text: string;
}

/**
 * `rental_agreement_templates` (migration 0267) — the paper a rental signs.
 * The customer's own wording, VERBATIM, as ordered blocks; `fields` caches the
 * {{tokens}} it uses. A (doc_key, version) pair is immutable: replacing the
 * wording mints version+1, and a signed agreement keeps the version it was
 * signed under.
 */
export interface RentalAgreementTemplateRow {
  id: string;
  doc_key: string;
  name: string;
  binds_to: string[];
  version: number;
  body: AgreementBlockJson[];
  fields: string[];
  effective_from: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `rental_buy_prices` (migration 0264) — the outright lane of an offer, one
 * row per sellable target (a SKU or a sofa combo). `price` NULL = sell at
 * whatever `product_skus.price` says; a number overrides it for this offer.
 */
export interface RentalBuyPriceRow {
  id: string;
  offer_id: string;
  sku: string | null;
  combo_id: string | null;
  price: number | null;
  gifts: RentalGiftJson[];
  active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `rental_offer_services` (migration 0264) — a service package attached to an
 * offer: FREE on the rent lane / buy lane / both (with how many visits are on
 * us), and/or sold at a monthly and/or one-off price.
 */
export interface RentalOfferServiceRow {
  id: string;
  offer_id: string;
  package_id: string;
  free_lane: "rent" | "buy" | "both" | null;
  free_visits: number | null;
  monthly_price: number | null;
  outright_price: number | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `rental_plans` (migration 0248) — a rent-to-own offer on ONE sellable sku:
 * term_months × monthly_fee plus the per-collection revenue split
 * (supplier_rate_pct → supplier; commission_base_pct → the flat seller base —
 * the full commission HIERARCHY lives in the HR line, not here). A plan can
 * bundle a service package for free (`included_package_id`). UNIQUE(sku,
 * term_months). Principal-owned; `active` defaults false (DORMANT).
 */
export interface RentalPlanRow {
  id: string;
  /** 0264 — NULL on a `combo` line (a combo is a shape, not a sellable code);
   *  always set on `unit` / `compartment` lines. */
  sku: string | null;
  term_months: number;
  monthly_fee: number;
  supplier_rate_pct: number;
  commission_base_pct: number;
  included_package_id: string | null;
  active: boolean;
  /** Stripe sync anchors (0255). A fee change mints a NEW price (amounts are
   *  immutable on Stripe) and archives the old one. NULL = not yet synced —
   *  the POS lane refuses online collection until the plan re-saves/syncs. */
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  /** 0264 — the parent offer (NULL only on a pre-0264 hand-authored plan). */
  offer_id: string | null;
  /** 0264 — a sofa combo target; mutually exclusive with `sku`. */
  combo_id: string | null;
  /** 0264 — unit = a whole SKU · compartment = a sofa part's rate (the build
   *  adds up) · combo = one fixed monthly for a combo shape. */
  line_kind: "unit" | "compartment" | "combo";
  /** 0264 — free gifts riding this rent line (real SKU + qty). */
  gifts: RentalGiftJson[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `rental_plans_pos` (0255) — the DELIBERATE store-side projection of an
 * ACTIVE rental plan (CF rental-pos-config-projection): the sellable face
 * only. The supplier/commission split columns are intentionally absent — a
 * dealer must never see the supplier's cut nor vice versa (0253 MAJOR).
 */
export interface RentalPlanPosRow {
  id: string;
  sku: string;
  term_months: number;
  monthly_fee: number;
  included_package_id: string | null;
  package_name: string | null;
  package_service_type: "cleaning" | "repair" | "other" | null;
  package_visits_per_year: number | null;
  /** stripe_price_id IS NOT NULL — the POS greys the lane out when false. */
  stripe_ready: boolean;
}

/**
 * `rental_agreements` (migration 0249) — one signed rent-to-own agreement
 * (`agreement_no` 'RA-1001…'). sku/term/fee/split are SNAPSHOTS at signup (a
 * later plan re-price never rewrites a live agreement). Lifecycle: active →
 * completed → ownership_transferred; early exit = buyout_pending (settle the
 * remaining months in one payment); default → defaulted/repossessed while the
 * residual settles. Stripe columns are wired when the Stripe sell lane ships.
 */
export interface RentalAgreementRow {
  id: string;
  agreement_no: string;
  customer_id: string;
  dealer_id: string | null;
  salesperson_id: string | null;
  order_id: string | null;
  plan_id: string | null;
  sku: string;
  term_months: number;
  monthly_fee: number;
  supplier_rate_pct: number;
  commission_base_pct: number;
  start_date: string;
  status:
    | "active"
    | "buyout_pending"
    | "completed"
    | "ownership_transferred"
    | "defaulted"
    | "repossessed"
    | "cancelled";
  buyout_at: string | null;
  buyout_amount: number | null;
  ownership_transfer_at: string | null;
  ownership_doc_url: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  /** 0264 — the offer signed from, and the FROZEN snapshot of what the
   *  customer picked that day (options / fabric colour / surcharges / sofa
   *  build), the gifts that rode along and the money due once at signing.
   *  A later re-price of the offer never rewrites these. */
  offer_id: string | null;
  selected_options: Record<string, unknown>;
  gifts: RentalGiftJson[];
  one_off_total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

/**
 * `rental_billings` (migration 0249) — the agreement's monthly billing
 * schedule, one row per month (`UNIQUE(agreement_id, seq)`). Every collected
 * month records the finance split at collection time (`supplier_share` /
 * `commission_share` — see the pure `rentalMonthlySplit`).
 */
export interface RentalBillingRow {
  id: string;
  agreement_id: string;
  seq: number;
  due_date: string;
  amount_due: number;
  status: "due" | "paid" | "overdue" | "waived" | "written_off";
  paid_at: string | null;
  paid_amount: number | null;
  method: string | null;
  reference: string | null;
  supplier_share: number | null;
  commission_share: number | null;
  stripe_invoice_id: string | null;
  recorded_by: string | null;
  created_at: string;
}

/**
 * `rental_stock_units` (migration 0249) — the rented-out asset registry
 * (`unit_code` 'RU-1001…'): a deployed mattress has LEFT the warehouse but is
 * still a Carres ASSET until ownership transfers. Own service/warranty event
 * history via `rental_unit_events`.
 */
export interface RentalStockUnitRow {
  id: string;
  unit_code: string;
  sku: string;
  agreement_id: string | null;
  customer_id: string | null;
  status:
    | "allocated"
    | "in_rental"
    | "returned"
    | "refurbishing"
    | "transferred"
    | "retired";
  deployed_at: string | null;
  returned_at: string | null;
  warranty_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

/**
 * `service_entitlements` (migration 0249) — ONE engine, multiple sources:
 * included with a rental, bought as a service SKU, gifted free with a grand
 * product, or granted manually. Visits pre-generate on mint (see
 * `serviceVisitsTotal` / `serviceVisitIntervalMonths`); CHECK enforces
 * visits_used <= visits_total.
 */
export interface ServiceEntitlementRow {
  id: string;
  customer_id: string;
  package_id: string | null;
  source: "rental" | "purchase" | "free_gift" | "manual";
  agreement_id: string | null;
  order_id: string | null;
  visits_total: number;
  visits_used: number;
  starts_on: string;
  expires_on: string | null;
  status: "active" | "exhausted" | "expired" | "cancelled";
  created_at: string;
  created_by: string | null;
}

/**
 * `service_visits` (migration 0249) — one scheduled/completed visit of an
 * entitlement (`UNIQUE(entitlement_id, seq)`). `partner` stays free-text until
 * the cleaning-partner tab ships (then an FK). Completion logs onto the
 * physical unit's `rental_unit_events` trail.
 */
export interface ServiceVisitRow {
  id: string;
  entitlement_id: string;
  seq: number;
  due_date: string;
  scheduled_date: string | null;
  partner: string | null;
  unit_id: string | null;
  status: "pending" | "scheduled" | "completed" | "skipped" | "cancelled";
  completed_at: string | null;
  completed_by: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * `rental_unit_events` (migration 0249) — append-only per-unit event trail
 * (the unit's service/warranty history, Loo's ask). `visit_id` links a
 * 'service' event back to the completed service visit.
 */
export interface RentalUnitEventRow {
  id: string;
  unit_id: string;
  event_type:
    | "deployed"
    | "service"
    | "warranty_claim"
    | "repair"
    | "returned"
    | "refurbished"
    | "transferred"
    | "note";
  visit_id: string | null;
  description: string | null;
  photo_url: string | null;
  actor: string | null;
  occurred_at: string;
}
