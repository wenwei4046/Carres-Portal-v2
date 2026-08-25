import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  catalogResponseSchema,
  parseOrderEntryConfigRow,
  productModelCreateInput,
  productModelPatchInput,
  productSkuCreateInput,
  productSkuPatchInput,
  sofaFabricCreateInput,
  sofaFabricPatchInput,
  fabricTierConfigSchema,
  modelFabricTierOverrideSchema,
  sizesActiveInput,
  generateSkusInput,
  skuSupplierOfferUpsertInput,
  floorConfigPatchInput,
  addonCreateInput,
  addonPatchInput,
  PRODUCT_MODEL_PHOTOS_BUCKET,
  FABRIC_TIER_ADDON_CONFIG,
  MODEL_FABRIC_TIER_OVERRIDES,
  sofaCompartmentCreateInput,
  sofaCompartmentPatchInput,
  modelSofaCompartmentInput,
  SOFA_COMPARTMENTS,
  MODEL_SOFA_COMPARTMENTS,
  sofaComboCreateInput,
  sofaComboPatchInput,
  canonicalizeSofaSlots,
  SOFA_COMBO_PRICING,
  specialAddonCreateInput,
  specialAddonPatchInput,
  SPECIAL_ADDONS,
  catalogOptionPoolCreateInput,
  catalogOptionPoolPatchInput,
  catalogOptionPoolNameSchema,
  catalogPoolBatchSaveInput,
  CATALOG_OPTION_POOLS,
  CATALOG_CONFIG_HISTORY,
  CATALOG_FABRICS,
  GUARANTEE_TERMS,
  SUPPLIERLESS_CATEGORIES as SHARED_SUPPLIERLESS_CATEGORIES,
  catalogFabricsBatchSaveInput,
  catalogFabricCostInput,
  deliveryFeeConfigPatchInput,
  specialDeliveryFeeRuleInput,
  DELIVERY_FEE_CONFIG,
  SPECIAL_DELIVERY_FEE_RULES,
  modelDefaultFreeGiftsInput,
  freeItemCampaignInput,
  MODEL_DEFAULT_FREE_GIFTS,
  FREE_ITEM_CAMPAIGNS,
  pwpRuleInput,
  PWP_RULES,
  productBundleInput,
  productBundlePatchInput,
  PRODUCT_BUNDLES,
  deriveSkuCode,
  canonicalSize,
  autoBedSkuDescription,
  skuImportInput,
  hasPricingIntent,
  type SkuImportRow,
  type SkuImportFailure,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { userClient } from "../lib/supabase";
import { syncCompartmentSku, discontinueCompartmentSku } from "../lib/sofa-compartment-sku";
import type { AppEnv } from "../types";

const catalogRouter = new Hono<AppEnv>();

// SKU codes are `{MODEL_KEY}-{variant}` (uppercase, dash) — the AutoCount-style
// scheme the 1013 existing SKUs use, NOT the legacy `category:model_key:variant`
// colon format (0148 documented that as broken). The formula now lives in
// `@carres/shared` (deriveSkuCode) so the mint + generate-skus + the web
// read-back can't drift.

// Service / accessory / guarantee categories carry no supplier (their SKUs are
// internal: delivery / disposal / labour / pure accessories / a guarantee is a
// promise, never purchased). The create-SKU supplier requirement is relaxed for
// them. Built from the SHARED list rather than a second hand-kept literal — the
// old local copy silently missed 'guarantee' when 0261 widened the enum, which
// would have demanded a supplier for a guarantee SKU.
const SUPPLIERLESS_CATEGORIES = new Set<string>(SHARED_SUPPLIERLESS_CATEGORIES);

const ALLOWED_PHOTO_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function internalOnly(c: { var: { auth: { role: string } } }) {
  const role = c.var.auth.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation/principal only" });
  }
}

// 0176 — fabric-tier config + override writes are principal-only.
// Same gate pattern as the 0175 SKU price/cost lock: early 403 before the
// DB round-trip; RLS is still the real enforcement boundary.
// 0177 — generalized to accept a caller-specific message (combos reuse this
// gate). The default keeps the original fabric-tier string so the existing
// callers + their tests are unchanged.
function principalOnly(
  c: { var: { auth: { role: string } } },
  message = "Only the principal (Master Admin) can modify fabric tier configuration",
) {
  if (c.var.auth.role !== "principal") {
    throw new HTTPException(403, { message });
  }
}

// Phase 2 Master-Admin pricing lock (migration 0175): only the principal may
// SET or CHANGE product_skus.price / .cost. The DB trigger
// (enforce_sku_price_cost_principal_only) is the real boundary — the catalog
// write path forwards the USER JWT (userClient), so RLS + the trigger run; this
// early gate just turns the raw 42501 into a clean, friendly 403 before the
// round-trip. All OTHER catalog edits (pos_active, description, name, modular,
// add-ons, supplier_id) stay open to internal roles.
// 0186 — pwp_price joins price + cost under the same principal lock (the DB
// trigger enforce_sku_price_cost_principal_only was EXTENDED to cover it).
// 0226 — COST leaves the principal-only set: operation records buying prices
// in the Operation Catalog, so cost is writable by operation + principal
// (the DB trigger was relaxed the same way). price / pwp_price / pricesBySize
// stay principal-only.
const SKU_PRICE_COST_ERROR =
  "Only the principal (Master Admin) can set SKU price, pwp_price, or per-size prices";
const SKU_COST_ERROR = "Only operation or the principal can set SKU cost";

// POST /skus: a non-principal MAY create an UNPRICED sku (price 0 / pwp_price
// null); operation may additionally seed the buying cost. Block only when a
// role tries to set something outside its lane.
function gateSkuCreatePriceCost(
  c: { var: { auth: { role: string } } },
  data: { price: number; cost?: number | null; pwpPrice?: number | null },
) {
  const role = c.var.auth.role;
  if (role === "principal") return;
  const setsPrice = data.price !== 0;
  const setsCost = data.cost !== null && data.cost !== undefined;
  const setsPwpPrice = data.pwpPrice !== null && data.pwpPrice !== undefined;
  if (setsPrice || setsPwpPrice) {
    throw new HTTPException(403, { message: SKU_PRICE_COST_ERROR });
  }
  if (setsCost && role !== "operation") {
    throw new HTTPException(403, { message: SKU_COST_ERROR });
  }
}

// PATCH /skus/:id: block when a role includes a pricing key outside its lane
// (presence = intent to change; a `null` clearing counts).
function gateSkuPatchPriceCost(
  c: { var: { auth: { role: string } } },
  data: {
    price?: number;
    cost?: number | null;
    pwpPrice?: number | null;
    // 0204 — per-size price map; presence = intent to change, same lock.
    pricesBySize?: Record<string, number> | null;
  },
) {
  const role = c.var.auth.role;
  if (role === "principal") return;
  if (
    data.price !== undefined ||
    data.pwpPrice !== undefined ||
    data.pricesBySize !== undefined
  ) {
    throw new HTTPException(403, { message: SKU_PRICE_COST_ERROR });
  }
  if (data.cost !== undefined && role !== "operation") {
    throw new HTTPException(403, { message: SKU_COST_ERROR });
  }
}

