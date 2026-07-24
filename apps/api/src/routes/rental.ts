import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  Adapters,
  DB,
  servicePackageInputSchema,
  servicePackagePatchSchema,
  rentalPlanInputSchema,
  rentalPlanPatchSchema,
  customerInputSchema,
  phoneKeyMy,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { userClient } from "../lib/supabase";
import type { AppEnv } from "../types";

// ---------------------------------------------------------------------------
// Rental + Service Plan base (migrations 0247-0249, 2026-07-25).
//
// Config side (service_packages + rental_plans) is authored in the P&M
// "Rental" tab — principal-only writes, mirroring the 0182 option-pools gate:
// early friendly 403 here, with RLS (…_write_principal / is_principal()) the
// real boundary. Living side (customers / rental_agreements /
// rental_stock_units) is internal-HQ read/write (RLS = is_internal()).
// EVERY handler forwards the USER JWT (userClient) so RLS runs — NEVER
// service_role.
//
// Table names are local constants for now — the shared package's rental
// contract (row/domain/adapters/zod) is landing in parallel and does not
// include tables.ts entries; hoist these to @carres/shared/tables when the
// catalog settles (§9.4 no-magic-strings).
// ---------------------------------------------------------------------------

const CUSTOMERS = "customers" as const;
const SERVICE_PACKAGES = "service_packages" as const;
const RENTAL_PLANS = "rental_plans" as const;
const RENTAL_AGREEMENTS = "rental_agreements" as const;
const RENTAL_STOCK_UNITS = "rental_stock_units" as const;

const rentalRouter = new Hono<AppEnv>();

const RENTAL_PRINCIPAL_MSG =
  "Only the principal (Master Admin) can manage rental plans and service packages";

// Internal HQ roles — the API twin of the 0247/0249 RLS is_internal() policies
// (principal / operation / finance / bd). Store + customer surfaces get their
// own deliberately-scoped doors when those phases ship.
const INTERNAL_ROLES = new Set<string>(["principal", "operation", "finance", "bd"]);

function internalOnly(c: { var: { auth: { role: string } } }) {
  if (!INTERNAL_ROLES.has(c.var.auth.role)) {
    throw new HTTPException(403, { message: "internal (principal/operation/finance/bd) only" });
  }
}

function principalOnly(c: { var: { auth: { role: string } } }) {
  if (c.var.auth.role !== "principal") {
    throw new HTTPException(403, { message: RENTAL_PRINCIPAL_MSG });
  }
}

// ---------------------------------------------------------------------------
// GET /config — the P&M Rental tab bundle: every service package + rental plan
// (active AND inactive — the editor must see retired rows; consumers filter
// client-side). Sorted in JS to stay mock-friendly, mirroring the 0182
// option-pools branch: packages by (sort_order, name), plans by created_at.
// ---------------------------------------------------------------------------
rentalRouter.get("/config", async (c) => {
  internalOnly(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const [packagesR, plansR] = await Promise.all([
    sb.from(SERVICE_PACKAGES).select("*"),
    sb.from(RENTAL_PLANS).select("*"),
  ]);
  if (packagesR.error) throw new HTTPException(500, { message: packagesR.error.message });
  if (plansR.error) throw new HTTPException(500, { message: plansR.error.message });

  const servicePackages = ((packagesR.data ?? []) as DB.ServicePackageRow[])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((r) => Adapters.servicePackageFromRow(r));
  const rentalPlans = ((plansR.data ?? []) as DB.RentalPlanRow[])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => Adapters.rentalPlanFromRow(r));

  return c.json({ servicePackages, rentalPlans });
});

// ---------------------------------------------------------------------------
// Service packages — principal-only CRUD (RLS service_packages_write_principal).
// ---------------------------------------------------------------------------

// POST /service-packages — create (principal-only). Duplicate sku (the
// UNIQUE service_packages.sku link) → friendly 409; unknown sku FK → 422.
rentalRouter.post("/service-packages", async (c) => {
  principalOnly(c);
  const parsed = await parseJsonBody(c, servicePackageInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SERVICE_PACKAGES)
    .insert({
      name: d.name,
      service_type: d.serviceType,
      duration_months: d.durationMonths,
      visits_per_year: d.visitsPerYear,
      price: d.price,
      sku: d.sku ?? null,
      active: d.active ?? true,
      sort_order: d.sortOrder ?? 0,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "duplicate_package_sku", message: "another service package already uses that sku" },
        409,
      );
    }
    if (error.code === "23503") {
      return c.json(
        { error: "invalid_param", code: "invalid_sku", message: "unknown sku (no matching product_skus row)" },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "service package insert returned no row" }, 500);
  }
  return c.json({ servicePackage: Adapters.servicePackageFromRow(data as DB.ServicePackageRow) }, 201);
});

