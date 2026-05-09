import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireSupplier } from "../../lib/auth-guards";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * Phase 6 carry-forward — Supplier · Me router.
 *
 * Closes `phase-6-supplier-me-endpoint`. SupplierDashboard + SupplierPOs need
 * `suppliers.kind` to gate `own_logistics`-vs-`factory_pickup` action buttons.
 * Pre-fix workaround was showing both Acknowledge + Mark-in-production on
 * pending state and surfacing the RPC's `wrong_supplier_kind` 422 in toast.
 *
 * Mounted at `/api/supplier/me`. Per-route `requireSupplier` guard. RLS on
 * suppliers (`suppliers_read`, 0002:152) admits the supplier's own row;
 * we forward the user JWT.
 *
 * Returns the supplier row keyed by JWT's `app_metadata.supplier_id`. If the
 * token has no supplier_id, that's an account-config bug — return 422 instead
 * of guessing.
 */
const supplierMeRouter = new Hono<AppEnv>();

supplierMeRouter.get("/", requireSupplier, async (c) => {
  const auth = c.var.auth;
  if (!auth.supplierId) {
    return c.json(
      {
        error: "missing_supplier_id",
        code: "missing_supplier_id",
        message: "Token has no supplier_id; account misconfigured",
      },
      422,
    );
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("suppliers")
    .select(
      "id, name, kind, cat_covered, lead_time, contact, contact_email, slug, portal_enabled",
    )
    .eq("id", auth.supplierId)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "Supplier not found" },
      404,
    );
  }
  return c.json(data);
});

export default supplierMeRouter;