// product_skus exceeds Supabase's 1000-row REST cap (1013+ live), so the bundle
// MUST page through or it silently drops SKUs (latent bug surfaced 2026-06-14:
// the dealer wizard + Create-PO were missing every SKU past the first 1000).
async function fetchAllSkus(sb: ReturnType<typeof userClient>): Promise<DB.ProductSkuRow[]> {
  const all: DB.ProductSkuRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("product_skus")
      .select("*")
      .range(from, from + PAGE - 1);
    if (error) throw new HTTPException(500, { message: error.message });
    const rows = (data ?? []) as DB.ProductSkuRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/**
 * GET /api/catalog — single bundle of everything the wizard's product picker
 * needs. Filters out discontinued models (and their skus + fabrics, since both
 * have ON DELETE CASCADE FKs to product_models — but discontinued is soft-delete
 * not hard-delete, so we filter explicitly here).
 *
 * RLS: catalog_read_all + skus_read_all + fabrics_read_all + addons_read_all +
 * floor_read_all all allow `auth.uid() is not null` — every authenticated role
 * sees the same bundle. Writes are principal-only (not used here).
 *
 * Cache hint: Cache-Control private, max-age=300 lets the browser keep this
 * for 5 minutes even outside TanStack staleTime — belt-and-suspenders.
 */
catalogRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // 0075 (Loo 2026-05-09) — admin mode includes discontinued models so the
  // catalog admin UI can render them (faded + with a Restore toggle). Public
  // consumers (dealer wizard, Create-PO modal) get the default filtered list.
  const adminMode = c.req.query("admin") === "true";

  // Run the 7 small queries in parallel — each is a simple `select *` against a
  // catalog table, all RLS-public-read. No auth-scoped filtering needed.
  // 0176 — also fetch the fabric tier config singleton + per-model overrides.
  const modelsQ = sb.from("product_models").select("*");
  const [modelsR, allSkus, fabricsR, addonsR, floorR, tierConfigR, tierOverridesR, sofaCompsR, modelSofaCompsR, sofaCombosR, specialAddonsR, optionPoolsR, deliveryFeeR, specialDeliveryRulesR, modelFreeGiftsR, freeItemCampaignsR, pwpRulesR, fabricMasterR, entryConfigR, bundlesR, guaranteeTermsR, purchasingSettingsR] = await Promise.all([
    adminMode ? modelsQ : modelsQ.is("discontinued_at", null),
    fetchAllSkus(sb), // paged — never capped at 1000
    sb.from("sofa_fabrics").select("*"),
    sb.from("addons").select("*").eq("active", true),
    sb.from("floor_config").select("*").eq("id", 1).maybeSingle(),
    // 0176 — singleton row (id=1). Use maybeSingle so a missing seed row
    // doesn't throw; we fall back to {0,0} defaults below.
    sb.from(FABRIC_TIER_ADDON_CONFIG).select("*").eq("id", 1).maybeSingle(),
    // 0176 — all override rows (sparse table; most models have no row).
    sb.from(MODEL_FABRIC_TIER_OVERRIDES).select("*"),
    // 0178 — sofa compartment pool + per-model offered rows (additive). The
    // maintenance UI is the only consumer in Phase 1; returned unfiltered.
    sb.from(SOFA_COMPARTMENTS).select("*"),
    sb.from(MODEL_SOFA_COMPARTMENTS).select("*"),
    // 0179 — sofa combo pricing rows (additive). Fetched unfiltered; the
    // active / discontinued_at filter is applied client-side below (like the
    // 0177 combos branch), since non-admin POS consumers must not see retired
    // combos while the maintenance tab (admin=true) must.
    sb.from(SOFA_COMBO_PRICING).select("*"),
    // 0181 — special add-ons (additive). Fetched unfiltered; active filter
    // applied client-side below (admin sees retired; POS sees active only).
    sb.from(SPECIAL_ADDONS).select("*"),
    // 0182 — global option pools (additive). Fetched UNFILTERED (active AND
    // inactive): each row carries its own `active`, and the Maintenance editor
    // must see the inactive ones, so consumers filter client-side. Curated
    // reference lists only — NOT a source of truth for any order-side consumer.
    sb.from(CATALOG_OPTION_POOLS).select("*"),
    // 0184 — delivery TRIP fee config singleton (id=1). maybeSingle so a missing
    // seed row doesn't throw; we fall back to the dormant {0,0} defaults below.
    sb.from(DELIVERY_FEE_CONFIG).select("*").eq("id", 1).maybeSingle(),
    // 0184 — per-RuleTarget special delivery fee rules. Fetched UNFILTERED
    // (active AND inactive — the Maintenance editor must see retired rows, and
    // the POS preview / server recompute apply only the matching active ones);
    // sorted in JS below (active-first, then sort_order) to stay mock-friendly,
    // mirroring the 0182 option-pools branch.
    sb.from(SPECIAL_DELIVERY_FEE_RULES).select("*"),
    // 0185 — Default Free Gifts (per model) + Free Item Campaigns (GWP).
    // Fetched UNFILTERED: the maintenance editor needs every row (incl. inactive
    // campaigns + empty gift sets), and the POS preview / Hono server resolver
    // filter by `active` / `gifts` themselves. Additive — pre-0185 clients ignore
    // both keys, and with NONE authored the resolver is dormant (zero behaviour
    // change), so a no-gift order stays byte-identical.
    sb.from(MODEL_DEFAULT_FREE_GIFTS).select("*"),
    sb.from(FREE_ITEM_CAMPAIGNS).select("*"),
    // 0186 — PWP & Promo rules. Fetched UNFILTERED: the maintenance editor needs
    // every row (incl. inactive rules), and a future order resolver filters by
    // `active` itself. Additive — pre-0186 clients ignore the key, and with NONE
    // authored / `active` default false it's dormant (zero behaviour change).
    sb.from(PWP_RULES).select("*"),
    // 0202 — global procurement fabric master (2990s fabric_trackings port).
    // Fetched UNFILTERED (active AND inactive — each row carries `active`; the
    // Fabrics tab editor must see OFF rows). Read-only reference — NOT a source
    // of truth for any order-side consumer (selling fabrics stay sofa_fabrics).
    sb.from(CATALOG_FABRICS).select("*"),
    // 0219 — Order Entry config singleton (payment methods + form fields).
    // maybeSingle + LENIENT parse below: a missing/garbage row degrades to the
    // code defaults (pre-0219 behavior + Cash) instead of breaking the bundle.
    sb.from("order_entry_config").select("*").eq("id", true).maybeSingle(),
    // 0239 — product bundles. Fetched UNFILTERED (the Promo/GWP editor needs
    // inactive rows too); the POS active-only filter is applied client-side
    // below, mirroring the 0181 special-addons branch.
    sb.from(PRODUCT_BUNDLES).select("*"),
    // 0262 — guarantee terms. The POS needs them in the SAME round-trip as the
    // models: without a term row it cannot tell a guarantee SKU from an
    // accessory, nor which cart lines the guarantee may attach to. Fetched
    // UNFILTERED so the maintenance view sees retired terms; the active-only
    // filter is applied client-side below (mirrors the special-addons branch).
    sb.from(GUARANTEE_TERMS).select("*"),
    // 0303 (P1) — the earliest date a store may sell. One editable number,
    // read here so the POS date picker and the server-side create gate read
    // the same row instead of two copies of a literal.
    sb.from("purchasing_settings").select("earliest_sell_days").eq("id", 1).maybeSingle(),
  ]);

  for (const r of [modelsR, fabricsR, addonsR, floorR]) {
    if (r.error) throw new HTTPException(500, { message: r.error.message });
  }
  if (tierConfigR.error) throw new HTTPException(500, { message: tierConfigR.error.message });
  if (tierOverridesR.error) throw new HTTPException(500, { message: tierOverridesR.error.message });
  if (sofaCompsR.error) throw new HTTPException(500, { message: sofaCompsR.error.message });
  if (modelSofaCompsR.error) throw new HTTPException(500, { message: modelSofaCompsR.error.message });
  if (sofaCombosR.error) throw new HTTPException(500, { message: sofaCombosR.error.message });
  if (specialAddonsR.error) throw new HTTPException(500, { message: specialAddonsR.error.message });
  if (optionPoolsR.error) throw new HTTPException(500, { message: optionPoolsR.error.message });
  if (deliveryFeeR.error) throw new HTTPException(500, { message: deliveryFeeR.error.message });
  if (specialDeliveryRulesR.error) throw new HTTPException(500, { message: specialDeliveryRulesR.error.message });
  if (modelFreeGiftsR.error) throw new HTTPException(500, { message: modelFreeGiftsR.error.message });
  if (freeItemCampaignsR.error) throw new HTTPException(500, { message: freeItemCampaignsR.error.message });
  if (pwpRulesR.error) throw new HTTPException(500, { message: pwpRulesR.error.message });
  if (fabricMasterR.error) throw new HTTPException(500, { message: fabricMasterR.error.message });
  if (bundlesR.error) throw new HTTPException(500, { message: bundlesR.error.message });
  if (!floorR.data) {
    // floor_config row 1 should always exist post-migration; if it's missing
    // we surface as 500 rather than silently shipping a broken bundle.
    throw new HTTPException(500, { message: "floor_config row missing" });
  }

  // Filter skus + fabrics to only those whose model is in the non-discontinued
  // set. Cheaper than a server-side join for catalogs of this size (~50 models).
  const liveModelIds = new Set((modelsR.data ?? []).map((m) => m.id));
  const liveSkus = allSkus.filter((s) => {
    const row = s as DB.ProductSkuRow;
    if (!liveModelIds.has(row.model_id)) return false;
    // 0170 (Loo 2026-06-14) — sell-side ON/OFF. Non-admin consumers (dealer
    // wizard, Create-PO) only see pos_active SKUs; the catalog admin (admin=true)
    // sees OFF SKUs too so it can toggle them back on. Existing orders/POs that
    // reference an OFF SKU's code rehydrate by code directly, not via this bundle.
    if (!adminMode && row.pos_active === false) return false;
    return true;
  });
  const liveFabrics = (fabricsR.data ?? []).filter((f) =>
    liveModelIds.has((f as DB.SofaFabricRow).model_id),
  );

  // 0176 — safe fallback when the seed row is absent (shouldn't happen on a
  // properly migrated DB, but avoids NaN propagation on a fresh empty DB).
  const fabricTierConfig = tierConfigR.data
    ? Adapters.fabricTierConfigFromRow(tierConfigR.data as DB.FabricTierAddonConfigRow)
    : { sofaTier2Delta: 0, sofaTier3Delta: 0 };

  // 0184 — delivery fee config. The singleton (id=1) is seeded by the migration,
  // but fall back to the dormant defaults (all fees 0) when the row is absent so a
  // fresh/empty DB never ships a broken bundle (mirrors the fabric-tier fallback).
  const deliveryFeeConfig = deliveryFeeR.data
    ? Adapters.deliveryFeeConfigFromRow(deliveryFeeR.data as DB.DeliveryFeeConfigRow)
    : {
        baseFee: 0,
        crossCategoryFee: 0,
        chargedCategories: ["sofa", "mattress", "bedframe"],
        mattressBedframeLeadDays: 14,
        sofaLeadDays: 21,
      };

  const body = catalogResponseSchema.parse({
    models: (modelsR.data ?? []).map((m) => Adapters.productModelFromRow(m as DB.ProductModelRow)),
    skus: liveSkus.map((s) => Adapters.productSkuFromRow(s as DB.ProductSkuRow)),
    sofaFabrics: liveFabrics.map((f) => Adapters.sofaFabricFromRow(f as DB.SofaFabricRow)),
    addons: (addonsR.data ?? []).map((a) => Adapters.addonFromRow(a as DB.AddonRow)),
    floorConfig: Adapters.floorConfigFromRow(floorR.data as DB.FloorConfigRow),
    // 0219 — Order Entry config (additive, OPTIONAL; lenient row parse — read
    // errors / missing row degrade to the empty config = code defaults apply).
    orderEntryConfig: parseOrderEntryConfigRow(
      (entryConfigR && !entryConfigR.error ? entryConfigR.data : null) as {
        payment_methods?: unknown;
        form_fields?: unknown;
      } | null,
    ),
    // 0176 — fabric tier pricing (additive; pre-0176 clients ignore these keys).
    fabricTierConfig,
    modelFabricTierOverrides: (tierOverridesR.data ?? []).map(
      (r) => Adapters.modelFabricTierOverrideFromRow(r as DB.ModelFabricTierOverrideRow),
    ),
    // 0178 — sofa compartment pool + per-model offered (additive; optional).
    sofaCompartments: (sofaCompsR.data ?? []).map(
      (r) => Adapters.sofaCompartmentFromRow(r as DB.SofaCompartmentRow),
    ),
    // Each offered row is enriched with `skuPrice` — the synced
    // `{MODEL_KEY}-{code}` compartment SKU's price (SKU Master), which is the
    // authoritative à-la-carte price source (Loo, 2026-07-05). Joined from
    // `allSkus` (pre-pos_active-filter — a compartment sku the principal
    // toggled OFF must still price the builder in the non-admin POS bundle).
    modelSofaCompartments: (() => {
      const compSkuPrice = new Map<string, number>();
      // 0204 — the synced SKU's {size → RM} map, enriched alongside skuPrice so
      // the builder + POS price à-la-carte per the chosen size.
      const compSkuSizes = new Map<string, Record<string, number | null>>();
      for (const s of allSkus) {
        const row = s as DB.ProductSkuRow;
        if (row.compartment_id == null || row.discontinued_at != null) continue;
        if (row.prices_by_size != null) {
          const m: Record<string, number | null> = {};
          for (const [k, v] of Object.entries(row.prices_by_size)) {
            // NaN guard per entry: malformed → null (falls to the flat price).
            m[k] = v == null || !Number.isFinite(Number(v)) ? null : Number(v);
          }
          compSkuSizes.set(`${row.model_id}|${row.compartment_id}`, m);
        }
        const p = Number(row.price);
        // NaN guard: a malformed price falls through to the legacy chain (null)
        // instead of poisoning resolveCompartmentPrice (NaN survives ??).
        if (!Number.isFinite(p)) continue;
        compSkuPrice.set(`${row.model_id}|${row.compartment_id}`, p);
      }
      return (modelSofaCompsR.data ?? []).map((r) => {
        const mc = Adapters.modelSofaCompartmentFromRow(r as DB.ModelSofaCompartmentRow);
        return {
          ...mc,
          skuPrice: compSkuPrice.get(`${mc.modelId}|${mc.compartmentId}`) ?? null,
          skuPricesBySize: compSkuSizes.get(`${mc.modelId}|${mc.compartmentId}`) ?? null,
        };
      });
    })(),
    // 0179 — sofa combo pricing (additive; optional). Non-admin consumers
    // (POS / the future builder) only see live combos (active && not
    // discontinued); admin (maintenance tab) sees ALL so it can restore them —
    // mirrors the 0177 combos branch exactly.
    sofaCombos: (sofaCombosR.data ?? [])
      .filter((row) => {
        if (adminMode) return true;
        const r = row as DB.SofaComboPricingRow;
        return r.active === true && r.discontinued_at == null;
      })
      .map((r) => Adapters.sofaComboFromRow(r as DB.SofaComboPricingRow)),
    // 0181 — special add-ons. POS sees active only; admin (maintenance) sees all.
    specialAddons: (specialAddonsR.data ?? [])
      .filter((row) => adminMode || (row as DB.SpecialAddonRow).active === true)
      .map((r) => Adapters.specialAddonFromRow(r as DB.SpecialAddonRow)),
    // 0182 — global option pools. Returned in full (active AND inactive — each
    // row carries its own `active`, so consumers filter client-side), ordered by
    // (pool, sort_order, value). Sorted in JS to mirror the plain `.select("*")`
    // fetch (and stay mock-friendly) the way combos sort their components.
    optionPools: (optionPoolsR.data ?? [])
      .map((r) => Adapters.catalogOptionPoolFromRow(r as DB.CatalogOptionPoolRow))
      .sort((a, b) =>
        a.pool !== b.pool
          ? a.pool.localeCompare(b.pool)
          : a.sortOrder !== b.sortOrder
            ? a.sortOrder - b.sortOrder
            : a.value.localeCompare(b.value),
      ),
    // 0184 — delivery fee config + per-RuleTarget special rules (additive,
    // optional). Pre-0184 clients that don't read these are wholly unaffected.
    deliveryFeeConfig,
    // Active rules first, then ascending sort_order (the maintenance list +
    // POS preview both want live rules surfaced). Sorted in JS to mirror the
    // plain `.select("*")` fetch + stay mock-friendly (like option pools).
    specialDeliveryFeeRules: (specialDeliveryRulesR.data ?? [])
      .map((r) => Adapters.specialDeliveryFeeRuleFromRow(r as DB.SpecialDeliveryFeeRuleRow))
      .sort((a, b) =>
        a.active !== b.active
          ? Number(b.active) - Number(a.active)
          : a.sortOrder - b.sortOrder,
      ),
    // 0185 — Default Free Gifts (per model) + Free Item Campaigns (additive,
    // optional). Pre-0185 clients that don't read these are wholly unaffected.
    // Gift rows map straight through (malformed gift entries dropped in the
    // adapter). Campaigns are active-first, then ascending created_at — sorted on
    // the ROW before mapping (created_at isn't on the domain shape), mirroring the
    // delivery-rules active-first ordering.
    modelDefaultFreeGifts: (modelFreeGiftsR.data ?? []).map(
      (r) => Adapters.modelDefaultFreeGiftsFromRow(r as DB.ModelDefaultFreeGiftsRow),
    ),
    freeItemCampaigns: (freeItemCampaignsR.data ?? [])
      .slice()
      .sort((a, b) => {
        const ra = a as DB.FreeItemCampaignRow;
        const rb = b as DB.FreeItemCampaignRow;
        return ra.active !== rb.active
          ? Number(rb.active) - Number(ra.active)
          : String(ra.created_at).localeCompare(String(rb.created_at));
      })
      .map((r) => Adapters.freeItemCampaignFromRow(r as DB.FreeItemCampaignRow)),
    // 0186 — PWP & Promo rules (additive, OPTIONAL). Pre-0186 clients that don't
    // read this key are wholly unaffected. Active-first, then ascending created_at
    // — sorted on the ROW before mapping (created_at isn't on the domain shape),
    // mirroring the free-item-campaigns ordering above.
    pwpRules: (pwpRulesR.data ?? [])
      .slice()
      .sort((a, b) => {
        const ra = a as DB.PwpRuleRow;
        const rb = b as DB.PwpRuleRow;
        return ra.active !== rb.active
          ? Number(rb.active) - Number(ra.active)
          : String(ra.created_at).localeCompare(String(rb.created_at));
      })
      .map((r) => Adapters.pwpRuleFromRow(r as DB.PwpRuleRow)),
    // 0239 — product bundles (additive, OPTIONAL). POS sees active only; admin
    // (the Promo/GWP editor) sees all — mirrors the special-addons branch.
    // Sorted by (sort_order, name) in JS to stay mock-friendly.
    bundles: (bundlesR.data ?? [])
      .filter((row) => adminMode || (row as DB.ProductBundleRow).active === true)
      .map((r) => Adapters.productBundleFromRow(r as DB.ProductBundleRow))
      .sort((a, b) =>
        a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name),
      ),
    // 0202 — global procurement fabric master (additive, OPTIONAL). Sorted in
    // JS by (sort_order, fabric_code) to mirror the plain `.select("*")` fetch
    // and stay mock-friendly, the way the 0182 option-pools branch sorts.
    fabrics: (fabricMasterR.data ?? [])
      .map((r) => Adapters.catalogFabricFromRow(r as DB.CatalogFabricRow))
      .sort((a, b) =>
        a.sortOrder !== b.sortOrder
          ? a.sortOrder - b.sortOrder
          : a.fabricCode.localeCompare(b.fabricCode),
      ),
    // 0262 — guarantee terms (additive, OPTIONAL). POS sees active only; the
    // admin view sees retired terms too, so an old guarantee still reads as a
    // named promise on historic orders instead of a bare SKU code.
    guaranteeTerms: (guaranteeTermsR.data ?? [])
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      .filter((row: any) => adminMode || row.active === true)
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      .map((row: any) => ({
        guaranteeSku: String(row.guarantee_sku),
        label: String(row.label),
        coversCategory: row.covers_category,
        coverageYears: Number(row.coverage_years),
        remedy: row.remedy,
        termsText: row.terms_text ? String(row.terms_text) : null,
        active: Boolean(row.active),
        // 0270 scope — null at any level = ANY at that level.
        coversModelId: row.covers_model_id ? String(row.covers_model_id) : null,
        coversVariants: Array.isArray(row.covers_variants)
          ? (row.covers_variants as string[])
          : null,
        coversComboId: row.covers_combo_id ? String(row.covers_combo_id) : null,
        coversCompartmentId: row.covers_compartment_id
          ? String(row.covers_compartment_id)
          : null,
      }))
      .sort((a, b) => a.guaranteeSku.localeCompare(b.guaranteeSku)),
    // 0303 (P1) — the earliest date a store may sell. Absent (an older DB, a
    // read error) means the POS applies no floor, exactly as it does for a
    // cart with no made item: the server-side gate in lead-time.ts is the
    // one that refuses, and it reads the same row.
    earliestSellDays:
      purchasingSettingsR && !purchasingSettingsR.error && purchasingSettingsR.data
        ? Number(
            (purchasingSettingsR.data as { earliest_sell_days?: number }).earliest_sell_days ?? 0,
          )
        : undefined,
  });
  // EXPOSURE NOTE (0186): unlike `cost`, the PWP discounted reward price
  // (product_skus.pwp_price → sku.pwpPrice / sofa_combo_pricing.pwp_prices_by_height
  // → sofaCombo.pwpPricesByHeight) legitimately needs to reach the POS so the
  // salesperson can preview a PWP-reward line's discounted price. It therefore
  // rides in the bundle for ALL roles by design — it is NOT stripped. (The
  // principal-only WRITE lock still applies: the 0186 trigger + the route gate
  // block a non-principal from SETTING it.) This is a deliberate read-exposure,
  // tracked as the `pwp-price-pos-bundle-exposure` carry-forward (companion to
  // `combo-cost-pos-bundle-exposure`).

  // 0074 — was `private, max-age=300` but the browser cache was beating
  // react-query's invalidate-on-write (Loo 2026-05-09: new sofa model
  // didn't show until hard reload). React-query's `staleTime: 5 * 60_000`
  // already handles client-side caching; HTTP cache here was redundant.
  c.header("Cache-Control", "no-store");
  return c.json(body);
});

// ---------------------------------------------------------------------------
// Catalog admin (0074, Loo 2026-05-09 Q2=c). Principal + operation manage the
// SKU catalog; RLS write policies (catalog_write_internal /
// skus_write_internal / fabrics_write_internal) enforce the role gate via
// is_internal() — we forward the user JWT and let RLS reject other roles
// (PG 42501 → 403 via mapPgError).
//
// Soft-delete pattern: DELETE sets discontinued_at = now(); GET / filters
// those out so only admin endpoints (and the upcoming catalog UI's "show
// discontinued" toggle) ever see them.
// ---------------------------------------------------------------------------

// ----- Models -----