// PATCH /service-packages/:id — partial update (principal-only); empty → 422.
rentalRouter.patch("/service-packages/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, servicePackagePatchSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.serviceType !== undefined) patch.service_type = d.serviceType;
  if (d.durationMonths !== undefined) patch.duration_months = d.durationMonths;
  if (d.visitsPerYear !== undefined) patch.visits_per_year = d.visitsPerYear;
  if (d.price !== undefined) patch.price = d.price;
  if (d.sku !== undefined) patch.sku = d.sku;
  if (d.active !== undefined) patch.active = d.active;
  if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(SERVICE_PACKAGES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "duplicate_package_sku", message: "another service package already uses that sku" },
        409,
      );
    }
    if (error.code === "23503") {
      return c.json(
        { error: "invalid_param", code: "invalid_sku", message: "unknown sku (no matching product_skus row)" },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "service package not found" }, 404);
  }
  return c.json({ servicePackage: Adapters.servicePackageFromRow(data as DB.ServicePackageRow) });
});

// DELETE /service-packages/:id — HARD delete (principal-only). A rental_plan
// referencing it is fine (included_package_id is ON DELETE SET NULL); a
// service_entitlements reference BLOCKS (no cascade) → friendly 409.
rentalRouter.delete("/service-packages/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(SERVICE_PACKAGES).delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return c.json(
        { error: "conflict", code: "package_in_use", message: "service package has entitlements minted against it — deactivate it instead" },
        409,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Rental plans — principal-only CRUD (RLS rental_plans_write_principal).
// ---------------------------------------------------------------------------

// POST /plans — create (principal-only). Duplicate (sku, term_months) → 409;
// unknown sku FK violation → 422 invalid_sku.
rentalRouter.post("/plans", async (c) => {
  principalOnly(c);
  const parsed = await parseJsonBody(c, rentalPlanInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_PLANS)
    .insert({
      sku: d.sku,
      term_months: d.termMonths,
      monthly_fee: d.monthlyFee,
      supplier_rate_pct: d.supplierRatePct,
      commission_base_pct: d.commissionBasePct,
      included_package_id: d.includedPackageId ?? null,
      active: d.active ?? false,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "duplicate_plan", message: `a plan for ${d.sku} × ${d.termMonths} months already exists` },
        409,
      );
    }
    if (error.code === "23503") {
      // Two FKs can trip: the sku → product_skus link and included_package_id
      // → service_packages. Tell them apart by the constraint in the message.
      const pkg = /included_package/i.test(error.message ?? "");
      return c.json(
        pkg
          ? { error: "invalid_param", code: "invalid_package", message: "unknown included service package" }
          : { error: "invalid_param", code: "invalid_sku", message: "unknown sku (no matching product_skus row)" },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "rental plan insert returned no row" }, 500);
  }
  return c.json({ plan: Adapters.rentalPlanFromRow(data as DB.RentalPlanRow) }, 201);
});

// PATCH /plans/:id — partial update (principal-only); empty → 422.
rentalRouter.patch("/plans/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, rentalPlanPatchSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.sku !== undefined) patch.sku = d.sku;
  if (d.termMonths !== undefined) patch.term_months = d.termMonths;
  if (d.monthlyFee !== undefined) patch.monthly_fee = d.monthlyFee;
  if (d.supplierRatePct !== undefined) patch.supplier_rate_pct = d.supplierRatePct;
  if (d.commissionBasePct !== undefined) patch.commission_base_pct = d.commissionBasePct;
  if (d.includedPackageId !== undefined) patch.included_package_id = d.includedPackageId;
  if (d.active !== undefined) patch.active = d.active;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_PLANS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "duplicate_plan", message: "a plan for that sku × term already exists" },
        409,
      );
    }
    if (error.code === "23503") {
      const pkg = /included_package/i.test(error.message ?? "");
      return c.json(
        pkg
          ? { error: "invalid_param", code: "invalid_package", message: "unknown included service package" }
          : { error: "invalid_param", code: "invalid_sku", message: "unknown sku (no matching product_skus row)" },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "rental plan not found" }, 404);
  }
  return c.json({ plan: Adapters.rentalPlanFromRow(data as DB.RentalPlanRow) });
});

