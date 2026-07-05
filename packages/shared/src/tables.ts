/**
 * Supabase table-name constants — use these instead of raw string literals so
 * renames stay a single-file change and IDEs can grep all usages.
 *
 * Naming convention: UPPER_SNAKE_CASE constant = 'snake_case_table_name'.
 */

// ---------------------------------------------------------------------------
// Core order / dealer tables
// ---------------------------------------------------------------------------
export const ORDERS           = "orders" as const;
export const ORDER_LINES      = "order_lines" as const;
export const ORDER_ADDONS     = "order_addons" as const;
export const ORDER_HISTORY    = "order_history" as const;
export const DEALERS          = "dealers" as const;
export const OUTLETS          = "outlets" as const;
export const SALESPERSONS     = "salespersons" as const;

// ---------------------------------------------------------------------------
// Procurement / fulfillment tables
// ---------------------------------------------------------------------------
export const PURCHASE_ORDERS       = "purchase_orders" as const;
export const PURCHASE_ORDER_LINES  = "purchase_order_lines" as const;
export const PO_HISTORY            = "po_history" as const;
export const PO_PICKUP_EVENTS      = "po_pickup_events" as const;
export const ORDER_SUPPLIER_THREADS = "order_supplier_threads" as const;

// ---------------------------------------------------------------------------
// Catalog tables
// ---------------------------------------------------------------------------
export const PRODUCT_MODELS   = "product_models" as const;
export const PRODUCT_SKUS     = "product_skus" as const;
export const SOFA_FABRICS     = "sofa_fabrics" as const;
export const ADDONS           = "addons" as const;
export const FLOOR_CONFIG     = "floor_config" as const;

// 0184 — 2990s Products parity Phase 6: delivery TRIP fee config singleton +
// per-RuleTarget special overrides. (The floor STAIR surcharge in FLOOR_CONFIG
// is KEPT + coexists; the delivery fee is ADDITIVE.)
export const DELIVERY_FEE_CONFIG        = "delivery_fee_config" as const;
export const SPECIAL_DELIVERY_FEE_RULES = "special_delivery_fee_rules" as const;

// 0176 — fabric tier pricing config + per-model overrides.
export const FABRIC_TIER_ADDON_CONFIG    = "fabric_tier_addon_config" as const;
export const MODEL_FABRIC_TIER_OVERRIDES = "model_fabric_tier_overrides" as const;

// 0177 — fixed-set combos (套餐): a named bundle sold at one combo_price, with
// its component SKUs in combo_components. explodeCombo() splits the price back
// across the components at submit time.
export const COMBOS           = "combos" as const;
export const COMBO_COMPONENTS = "combo_components" as const;

// 0178 — sofa engine Phase 1: principal-owned compartment pool + per-model
// offered (which compartments a sofa model offers, with optional price override).
export const SOFA_COMPARTMENTS       = "sofa_compartments" as const;
export const MODEL_SOFA_COMPARTMENTS = "model_sofa_compartments" as const;

// 0179 — sofa engine Phase 2: principal-owned sofa combo pricing (a base model
// + ordered slots of compartment codes priced per seat height).
export const SOFA_COMBO_PRICING      = "sofa_combo_pricing" as const;
export const SPECIAL_ADDONS          = "special_addons" as const;

// 0182 — 2990s Products parity Phase 4: principal-owned global option pools
// (one generic table, a `pool` discriminator). Curated reference lists only —
// supplier_category, bedframe_size, mattress_size. NOT a source of truth for any
// order-side consumer (sizes stay per-model in allowed_options; supplier scope
// stays in suppliers.cat_covered).
export const CATALOG_OPTION_POOLS    = "catalog_option_pools" as const;

// 0201 — lightweight append-only snapshot log for the option pools (one row
// per pool Edit-save; "Effective from" + History in the catalog admin UI).
export const CATALOG_CONFIG_HISTORY  = "catalog_config_history" as const;

// 0185 — 2990s Products parity Phase 7: principal-owned Default Free Gifts (per
// model) + Free Item Campaigns (GWP). Free lines book as RM0 order_lines with
// attrs markers (attrs.free_gift / attrs.free_item) — create_order / order_lines
// are UNTOUCHED. DORMANT until the principal authors gifts / campaigns.
export const MODEL_DEFAULT_FREE_GIFTS = "model_default_free_gifts" as const;
export const FREE_ITEM_CAMPAIGNS      = "free_item_campaigns" as const;

// 0186 — 2990s Products parity Phase 8a: principal-owned PWP & Promo RULES
// (trigger category/scope → reward category/scope @ qtyPerTrigger). The reward
// PRICE lives per-SKU (product_skus.pwp_price) / per-sofa-combo
// (sofa_combo_pricing.pwp_prices_by_height), NOT on the rule. DORMANT (active
// default false; no order consumer yet) — P8a is the stateless foundation.
export const PWP_RULES = "pwp_rules" as const;

// 0187 — 2990s Products parity Phase 8c: the PWP voucher LEDGER (SAME-CART
// state machine). One row = one reserved/claimed voucher slot; code is the PK
// ("occupy-the-number" guarantee). RESERVED on a cart trigger; CLAIMED
// (RESERVED→USED) at order Confirm via the pwp_claim_code RPC; unclaimed
// RESERVED DELETEd at Confirm. Owner-scoped RLS. DORMANT (0 active pwp_rules →
// 0 codes minted → orders byte-identical).
export const PWP_CODES = "pwp_codes" as const;

// ---------------------------------------------------------------------------
// People / org tables
// ---------------------------------------------------------------------------
export const SUPPLIERS         = "suppliers" as const;
export const DELIVERY_PARTNERS = "delivery_partners" as const;
export const PARTNER_FLEET     = "partner_fleet" as const;
export const WAREHOUSES        = "warehouses" as const;
export const APP_USERS         = "app_users" as const;

// ---------------------------------------------------------------------------
// Finance tables
// ---------------------------------------------------------------------------
export const PAYMENTS        = "payments" as const;
export const INVOICES        = "invoices" as const;
export const REFUNDS         = "refunds" as const;
export const APPROVALS       = "approvals" as const;
export const BANK_STATEMENTS = "bank_statements" as const;
export const RECONCILIATIONS = "reconciliations" as const;

// ---------------------------------------------------------------------------
// Stock tables
// ---------------------------------------------------------------------------
export const STOCK_BALANCES   = "stock_balances" as const;
export const STOCK_MOVEMENTS  = "stock_movements" as const;
export const OPS_STOCK_ITEMS  = "ops_stock_items" as const;

// ---------------------------------------------------------------------------
// Misc / operational tables
// ---------------------------------------------------------------------------
export const AUDIT_LOG     = "audit_log" as const;
export const INQUIRIES     = "inquiries" as const;
export const SERVICE_NOTES = "service_notes" as const;
export const SOPS          = "sops" as const;

// Migration 0159 — ops order control overlay.
export const OPS_ORDER_CONTROL = "ops_order_control" as const;

// Migration 0174 — SO Maintenance shared column-config table.
export const SALES_ORDER_GRID_CONFIG = "sales_order_grid_config" as const;