catalogRouter.post("/models", async (c) => {
  const parsed = await parseJsonBody(c, productModelCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("product_models")
    .insert({
      category: parsed.data.category,
      model_key: parsed.data.modelKey,
      name: parsed.data.name,
      blurb: parsed.data.blurb ?? null,
      colors: parsed.data.colors ?? null,
      gaps: parsed.data.gaps ?? null,
      sofa_mode: parsed.data.sofaMode ?? null,
      allowed_options: parsed.data.allowedOptions ?? {},
    })
    .select("*")
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(
    { model: Adapters.productModelFromRow(data as DB.ProductModelRow) },
    201,
  );
});

catalogRouter.patch("/models/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, productModelPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.category !== undefined) patch.category = parsed.data.category;
  if (parsed.data.modelKey !== undefined) patch.model_key = parsed.data.modelKey;
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.blurb !== undefined) patch.blurb = parsed.data.blurb;
  if (parsed.data.colors !== undefined) patch.colors = parsed.data.colors;
  if (parsed.data.gaps !== undefined) patch.gaps = parsed.data.gaps;
  if (parsed.data.sofaMode !== undefined) patch.sofa_mode = parsed.data.sofaMode;
  // 0075 — restore toggle (Loo 2026-05-09).
  if (parsed.data.discontinuedAt !== undefined)
    patch.discontinued_at = parsed.data.discontinuedAt;
  // 0171 — option pool edits (Modular AllowedOptionsPanel / Maintenance).
  if (parsed.data.allowedOptions !== undefined)
    patch.allowed_options = parsed.data.allowedOptions;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("product_models")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }
  return c.json({ model: Adapters.productModelFromRow(data as DB.ProductModelRow) });
});

// Soft-delete: stamps discontinued_at so the public catalog hides the model
// (and its SKUs/fabrics via the `liveModelIds` filter on GET /). Existing
// orders + POs that already reference its SKU strings continue to work
// (the FK is on `model_id` in product_skus only — pre-existing rows in
// purchase_order_lines/order_lines reference the SKU as plain text).
catalogRouter.delete("/models/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("product_models")
    .update({ discontinued_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }
  return c.json({ ok: true });
});

// ----- SKUs (variants) -----

catalogRouter.post("/skus", async (c) => {
  const parsed = await parseJsonBody(c, productSkuCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  // Phase 2 (0175): principal-only price/cost. Non-principal may still create an
  // unpriced SKU (price 0 / cost null) for the principal to price later.
  gateSkuCreatePriceCost(c, parsed.data);
  const sb = userClient(c.env, c.var.auth.jwt);

  // SKU code = `<category>:<model_key>:<variant>` to match the existing
  // catalog convention (split_part used by operation_calc_shortages,
  // CreatePOModal, etc.). Server resolves category + model_key from the
  // model row so the FE doesn't need to send them.
  const { data: modelRow, error: modelErr } = await sb
    .from("product_models")
    .select("category, model_key, name")
    .eq("id", parsed.data.modelId)
    .maybeSingle();
  if (modelErr) {
    const m = mapPgError(modelErr);
    return c.json(m.body, m.status);
  }
  if (!modelRow) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }
  const supplierless = SUPPLIERLESS_CATEGORIES.has(modelRow.category);

  // Accessory / service carry NO variant axis (one SKU per model, Loo
  // 2026-07-11) — an empty variant is allowed for them and the SKU code is the
  // bare MODEL_KEY. Every other category still requires a variant (the size /
  // preset IS the code suffix).
  if (parsed.data.variant === "" && !supplierless) {
    return c.json(
      {
        error: "validation",
        code: "variant_required",
        message: `A size / variant is required for ${modelRow.category} SKUs.`,
      },
      422,
    );
  }

  // Mattress/bedframe sizes resolve through the canonical table so the SKU code
  // stays SHORT (`-K`) while the stored variant (the SIZE shown) is the FULL
  // name (`King`). Non-size variants (sofa presets, accessories) pass through.
  const isBedSize =
    parsed.data.variantKind === "size" &&
    (modelRow.category === "mattress" || modelRow.category === "bedframe");
  const resolvedVariant = isBedSize
    ? canonicalSize(parsed.data.variant)
    : { code: parsed.data.variant, name: parsed.data.variant };
  const skuCode = resolvedVariant.code
    ? deriveSkuCode(modelRow.model_key, resolvedVariant.code)
    : modelRow.model_key.toUpperCase();

  // 0074 bugfix (Loo 2026-05-09): product_skus.supplier_id was NOT NULL on
  // staging/prod. Auto-resolve from suppliers.cat_covered[] when the caller
  // doesn't pass an explicit supplierId — same routing rule the Create-PO
  // modal uses. 0171 (Loo 2026-06-14): service/accessory SKUs carry NO supplier,
  // so the requirement is relaxed for them (supplier_id stays null).
  let supplierId: string | null = parsed.data.supplierId ?? null;
  if (!supplierId && !supplierless) {
    const { data: supRow, error: supErr } = await sb
      .from("suppliers")
      .select("id")
      .contains("cat_covered", [modelRow.category])
      .limit(1)
      .maybeSingle();
    if (supErr) {
      const m = mapPgError(supErr);
      return c.json(m.body, m.status);
    }
    if (!supRow) {
      return c.json(
        {
          error: "rule_violation",
          code: "no_supplier_for_category",
          message: `No supplier currently covers ${modelRow.category}. Configure one before adding ${modelRow.category} variants.`,
        },
        422,
      );
    }
    supplierId = supRow.id as string;
  }

  // Loo 2026-07-20 — auto-generate the description for mattress/bedframe SKUs
  // when the caller didn't type one: `{Category} {Model name} {dimensions}`
  // (e.g. `Mattress Lumi Classic 183X190CM`), the dimensions looked up from the
  // Maintenance size pool by this SKU's size. A typed description always wins;
  // no pool match / no dimensions → stays null. Accessory + service stay fully
  // manual; sofa compartment SKUs get "Sofa {Model} {code}" in the offer auto-sync.
  let description = parsed.data.description ?? null;
  if (!description && isBedSize) {
    const { data: poolRows, error: poolErr } = await sb
      .from(CATALOG_OPTION_POOLS)
      .select("value, dimensions")
      .eq("pool", `${modelRow.category}_size`);
    if (poolErr) {
      const m = mapPgError(poolErr);
      return c.json(m.body, m.status);
    }
    description = autoBedSkuDescription(
      modelRow.category,
      (modelRow.name as string) ?? "",
      resolvedVariant.code,
      (poolRows ?? []) as { value: string; dimensions: string | null }[],
    );
  }

  const { data, error } = await sb
    .from("product_skus")
    .insert({
      model_id: parsed.data.modelId,
      sku: skuCode,
      variant: resolvedVariant.name,
      variant_kind: parsed.data.variantKind,
      price: parsed.data.price,
      cost: parsed.data.cost ?? null,
      // 0186 — principal-only PWP reward price (companion to cost). null = unset.
      pwp_price: parsed.data.pwpPrice ?? null,
      supplier_id: supplierId,
      // 0375 — the supplier's own item code. '' → null (a blank is not a code).
      //
      // ⚠️ SPREAD, NOT A FIXED KEY, and the reason is a deploy-order hazard:
      // this route ships with the WEB deploy, but 0375 is applied BY HAND. In
      // the window between them the column does not exist, and PostgREST
      // refuses an INSERT naming an unknown column — which would have taken
      // out SKU creation entirely, not just the new field. Omitting the key
      // when nobody typed a code keeps the old path working untouched; a
      // typed code still fails loudly, which is the honest half of the trade.
      // The PATCH door is already conditional for the same reason.
      ...(parsed.data.supplierCode?.trim()
        ? { supplier_code: parsed.data.supplierCode.trim() }
        : {}),
      description,
      pos_active: parsed.data.posActive ?? true,
    })
    .select("*")
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(
    { sku: Adapters.productSkuFromRow(data as DB.ProductSkuRow) },
    201,
  );
});

catalogRouter.patch("/skus/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, productSkuPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  // Phase 2 (0175): principal-only price/cost. All other SKU edits (variant,
  // pos_active, description, supplier, restore toggle) stay open to internal.
  gateSkuPatchPriceCost(c, parsed.data);
  const patch: Record<string, unknown> = {};
  // Loo 2026-07-11 — the CODE is a free, directly-renameable field (AutoCount
  // style). DB unique(sku) turns a collision into a clean 409 via mapPgError.
  if (parsed.data.sku !== undefined) patch.sku = parsed.data.sku;
  // 0375 — supplier's own item code; '' clears to null (a blank is not a code).
  if (parsed.data.supplierCode !== undefined)
    patch.supplier_code = parsed.data.supplierCode?.trim() || null;
  if (parsed.data.variant !== undefined) patch.variant = parsed.data.variant;
  if (parsed.data.variantKind !== undefined) patch.variant_kind = parsed.data.variantKind;
  if (parsed.data.price !== undefined) patch.price = parsed.data.price;
  if (parsed.data.cost !== undefined) patch.cost = parsed.data.cost;
  // 0186 — only write pwp_price when present so an unrelated patch doesn't clobber
  // the benchmark; an explicit null clears it (back to "unset").
  if (parsed.data.pwpPrice !== undefined) patch.pwp_price = parsed.data.pwpPrice;
  // 0204 — full-map replace: the UI sends the whole {size → RM} map on each
  // commit (unpriced sizes OMITTED); explicit null clears the map entirely.
  if (parsed.data.pricesBySize !== undefined) patch.prices_by_size = parsed.data.pricesBySize;
  if (parsed.data.supplierId !== undefined) patch.supplier_id = parsed.data.supplierId;
  // 0075 — restore toggle (Loo 2026-05-09).
  if (parsed.data.discontinuedAt !== undefined)
    patch.discontinued_at = parsed.data.discontinuedAt;
  // 0170 — sell-side toggle + editable description.
  if (parsed.data.posActive !== undefined) patch.pos_active = parsed.data.posActive;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }

  const sb = userClient(c.env, c.var.auth.jwt);

  // Loo 2026-07-11 — a variant/SIZE edit no longer rewrites the code (the CODE
  // is a free field renamed via the explicit `sku` patch above). Only the
  // CLEAR gate remains: '' is allowed solely for the no-variant-axis
  // categories (accessory/service) — every other category needs its size.
  if (parsed.data.variant === "") {
    const { data: skuRow, error: skuErr } = await sb
      .from("product_skus")
      .select("model_id")
      .eq("id", id)
      .maybeSingle();
    if (skuErr) {
      const m = mapPgError(skuErr);
      return c.json(m.body, m.status);
    }
    if (!skuRow) {
      return c.json({ error: "not_found", code: "not_found", message: "sku not found" }, 404);
    }
    const { data: modelRow } = await sb
      .from("product_models")
      .select("category")
      .eq("id", skuRow.model_id)
      .maybeSingle();
    if (modelRow && !SUPPLIERLESS_CATEGORIES.has(modelRow.category as string)) {
      return c.json(
        {
          error: "validation",
          code: "variant_required",
          message: `A size / variant is required for ${modelRow.category} SKUs.`,
        },
        422,
      );
    }
  }

  const { data, error } = await sb
    .from("product_skus")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "sku not found" }, 404);
  }
  return c.json({ sku: Adapters.productSkuFromRow(data as DB.ProductSkuRow) });
});

// Loo 2026-07-20 — Delete = the SKU is GONE for good (was a soft
// discontinued_at stamp; Loo: "如果选择 delete，就是这个 SKU 永远消失").
// Order/PO lines are unaffected — they store the sku as a text snapshot, no FK.
// Soft retirement still exists as `discontinued_at` via PATCH (and the
// compartment un-offer path keeps soft-discontinuing by design).
//
// Loo 2026-07-20 (same day, follow-up) — deleting a model's LAST SKU deletes
// the now-empty model too, so its chip/row leaves SKU Master + Modular with
// it ("when no more that model sku anymore"). Every FK onto product_models is
// ON DELETE CASCADE (verified live: product_skus / sofa_fabrics /
// model_sofa_compartments / model_fabric_tier_overrides / sofa_combo_pricing
// / model_default_free_gifts) and order/PO lines snapshot the sku as text, so
// the model delete is clean. Best-effort: the SKU is already gone, so a model
// cleanup failure never turns the response into an error.
// Loo 2026-07-21 — deleting a COMPARTMENT sku also UN-OFFERS the compartment
// on its model (deletes the model_sofa_compartments row): a deleted sku can't
// be ordered, so the Modular toggle + the POS builder must stop offering it
// (the P5 explode would fail-closed on it anyway). The offer write is
// principal-only (0178 RLS), so a compartment sku's delete is gated to the
// principal too — otherwise a non-principal delete would strand a ghost offer
// RLS won't let it clean up. Offer first, sku second: if the sku delete then
// fails, the model merely shows the compartment un-offered while the row
// lingers in SKU Master (delete again / re-offer both recover) — never the
// reverse (offered but unorderable).
catalogRouter.delete("/skus/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data: target, error: tErr } = await sb
    .from("product_skus")
    .select("id, model_id, compartment_id")
    .eq("id", id)
    .maybeSingle();
  if (tErr) {
    const m = mapPgError(tErr);
    return c.json(m.body, m.status);
  }
  if (!target) {
    return c.json({ error: "not_found", code: "not_found", message: "sku not found" }, 404);
  }
  const compartmentId = (target as { compartment_id: string | null }).compartment_id;
  const targetModelId = (target as { model_id: string | null }).model_id;
  if (compartmentId) {
    principalOnly(c, SOFA_COMPARTMENT_MSG);
    if (targetModelId) {
      const { error: offErr } = await sb
        .from("model_sofa_compartments")
        .delete()
        .eq("model_id", targetModelId)
        .eq("compartment_id", compartmentId);
      if (offErr) {
        const m = mapPgError(offErr);
        return c.json(m.body, m.status);
      }
    }
  }

  const { data, error } = await sb
    .from("product_skus")
    .delete()
    .eq("id", id)
    .select("id, model_id")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "sku not found" }, 404);
  }

  let modelDeleted = false;
  const modelId = (data as { model_id: string | null }).model_id;
  if (modelId) {
    // Any surviving row (incl. discontinued ones) keeps the model. Check-then-
    // delete is not atomic, but catalog authoring is single-principal and the
    // model delete would only cascade onto a SKU inserted inside that window.
    const { count, error: cntErr } = await sb
      .from("product_skus")
      .select("id", { count: "exact", head: true })
      .eq("model_id", modelId);
    if (!cntErr && count === 0) {
      const { data: gone } = await sb
        .from("product_models")
        .delete()
        .eq("id", modelId)
        .select("id")
        .maybeSingle();
      modelDeleted = gone != null;
    }
  }
  return c.json({ ok: true, modelDeleted });
});