// DELETE /plans/:id — HARD delete (principal-only). An agreement referencing
// the plan BLOCKS (rental_agreements.plan_id has no cascade) → friendly 409;
// the soft path is PATCH active=false.
rentalRouter.delete("/plans/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(RENTAL_PLANS).delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return c.json(
        { error: "conflict", code: "plan_in_use", message: "rental plan has agreements signed against it — deactivate it instead" },
        409,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Living side — internal-HQ read surfaces over the (dormant) agreement base.
// ---------------------------------------------------------------------------

/** rental_agreements row + the PostgREST customer embed (FK customer_id). */
type AgreementRowWithCustomer = DB.RentalAgreementRow & {
  customers: { name: string | null; phone: string | null } | null;
};

// GET /agreements — newest first, capped at 200 (guardrail #3: never assume
// the full list is loaded). Embeds the customer's name+phone via the single
// customer_id FK — no disambiguation needed (one FK on this table).
rentalRouter.get("/agreements", async (c) => {
  internalOnly(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_AGREEMENTS)
    .select("*, customers(name, phone)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new HTTPException(500, { message: error.message });
  const agreements = ((data ?? []) as AgreementRowWithCustomer[]).map((r) => {
    const { customers, ...row } = r;
    return {
      ...Adapters.rentalAgreementFromRow(row as DB.RentalAgreementRow),
      customerName: customers?.name ?? null,
      customerPhone: customers?.phone ?? null,
    };
  });
  return c.json({ agreements });
});

// GET /units — the rented-out asset registry, newest first, capped at 500.
rentalRouter.get("/units", async (c) => {
  internalOnly(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_STOCK_UNITS)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({
    units: ((data ?? []) as DB.RentalStockUnitRow[]).map((r) => Adapters.rentalStockUnitFromRow(r)),
  });
});

// ---------------------------------------------------------------------------
// Customers — the 0247 first-class customer entity (internal-HQ for the base;
// the POS sell lane widens access in its own phase).
// ---------------------------------------------------------------------------

// GET /customers?q= — pick-list search. Case-insensitive contains on name OR
// phone; no/short q returns the newest 50 so the picker is never blank.
rentalRouter.get("/customers", async (c) => {
  internalOnly(c);
  const q = (c.req.query("q") ?? "").trim();
  const sb = userClient(c.env, c.var.auth.jwt);
  let query = sb.from(CUSTOMERS).select("*");
  if (q.length >= 2) {
    // Escape ilike wildcards (a literal %/_ must not widen the match) and drop
    // PostgREST .or() syntax characters (comma/parens would split the clause).
    const pattern =
      "%" + q.replace(/[,()]/g, " ").replace(/[\\%_]/g, (m) => "\\" + m) + "%";
    query = query.or(`name.ilike.${pattern},phone.ilike.${pattern}`);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({
    customers: ((data ?? []) as DB.CustomerRow[]).map((r) => Adapters.customerFromRow(r)),
  });
});

// POST /customers — create (internal). phone_key is computed SERVER-side with
// the canonical MY-aware helper (phoneKeyMy — the JS twin of the SQL
// pwp_phone_key, 0188): one customer per canonical phone, enforced by the
// UNIQUE(phone_key) → friendly 409 customer_exists.
rentalRouter.post("/customers", async (c) => {
  internalOnly(c);
  const parsed = await parseJsonBody(c, customerInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const key = phoneKeyMy(d.phone);
  if (!key) {
    return c.json(
      { error: "invalid_input", code: "invalid_param", message: "phone has no usable digits" },
      422,
    );
  }
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(CUSTOMERS)
    .insert({
      name: d.name,
      phone: d.phone,
      phone_key: key,
      email: d.email ?? null,
      address: d.address ?? null,
      notes: d.notes ?? null,
      updated_at: new Date().toISOString(),
      created_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "customer_exists", message: "a customer with that phone already exists" },
        409,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "customer insert returned no row" }, 500);
  }
  return c.json({ customer: Adapters.customerFromRow(data as DB.CustomerRow) }, 201);
});

export default rentalRouter;
