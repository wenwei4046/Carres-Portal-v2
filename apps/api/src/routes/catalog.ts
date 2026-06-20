import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  catalogResponseSchema,
  productModelCreateInput,
  productModelPatchInput,
  productSkuCreateInput,
  productSkuPatchInput,
  sofaFabricCreateInput,
  sofaFabricPatchInput,
  fabricTierConfigSchema,
  modelFabricTierOverrideSchema,
  comboCreateInput,
  comboPatchInput,
  sizesActiveInput,
  generateSkusInput,
  floorConfigPatchInput,
  addonCreateInput,
  addonPatchInput,
  PRODUCT_MODEL_PHOTOS_BUCKET,
  FABRIC_TIER_ADDON_CONFIG,
  MODEL_FABRIC_TIER_OVERRIDES,
  COMBOS,
  COMBO_COMPONENTS,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

const catalogRouter = new Hono<AppEnv>();

// Loo 2026-06-14 — new SKU codes are `{MODEL_KEY}-{variant}` (uppercase, dash),
// matching the AutoCount-style scheme the 1013 existing SKUs use. NOT the legacy
// `category:model_key:variant` colon format (which 0148 documented as broken).
function deriveSkuCode(modelKey: string, variant: string): string {
  return `${modelKey.toUpperCase()}-${variant}`;
}

// Service/accessory categories carry no supplier (their SKUs are internal:
// delivery / disposal / labour / pure accessories). The create-SKU supplier
// requirement is relaxed for them.
const SUPPLIERLESS_CATEGORIES = new Set(["service", "accessory"]);

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
const SKU_PRICE_COST_ERROR =
  "Only the principal (Master Admin) can set SKU price or cost";

// POST /skus: a non-principal MAY create an UNPRICED sku (price 0 / cost null);
// block only when they try to seed a price or cost.
function gateSkuCreatePriceCost(
  c: { var: { auth: { role: string } } },
  data: { price: number; cost?: number | null },
) {
  if (c.var.auth.role === "principal") return;
  const setsPrice = data.price !== 0;
  const setsCost = data.cost !== null && data.cost !== undefined;
  if (setsPrice || setsCost) {
    throw new HTTPException(403, { message: SKU_PRICE_COST_ERROR });
  }
}