// POST /import-skus — bulk SKU import (2990s Products parity Phase 1). Faithful
// port of the 2990s batch-import: max 500 rows, **blank cell = preserve** (an
// omitted field is never written on update, so an export -> edit -> re-import
// round-trip can't zero a price), per-row failures so one bad row never sinks
// the batch. Carres divergence: each row resolves/creates a product_model by
// (category, model_key) FIRST, then upserts a product_sku under it keyed by the
// derived `{MODEL_KEY}-{variant}` code (the load-bearing order/PO/stock join key).
//
// Gating: internalOnly to run at all; principal-only the moment ANY row carries
// a price/cost (mirrors the 0175 lock — the DB trigger is still the real boundary
// since we forward the user JWT). userClient/RLS only — never service_role.
//
// COST: a CONSTANT 4 Cloudflare subrequests — three batched reads and one
// catalog_import_skus call (migration 0358) — no matter how many rows the file
// carries. It used to be 3 + one INSERT per new model + one write per row, which
// crossed the Workers Free-plan cap of 50 at around 45 rows and then reported
// the overflow as several hundred identical spreadsheet errors.
catalogRouter.post("/import-skus", async (c) => {
  internalOnly(c);
  const parsed = await parseJsonBody(c, skuImportInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const rows = parsed.data.rows;

  if (hasPricingIntent(rows) && c.var.auth.role !== "principal") {
    return c.json(
      {
        error: "forbidden",
        code: "import_pricing_principal_only",
        message:
          "Only the principal (Master Admin) can import SKU price or cost. Remove the price/cost columns, or ask the principal to run the priced import.",
      },
      403,
    );
  }

  const sb = userClient(c.env, c.var.auth.jwt);
  const rowKey = (r: SkuImportRow) => deriveSkuCode(r.modelKey, r.variant);
  // One slot per submitted row. A row that fails anywhere fills its own slot, so
  // the failures come back in file order however they were discovered.
  const failureByRow: (SkuImportFailure | null)[] = rows.map(() => null);

  // ---- (1) Supplier resolution maps (load all suppliers once) ----------------
  // .order(slug) so category auto-resolve (first-wins) is deterministic if two
  // suppliers ever cover the same category.
  const { data: suppliers, error: supErr } = await sb
    .from("suppliers")
    .select("id, slug, name, cat_covered")
    .order("slug");
  if (supErr) {
    const m = mapPgError(supErr);
    return c.json(m.body, m.status);
  }
  const supBySlug = new Map<string, string>();
  const supByName = new Map<string, string>();
  const supByCategory = new Map<string, string>();
  for (const row of suppliers ?? []) {
    const s = row as { id: string; slug: string | null; name: string | null; cat_covered: string[] | null };
    if (s.slug) supBySlug.set(s.slug.toLowerCase(), s.id);
    if (s.name) supByName.set(s.name.toLowerCase(), s.id);
    for (const cat of s.cat_covered ?? []) {
      if (!supByCategory.has(cat)) supByCategory.set(cat, s.id);
    }
  }

  // ---- (2) Resolve models by (category, model_key) ---------------------------
  // Read-only here. CREATING the missing ones is the RPC's job — it is a write,
  // and it was one subrequest each. This map answers a different question: which
  // model does a code belong to TODAY, for the collision check below.
  const modelComposite = (category: string, modelKey: string) => `${category}::${modelKey}`;
  const wantedModelKeys = Array.from(new Set(rows.map((r) => r.modelKey)));
  const { data: existingModels, error: modelsErr } = await sb
    .from("product_models")
    .select("id, category, model_key")
    .in("model_key", wantedModelKeys);
  if (modelsErr) {
    const m = mapPgError(modelsErr);
    return c.json(m.body, m.status);
  }
  const modelIdByComposite = new Map<string, string>();
  for (const row of existingModels ?? []) {
    const mr = row as { id: string; category: string; model_key: string };
    modelIdByComposite.set(modelComposite(mr.category, mr.model_key), mr.id);
  }

  // ---- (3) Preload existing SKUs by derived code -----------------------------
  // Carry model_id so a code that already belongs to a DIFFERENT model (a
  // cross-category {MODEL_KEY}-{variant} collision) is rejected, never silently
  // re-targeted — the derived code doesn't encode category.
  const wantedCodes = Array.from(new Set(rows.map(rowKey)));
  const { data: existingSkus, error: skusErr } = await sb
    .from("product_skus")
    .select("sku, model_id")
    .in("sku", wantedCodes);
  if (skusErr) {
    const m = mapPgError(skusErr);
    return c.json(m.body, m.status);
  }
  const skuByCode = new Map<string, { modelId: string }>();
  for (const row of existingSkus ?? []) {
    const sr = row as { sku: string; model_id: string };
    skuByCode.set(sr.sku, { modelId: sr.model_id });
  }

  // ---- (4) The distinct models the file names --------------------------------
  // Name comes from the first row that mentions the model; allowed_options.sizes
  // is seeded from that model's size variants (Modular parity). The RPC creates
  // only the ones that turn out to be missing.
  const models = new Map<string, { category: string; model_key: string; name: string; sizes: Set<string> }>();
  for (const r of rows) {
    const comp = modelComposite(r.category, r.modelKey);
    let entry = models.get(comp);
    if (!entry) {
      entry = { category: r.category, model_key: r.modelKey, name: r.model, sizes: new Set() };
      models.set(comp, entry);
    }
    if (r.variantKind === "size") entry.sizes.add(r.variant);
  }

  // ---- (5) Build the batch — every rejection reason is settled here ----------
  type ImportPayloadRow = Record<string, unknown> & { sku: string };
  const payloadRows: ImportPayloadRow[] = [];
  const sourceRowOf: number[] = []; // payload index -> submitted row index
  // Codes an EARLIER row in this same file will have inserted by the time the
  // RPC reaches this one. Separate from skuByCode, which is the pre-batch
  // snapshot the collision check must use.
  const insertedInBatch = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = rowKey(r);
    const comp = modelComposite(r.category, r.modelKey);

    // A code that already exists under a DIFFERENT model means a cross-category
    // collision (same {MODEL_KEY}-{variant}, different category). Fail the row
    // rather than clobber an unrelated SKU. An undefined model id means this
    // file is CREATING that model, so any pre-existing code is by definition
    // somebody else's.
    const collidesWith = skuByCode.get(code);
    const knownModelId = modelIdByComposite.get(comp);
    if (collidesWith && (knownModelId === undefined || collidesWith.modelId !== knownModelId)) {
      failureByRow[i] = {
        row: i + 1,
        key: code,
        reason: `code ${code} already belongs to another model — pick a distinct model_key`,
      };
      continue;
    }
    const willExist = skuByCode.has(code) || insertedInBatch.has(code);

    // Supplier: an explicit column always resolves (and is written on either
    // path). A NEW sku in a supplier-bearing category must resolve one (else the
    // row fails). An UPDATE with no explicit supplier preserves the stored one —
    // so we don't require a covering supplier just to edit a price/description.
    let supplierId: string | null = null;
    let supplierExplicit = false;
    if (r.supplier) {
      const found = supBySlug.get(r.supplier.toLowerCase()) ?? supByName.get(r.supplier.toLowerCase());
      if (!found) {
        failureByRow[i] = { row: i + 1, key: code, reason: `supplier "${r.supplier}" not found` };
        continue;
      }
      supplierId = found;
      supplierExplicit = true;
    } else if (!willExist && !SUPPLIERLESS_CATEGORIES.has(r.category)) {
      const auto = supByCategory.get(r.category);
      if (!auto) {
        failureByRow[i] = { row: i + 1, key: code, reason: `no supplier covers ${r.category}` };
        continue;
      }
      supplierId = auto;
    }

    const p: ImportPayloadRow = {
      category: r.category,
      model_key: r.modelKey,
      sku: code,
      variant: r.variant,
      supplier_id: supplierId,
      supplier_explicit: supplierExplicit,
    };
    // An OMITTED key means PRESERVE — on this side and in the RPC. Never send a
    // null: a blank cell was dropped upstream so a round-trip cannot zero a
    // price or re-type a preset SKU to 'size'.
    if (r.variantKind !== undefined) p.variant_kind = r.variantKind;
    if (r.price !== undefined) p.price = r.price;
    if (r.cost !== undefined) p.cost = r.cost;
    if (r.description !== undefined) p.description = r.description;
    /* 0376 — the supplier's own item code. Same omitted-means-preserve rule:
       a file with no supplier_code column must not wipe codes keyed in by
       hand, and only a PRESENT-but-blank cell clears one. */
    if (r.supplierCode !== undefined) p.supplier_code = r.supplierCode;
    /* 0186 pwp_price via the import (2026-08-24). Same omitted-means-preserve
       rule. DEPLOY-ORDER SAFE unlike 0375's column: this is a KEY IN A JSONB
       PAYLOAD, and catalog_import_skus reads only the keys it knows — until
       the migration teaching it pwp_price is applied, the key is simply
       ignored (rows import, prices don't land), never an error. */
    if (r.pwpPrice !== undefined) p.pwp_price = r.pwpPrice;
    if (r.posActive !== undefined) p.pos_active = r.posActive;

    payloadRows.push(p);
    sourceRowOf.push(i);
    // A later duplicate of this code in the same file is an UPDATE by the time
    // the RPC reaches it, so it no longer needs a covering supplier — mirroring
    // the in-order last-wins merge the RPC performs.
    insertedInBatch.add(code);
  }

  // ---- (6) ONE call: create the models, then upsert every row in order -------
  // Order is the contract. The RPC walks `rows` as sent, inside one transaction,
  // so a duplicated code merges last-wins with the earlier row's fields intact.
  // A concurrent pool would break that and would not reduce the subrequest count
  // — which is the thing that was actually broken.
  let upserted = 0;
  let createdModels = 0;
  const { data: batch, error: batchErr } = await sb.rpc("catalog_import_skus", {
    p_payload: {
      models: Array.from(models.values()).map((m) => ({
        category: m.category,
        model_key: m.model_key,
        name: m.name,
        sizes: Array.from(m.sizes),
      })),
      rows: payloadRows,
    },
  });

  const failAllSent = (reason: string) => {
    sourceRowOf.forEach((src, k) => {
      failureByRow[src] = { row: src + 1, key: payloadRows[k].sku, reason };
    });
  };

  if (batchErr) {
    // The batch itself failed (role gate, transport). Report every row that
    // reached it, rather than 500-ing an import that wrote nothing.
    failAllSent(mapPgError(batchErr).body.message ?? batchErr.message);
  } else {
    const res = (batch ?? {}) as {
      created_models?: number;
      rows?: { result: string; error?: string | null }[];
    };
    createdModels = res.created_models ?? 0;
    const results = res.rows ?? [];
    sourceRowOf.forEach((src, k) => {
      const d = results[k];
      if (!d) {
        failureByRow[src] = {
          row: src + 1,
          key: payloadRows[k].sku,
          reason: "no result returned for this row",
        };
      } else if (d.result === "error") {
        failureByRow[src] = {
          row: src + 1,
          key: payloadRows[k].sku,
          reason: d.error ?? "import failed",
        };
      } else {
        upserted += 1;
      }
    });
  }

  const failures = failureByRow.filter((f): f is SkuImportFailure => f !== null);
  return c.json({
    upserted,
    createdModels,
    failed: failures.length,
    failures: failures.slice(0, 50),
  });
});

// ----- Sofa fabrics -----

catalogRouter.post("/sofa-fabrics", async (c) => {
  const parsed = await parseJsonBody(c, sofaFabricCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("sofa_fabrics")
    .insert({
      model_id: parsed.data.modelId,
      fabric_name: parsed.data.fabricName,
      surcharge: parsed.data.surcharge,
      // 0075 — fabric colors (Loo 2026-05-09).
      colors: parsed.data.colors ?? null,
      // 0176 — price tier. Defaults to PRICE_1 if caller omits the field.
      tier: parsed.data.tier ?? "PRICE_1",
    })
    .select("*")
    .single();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json(
    { fabric: Adapters.sofaFabricFromRow(data as DB.SofaFabricRow) },
    201,
  );
});

catalogRouter.patch("/sofa-fabrics/:id", async (c) => {
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, sofaFabricPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.fabricName !== undefined) patch.fabric_name = parsed.data.fabricName;
  if (parsed.data.surcharge !== undefined) patch.surcharge = parsed.data.surcharge;
  if (parsed.data.colors !== undefined) patch.colors = parsed.data.colors;
  // 0075 — restore toggle: PATCH discontinuedAt:null clears the soft-delete.
  if (parsed.data.discontinuedAt !== undefined)
    patch.discontinued_at = parsed.data.discontinuedAt;
  // 0176 — tier change (PRICE_1/2/3). No principal gate at the API layer for
  // v1 (RLS on sofa_fabrics uses is_internal(); tier is further gated in the UI).
  if (parsed.data.tier !== undefined) patch.tier = parsed.data.tier;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("sofa_fabrics")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "fabric not found" }, 404);
  }
  return c.json({ fabric: Adapters.sofaFabricFromRow(data as DB.SofaFabricRow) });
});

catalogRouter.delete("/sofa-fabrics/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("sofa_fabrics")
    .update({ discontinued_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "fabric not found" }, 404);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 0169-0173 — Product & Maintenance: sizes-active cascade, generate-skus,
// model photo (signed-upload), floor-config + addons (Maintenance tab).
// All internal-only (operation/principal); RLS is the real boundary.
// ---------------------------------------------------------------------------

// PATCH /models/:id/sizes-active — `sizes` is the new ACTIVE set. Writes
// allowed_options.sizes and cascades pos_active across the model's size SKUs
// (in-set => on, others => off). NEVER touches discontinued_at.
catalogRouter.patch("/models/:id/sizes-active", async (c) => {
  internalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, sizesActiveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: modelRow, error: mErr } = await sb
    .from("product_models")
    .select("allowed_options")
    .eq("id", id)
    .maybeSingle();
  if (mErr) { const m = mapPgError(mErr); return c.json(m.body, m.status); }
  if (!modelRow) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }

  const nextOpts = {
    ...((modelRow.allowed_options as Record<string, unknown>) ?? {}),
    sizes: parsed.data.sizes,
  };
  const { error: upErr } = await sb
    .from("product_models")
    .update({ allowed_options: nextOpts })
    .eq("id", id);
  if (upErr) { const m = mapPgError(upErr); return c.json(m.body, m.status); }

  // Cascade: all size SKUs off, then turn the in-set ones on. Two idempotent
  // bulk updates (no per-row loop). Never touches discontinued_at.
  const offRes = await sb
    .from("product_skus")
    .update({ pos_active: false })
    .eq("model_id", id)
    .eq("variant_kind", "size");
  if (offRes.error) { const m = mapPgError(offRes.error); return c.json(m.body, m.status); }
  if (parsed.data.sizes.length > 0) {
    const onRes = await sb
      .from("product_skus")
      .update({ pos_active: true })
      .eq("model_id", id)
      .eq("variant_kind", "size")
      .in("variant", parsed.data.sizes);
    if (onRes.error) { const m = mapPgError(onRes.error); return c.json(m.body, m.status); }
  }
  return c.json({ ok: true, sizes: parsed.data.sizes });
});

