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