// PATCH /skus/:id: block when a non-principal includes a price or cost key at
// all (presence = intent to change; `cost: null` clearing counts as a change).
function gateSkuPatchPriceCost(
  c: { var: { auth: { role: string } } },
  data: { price?: number; cost?: number | null },
) {
  if (c.var.auth.role === "principal") return;
  if (data.price !== undefined || data.cost !== undefined) {
    throw new HTTPException(403, { message: SKU_PRICE_COST_ERROR });
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
  const [modelsR, allSkus, fabricsR, addonsR, floorR, tierConfigR, tierOverridesR, combosR, comboComponentsR] = await Promise.all([
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
    // 0177 — combos + their components. Fetched unfiltered; the active /
    // discontinued_at filter is applied client-side below (like the skus
    // pos_active filter), since each combo also needs its components joined in
    // JS anyway. A combo is "effective immediately" — `effective_from` is
    // stored but NOT gated in v1.
    sb.from(COMBOS).select("*"),
    sb.from(COMBO_COMPONENTS).select("*"),
  ]);

  for (const r of [modelsR, fabricsR, addonsR, floorR]) {
    if (r.error) throw new HTTPException(500, { message: r.error.message });
  }
  if (tierConfigR.error) throw new HTTPException(500, { message: tierConfigR.error.message });
  if (tierOverridesR.error) throw new HTTPException(500, { message: tierOverridesR.error.message });
  if (combosR.error) throw new HTTPException(500, { message: combosR.error.message });
  if (comboComponentsR.error) throw new HTTPException(500, { message: comboComponentsR.error.message });
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

  // 0177 — assemble each combo with its components (sorted by sort_order asc;
  // the last component absorbs the rounding residue in explodeCombo). Non-admin
  // consumers (POS) only see live combos (active && not discontinued); admin
  // (maintenance tab) sees ALL combos so it can re-activate / restore them.
  const comboRows = (combosR.data ?? []).filter((row) => {
    if (adminMode) return true;
    const r = row as DB.ComboRow;
    return r.active === true && r.discontinued_at == null;
  });
  const componentsByCombo = new Map<string, DB.ComboComponentRow[]>();
  for (const row of comboComponentsR.data ?? []) {
    const cc = row as DB.ComboComponentRow;
    const list = componentsByCombo.get(cc.combo_id) ?? [];
    list.push(cc);
    componentsByCombo.set(cc.combo_id, list);
  }
  const combos = comboRows.map((row) => {
    const r = row as DB.ComboRow;
    const components = (componentsByCombo.get(r.id) ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((cc) => Adapters.comboComponentFromRow(cc));
    return { ...Adapters.comboFromRow(r), components };
  });

  const body = catalogResponseSchema.parse({
    models: (modelsR.data ?? []).map((m) => Adapters.productModelFromRow(m as DB.ProductModelRow)),
    skus: liveSkus.map((s) => Adapters.productSkuFromRow(s as DB.ProductSkuRow)),
    sofaFabrics: liveFabrics.map((f) => Adapters.sofaFabricFromRow(f as DB.SofaFabricRow)),
    addons: (addonsR.data ?? []).map((a) => Adapters.addonFromRow(a as DB.AddonRow)),
    floorConfig: Adapters.floorConfigFromRow(floorR.data as DB.FloorConfigRow),
    // 0176 — fabric tier pricing (additive; pre-0176 clients ignore these keys).
    fabricTierConfig,
    modelFabricTierOverrides: (tierOverridesR.data ?? []).map(
      (r) => Adapters.modelFabricTierOverrideFromRow(r as DB.ModelFabricTierOverrideRow),
    ),
    // 0177 — fixed-set combos (additive; pre-0177 clients ignore this key).
    combos,
  });

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
    .select("category, model_key")
    .eq("id", parsed.data.modelId)
    .maybeSingle();
  if (modelErr) {
    const m = mapPgError(modelErr);
    return c.json(m.body, m.status);
  }
  if (!modelRow) {
    return c.json({ error: "not_found", code: "not_found", message: "model not found" }, 404);
  }
  const skuCode = deriveSkuCode(modelRow.model_key, parsed.data.variant);
  const supplierless = SUPPLIERLESS_CATEGORIES.has(modelRow.category);

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

  const { data, error } = await sb
    .from("product_skus")
    .insert({
      model_id: parsed.data.modelId,
      sku: skuCode,
      variant: parsed.data.variant,
      variant_kind: parsed.data.variantKind,
      price: parsed.data.price,
      cost: parsed.data.cost ?? null,
      supplier_id: supplierId,
      description: parsed.data.description ?? null,
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
  if (parsed.data.variant !== undefined) patch.variant = parsed.data.variant;
  if (parsed.data.variantKind !== undefined) patch.variant_kind = parsed.data.variantKind;
  if (parsed.data.price !== undefined) patch.price = parsed.data.price;
  if (parsed.data.cost !== undefined) patch.cost = parsed.data.cost;
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

  // If variant changed we re-derive the sku code so it stays consistent with the
  // {MODEL_KEY}-{variant} scheme. Look up the model first to know model_key.
  if (parsed.data.variant !== undefined) {
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
      .select("model_key")
      .eq("id", skuRow.model_id)
      .maybeSingle();
    if (modelRow) {
      patch.sku = deriveSkuCode(modelRow.model_key, parsed.data.variant);
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

catalogRouter.delete("/skus/:id", async (c) => {
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("product_skus")
    .update({ discontinued_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "sku not found" }, 404);
  }
  return c.json({ ok: true });
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
    .select("category, model_key, allowed_options")
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
  let supplierId: string | null = null;
  if (!SUPPLIERLESS_CATEGORIES.has(modelRow.category)) {
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

  const codeFor = (v: string) => deriveSkuCode(modelRow.model_key, v);
  const wantCodes = variants.map(codeFor);
  const { data: existingRows, error: exErr } = await sb
    .from("product_skus")
    .select("sku")
    .in("sku", wantCodes);
  if (exErr) { const m = mapPgError(exErr); return c.json(m.body, m.status); }
  const existing = new Set((existingRows ?? []).map((r) => (r as { sku: string }).sku));

  const toInsert = variants
    .filter((v) => !existing.has(codeFor(v)))
    .map((v) => ({
      model_id: id,
      sku: codeFor(v),
      variant: v,
      variant_kind: "size" as const,
      price: parsed.data.price ?? 0,
      cost: null,
      supplier_id: supplierId,
      pos_active: true,
    }));

  let generated = 0;
  if (toInsert.length > 0) {
    const { data, error } = await sb
      .from("product_skus")
      .insert(toInsert)
      .select("id");
    if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
    generated = (data ?? []).length;
  }
  return c.json({ ok: true, generated, skipped: variants.length - generated });
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
  if (!parsed.data.path.startsWith(`${id}/`)) {
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
    })
    .select("*")
    .single();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
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
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("addons")
    .update(patch)
    .eq("key", key)
    .select("*")
    .maybeSingle();
  if (error) { const m = mapPgError(error); return c.json(m.body, m.status); }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "addon not found" }, 404);
  }
  return c.json({ addon: Adapters.addonFromRow(data as DB.AddonRow) });
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
// 0177 — Combos (套餐). Fixed-set bundles sold at one combo_price; component
// SKUs split the price back via explodeCombo() at submit time. All writes are
// principal-only ("Master Admin"), mirroring the 0176 fabric-tier write gate:
// early friendly 403 here, with RLS (combos_write_principal /
// combo_components_write_principal) as the real boundary — we forward the USER
// JWT (userClient) so RLS runs.
// ---------------------------------------------------------------------------

const COMBO_PRINCIPAL_MSG = "Only the principal (Master Admin) can manage combos";

// kebab-case slug from the combo name: lowercase, spaces → dash, strip anything
// outside [a-z0-9-]. A name that slugifies to empty (e.g. Chinese-only) yields
// "" → the caller falls back to a random `combo-<hex>` key.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// POST /combos — create a combo + its components (principal-only).
// Atomicity (no new RPC in v1): supabase-js can't wrap two statements in a
// single txn without an RPC, so if the components insert fails we COMPENSATE by
// deleting the just-created combo row — no orphan combo is left behind.
catalogRouter.post("/combos", async (c) => {
  principalOnly(c, COMBO_PRINCIPAL_MSG);
  const parsed = await parseJsonBody(c, comboCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  const comboKey =
    parsed.data.comboKey?.trim() ||
    slugify(parsed.data.name) ||
    `combo-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

  const { data: comboRow, error: comboErr } = await sb
    .from(COMBOS)
    .insert({
      combo_key: comboKey,
      name: parsed.data.name,
      combo_price: parsed.data.comboPrice,
      active: parsed.data.active ?? true,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (comboErr) {
    const m = mapPgError(comboErr);
    return c.json(m.body, m.status);
  }
  if (!comboRow) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "combo insert returned no row" }, 500);
  }
  const newId = (comboRow as DB.ComboRow).id;

  const componentRows = parsed.data.components.map((comp, i) => ({
    combo_id: newId,
    sku: comp.sku,
    qty: comp.qty,
    sort_order: comp.sortOrder ?? i,
  }));
  const { error: compErr } = await sb.from(COMBO_COMPONENTS).insert(componentRows);
  if (compErr) {
    // Compensating delete — remove the orphan combo so a half-created bundle
    // doesn't linger. (Best-effort: if the delete itself fails the original
    // error still wins; v1-acceptable per the brief.)
    await sb.from(COMBOS).delete().eq("id", newId);
    const m = mapPgError(compErr);
    return c.json(m.body, m.status);
  }

  const combo = {
    ...Adapters.comboFromRow(comboRow as DB.ComboRow),
    components: [...componentRows]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => Adapters.comboComponentFromRow(r as DB.ComboComponentRow)),
  };
  return c.json({ combo }, 201);
});

// PATCH /combos/:id — update scalar fields and/or REPLACE the component set
// (principal-only). Components-replace = delete-then-insert; if the re-insert
// fails after the delete there is a small window with no components for the
// combo (v1-acceptable: no multi-statement txn without an RPC).
catalogRouter.patch("/combos/:id", async (c) => {
  principalOnly(c, COMBO_PRINCIPAL_MSG);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, comboPatchInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);

  const patch: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.comboPrice !== undefined) patch.combo_price = parsed.data.comboPrice;
  if (parsed.data.active !== undefined) patch.active = parsed.data.active;
  if (parsed.data.comboKey !== undefined) patch.combo_key = parsed.data.comboKey;

  const hasComponents = parsed.data.components !== undefined;
  if (Object.keys(patch).length === 0 && !hasComponents) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }

  const sb = userClient(c.env, c.var.auth.jwt);

  // Always stamp updated_at / updated_by when there's at least one scalar field;
  // if ONLY components change we still touch the combo row so updated_* reflects
  // the edit.
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;

  const { data: comboRow, error: comboErr } = await sb
    .from(COMBOS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (comboErr) {
    const m = mapPgError(comboErr);
    return c.json(m.body, m.status);
  }
  if (!comboRow) {
    return c.json({ error: "not_found", code: "not_found", message: "combo not found" }, 404);
  }

  let componentRows: { combo_id: string; sku: string; qty: number; sort_order: number }[] = [];
  if (hasComponents) {
    componentRows = (parsed.data.components ?? []).map((comp, i) => ({
      combo_id: id,
      sku: comp.sku,
      qty: comp.qty,
      sort_order: comp.sortOrder ?? i,
    }));
    // Replace the set: delete the old components, then insert the new ones.
    const { error: delErr } = await sb.from(COMBO_COMPONENTS).delete().eq("combo_id", id);
    if (delErr) {
      const m = mapPgError(delErr);
      return c.json(m.body, m.status);
    }
    if (componentRows.length > 0) {
      const { error: insErr } = await sb.from(COMBO_COMPONENTS).insert(componentRows);
      if (insErr) {
        const m = mapPgError(insErr);
        return c.json(m.body, m.status);
      }
    }
  } else {
    // Components untouched → read the existing set so the response is complete.
    const { data: existing, error: readErr } = await sb
      .from(COMBO_COMPONENTS)
      .select("*")
      .eq("combo_id", id);
    if (readErr) {
      const m = mapPgError(readErr);
      return c.json(m.body, m.status);
    }
    componentRows = (existing ?? []) as { combo_id: string; sku: string; qty: number; sort_order: number }[];
  }

  const combo = {
    ...Adapters.comboFromRow(comboRow as DB.ComboRow),
    components: [...componentRows]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => Adapters.comboComponentFromRow(r as DB.ComboComponentRow)),
  };
  return c.json({ combo });
});

// DELETE /combos/:id — soft-delete (principal-only), mirroring DELETE /models
// and /skus: stamp discontinued_at and flip active=false so GET / hides it
// from POS while the maintenance tab (admin=true) can still restore it.
catalogRouter.delete("/combos/:id", async (c) => {
  principalOnly(c, COMBO_PRINCIPAL_MSG);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(COMBOS)
    .update({
      active: false,
      discontinued_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "combo not found" }, 404);
  }
  return c.json({ ok: true });
});

export default catalogRouter;