// POST /models/:id/generate-skus — materialize one SKU per variant (from
// allowed_options.sizes or an explicit list). Code = {MODEL_KEY}-{variant}.
// Idempotent: existing codes are skipped, not 409'd.
catalogRouter.post("/models/:id/generate-skus", async (c) => {
  internalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, generateSkusInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  const { data: modelRow, error: mErr } = await sb
    .from("product_models")
    .select("category, model_key, name, allowed_options")
    .eq("id", id)
    .maybeSingle();
  if (mErr) { const m = mapPgError(mErr); return c.json(m.body, m.status); }
  if (!modelRow) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }

  const optSizes = ((modelRow.allowed_options as { sizes?: string[] })?.sizes) ?? [];
  const variants = (parsed.data.variants ?? optSizes).filter((v) => v.trim().length > 0);
  if (variants.length === 0) {
    return c.json({ ok: true, generated: 0, skipped: 0, message: "no variants to generate" });
  }

  // Supplier resolution (size categories need one; service/accessory don't).
  // An explicit caller supplierId wins outright - two suppliers can both cover
  // one category, and without an override a keyer has no way to say a batch is
  // Hookka's rather than whichever supplier's cat_covered[] happened to sort
  // first. Absent (the default) keeps today's auto-resolve byte-identical.
  let supplierId: string | null = null;
  if (!SUPPLIERLESS_CATEGORIES.has(modelRow.category)) {
    if (parsed.data.supplierId) {
      const { data: chosen, error: chosenErr } = await sb
        .from("suppliers")
        .select("id")
        .eq("id", parsed.data.supplierId)
        .maybeSingle();
      if (chosenErr) { const m = mapPgError(chosenErr); return c.json(m.body, m.status); }
      if (!chosen) {
        return c.json(
          { error: "not_found", code: "not_found", message: "supplierId does not exist" },
          404,
        );
      }
      supplierId = chosen.id as string;
    } else {
      const { data: supRow, error: supErr } = await sb
        .from("suppliers")
        .select("id")
        .contains("cat_covered", [modelRow.category])
        .limit(1)
        .maybeSingle();
      if (supErr) { const m = mapPgError(supErr); return c.json(m.body, m.status); }
      if (!supRow) {
        return c.json(
          {
            error: "rule_violation",
            code: "no_supplier_for_category",
            message: `No supplier currently covers ${modelRow.category}. Configure one before generating ${modelRow.category} SKUs.`,
          },
          422,
        );
      }
      supplierId = supRow.id as string;
    }
  }

  // Mattress/bedframe sizes resolve through the canonical table so the SKU
  // code stays SHORT (`-K`) while the stored variant (the SIZE shown) is the
  // FULL name (`King`) — never the raw pool code. Other categories pass through
  // unchanged (canonicalSize is a no-op for non-bed tokens anyway).
  const isBedCategory = modelRow.category === "mattress" || modelRow.category === "bedframe";
  const resolve = (v: string) => (isBedCategory ? canonicalSize(v) : { code: v, name: v });
  const codeFor = (v: string) => deriveSkuCode(modelRow.model_key, resolve(v).code);

  // Loo 2026-07-20 — auto description per generated bed SKU:
  // `{Category} {Model name} {dimensions}` from the Maintenance size pool
  // (matched by this variant's canonical size). No pool match → null; never
  // blocks the generation. Non-bed categories don't auto-describe here.
  let poolDims: { value: string; dimensions: string | null }[] = [];
  if (isBedCategory) {
    const { data: poolRows, error: poolErr } = await sb
      .from(CATALOG_OPTION_POOLS)
      .select("value, dimensions")
      .eq("pool", `${modelRow.category}_size`);
    if (poolErr) { const m = mapPgError(poolErr); return c.json(m.body, m.status); }
    poolDims = (poolRows ?? []) as { value: string; dimensions: string | null }[];
  }
  const wantCodes = variants.map(codeFor);
  const { data: existingRows, error: exErr } = await sb
    .from("product_skus")
    .select("sku")
    .in("sku", wantCodes);
  if (exErr) { const m = mapPgError(exErr); return c.json(m.body, m.status); }
  const existing = new Set((existingRows ?? []).map((r) => (r as { sku: string }).sku));

  /* ⭐ The supplier's own code per generated row (2026-08-24): the per-variant
     override first, then the batch default, then NULL. Read against the RAW
     variant the caller sent — the canonical size (`K` → `King`) is computed
     here, so the caller cannot have keyed the map by it. A blank string is
     NULL, not "", so an untouched box never writes an empty code. */
  const supplierCodeFor = (v: string): string | null => {
    /* A BLANK OVERRIDE IS AN ABSENT ONE, not an instruction to clear. The box
       for a piece starts empty and shows the batch code as its placeholder, so
       "left alone" and "deliberately emptied" look identical to the operator —
       reading `""` as a clear would blank the code they had just typed above.
       `??` alone gets this wrong: an empty string is not nullish, so it would
       win the coalesce and take the batch default out of play. */
    const own = (parsed.data.supplierCodes?.[v] ?? "").trim();
    return own || (parsed.data.supplierCode ?? "").trim() || null;
  };
  /* THE DEPLOY-ORDER HAZARD, RESPECTED (`catalog.skus-supplier-code.test.ts`).
     `supplier_code` (0375) was applied by hand, and PostgREST refuses an INSERT
     naming a column that does not exist — which would take out SKU GENERATION
     entirely rather than just the new field. So the key is named only when a
     code was actually typed, and then on EVERY row of the batch, because a
     bulk insert whose objects disagree about their keys is its own hazard. */
  const anySupplierCode = variants.some((v) => supplierCodeFor(v) !== null);

  /* ⭐ PER-VARIANT PRICE AND PWP (2026-08-25) — the quotation case: a bedframe
     is priced per size, so ONE batch price wrote the wrong number on every row.
     A variant's own entry wins; absent falls back to the batch price, then 0
     (UNPRICED). An explicit per-variant 0 is a deliberate "unpriced at this
     size" and is kept — `??` passes 0 through, which is exactly right.
     pwp_price obeys the 0186 server law: a value <= 0 means NOT SET and is
     stored as NULL, never as a zero that half-reads as a price. The key rides
     every row of the batch or none (rows of one bulk insert must agree about
     their columns). */
  const priceFor = (v: string): number => parsed.data.prices?.[v] ?? parsed.data.price ?? 0;
  const pwpFor = (v: string): number | null => {
    const p = parsed.data.pwpPrices?.[v];
    return typeof p === "number" && p > 0 ? p : null;
  };
  const anyPwp = variants.some((v) => pwpFor(v) !== null);

  const toInsert = variants
    .filter((v) => !existing.has(codeFor(v)))
    .map((v) => ({
      model_id: id,
      sku: codeFor(v),
      variant: resolve(v).name,
      variant_kind: "size" as const,
      price: priceFor(v),
      ...(anyPwp ? { pwp_price: pwpFor(v) } : {}),
      cost: null,
      supplier_id: supplierId,
      ...(anySupplierCode ? { supplier_code: supplierCodeFor(v) } : {}),
      pos_active: true,
      description: autoBedSkuDescription(
        modelRow.category,
        (modelRow.name as string) ?? "",
        resolve(v).code,
        poolDims,
      ),
    }));

  let generated = 0;
  if (toInsert.length > 0) {
    const { data, error } = await sb
      .from("product_skus")
      .insert(toInsert)
      .select("id");
    if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
    generated = (data ?? []).length;

    // Loo 2026-07-21 — generating a size onto an EXISTING model must also join
    // the sizes-active set: allowed_options.sizes drives the Modular toggle +
    // the POS size cascade, so a size generated but absent there would exist
    // yet never be offerable. Union (never replace) so deliberately-inactive
    // sizes stay off; the create-model path already seeds sizes = no-op there.
    if (isBedCategory) {
      const missing = toInsert.map((r) => r.variant).filter((n) => !optSizes.includes(n));
      if (missing.length > 0) {
        const nextOpts = {
          ...((modelRow.allowed_options as Record<string, unknown>) ?? {}),
          sizes: [...optSizes, ...missing],
        };
        const { error: aoErr } = await sb
          .from("product_models")
          .update({ allowed_options: nextOpts })
          .eq("id", id);
        if (aoErr) { const m = mapPgError(aoErr); return c.json(m.body, m.status); }
      }
    }
  }
  return c.json({ ok: true, generated, skipped: variants.length - generated });
});

// ----- 0388 — dual-sourcing, the recording half ------------------------------
//
// A SKU's `supplier_id` slot stays THE routing truth for POs. These routes
// only record what each supplier QUOTED for the piece — their own code, their
// prices — so the second Hookka's paper stops being thrown away. Nothing that
// reads the slot changes.

const OFFER_SELECT =
  "supplier_id, supplier_code, price, pwp_price, updated_at, suppliers(name)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function offerFromRow(r: any) {
  return {
    supplierId: r.supplier_id as string,
    supplierName: (r.suppliers?.name as string | undefined) ?? null,
    supplierCode: (r.supplier_code as string | null) ?? null,
    price: (r.price as number | null) ?? null,
    pwpPrice: (r.pwp_price as number | null) ?? null,
    updatedAt: r.updated_at as string,
  };
}

catalogRouter.get("/skus/:id/supplier-offers", async (c) => {
  internalOnly(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("sku_supplier_offers")
    .select(OFFER_SELECT)
    .eq("sku_id", c.req.param("id"));
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  const offers = (data ?? []).map(offerFromRow)
    .sort((a, b) => (a.supplierName ?? "").localeCompare(b.supplierName ?? ""));
  return c.json({ offers });
});

catalogRouter.put("/skus/:id/supplier-offers", async (c) => {
  /* Offers carry PRICES, and price-bearing catalog writes have been principal
     locked since 0175/0186 — the same person who may set a SKU's price may
     record what a supplier quoted for it. RLS enforces the same boundary. */
  principalOnly(c, "Only the principal (Master Admin) can record supplier offers");
  const parsed = await parseJsonBody(c, skuSupplierOfferUpsertInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("sku_supplier_offers")
    .upsert(
      {
        sku_id: c.req.param("id"),
        supplier_id: parsed.data.supplierId,
        supplier_code: parsed.data.supplierCode?.trim() || null,
        price: parsed.data.price ?? null,
        pwp_price: parsed.data.pwpPrice ?? null,
        updated_at: new Date().toISOString(),
        updated_by: c.var.auth.id,
      },
      { onConflict: "sku_id,supplier_id" },
    )
    .select(OFFER_SELECT)
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "upsert returned no row" }, 404);
  }
  return c.json({ offer: offerFromRow(data) });
});

catalogRouter.delete("/skus/:id/supplier-offers/:supplierId", async (c) => {
  principalOnly(c, "Only the principal (Master Admin) can remove supplier offers");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb
    .from("sku_supplier_offers")
    .delete()
    .eq("sku_id", c.req.param("id"))
    .eq("supplier_id", c.req.param("supplierId"));
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  // Idempotent: removing an offer that is not there is not an error.
  return c.json({ ok: true });
});

// ----- Model photo (signed-upload pattern, mirrors storage/dos + partner/pod) -----

const photoSignSchema = z
  .object({
    mimeType: z.enum(ALLOWED_PHOTO_MIMES),
    sizeBytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
  })
  .strict();

catalogRouter.post("/models/:id/photo/sign-upload", async (c) => {
  internalOnly(c);
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = photoSignSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: issue?.message ?? "invalid input", field: issue?.path.join(".") ?? "unknown" },
      422,
    );
  }
  const ext =
    parsed.data.mimeType === "image/jpeg" ? "jpg" : parsed.data.mimeType === "image/png" ? "png" : "webp";
  const path = `${id}/${crypto.randomUUID()}.${ext}`;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.storage
    .from(PRODUCT_MODEL_PHOTOS_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ token: data.token, path: data.path });
});

const photoStoreSchema = z.object({ path: z.string().min(1).max(500) }).strict();

// PATCH /models/:id/photo — after the browser uploads to the signed URL, store
// the resulting public URL. The path must belong to this model (anti-spoof).
catalogRouter.patch("/models/:id/photo", async (c) => {
  internalOnly(c);
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = photoStoreSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "path required" }, 422);
  }
  if (!parsed.data.path.startsWith(`${id}/`) || parsed.data.path.includes("..")) {
    return c.json({ error: "invalid_input", code: "path_mismatch", message: "path does not belong to this model" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const pub = sb.storage.from(PRODUCT_MODEL_PHOTOS_BUCKET).getPublicUrl(parsed.data.path);
  const { data, error } = await sb
    .from("product_models")
    .update({ photo_url: pub.data.publicUrl })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }
  return c.json({ model: Adapters.productModelFromRow(data as DB.ProductModelRow) });
});

catalogRouter.delete("/models/:id/photo", async (c) => {
  internalOnly(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("product_models")
    .update({ photo_url: null })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }
  return c.json({ model: Adapters.productModelFromRow(data as DB.ProductModelRow) });
});

// ----- Maintenance: delivery-fee (floor_config) + add-ons -----

// PATCH /floor-config — the delivery-fee singleton (id=1). RLS is principal-only
// (floor_write_principal); operation users 403 here by design (UI gates too).
catalogRouter.patch("/floor-config", async (c) => {
  internalOnly(c);
  const parsed = await parseJsonBody(c, floorConfigPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.freeUpToFloor !== undefined) patch.free_up_to_floor = parsed.data.freeUpToFloor;
  if (parsed.data.perFloorPerItem !== undefined) patch.per_floor_per_item = parsed.data.perFloorPerItem;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("floor_config")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "floor_config row missing" }, 404);
  }
  return c.json({ floorConfig: Adapters.floorConfigFromRow(data as DB.FloorConfigRow) });
});

/**
 * Ensure the addon's linked Service SKU EXISTS as a real product_skus row
 * (Loo 2026-07-12 — the link must be real, not a dangling code). Mirrors the
 * 0172 hand-minted rows: parent model = the `service-addons` service model,
 * sku = variant = the bare SVC- code. Idempotent (upsert ignoreDuplicates on
 * the sku UNIQUE) and best-effort — the addon itself is already committed, so
 * a mint failure never fails the request; the row can be added via SKU Master.
 *
 * 0175 price lock: only the principal may INSERT a priced sku, so a
 * non-principal internal caller mints it UNPRICED (0) for the principal to
 * price later — same rule the trigger enforces for every other sku create.
 */
async function ensureServiceSkuRow(
  sb: ReturnType<typeof userClient>,
  opts: { sku: string; description: string; price: number; isPrincipal: boolean },
): Promise<void> {
  const modelR = await sb
    .from("product_models")
    .select("id")
    .eq("category", "service")
    .eq("model_key", "service-addons")
    .maybeSingle();
  if (modelR.error || !modelR.data) return; // stripped env — nothing to hang it on
  const r = await sb.from("product_skus").upsert(
    {
      model_id: (modelR.data as { id: string }).id,
      sku: opts.sku,
      variant: opts.sku,
      variant_kind: "preset",
      price: opts.isPrincipal ? opts.price : 0,
      pos_active: true,
      description: opts.description,
    },
    { onConflict: "sku", ignoreDuplicates: true },
  );
  void r; // best-effort — errors intentionally swallowed (see docstring)
}

