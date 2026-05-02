import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  Adapters,
  DB,
  catalogResponseSchema,
} from "@carres/shared";
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

  c.header("Cache-Control", "private, max-age=300");
  return c.json(body);
});

export default catalogRouter;
