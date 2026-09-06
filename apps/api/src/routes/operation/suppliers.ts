import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { supplierCreateInput, supplierSlug } from "@carres/shared";
import { mapPgError, parseJsonBody } from "../../lib/route-helpers";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * GET /api/operation/suppliers
 *
 * Lightweight list of suppliers — used by `CreatePOModal` (M5 Task 3, §18.4
 * spec) to populate the "Supplier" dropdown and to drive the auto-detect of
 * supplier per SKU via `cat_covered`. Surfaces the columns proto's NewPODialog
 * needs: `id`, `name`, `kind` (own_logistics | factory_pickup), `cat_covered`,
 * `lead_time`, `contact`.
 *
 * Auth: operation-only via inline guard (mirrors partners.ts pattern). RLS
 * `suppliers_read` already lets HQ roles SELECT (0002_rls.sql), so the user
 * JWT is enough — no service_role.
 */
const operationSuppliersRouter = new Hono<AppEnv>();

operationSuppliersRouter.use("*", async (c, next) => {
  const role = c.var.auth?.role;
  if (role !== "operation" && role !== "principal") {
    throw new HTTPException(403, { message: "operation only" });
  }
  await next();
});

operationSuppliersRouter.get("/", async (c) => {
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from("suppliers")
    /* `slug` rides along (2026-08-25): it is the IDENTITY the server checks a
       new supplier against, and a supplier can be RENAMED while the slug stays
       (Ohana still carries `hookka` from 0032). A client deriving slugs from
       NAMES would let "Hookka" through and be refused server-side — the exact
       dead end this list exists to prevent. */
    .select("id, name, slug, kind, cat_covered, lead_time, contact, contact_email, whatsapp_group_url")
    .order("name", { ascending: true });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ suppliers: data ?? [] });
});

/**
 * ⭐ POST /api/operation/suppliers — THE FIRST SUPPLIER-CREATION DOOR
 * (2026-08-24).
 *
 * Before this the portal had none: no route, no screen. Every supplier row was
 * inserted by hand in the SQL editor, so onboarding a factory was an
 * engineering task and a keyer who met a new supplier mid-catalog simply
 * stopped. Catalog gets a door onto it (the New SKU picker); Purchasing keeps
 * ownership of the record — one door, not a second home (Law C).
 *
 * PRINCIPAL ONLY, and that is not a new decision: `suppliers_principal_write`
 * (0002) has always been the boundary. The check here only turns a raw 42501
 * into a sentence, exactly as the catalog's own price lock does. NO RLS
 * CHANGES — the same policy that refused this yesterday allows it today,
 * because the principal was always permitted; there was simply nothing to call.
 */
operationSuppliersRouter.post("/", async (c) => {
  if (c.var.auth.role !== "principal") {
    throw new HTTPException(403, {
      message: "Only the principal (Master Admin) can add a supplier",
    });
  }
  const parsed = await parseJsonBody(c, supplierCreateInput);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const sb = userClient(c.env, c.var.auth.jwt);

  /* The slug is DERIVED, never typed — it is unique in production and keys
     SUPPLIER_SOP across environments (0032). Checked before the insert so a
     collision reads as a sentence about the NAME, which is the thing the keyer
     actually chose, instead of a raw 23505 about a column they never saw. */
  const slug = supplierSlug(parsed.data.name);
  if (!slug) {
    return c.json(
      {
        error: "rule_violation",
        code: "unusable_name",
        message: "That name has no letters or digits in it — give the supplier a readable name.",
      },
      422,
    );
  }
  const { data: clash, error: clashErr } = await sb
    .from("suppliers")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (clashErr) {
    const m = mapPgError(clashErr);
    return c.json(m.body, m.status);
  }
  if (clash) {
    return c.json(
      {
        error: "rule_violation",
        code: "supplier_exists",
        message: `${(clash as { name: string }).name} is already a supplier — pick it from the list instead of adding it twice.`,
      },
      422,
    );
  }

  const { data, error } = await sb.rpc("catalog_create_supplier_setup", {
    p_name: parsed.data.name,
    p_slug: slug,
    p_kind: parsed.data.kind,
    p_categories: parsed.data.catCovered,
    p_production_days: parsed.data.productionDays,
    p_off_days: parsed.data.offDays,
  });
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json(
      { error: "not_found", code: "not_found", message: "insert returned no row" },
      404,
    );
  }
  return c.json({ supplier: data }, 201);
});

export default operationSuppliersRouter;