catalogRouter.post("/addons", async (c) => {
  internalOnly(c);
  const parsed = await parseJsonBody(c, addonCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("addons")
    .insert({
      key: parsed.data.key,
      name: parsed.data.name,
      price: parsed.data.price,
      active: parsed.data.active ?? true,
      service_sku: parsed.data.serviceSku ?? null,
      size_options: parsed.data.sizeOptions ?? null,
    })
    .select("*")
    .single();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (parsed.data.serviceSku) {
    await ensureServiceSkuRow(sb, {
      sku: parsed.data.serviceSku,
      description: parsed.data.serviceDescription || parsed.data.name,
      price: parsed.data.price,
      isPrincipal: c.var.auth.role === "principal",
    });
  }
  return c.json({ addon: Adapters.addonFromRow(data as DB.AddonRow) }, 201);
});

catalogRouter.patch("/addons/:key", async (c) => {
  internalOnly(c);
  const key = c.req.param("key");
  const parsed = await parseJsonBody(c, addonPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.price !== undefined) patch.price = parsed.data.price;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.serviceSku !== undefined) patch.service_sku = parsed.data.serviceSku;
  // 0242 — null OR [] both mean "no size pick"; store [] as null for one shape.
  if (parsed.data.sizeOptions !== undefined) {
    patch.size_options = parsed.data.sizeOptions?.length ? parsed.data.sizeOptions : null;
  }
  // serviceDescription is NOT an addons column — it lands on the linked SKU
  // row below. A description-only patch is therefore valid (no column patch).
  if (Object.keys(patch).length === 0 && parsed.data.serviceDescription === undefined) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } =
    Object.keys(patch).length > 0
      ? await sb.from("addons").update(patch).eq("key", key).select("*").maybeSingle()
      : await sb.from("addons").select("*").eq("key", key).maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "addon not found" }, 404);
  }
  const row = data as DB.AddonRow;
  const isPrincipal = c.var.auth.role === "principal";
  // Keep the Service SKU link REAL (Loo 2026-07-12), best-effort:
  //  - a (re)assigned serviceSku → make sure the SVC- row exists (restore path);
  //  - a serviceDescription → write it onto the linked SKU row (description is
  //    internal-writable — not 0175-locked);
  //  - a principal price change → mirror it onto the linked SKU row so the
  //    SKU Master shows the same number (non-principal skips — 0175 lock).
  if (parsed.data.serviceSku) {
    await ensureServiceSkuRow(sb, {
      sku: parsed.data.serviceSku,
      description: parsed.data.serviceDescription || row.name,
      price: row.price,
      isPrincipal,
    });
  }
  if (parsed.data.serviceDescription !== undefined && row.service_sku) {
    await sb
      .from("product_skus")
      .update({ description: parsed.data.serviceDescription || null })
      .eq("sku", row.service_sku);
  }
  if (parsed.data.price !== undefined && isPrincipal && row.service_sku) {
    await sb.from("product_skus").update({ price: row.price }).eq("sku", row.service_sku);
  }
  return c.json({ addon: Adapters.addonFromRow(row) });
});

// Soft-disable (active=false) rather than hard delete so the service_sku link
// + any historical reference survive.
catalogRouter.delete("/addons/:key", async (c) => {
  internalOnly(c);
  const key = c.req.param("key");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("addons")
    .update({ active: false })
    .eq("key", key)
    .select("key")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "addon not found" }, 404);
  }
  return c.json({ ok: true });
});

// ----- Special add-ons (0181, principal-only) -----
// Per-model SELLING surcharges with one-level follow-up question groups.
// principalOnly() is the friendly early 403; the RLS policy
// (special_addons_write_principal) is the real boundary (user JWT forwarded).
const SPECIAL_ADDON_GATE = "Only the principal (Master Admin) can manage special add-ons";

catalogRouter.post("/special-addons", async (c) => {
  principalOnly(c, SPECIAL_ADDON_GATE);
  const parsed = await parseJsonBody(c, specialAddonCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SPECIAL_ADDONS)
    .insert({
      code: parsed.data.code,
      label: parsed.data.label,
      so_description: parsed.data.soDescription ?? "",
      categories: parsed.data.categories,
      selling_price: parsed.data.sellingPrice,
      cost: parsed.data.cost ?? null,
      option_groups: parsed.data.optionGroups ?? [],
      active: parsed.data.active ?? true,
      sort_order: parsed.data.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .single();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  return c.json({ specialAddon: Adapters.specialAddonFromRow(data as DB.SpecialAddonRow) }, 201);
});

catalogRouter.patch("/special-addons/:id", async (c) => {
  principalOnly(c, SPECIAL_ADDON_GATE);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, specialAddonPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  // `code` is intentionally NOT patchable (stable key referenced by
  // allowed_options.specials + order_lines.attrs).
  const patch: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.soDescription !== undefined) patch.so_description = parsed.data.soDescription;
  if (parsed.data.categories !== undefined) patch.categories = parsed.data.categories;
  if (parsed.data.sellingPrice !== undefined) patch.selling_price = parsed.data.sellingPrice;
  if (parsed.data.cost !== undefined) patch.cost = parsed.data.cost;
  if (parsed.data.optionGroups !== undefined) patch.option_groups = parsed.data.optionGroups;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SPECIAL_ADDONS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "special add-on not found" }, 404);
  }
  return c.json({ specialAddon: Adapters.specialAddonFromRow(data as DB.SpecialAddonRow) });
});

// Soft-delete (active=false) — preserves the code referenced by existing models'
// allowed_options.specials + historical order_lines.attrs.
catalogRouter.delete("/special-addons/:id", async (c) => {
  principalOnly(c, SPECIAL_ADDON_GATE);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SPECIAL_ADDONS)
    .update({ active: false })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "special add-on not found" }, 404);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 0176 — Fabric tier pricing admin (principal-only).
// The DB singleton (fabric_tier_addon_config id=1) holds the global RM deltas
// for PRICE_2 / PRICE_3 sofa fabrics. Per-model overrides live in
// model_fabric_tier_overrides (sparse; only models with non-default deltas
// have a row). Both tables are RLS principal-only-write; we also gate here for
// a friendly 403 before the round-trip (same pattern as the 0175 SKU lock).
// ---------------------------------------------------------------------------

const fabricTierConfigPatchInput = fabricTierConfigSchema;

// PATCH /fabric-tier-config — update the global tier delta singleton (id=1).
// Body: { sofaTier2Delta: number, sofaTier3Delta: number } (both nonnegative).
catalogRouter.patch("/fabric-tier-config", async (c) => {
  principalOnly(c);
  const parsed = await parseJsonBody(c, fabricTierConfigPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(FABRIC_TIER_ADDON_CONFIG)
    .update({
      sofa_tier2_delta: parsed.data.sofaTier2Delta,
      sofa_tier3_delta: parsed.data.sofaTier3Delta,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .eq("id", 1)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "fabric_tier_addon_config row missing" },
      404,
    );
  }
  return c.json({
    fabricTierConfig: Adapters.fabricTierConfigFromRow(data as DB.FabricTierAddonConfigRow),
  });
});

const modelFabricTierOverrideInput = modelFabricTierOverrideSchema.omit({ modelId: true });

// PUT /model-fabric-tier-override/:modelId — upsert a per-model tier override.
// Body: { tier2Delta: number|null, tier3Delta: number|null }
// null = inherit from global config; 0 = explicit no-premium for this model.
catalogRouter.put("/model-fabric-tier-override/:modelId", async (c) => {
  principalOnly(c);
  const modelId = c.req.param("modelId");
  const parsed = await parseJsonBody(c, modelFabricTierOverrideInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(MODEL_FABRIC_TIER_OVERRIDES)
    .upsert(
      {
        model_id: modelId,
        tier2_delta: parsed.data.tier2Delta,
        tier3_delta: parsed.data.tier3Delta,
        updated_at: new Date().toISOString(),
        updated_by: c.var.auth.id,
      },
      { onConflict: "model_id" },
    )
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "upsert returned no row" },
      404,
    );
  }
  return c.json({
    override: Adapters.modelFabricTierOverrideFromRow(data as DB.ModelFabricTierOverrideRow),
  });
});

// ---------------------------------------------------------------------------
// 0178 — Sofa compartments (the "Base" pool) + per-model offered set. All
// writes are principal-only ("Master Admin"), mirroring the 0176/0177 gate:
// early friendly 403 here, with RLS (sofa_compartments_write_principal /
// model_sofa_compartments_write_principal) the real boundary — we forward the
// USER JWT (userClient) so RLS runs. Compartments become real product_skus in
// a later phase; Phase 1 is the pool + offered + price maintenance only.
// ---------------------------------------------------------------------------

const SOFA_COMPARTMENT_MSG = "Only the principal (Master Admin) can manage sofa compartments";

// POST /sofa-compartments — create a pool compartment (principal-only).
catalogRouter.post("/sofa-compartments", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const parsed = await parseJsonBody(c, sofaCompartmentCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SOFA_COMPARTMENTS)
    .insert({
      code: parsed.data.code,
      description: parsed.data.description ?? null,
      seat_count: parsed.data.seatCount ?? null,
      arm_config: parsed.data.armConfig ?? null,
      icon_url: parsed.data.iconUrl ?? null,
      // NO default_price (Loo, 2026-07-05): the pool is a foundation catalog;
      // prices live on the synced per-model SKUs (SKU Master). Column stays at
      // its DB default (0) as a dormant legacy fallback.
      sort_order: parsed.data.sortOrder ?? 0,
      active: parsed.data.active ?? true,
      // 0205 — per-compartment fabric-tier delta override (null = inherit).
      special_tier2_delta: parsed.data.specialTier2Delta ?? null,
      special_tier3_delta: parsed.data.specialTier3Delta ?? null,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "compartment insert returned no row" }, 500);
  }
  return c.json({ compartment: Adapters.sofaCompartmentFromRow(data as DB.SofaCompartmentRow) }, 201);
});

// PATCH /sofa-compartments/:id — update pool fields (principal-only); empty → 422.
catalogRouter.patch("/sofa-compartments/:id", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, sofaCompartmentPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const patch: Record<string, unknown> = {};
  if (parsed.data.code !== undefined) patch.code = parsed.data.code;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.seatCount !== undefined) patch.seat_count = parsed.data.seatCount;
  if (parsed.data.armConfig !== undefined) patch.arm_config = parsed.data.armConfig;
  if (parsed.data.iconUrl !== undefined) patch.icon_url = parsed.data.iconUrl;
  if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  // 0205 — per-compartment fabric-tier deltas. `!== undefined` (not `??`) so an
  // explicit null clears the override back to "inherit per-model / global".
  if (parsed.data.specialTier2Delta !== undefined) patch.special_tier2_delta = parsed.data.specialTier2Delta;
  if (parsed.data.specialTier3Delta !== undefined) patch.special_tier3_delta = parsed.data.specialTier3Delta;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SOFA_COMPARTMENTS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "compartment not found" }, 404);
  }
  return c.json({ compartment: Adapters.sofaCompartmentFromRow(data as DB.SofaCompartmentRow) });
});

// DELETE /sofa-compartments/:id — soft-delete via active=false (principal-only).
// (sofa_compartments has no discontinued_at; `active` is the on/off flag.)
catalogRouter.delete("/sofa-compartments/:id", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SOFA_COMPARTMENTS)
    .update({ active: false, updated_at: new Date().toISOString(), updated_by: c.var.auth.id })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "compartment not found" }, 404);
  }
  return c.json({ ok: true });
});

// ----- Compartment photo (signed-upload pattern, mirrors /models/:id/photo) -----
// Reuses the PUBLIC product-model-photos bucket (0173 — internal-write, no path
// scoping) under the reserved `compartments/{id}/…` prefix (model photo paths
// start with a model uuid, so the prefixes can never collide). The photo lands
// in `sofa_compartments.icon_url` (0178) — CompartmentSilhouette prefers it
// over the SVG in the builder / POS configurator cell boxes.

// POST /sofa-compartments/:id/photo/sign-upload — principal-only.
catalogRouter.post("/sofa-compartments/:id/photo/sign-upload", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = photoSignSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: issue?.message ?? "invalid input", field: issue?.path.join(".") ?? "unknown" },
      422,
    );
  }
  const ext =
    parsed.data.mimeType === "image/jpeg" ? "jpg" : parsed.data.mimeType === "image/png" ? "png" : "webp";
  const path = `compartments/${id}/${crypto.randomUUID()}.${ext}`;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.storage
    .from(PRODUCT_MODEL_PHOTOS_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ token: data.token, path: data.path });
});

// PATCH /sofa-compartments/:id/photo — store the uploaded file's public URL in
// icon_url. The path must belong to this compartment (anti-spoof).
catalogRouter.patch("/sofa-compartments/:id/photo", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const id = c.req.param("id");
  const raw = await c.req.json().catch(() => ({}));
  const parsed = photoStoreSchema.safeParse(raw);
  if (!parsed.success) {
    return c.json({ error: "invalid_input", code: "invalid_param", message: "path required" }, 422);
  }
  if (!parsed.data.path.startsWith(`compartments/${id}/`) || parsed.data.path.includes("..")) {
    return c.json({ error: "invalid_input", code: "path_mismatch", message: "path does not belong to this compartment" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const pub = sb.storage.from(PRODUCT_MODEL_PHOTOS_BUCKET).getPublicUrl(parsed.data.path);
  const { data, error } = await sb
    .from(SOFA_COMPARTMENTS)
    .update({ icon_url: pub.data.publicUrl, updated_at: new Date().toISOString(), updated_by: c.var.auth.id })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "compartment not found" }, 404);
  }
  return c.json({ compartment: Adapters.sofaCompartmentFromRow(data as DB.SofaCompartmentRow) });
});

// DELETE /sofa-compartments/:id/photo — clear icon_url (falls back to the SVG).
catalogRouter.delete("/sofa-compartments/:id/photo", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SOFA_COMPARTMENTS)
    .update({ icon_url: null, updated_at: new Date().toISOString(), updated_by: c.var.auth.id })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "compartment not found" }, 404);
  }
  return c.json({ compartment: Adapters.sofaCompartmentFromRow(data as DB.SofaCompartmentRow) });
});

// PUT /models/:modelId/compartments/:compartmentId — upsert the per-model
// offered row (principal-only). priceOverride null = inherit the pool default.
catalogRouter.put("/models/:modelId/compartments/:compartmentId", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const modelId = c.req.param("modelId");
  const compartmentId = c.req.param("compartmentId");
  const parsed = await parseJsonBody(c, modelSofaCompartmentInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  // Phase 5 — auto-sync the compartment into a REAL product_skus row BEFORE the
  // offered row is written, so an offered compartment never exists without its
  // sellable sku (the explode would otherwise fail closed). Idempotent +
  // principal-gated (the 0175 price-lock trigger allows the principal's write).
  const synced = await syncCompartmentSku(sb, {
    modelId,
    compartmentId,
    priceOverride: parsed.data.priceOverride ?? null,
    supplierId: parsed.data.supplierId,
    supplierCode: parsed.data.supplierCode,
  });
  if (!synced.ok) return c.json(synced.body, synced.status);

  const { data, error } = await sb
    .from(MODEL_SOFA_COMPARTMENTS)
    .upsert(
      {
        model_id: modelId,
        compartment_id: compartmentId,
        price_override: parsed.data.priceOverride ?? null,
        sort_order: parsed.data.sortOrder ?? 0,
        updated_at: new Date().toISOString(),
        updated_by: c.var.auth.id,
      },
      { onConflict: "model_id,compartment_id" },
    )
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "upsert returned no row" }, 404);
  }
  return c.json({ modelSofaCompartment: Adapters.modelSofaCompartmentFromRow(data as DB.ModelSofaCompartmentRow) });
});

