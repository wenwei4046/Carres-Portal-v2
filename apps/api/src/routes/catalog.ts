import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
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
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

const catalogRouter = new Hono<AppEnv>();

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

  // Run the 5 small queries in parallel — each is a simple `select *` against a
  // catalog table, all RLS-public-read. No auth-scoped filtering needed.
  const [modelsR, skusR, fabricsR, addonsR, floorR] = await Promise.all([
    sb.from("product_models").select("*").is("discontinued_at", null),
    sb.from("product_skus").select("*"),
    sb.from("sofa_fabrics").select("*"),
    sb.from("addons").select("*").eq("active", true),
    sb.from("floor_config").select("*").eq("id", 1).maybeSingle(),
  ]);

  for (const r of [modelsR, skusR, fabricsR, addonsR, floorR]) {
    if (r.error) throw new HTTPException(500, { message: r.error.message });
  }
  if (!floorR.data) {
    // floor_config row 1 should always exist post-migration; if it's missing
    // we surface as 500 rather than silently shipping a broken bundle.
    throw new HTTPException(500, { message: "floor_config row missing" });
  }

  // Filter skus + fabrics to only those whose model is in the non-discontinued
  // set. Cheaper than a server-side join for catalogs of this size (~50 models).
  const liveModelIds = new Set((modelsR.data ?? []).map((m) => m.id));
  const liveSkus = (skusR.data ?? []).filter((s) =>
    liveModelIds.has((s as DB.ProductSkuRow).model_id),
  );
  const liveFabrics = (fabricsR.data ?? []).filter((f) =>
    liveModelIds.has((f as DB.SofaFabricRow).model_id),
  );

  const body = catalogResponseSchema.parse({
    models: (modelsR.data ?? []).map((m) => Adapters.productModelFromRow(m as DB.ProductModelRow)),
    skus: liveSkus.map((s) => Adapters.productSkuFromRow(s as DB.ProductSkuRow)),
    sofaFabrics: liveFabrics.map((f) => Adapters.sofaFabricFromRow(f as DB.SofaFabricRow)),
    addons: (addonsR.data ?? []).map((a) => Adapters.addonFromRow(a as DB.AddonRow)),
    floorConfig: Adapters.floorConfigFromRow(floorR.data as DB.FloorConfigRow),
  });

  // 0074 — was `private, max-age=300` but the browser cache was beating
  // react-query's invalidate-on-write (Loo 2026-05-09: new sofa model
  // didn't show until hard reload). React-query's `staleTime: 5 * 60_000`
  // already handles client-side caching; HTTP cache here was redundant.
  c.header("Cache-Control", "no-store");
  return c.json(body);
});

// ---------------------------------------------------------------------------
// Catalog admin (0074, Loo 2026-05-09 Q2=c). Principal + logistics manage the
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
  const sb = userClient(c.env, c.var.auth.jwt);

  // SKU code = `<category>:<model_key>:<variant>` to match the existing
  // catalog convention (split_part used by logistics_calc_shortages,
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
  const skuCode = `${modelRow.category}:${modelRow.model_key}:${parsed.data.variant}`;

  // 0074 bugfix (Loo 2026-05-09): product_skus.supplier_id is NOT NULL on
  // staging/prod. Auto-resolve from suppliers.cat_covered[] when the caller
  // doesn't pass an explicit supplierId — same routing rule the Create-PO
  // modal uses (`findSupplierForSku`). Falls back to 422 when no supplier
  // covers this category yet.
  let supplierId: string | null = parsed.data.supplierId ?? null;
  if (!supplierId) {
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
  const patch: Record<string, unknown> = {};
  if (parsed.data.variant !== undefined) patch.variant = parsed.data.variant;
  if (parsed.data.variantKind !== undefined) patch.variant_kind = parsed.data.variantKind;
  if (parsed.data.price !== undefined) patch.price = parsed.data.price;
  if (parsed.data.cost !== undefined) patch.cost = parsed.data.cost;
  if (parsed.data.supplierId !== undefined) patch.supplier_id = parsed.data.supplierId;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }

  const sb = userClient(c.env, c.var.auth.jwt);

  // If variant changed we must re-derive the sku code so split_part(sku,':',3)
  // stays in sync. Look up the model first to know category + model_key.
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
      .select("category, model_key")
      .eq("id", skuRow.model_id)
      .maybeSingle();
    if (modelRow) {
      patch.sku = `${modelRow.category}:${modelRow.model_key}:${parsed.data.variant}`;
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

export default catalogRouter;