// DELETE /models/:modelId/compartments/:compartmentId — un-offer (hard-delete
// the offered row; principal-only). Idempotent: removing a non-existent offered
// row still returns ok.
catalogRouter.delete("/models/:modelId/compartments/:compartmentId", async (c) => {
  principalOnly(c, SOFA_COMPARTMENT_MSG);
  const modelId = c.req.param("modelId");
  const compartmentId = c.req.param("compartmentId");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb
    .from(MODEL_SOFA_COMPARTMENTS)
    .delete()
    .eq("model_id", modelId)
    .eq("compartment_id", compartmentId);
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }

  // Phase 5 — soft-discontinue the compartment's sku (pos_active=false +
  // discontinued_at). NEVER delete it: historical order_lines may FK the sku. A
  // later re-offer re-activates it. Idempotent (0 matched rows = no-op).
  const disc = await discontinueCompartmentSku(sb, { modelId, compartmentId });
  if (!disc.ok) return c.json(disc.body, disc.status);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 0179 — Sofa combo pricing (the "money core" inputs). A sofa combo = a
// principal-owned named SLOT set for one model, priced per seat-height
// (prices_by_height). All writes are principal-only ("Master Admin"), mirroring
// the 0176/0177/0178 gate: early friendly 403 here, with RLS
// (sofa_combo_pricing_write_principal) the real boundary — we forward the USER
// JWT (userClient) so RLS runs; NEVER service_role. Slots are canonicalized
// (sort within slot + sort slots, drop blanks) BEFORE write so equivalent
// combos persist identically and the Phase-3 matcher reads a stable shape.
// ---------------------------------------------------------------------------

const SOFA_COMBO_PRINCIPAL_MSG = "Only the principal (Master Admin) can manage sofa combos";

// POST /sofa-combos — create a sofa combo (principal-only).
catalogRouter.post("/sofa-combos", async (c) => {
  principalOnly(c, SOFA_COMBO_PRINCIPAL_MSG);
  const parsed = await parseJsonBody(c, sofaComboCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  const insert: Record<string, unknown> = {
    model_id: parsed.data.modelId,
    // Canonicalize so equivalent slot sets persist identically (mirrors 2990s
    // canonicalizeComboModulesForStorage; folded into the shared pure helper).
    slots: canonicalizeSofaSlots(parsed.data.slots),
    tier: parsed.data.tier ?? null,
    prices_by_height: parsed.data.pricesByHeight ?? {},
    // 0183 — principal-only per-seat-height cost benchmark (companion to
    // prices_by_height). null = unset; never feeds order/finance/PO.
    cost_by_height: parsed.data.costByHeight ?? null,
    // 0186 — principal-only per-seat-height PWP reward price (companion to
    // prices_by_height). null = unset. DORMANT — no order consumer in P8a.
    pwp_prices_by_height: parsed.data.pwpPricesByHeight ?? null,
    label: parsed.data.label ?? null,
    active: parsed.data.active ?? true,
    // 0206 — Quick Pick preset flag (default false = a pricing-only combo).
    is_quick_pick: parsed.data.isQuickPick ?? false,
    updated_at: new Date().toISOString(),
    updated_by: c.var.auth.id,
  };
  // effective_from defaults to CURRENT_DATE at the DB; only set it when the
  // caller supplies one (future-dating / tie-break authoring).
  if (parsed.data.effectiveFrom !== undefined) insert.effective_from = parsed.data.effectiveFrom;

  const { data, error } = await sb
    .from(SOFA_COMBO_PRICING)
    .insert(insert)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "sofa combo insert returned no row" }, 500);
  }
  return c.json({ sofaCombo: Adapters.sofaComboFromRow(data as DB.SofaComboPricingRow) }, 201);
});

// PATCH /sofa-combos/:id — update fields (principal-only); empty body → 422.
catalogRouter.patch("/sofa-combos/:id", async (c) => {
  principalOnly(c, SOFA_COMBO_PRINCIPAL_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, sofaComboPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const patch: Record<string, unknown> = {};
  if (parsed.data.modelId !== undefined) patch.model_id = parsed.data.modelId;
  // Canonicalize slots on update too (same invariant as create).
  if (parsed.data.slots !== undefined) patch.slots = canonicalizeSofaSlots(parsed.data.slots);
  if (parsed.data.tier !== undefined) patch.tier = parsed.data.tier;
  if (parsed.data.pricesByHeight !== undefined) patch.prices_by_height = parsed.data.pricesByHeight;
  // 0183 — only write cost_by_height when present so an unrelated patch doesn't
  // clobber the benchmark; an explicit null clears it (back to "unset").
  if (parsed.data.costByHeight !== undefined) patch.cost_by_height = parsed.data.costByHeight;
  // 0186 — same for the PWP reward price (present-only write; null clears).
  if (parsed.data.pwpPricesByHeight !== undefined) patch.pwp_prices_by_height = parsed.data.pwpPricesByHeight;
  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.effectiveFrom !== undefined) patch.effective_from = parsed.data.effectiveFrom;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  // 0206 — Quick Pick preset flag (promote/demote a combo to/from Quick pick).
  if (parsed.data.isQuickPick !== undefined) patch.is_quick_pick = parsed.data.isQuickPick;

  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SOFA_COMBO_PRICING)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "sofa combo not found" }, 404);
  }
  return c.json({ sofaCombo: Adapters.sofaComboFromRow(data as DB.SofaComboPricingRow) });
});

// DELETE /sofa-combos/:id — soft-delete (principal-only), mirroring DELETE
// /combos: stamp discontinued_at + flip active=false so GET / hides it from the
// POS/builder while the maintenance tab (admin=true) can still restore it.
catalogRouter.delete("/sofa-combos/:id", async (c) => {
  principalOnly(c, SOFA_COMBO_PRINCIPAL_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SOFA_COMBO_PRICING)
    .update({
      active: false,
      discontinued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "sofa combo not found" }, 404);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 0182 — Global option pools (2990s Products parity Phase 4). One generic table
// with a `pool` discriminator holding THREE curated reference lists:
// supplier_category, bedframe_size, mattress_size. These are READ-ONLY reference
// lists — NOT a source of truth for any order-side consumer (sizes stay per-model
// in product_models.allowed_options; supplier scope stays in
// suppliers.cat_covered). All writes are principal-only ("Master Admin"),
// mirroring the 0177/0178/0181 gate: early friendly 403 here, with RLS
// (catalog_option_pools_write_principal) the real boundary — we forward the USER
// JWT (userClient) so RLS runs; NEVER service_role.
// ---------------------------------------------------------------------------

const OPTION_POOL_MSG = "Only the principal (Master Admin) can manage option pools";

// Friendly 409 for a UNIQUE(pool,value) collision. mapPgError defaults 23505 to
// a generic 500, so the option-pool writes special-case it here (the maintenance
// editor surfaces "that value already exists in this pool").
function optionPoolDuplicate(value?: string, pool?: string) {
  return {
    error: "conflict",
    code: "duplicate_option_pool_value",
    message:
      value && pool
        ? `"${value}" already exists in ${pool}`
        : "that value already exists in this pool",
  } as const;
}

// POST /option-pools — create a pool entry (principal-only).
catalogRouter.post("/option-pools", async (c) => {
  principalOnly(c, OPTION_POOL_MSG);
  const parsed = await parseJsonBody(c, catalogOptionPoolCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(CATALOG_OPTION_POOLS)
    .insert({
      pool: parsed.data.pool,
      value: parsed.data.value,
      label: parsed.data.label ?? null,
      dimensions: parsed.data.dimensions ?? null,
      surcharge: parsed.data.surcharge ?? null,
      active: parsed.data.active ?? true,
      sort_order: parsed.data.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(optionPoolDuplicate(parsed.data.value, parsed.data.pool), 409);
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "option pool insert returned no row" }, 500);
  }
  return c.json({ optionPool: Adapters.catalogOptionPoolFromRow(data as DB.CatalogOptionPoolRow) }, 201);
});

// PATCH /option-pools/:id — update a pool entry (principal-only); empty → 422.
// `pool` is intentionally NOT patchable (the schema omits it) — moving an entry
// between pools would skew the UNIQUE(pool,value) intent; delete + recreate.
catalogRouter.patch("/option-pools/:id", async (c) => {
  principalOnly(c, OPTION_POOL_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, catalogOptionPoolPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.value !== undefined) patch.value = parsed.data.value;
  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.dimensions !== undefined) patch.dimensions = parsed.data.dimensions;
  if (parsed.data.surcharge !== undefined) patch.surcharge = parsed.data.surcharge;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(CATALOG_OPTION_POOLS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    // A value-rename can also collide with an existing (pool,value).
    if (error.code === "23505") {
      return c.json(optionPoolDuplicate(parsed.data.value), 409);
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "option pool not found" }, 404);
  }
  return c.json({ optionPool: Adapters.catalogOptionPoolFromRow(data as DB.CatalogOptionPoolRow) });
});

// DELETE /option-pools/:id — HARD delete (principal-only). Nothing FKs to this
// table (curated reference list, no order-side consumer), so deletion is safe.
// The soft-hide path is `active=false` via PATCH. Idempotent: a missing id is a
// no-op that still returns ok (mirrors the un-offer route).
catalogRouter.delete("/option-pools/:id", async (c) => {
  principalOnly(c, OPTION_POOL_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(CATALOG_OPTION_POOLS).delete().eq("id", id);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// PUT /option-pools/:pool — 0201 batch save (principal-only). REPLACE semantics:
// the body's `entries` become the pool's full new contents (array order =
// display order) and the catalog_pool_batch_save RPC appends a
// catalog_config_history snapshot in the SAME transaction — that atomicity is
// exactly why this is an RPC and not delete+insert round-trips. SECURITY
// INVOKER: the user JWT is forwarded, so RLS
// (catalog_option_pools_write_principal + catalog_config_history_write_principal)
// stays the real boundary.
catalogRouter.put("/option-pools/:pool", async (c) => {
  principalOnly(c, OPTION_POOL_MSG);
  const poolParam = catalogOptionPoolNameSchema.safeParse(c.req.param("pool"));
  if (!poolParam.success) {
    return c.json({ error: "not_found", code: "not_found", message: "unknown option pool" }, 404);
  }
  const parsed = await parseJsonBody(c, catalogPoolBatchSaveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  // Friendly 409 before the round-trip: duplicate values would trip
  // UNIQUE(pool,value) mid-RPC and roll the whole save back anyway.
  const values = parsed.data.entries.map((e) => e.value);
  if (new Set(values).size !== values.length) {
    return c.json(optionPoolDuplicate(undefined, poolParam.data), 409);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("catalog_pool_batch_save", {
    p_pool: poolParam.data,
    p_entries: parsed.data.entries.map((e) => ({
      value: e.value,
      label: e.label ?? null,
      dimensions: e.dimensions ?? null,
      surcharge: e.surcharge ?? null,
      active: e.active ?? true,
    })),
    p_notes: parsed.data.notes ?? null,
  });
  if (error) {
    if (error.code === "23505") {
      return c.json(optionPoolDuplicate(undefined, poolParam.data), 409);
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, result: data ?? null });
});

// GET /config-history?section= — 0201 snapshot log for one pool, newest first
// (internal read; the History dialog is operation+principal facing).
catalogRouter.get("/config-history", async (c) => {
  internalOnly(c);
  const sectionParam = catalogOptionPoolNameSchema.safeParse(c.req.query("section"));
  if (!sectionParam.success) {
    return c.json(
      { error: "validation", code: "validation", message: "unknown config-history section" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(CATALOG_CONFIG_HISTORY)
    .select("*")
    .eq("section", sectionParam.data)
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({
    history: (data ?? []).map((r) =>
      Adapters.catalogConfigHistoryFromRow(r as DB.CatalogConfigHistoryRow),
    ),
  });
});

// ---------------------------------------------------------------------------
// 0202 — Global procurement fabric master (2990s fabric_trackings port). The
// Fabrics tab edits the WHOLE list as one draft, so the write is a single
// atomic batch save (replace contents + append a section='fabrics'
// catalog_config_history snapshot via catalog_fabrics_batch_save — 0201
// pattern). Principal-only write; RLS (catalog_fabrics_write_principal) is the
// real boundary — userClient, never service_role.
// ---------------------------------------------------------------------------

const FABRIC_MSG = "Only the principal (Master Admin) can manage fabrics";

// PUT /fabrics — batch save (principal-only). REPLACE semantics.
catalogRouter.put("/fabrics", async (c) => {
  principalOnly(c, FABRIC_MSG);
  const parsed = await parseJsonBody(c, catalogFabricsBatchSaveInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  // Friendly 409 before the round-trip: duplicate codes would trip
  // UNIQUE(fabric_code) mid-RPC and roll the whole save back anyway.
  const codes = parsed.data.entries.map((e) => e.fabricCode);
  if (new Set(codes).size !== codes.length) {
    return c.json(fabricDuplicate(), 409);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("catalog_fabrics_batch_save", {
    p_entries: parsed.data.entries.map((e) => ({
      fabricCode: e.fabricCode,
      series: e.series ?? null,
      description: e.description ?? null,
      supplierCode: e.supplierCode ?? null,
      sofaTier: e.sofaTier ?? "PRICE_2",
      bedframeTier: e.bedframeTier ?? "PRICE_2",
      active: e.active ?? true,
    })),
    p_notes: parsed.data.notes ?? null,
  });
  if (error) {
    if (error.code === "23505") return c.json(fabricDuplicate(), 409);
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, result: data ?? null });
});

function fabricDuplicate() {
  return {
    error: "conflict",
    code: "duplicate_fabric_code",
    message: "Duplicate fabric codes — each fabric code must be unique.",
  } as const;
}

// PATCH /fabrics/:id/cost — 0226 Operation Catalog: operation records a
// fabric's buying add-on (RM). Internal (operation + principal); the table's
// write RLS stays principal-only, so the write goes through the
// catalog_fabrics_set_cost SECURITY DEFINER RPC (is_internal() gated inside).
catalogRouter.patch("/fabrics/:id/cost", async (c) => {
  internalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, catalogFabricCostInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("catalog_fabrics_set_cost", {
    p_id: id,
    p_cost: parsed.data.cost,
  });
  if (error) {
    if (error.code === "P0002") {
      return c.json(
        { error: "not_found", code: "not_found", message: "fabric not found" },
        404,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true, result: data ?? null });
});

// GET /fabrics/history — the section='fabrics' snapshot log, newest first
// (internal read; the History dialog is operation+principal facing).
catalogRouter.get("/fabrics/history", async (c) => {
  internalOnly(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(CATALOG_CONFIG_HISTORY)
    .select("*")
    .eq("section", "fabrics")
    .order("effective_from", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({
    history: (data ?? []).map((r) =>
      Adapters.catalogFabricsHistoryFromRow(r as DB.CatalogConfigHistoryRow),
    ),
  });
});

// ---------------------------------------------------------------------------
// 0184 — Delivery TRIP fee (2990s Products parity Phase 6). The principal-owned
// config singleton (a flat trip fee + a sofa × mattress/bedframe cross-category
// surcharge + the principal-selected charged-category set) + per-RuleTarget
// special overrides. DORMANT by default (seeds 0/0 → byte-identical order totals
// until the principal sets rates). The floor STAIR surcharge (floor_config) is
// KEPT + coexists — the delivery fee is ADDITIVE. All writes are principal-only
// ("Master Admin"), mirroring the 0177/0178/0181/0182 gate: early friendly 403
// here, with RLS (delivery_fee_config_write_principal /
// special_delivery_fee_rules_write_principal) the real boundary — we forward the
// USER JWT (userClient) so RLS runs; NEVER service_role.
// ---------------------------------------------------------------------------

const DELIVERY_FEE_MSG = "Only the principal (Master Admin) can manage delivery fees";

// Patch variant of the rule input: every field optional (empty → 422 below). A
// present `target` still requires ≥1 entry (the .min(1) carries through .partial).
const specialDeliveryFeeRulePatchInput = specialDeliveryFeeRuleInput.partial();

// PATCH /delivery-fee-config — update the singleton (id=1); empty body → 422.
catalogRouter.patch("/delivery-fee-config", async (c) => {
  principalOnly(c, DELIVERY_FEE_MSG);
  const parsed = await parseJsonBody(c, deliveryFeeConfigPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.baseFee !== undefined) patch.base_fee = parsed.data.baseFee;
  if (parsed.data.crossCategoryFee !== undefined) patch.cross_category_fee = parsed.data.crossCategoryFee;
  if (parsed.data.chargedCategories !== undefined) patch.charged_categories = parsed.data.chargedCategories;
  if (parsed.data.mattressBedframeLeadDays !== undefined)
    patch.mattress_bedframe_lead_days = parsed.data.mattressBedframeLeadDays;
  if (parsed.data.sofaLeadDays !== undefined) patch.sofa_lead_days = parsed.data.sofaLeadDays;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(DELIVERY_FEE_CONFIG)
    .update(patch)
    .eq("id", 1)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "delivery_fee_config row missing" },
      404,
    );
  }
  return c.json({ deliveryFeeConfig: Adapters.deliveryFeeConfigFromRow(data as DB.DeliveryFeeConfigRow) });
});

// POST /special-delivery-fee-rules — create a per-RuleTarget override (principal-only).
catalogRouter.post("/special-delivery-fee-rules", async (c) => {
  principalOnly(c, DELIVERY_FEE_MSG);
  const parsed = await parseJsonBody(c, specialDeliveryFeeRuleInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SPECIAL_DELIVERY_FEE_RULES)
    .insert({
      // `target` is RuleTarget[] jsonb (re-parsed on read via parseRuleTargets).
      target: parsed.data.target,
      standalone_fee: parsed.data.standaloneFee,
      cross_cat_followup_fee: parsed.data.crossCategoryFollowupFee,
      label: parsed.data.label ?? null,
      active: parsed.data.active ?? true,
      sort_order: parsed.data.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: "special delivery fee rule insert returned no row" },
      500,
    );
  }
  return c.json(
    { specialDeliveryFeeRule: Adapters.specialDeliveryFeeRuleFromRow(data as DB.SpecialDeliveryFeeRuleRow) },
    201,
  );
});

// PATCH /special-delivery-fee-rules/:id — partial update (principal-only); empty → 422.
catalogRouter.patch("/special-delivery-fee-rules/:id", async (c) => {
  principalOnly(c, DELIVERY_FEE_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, specialDeliveryFeeRulePatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.target !== undefined) patch.target = parsed.data.target;
  if (parsed.data.standaloneFee !== undefined) patch.standalone_fee = parsed.data.standaloneFee;
  if (parsed.data.crossCategoryFollowupFee !== undefined)
    patch.cross_cat_followup_fee = parsed.data.crossCategoryFollowupFee;
  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SPECIAL_DELIVERY_FEE_RULES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "special delivery fee rule not found" },
      404,
    );
  }
  return c.json({ specialDeliveryFeeRule: Adapters.specialDeliveryFeeRuleFromRow(data as DB.SpecialDeliveryFeeRuleRow) });
});

// DELETE /special-delivery-fee-rules/:id — HARD delete (principal-only). Nothing
// FKs to this table, so deletion is safe; the soft-hide path is `active=false`
// via PATCH. Idempotent: a missing id is a no-op that still returns ok (mirrors
// the option-pools un-author route).
catalogRouter.delete("/special-delivery-fee-rules/:id", async (c) => {
  principalOnly(c, DELIVERY_FEE_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(SPECIAL_DELIVERY_FEE_RULES).delete().eq("id", id);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 0185 — Default Free Gifts (per model) + Free Item Campaigns (2990s Products
// parity Phase 7, GWP). A free gift is a DETERMINISTIC accessory @ RM0 the
// server APPENDS for a qualifying paid line; a free item campaign lets a
// salesperson "Make Free" an ELIGIBLE existing line. Both are principal-owned
// ("Master Admin"): early friendly 403 here, with RLS
// (model_default_free_gifts_write_principal / free_item_campaigns_write_principal)
// the real boundary — we forward the USER JWT (userClient) so RLS runs; NEVER
// service_role. NO order-side change here — create_order / order_lines / the
// free-line enforcement live elsewhere; this is the config/CRUD surface only.
// ---------------------------------------------------------------------------

const FREE_GIFT_MSG = "Only the principal (Master Admin) can manage free gifts";

// Patch variant of the campaign input: every field optional (empty → 422 below).
// A present `eligible` still requires ≥1 entry (the .min(1) carries through).
const freeItemCampaignPatchInput = freeItemCampaignInput.partial();

// PUT /model-free-gifts/:modelId — REPLACE a model's whole default-gift set
// (principal-only). An empty `gifts` clears the config (the row is deleted, so
// the model triggers no gift). A non-empty set upserts on model_id.
catalogRouter.put("/model-free-gifts/:modelId", async (c) => {
  principalOnly(c, FREE_GIFT_MSG);
  const modelId = c.req.param("modelId");
  const parsed = await parseJsonBody(c, modelDefaultFreeGiftsInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  // Empty set = clear: delete the row (the GET resolver then returns nothing for
  // this model). Return the cleared shape so the client can update its cache.
  if (parsed.data.gifts.length === 0) {
    const { error } = await sb
      .from(MODEL_DEFAULT_FREE_GIFTS)
      .delete()
      .eq("model_id", modelId);
    if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
    return c.json({ modelDefaultFreeGifts: { modelId, gifts: [] } });
  }

  const { data, error } = await sb
    .from(MODEL_DEFAULT_FREE_GIFTS)
    .upsert(
      {
        model_id: modelId,
        // `gifts` is DefaultFreeGift[] jsonb (re-parsed on read via
        // parseDefaultFreeGifts, which drops any malformed entry).
        gifts: parsed.data.gifts,
        updated_at: new Date().toISOString(),
        updated_by: c.var.auth.id,
      },
      { onConflict: "model_id" },
    )
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "upsert returned no row" },
      404,
    );
  }
  return c.json({
    modelDefaultFreeGifts: Adapters.modelDefaultFreeGiftsFromRow(
      data as DB.ModelDefaultFreeGiftsRow,
    ),
  });
});

// DELETE /model-free-gifts/:modelId — drop a model's gift config (principal-only).
// Idempotent: a missing row is a no-op that still returns ok.
catalogRouter.delete("/model-free-gifts/:modelId", async (c) => {
  principalOnly(c, FREE_GIFT_MSG);
  const modelId = c.req.param("modelId");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb
    .from(MODEL_DEFAULT_FREE_GIFTS)
    .delete()
    .eq("model_id", modelId);
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  return c.json({ ok: true });
});

// POST /free-item-campaigns — create a GWP campaign (principal-only). `eligible`
// requires ≥1 target; `active` defaults false (a campaign is dormant until the
// principal flips it on); `maxFreeQty` defaults 1.
catalogRouter.post("/free-item-campaigns", async (c) => {
  principalOnly(c, FREE_GIFT_MSG);
  const parsed = await parseJsonBody(c, freeItemCampaignInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(FREE_ITEM_CAMPAIGNS)
    .insert({
      name: parsed.data.name,
      active: parsed.data.active ?? false,
      max_free_qty: parsed.data.maxFreeQty ?? 1,
      // `eligible` is RuleTarget[] jsonb (re-parsed on read via parseRuleTargets).
      eligible: parsed.data.eligible,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: "free item campaign insert returned no row" },
      500,
    );
  }
  return c.json(
    { freeItemCampaign: Adapters.freeItemCampaignFromRow(data as DB.FreeItemCampaignRow) },
    201,
  );
});

// PATCH /free-item-campaigns/:id — partial update (principal-only); empty → 422.
catalogRouter.patch("/free-item-campaigns/:id", async (c) => {
  principalOnly(c, FREE_GIFT_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, freeItemCampaignPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.maxFreeQty !== undefined) patch.max_free_qty = parsed.data.maxFreeQty;
  if (parsed.data.eligible !== undefined) patch.eligible = parsed.data.eligible;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(FREE_ITEM_CAMPAIGNS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "free item campaign not found" },
      404,
    );
  }
  return c.json({ freeItemCampaign: Adapters.freeItemCampaignFromRow(data as DB.FreeItemCampaignRow) });
});

// DELETE /free-item-campaigns/:id — HARD delete (principal-only). Nothing FKs to
// this table, so deletion is safe; the soft-hide path is `active=false` via PATCH.
catalogRouter.delete("/free-item-campaigns/:id", async (c) => {
  principalOnly(c, FREE_GIFT_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(FREE_ITEM_CAMPAIGNS).delete().eq("id", id);
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 0186 — PWP & Promo RULES (2990s Products parity Phase 8a). A rule unlocks a
// reward category/scope when a trigger category/scope is in the cart, at the
// ratio qty_per_trigger. type 'pwp' = the reward is sold at its per-SKU
// pwp_price; 'promo' = the reward is FREE. The reward PRICE is NOT on the rule —
// it lives per-SKU (product_skus.pwp_price) / per-sofa-combo
// (sofa_combo_pricing.pwp_prices_by_height). All writes are principal-owned
// ("Master Admin"): early friendly 403 here, with RLS (pwp_rules_write_principal)
// the real boundary — we forward the USER JWT (userClient) so RLS runs; NEVER
// service_role. DORMANT in P8a — NO order-side consumer; create_order /
// order_lines are untouched, so orders stay byte-identical. CRUD surface only.
// Mirrors the 0185 free-item-campaigns routes EXACTLY.
// ---------------------------------------------------------------------------

const PWP_RULE_MSG = "Only the principal (Master Admin) can manage PWP rules";

// Patch variant of the rule input: every field optional (empty body → 422 below).
const pwpRulePatchInput = pwpRuleInput.partial();

// POST /pwp-rules — create a PWP/Promo rule (principal-only). `triggerTargets` /
// `rewardTargets` ALLOW empty ([] = the whole category); `qtyPerTrigger` defaults
// 1; `active` defaults false (a rule is dormant until the principal flips it on).
catalogRouter.post("/pwp-rules", async (c) => {
  principalOnly(c, PWP_RULE_MSG);
  const parsed = await parseJsonBody(c, pwpRuleInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(PWP_RULES)
    .insert({
      type: parsed.data.type,
      trigger_category: parsed.data.triggerCategory,
      // `trigger_targets` / `reward_targets` are RuleTarget[] jsonb.
      trigger_targets: parsed.data.triggerTargets,
      reward_category: parsed.data.rewardCategory,
      reward_targets: parsed.data.rewardTargets,
      qty_per_trigger: parsed.data.qtyPerTrigger ?? 1,
      active: parsed.data.active ?? false,
      // P8d (0188) — per-rule cross-order carry-forward policy. `carry_forward`
      // defaults true (the DB default); `carry_forward_days` NULL = perpetual.
      carry_forward: parsed.data.carryForward ?? true,
      carry_forward_days: parsed.data.carryForwardDays ?? null,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: "pwp rule insert returned no row" },
      500,
    );
  }
  return c.json(
    { pwpRule: Adapters.pwpRuleFromRow(data as DB.PwpRuleRow) },
    201,
  );
});

// PATCH /pwp-rules/:id — partial update (principal-only); empty → 422.
catalogRouter.patch("/pwp-rules/:id", async (c) => {
  principalOnly(c, PWP_RULE_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, pwpRulePatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.type !== undefined) patch.type = parsed.data.type;
  if (parsed.data.triggerCategory !== undefined) patch.trigger_category = parsed.data.triggerCategory;
  if (parsed.data.triggerTargets !== undefined) patch.trigger_targets = parsed.data.triggerTargets;
  if (parsed.data.rewardCategory !== undefined) patch.reward_category = parsed.data.rewardCategory;
  if (parsed.data.rewardTargets !== undefined) patch.reward_targets = parsed.data.rewardTargets;
  if (parsed.data.qtyPerTrigger !== undefined) patch.qty_per_trigger = parsed.data.qtyPerTrigger;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  // P8d (0188) — per-rule cross-order carry-forward policy round-trips through PATCH.
  if (parsed.data.carryForward !== undefined) patch.carry_forward = parsed.data.carryForward;
  if (parsed.data.carryForwardDays !== undefined)
    patch.carry_forward_days = parsed.data.carryForwardDays;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(PWP_RULES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "pwp rule not found" },
      404,
    );
  }
  return c.json({ pwpRule: Adapters.pwpRuleFromRow(data as DB.PwpRuleRow) });
});

// DELETE /pwp-rules/:id — HARD delete (principal-only). Nothing FKs to this
// table, so deletion is safe; the soft-hide path is `active=false` via PATCH.
catalogRouter.delete("/pwp-rules/:id", async (c) => {
  principalOnly(c, PWP_RULE_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(PWP_RULES).delete().eq("id", id);
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 0239 — PRODUCT BUNDLES (bundle pricing). A bundle = a named set of catalog
// SKUs sold together at ONE bundle price; the POS explodes it into component
// order_lines via the shared `explodeBundle` (Σ-exact split) — create_order /
// order_lines are UNTOUCHED (bundle identity rides order_lines.attrs.bundle_*).
// All writes are principal-owned ("Master Admin"): early friendly 403 here,
// with RLS (product_bundles_write_principal) the real boundary — we forward the
// USER JWT (userClient) so RLS runs; NEVER service_role. DORMANT until a bundle
// is authored + flipped active. Mirrors the 0186 pwp-rules routes EXACTLY.
// ---------------------------------------------------------------------------

const BUNDLE_MSG = "Only the principal (Master Admin) can manage bundles";

// POST /bundles — create a bundle (principal-only). ≥2 components; `active`
// defaults false (dormant until the principal flips it on).
catalogRouter.post("/bundles", async (c) => {
  principalOnly(c, BUNDLE_MSG);
  const parsed = await parseJsonBody(c, productBundleInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(PRODUCT_BUNDLES)
    .insert({
      name: parsed.data.name,
      price: parsed.data.price,
      // 0241 — bundle kinds; `components`/`slots` are jsonb arrays.
      kind: parsed.data.kind ?? "fixed",
      components: parsed.data.components ?? [],
      slots: parsed.data.slots ?? [],
      active: parsed.data.active ?? false,
      sort_order: parsed.data.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: "bundle insert returned no row" },
      500,
    );
  }
  return c.json(
    { bundle: Adapters.productBundleFromRow(data as DB.ProductBundleRow) },
    201,
  );
});

// PATCH /bundles/:id — partial update (principal-only); empty → 422.
catalogRouter.patch("/bundles/:id", async (c) => {
  principalOnly(c, BUNDLE_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, productBundlePatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.price !== undefined) patch.price = parsed.data.price;
  if (parsed.data.kind !== undefined) patch.kind = parsed.data.kind;
  if (parsed.data.components !== undefined) patch.components = parsed.data.components;
  if (parsed.data.slots !== undefined) patch.slots = parsed.data.slots;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.sortOrder !== undefined) patch.sort_order = parsed.data.sortOrder;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(PRODUCT_BUNDLES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "bundle not found" },
      404,
    );
  }
  return c.json({ bundle: Adapters.productBundleFromRow(data as DB.ProductBundleRow) });
});

// DELETE /bundles/:id — HARD delete (principal-only). Nothing FKs to this
// table, so deletion is safe; the soft-hide path is `active=false` via PATCH.
catalogRouter.delete("/bundles/:id", async (c) => {
  principalOnly(c, BUNDLE_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(PRODUCT_BUNDLES).delete().eq("id", id);
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  return c.json({ ok: true });
});

export default catalogRouter;
