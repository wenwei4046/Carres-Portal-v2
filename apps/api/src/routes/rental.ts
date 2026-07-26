import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  servicePackageInputSchema,
  servicePackagePatchSchema,
  rentalPlanInputSchema,
  rentalPlanPatchSchema,
  rentalOfferInputSchema,
  rentalOfferPatchSchema,
  rentalBuyPriceInputSchema,
  rentalBuyPricePatchSchema,
  rentalOfferServiceInputSchema,
  rentalOfferServicePatchSchema,
  agreementTemplateInputSchema,
  agreementTemplatePatchSchema,
  agreementTokens,
  serviceSkuCode,
  phoneKeyMy,
  customerInputSchema,
  createRentalAgreementInputSchema,
  CUSTOMERS,
  SERVICE_PACKAGES,
  RENTAL_PLANS,
  RENTAL_PLANS_POS,
  RENTAL_OFFERS,
  RENTAL_BUY_PRICES,
  RENTAL_OFFER_SERVICES,
  RENTAL_AGREEMENT_TEMPLATES,
  RENTAL_AGREEMENTS,
  RENTAL_STOCK_UNITS,
  PRODUCT_MODELS,
  PRODUCT_SKUS,
} from "@carres/shared";
import { mapPgError, parseJsonBody } from "../lib/route-helpers";
import { ensureFixedTermSchedule, ensureRentalPlanStripeObjects, CARRES_SOURCE } from "../lib/rental-stripe";
import { stripeClient, stripeConfigured } from "../lib/stripe";
import { adminClient, userClient } from "../lib/supabase";
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
// service_role. Table names come from @carres/shared/tables (§9.4).
// ---------------------------------------------------------------------------

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

// "Everyone can sell" (Loo, 0255) — the POS-transacting set, the API twin of
// the create_rental_agreement RPC's own gate (mirrors requireOrderRole).
const SELLER_ROLES = new Set<string>([
  "dealer",
  "salesperson",
  "showroom",
  "bd",
  "principal",
  "operation",
  "finance",
]);

function sellerOnly(c: { var: { auth: { role: string } } }) {
  if (!SELLER_ROLES.has(c.var.auth.role)) {
    throw new HTTPException(403, { message: "Role cannot sell rental plans" });
  }
}

function requireStripeConfigured(c: { env: AppEnv["Bindings"] }) {
  if (!stripeConfigured(c.env)) {
    throw new HTTPException(503, {
      message: "Stripe is not set up yet — ask the principal to add the Stripe keys.",
    });
  }
}

// ---------------------------------------------------------------------------
// Stripe plan sync (0255) — authoring a plan upserts its Stripe Product +
// recurring Price (the pilot's metadata namespace). Sync NEVER fails the save:
// the plan row is the source of truth, Stripe is a projection; a failure comes
// back as stripeSync.status='error' and the Rental tab offers a manual Sync.
// The id write-back rides the PRINCIPAL's own JWT (RLS rental_plans_write_
// principal) — no service_role in the authoring path.
// ---------------------------------------------------------------------------

type StripeSyncOutcome = { status: "synced" | "skipped" | "error"; message?: string };

async function syncPlanStripe(
  c: Context<AppEnv>,
  sb: ReturnType<typeof userClient>,
  planRow: DB.RentalPlanRow,
): Promise<{ plan: DB.RentalPlanRow; stripeSync: StripeSyncOutcome }> {
  if (!stripeConfigured(c.env)) {
    return { plan: planRow, stripeSync: { status: "skipped", message: "stripe_not_configured" } };
  }
  try {
    // Same-SKU sibling plan's Product (deterministic DB lookup — never Stripe
    // search) so two terms on one mattress share one Product.
    // 0264 — a combo line has no sku; its siblings share the combo instead.
    const siblingQ = sb
      .from(RENTAL_PLANS)
      .select("stripe_product_id")
      .not("stripe_product_id", "is", null)
      .neq("id", planRow.id);
    const { data: sibling } = await (
      planRow.sku != null
        ? siblingQ.eq("sku", planRow.sku)
        : siblingQ.eq("combo_id", planRow.combo_id ?? "")
    )
      .limit(1)
      .maybeSingle();
    const ids = await ensureRentalPlanStripeObjects(
      stripeClient(c.env),
      planRow,
      (sibling as { stripe_product_id: string | null } | null)?.stripe_product_id ?? null,
    );
    if (ids.productId === planRow.stripe_product_id && ids.priceId === planRow.stripe_price_id) {
      return { plan: planRow, stripeSync: { status: "synced" } };
    }
    const { data: updated, error } = await sb
      .from(RENTAL_PLANS)
      .update({ stripe_product_id: ids.productId, stripe_price_id: ids.priceId })
      .eq("id", planRow.id)
      .select("*")
      .maybeSingle();
    if (error || !updated) {
      return {
        plan: planRow,
        stripeSync: { status: "error", message: error?.message ?? "could not store the Stripe ids" },
      };
    }
    return { plan: updated as DB.RentalPlanRow, stripeSync: { status: "synced" } };
  } catch (e) {
    return {
      plan: planRow,
      stripeSync: { status: "error", message: e instanceof Error ? e.message : "Stripe sync failed" },
    };
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
  // 0264 — the tab now authors OFFERS (one per model) with their rent lines,
  // buy prices and attached service packages. The five reads are independent;
  // a missing table on a stale environment surfaces as a plain 500.
  const [packagesR, plansR, offersR, buyR, offerSvcR, templatesR] = await Promise.all([
    sb.from(SERVICE_PACKAGES).select("*"),
    sb.from(RENTAL_PLANS).select("*"),
    sb.from(RENTAL_OFFERS).select("*"),
    sb.from(RENTAL_BUY_PRICES).select("*"),
    sb.from(RENTAL_OFFER_SERVICES).select("*"),
    sb.from(RENTAL_AGREEMENT_TEMPLATES).select("*"),
  ]);
  if (packagesR.error) throw new HTTPException(500, { message: packagesR.error.message });
  if (plansR.error) throw new HTTPException(500, { message: plansR.error.message });
  if (offersR.error) throw new HTTPException(500, { message: offersR.error.message });
  if (buyR.error) throw new HTTPException(500, { message: buyR.error.message });
  if (offerSvcR.error) throw new HTTPException(500, { message: offerSvcR.error.message });
  if (templatesR.error) throw new HTTPException(500, { message: templatesR.error.message });

  const servicePackages = ((packagesR.data ?? []) as DB.ServicePackageRow[])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((r) => Adapters.servicePackageFromRow(r));
  const rentalPlans = ((plansR.data ?? []) as DB.RentalPlanRow[])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => Adapters.rentalPlanFromRow(r));
  const rentalOffers = ((offersR.data ?? []) as DB.RentalOfferRow[])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => Adapters.rentalOfferFromRow(r));
  const buyPrices = ((buyR.data ?? []) as DB.RentalBuyPriceRow[])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((r) => Adapters.rentalBuyPriceFromRow(r));
  const offerServices = ((offerSvcR.data ?? []) as DB.RentalOfferServiceRow[])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
    .map((r) => Adapters.rentalOfferServiceFromRow(r));

  // 0267 — newest version of each document first (the tab lists by doc, and
  // an older version stays readable because agreements were signed under it).
  const agreementTemplates = ((templatesR.data ?? []) as DB.RentalAgreementTemplateRow[])
    .slice()
    .sort((a, b) => a.doc_key.localeCompare(b.doc_key) || b.version - a.version)
    .map((r) => Adapters.rentalAgreementTemplateFromRow(r));

  return c.json({
    servicePackages,
    rentalPlans,
    rentalOffers,
    buyPrices,
    offerServices,
    agreementTemplates,
  });
});

// ---------------------------------------------------------------------------
// Service packages — principal-only CRUD (RLS service_packages_write_principal).
// ---------------------------------------------------------------------------

// 0264 — a service plan IS a SKU: "one year × how many visits = one SKU"
// (Loo 2026-07-26). Creating a package with a category and no explicit sku
// mints `SVC-{CAT}-{TYPE}-{n}Y{visits}` under the catalog's service model, so
// the plan can be sold, gifted and invoiced like any other product. Idempotent:
// an existing code is reused (a package deleted and re-authored keeps its SKU).
async function ensureServiceSku(
  sb: ReturnType<typeof userClient>,
  code: string,
  name: string,
  price: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data: existing, error: readErr } = await sb
    .from(PRODUCT_SKUS)
    .select("sku")
    .eq("sku", code)
    .maybeSingle();
  if (readErr) return { ok: false, message: readErr.message };
  if (existing) return { ok: true };

  const { data: model, error: modelErr } = await sb
    .from(PRODUCT_MODELS)
    .select("id")
    .eq("category", "service")
    .is("discontinued_at", null)
    .limit(1)
    .maybeSingle();
  if (modelErr) return { ok: false, message: modelErr.message };
  if (!model) {
    return {
      ok: false,
      message: "no service-category model in the catalog — create one in Modular before authoring service plans",
    };
  }
  const { error: insErr } = await sb.from(PRODUCT_SKUS).insert({
    model_id: (model as { id: string }).id,
    sku: code,
    variant: code,
    variant_kind: "preset",
    price,
    pos_active: true,
    description: name,
  });
  if (insErr) return { ok: false, message: insErr.message };
  return { ok: true };
}

// POST /service-packages — create (principal-only). Duplicate sku (the
// UNIQUE service_packages.sku link) → friendly 409; unknown sku FK → 422.
rentalRouter.post("/service-packages", async (c) => {
  principalOnly(c);
  const parsed = await parseJsonBody(c, servicePackageInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);

  // Auto-SKU: only when the caller named a category and gave no sku of its own.
  let sku = d.sku ?? null;
  if (!sku && d.category) {
    const code = serviceSkuCode(d.category, d.serviceType, d.durationMonths, d.visitsPerYear);
    const minted = await ensureServiceSku(sb, code, d.name, d.price);
    if (!minted.ok) {
      return c.json({ error: "invalid_param", code: "service_sku_mint_failed", message: minted.message }, 422);
    }
    sku = code;
  }

  const { data, error } = await sb
    .from(SERVICE_PACKAGES)
    .insert({
      name: d.name,
      service_type: d.serviceType,
      duration_months: d.durationMonths,
      visits_per_year: d.visitsPerYear,
      price: d.price,
      sku,
      category: d.category ?? null,
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
  // 0264 — category is patchable, but the SKU is NOT re-minted: a code that
  // already exists in the catalog (and possibly on an invoice) is permanent.
  // A different duration/visits/category wants a NEW package.
  if (d.category !== undefined) patch.category = d.category;
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
      sku: d.sku ?? null,
      term_months: d.termMonths,
      monthly_fee: d.monthlyFee,
      supplier_rate_pct: d.supplierRatePct,
      commission_base_pct: d.commissionBasePct,
      included_package_id: d.includedPackageId ?? null,
      active: d.active ?? false,
      // 0264 — the parent offer + sofa targets + gifts.
      offer_id: d.offerId ?? null,
      combo_id: d.comboId ?? null,
      line_kind: d.lineKind ?? (d.comboId ? "combo" : "unit"),
      gifts: d.gifts ?? [],
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
  // 0255 — project the fresh plan into Stripe (Product + recurring Price).
  const synced = await syncPlanStripe(c, sb, data as DB.RentalPlanRow);
  return c.json(
    { plan: Adapters.rentalPlanFromRow(synced.plan), stripeSync: synced.stripeSync },
    201,
  );
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
  if (d.offerId !== undefined) patch.offer_id = d.offerId;
  if (d.comboId !== undefined) patch.combo_id = d.comboId;
  if (d.lineKind !== undefined) patch.line_kind = d.lineKind;
  if (d.gifts !== undefined) patch.gifts = d.gifts;
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
  // 0255 — re-project into Stripe when the sellable face moved (sku/term/fee)
  // or the plan was never synced. A pure deactivate skips Stripe entirely
  // (the POS view already hides inactive plans).
  const row = data as DB.RentalPlanRow;
  const touchedPricing =
    d.sku !== undefined || d.termMonths !== undefined || d.monthlyFee !== undefined;
  if (touchedPricing || (!row.stripe_price_id && row.active)) {
    const synced = await syncPlanStripe(c, sb, row);
    return c.json({ plan: Adapters.rentalPlanFromRow(synced.plan), stripeSync: synced.stripeSync });
  }
  return c.json({ plan: Adapters.rentalPlanFromRow(row) });
});

// POST /plans/:id/stripe-sync — manual retry for a failed auto-sync
// (principal-only; the Rental tab's "Sync" button).
rentalRouter.post("/plans/:id/stripe-sync", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from(RENTAL_PLANS).select("*").eq("id", id).maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "rental plan not found" }, 404);
  }
  const synced = await syncPlanStripe(c, sb, data as DB.RentalPlanRow);
  return c.json({ plan: Adapters.rentalPlanFromRow(synced.plan), stripeSync: synced.stripeSync });
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
// Rental OFFERS (0264) — the model-level config the P&M Rental tab authors:
// which lanes are open, how the monthly base is reached, the option/fabric
// price overlay, the surcharge slots and the split. Principal-only writes
// (RLS rental_offers_write_principal); the per-variant money hangs off it as
// rental_plans (rent) and rental_buy_prices (buy).
// ---------------------------------------------------------------------------

// POST /offers — create. One offer per model (UNIQUE model_id) → 409.
rentalRouter.post("/offers", async (c) => {
  principalOnly(c);
  const parsed = await parseJsonBody(c, rentalOfferInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_OFFERS)
    .insert({
      model_id: d.modelId,
      pricing_mode: d.pricingMode ?? "variant",
      rent_enabled: d.rentEnabled ?? true,
      buy_enabled: d.buyEnabled ?? false,
      ...(d.termsMonths ? { terms_months: d.termsMonths } : {}),
      option_prices: d.optionPrices ?? {},
      surcharges: d.surcharges ?? [],
      supplier_rate_pct: d.supplierRatePct ?? 0,
      commission_base_pct: d.commissionBasePct ?? 0,
      active: d.active ?? false,
      notes: d.notes ?? null,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "duplicate_offer", message: "this model already has an offer — edit that one" },
        409,
      );
    }
    if (error.code === "23503") {
      return c.json(
        { error: "invalid_param", code: "invalid_model", message: "unknown model (no matching product_models row)" },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "offer insert returned no row" }, 500);
  }
  return c.json({ offer: Adapters.rentalOfferFromRow(data as DB.RentalOfferRow) }, 201);
});

// PATCH /offers/:id — partial update; `modelId` is deliberately unpatchable
// (zod omits it — re-pointing an authored offer would re-parent live money).
rentalRouter.patch("/offers/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, rentalOfferPatchSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.pricingMode !== undefined) patch.pricing_mode = d.pricingMode;
  if (d.rentEnabled !== undefined) patch.rent_enabled = d.rentEnabled;
  if (d.buyEnabled !== undefined) patch.buy_enabled = d.buyEnabled;
  if (d.termsMonths !== undefined) patch.terms_months = d.termsMonths;
  if (d.optionPrices !== undefined) patch.option_prices = d.optionPrices;
  if (d.surcharges !== undefined) patch.surcharges = d.surcharges;
  if (d.supplierRatePct !== undefined) patch.supplier_rate_pct = d.supplierRatePct;
  if (d.commissionBasePct !== undefined) patch.commission_base_pct = d.commissionBasePct;
  if (d.active !== undefined) patch.active = d.active;
  if (d.notes !== undefined) patch.notes = d.notes;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_OFFERS)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "offer not found" }, 404);
  }
  return c.json({ offer: Adapters.rentalOfferFromRow(data as DB.RentalOfferRow) });
});

// DELETE /offers/:id — cascades its rent lines, buy prices and attached
// services (all ON DELETE CASCADE). A rent line with a signed agreement blocks
// (rental_agreements.plan_id has no cascade) → friendly 409; the soft path is
// PATCH active=false.
rentalRouter.delete("/offers/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(RENTAL_OFFERS).delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return c.json(
        {
          error: "conflict",
          code: "offer_in_use",
          message: "this offer has agreements signed against it — switch it off instead",
        },
        409,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Buy prices (0264) — the outright lane of an offer. `price` null = sell at
// whatever SKU Master says.
// ---------------------------------------------------------------------------

rentalRouter.post("/offers/:offerId/buy-prices", async (c) => {
  principalOnly(c);
  const offerId = c.req.param("offerId");
  const parsed = await parseJsonBody(c, rentalBuyPriceInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_BUY_PRICES)
    .insert({
      offer_id: offerId,
      sku: d.sku ?? null,
      combo_id: d.comboId ?? null,
      price: d.price ?? null,
      gifts: d.gifts ?? [],
      active: d.active ?? true,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "duplicate_buy_price", message: "that target already has a buy price on this offer" },
        409,
      );
    }
    if (error.code === "23503") {
      return c.json(
        { error: "invalid_param", code: "invalid_target", message: "unknown offer, sku or combo" },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "buy price insert returned no row" }, 500);
  }
  return c.json({ buyPrice: Adapters.rentalBuyPriceFromRow(data as DB.RentalBuyPriceRow) }, 201);
});

rentalRouter.patch("/buy-prices/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, rentalBuyPricePatchSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.sku !== undefined) patch.sku = d.sku;
  if (d.comboId !== undefined) patch.combo_id = d.comboId;
  if (d.price !== undefined) patch.price = d.price;
  if (d.gifts !== undefined) patch.gifts = d.gifts;
  if (d.active !== undefined) patch.active = d.active;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_BUY_PRICES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "buy price not found" }, 404);
  }
  return c.json({ buyPrice: Adapters.rentalBuyPriceFromRow(data as DB.RentalBuyPriceRow) });
});

rentalRouter.delete("/buy-prices/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(RENTAL_BUY_PRICES).delete().eq("id", id);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Offer services (0264) — which service packages an offer attaches, free on
// which lane (and for how many visits), or at what monthly / one-off price.
// ---------------------------------------------------------------------------

rentalRouter.post("/offers/:offerId/services", async (c) => {
  principalOnly(c);
  const offerId = c.req.param("offerId");
  const parsed = await parseJsonBody(c, rentalOfferServiceInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_OFFER_SERVICES)
    .insert({
      offer_id: offerId,
      package_id: d.packageId,
      free_lane: d.freeLane ?? null,
      free_visits: d.freeVisits ?? null,
      monthly_price: d.monthlyPrice ?? null,
      outright_price: d.outrightPrice ?? null,
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
        { error: "conflict", code: "duplicate_offer_service", message: "that package is already attached to this offer" },
        409,
      );
    }
    if (error.code === "23503") {
      return c.json(
        { error: "invalid_param", code: "invalid_target", message: "unknown offer or service package" },
        422,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "offer service insert returned no row" }, 500);
  }
  return c.json(
    { offerService: Adapters.rentalOfferServiceFromRow(data as DB.RentalOfferServiceRow) },
    201,
  );
});

rentalRouter.patch("/offer-services/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, rentalOfferServicePatchSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.freeLane !== undefined) patch.free_lane = d.freeLane;
  if (d.freeVisits !== undefined) patch.free_visits = d.freeVisits;
  if (d.monthlyPrice !== undefined) patch.monthly_price = d.monthlyPrice;
  if (d.outrightPrice !== undefined) patch.outright_price = d.outrightPrice;
  if (d.active !== undefined) patch.active = d.active;
  if (d.sortOrder !== undefined) patch.sort_order = d.sortOrder;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_OFFER_SERVICES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "offer service not found" }, 404);
  }
  return c.json({ offerService: Adapters.rentalOfferServiceFromRow(data as DB.RentalOfferServiceRow) });
});

rentalRouter.delete("/offer-services/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const sb = userClient(c.env, c.var.auth.jwt);
  const { error } = await sb.from(RENTAL_OFFER_SERVICES).delete().eq("id", id);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Agreement wording (0267) — the paper a rental signs. The customer's own
// document, printed VERBATIM; the API only versions it. A version is
// IMMUTABLE: new wording is POSTed as version max+1, so an agreement signed
// under v1 can always be re-rendered exactly as it was signed.
// ---------------------------------------------------------------------------

// POST /agreement-templates — author a new version (principal-only).
rentalRouter.post("/agreement-templates", async (c) => {
  principalOnly(c);
  const parsed = await parseJsonBody(c, agreementTemplateInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);

  // Next version for this document (a fresh doc_key starts at 1).
  const { data: latest, error: readErr } = await sb
    .from(RENTAL_AGREEMENT_TEMPLATES)
    .select("version")
    .eq("doc_key", d.docKey)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readErr) throw new HTTPException(500, { message: readErr.message });
  const version = ((latest as { version?: number } | null)?.version ?? 0) + 1;

  const { data, error } = await sb
    .from(RENTAL_AGREEMENT_TEMPLATES)
    .insert({
      doc_key: d.docKey,
      name: d.name,
      binds_to: d.bindsTo ?? [],
      version,
      body: d.body,
      // Cached from the wording itself — the editor lists what it will fill.
      fields: agreementTokens(d.body),
      ...(d.effectiveFrom ? { effective_from: d.effectiveFrom } : {}),
      active: d.active ?? true,
      updated_at: new Date().toISOString(),
      updated_by: c.var.auth.id,
    })
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return c.json(
        { error: "conflict", code: "duplicate_version", message: "that version already exists — reload and try again" },
        409,
      );
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "template insert returned no row" }, 500);
  }
  return c.json(
    { template: Adapters.rentalAgreementTemplateFromRow(data as DB.RentalAgreementTemplateRow) },
    201,
  );
});

// PATCH /agreement-templates/:id — binding / name / effective date / active.
// The WORDING is never patched: new wording is a new version.
rentalRouter.patch("/agreement-templates/:id", async (c) => {
  principalOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, agreementTemplatePatchSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const patch: Record<string, unknown> = {};
  if (d.name !== undefined) patch.name = d.name;
  if (d.bindsTo !== undefined) patch.binds_to = d.bindsTo;
  if (d.effectiveFrom !== undefined) patch.effective_from = d.effectiveFrom;
  if (d.active !== undefined) patch.active = d.active;
  if (Object.keys(patch).length === 0) {
    return c.json({ error: "no_fields", code: "no_fields", message: "patch body is empty" }, 422);
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = c.var.auth.id;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb
    .from(RENTAL_AGREEMENT_TEMPLATES)
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) {
    return c.json({ error: "not_found", code: "not_found", message: "agreement wording not found" }, 404);
  }
  return c.json({
    template: Adapters.rentalAgreementTemplateFromRow(data as DB.RentalAgreementTemplateRow),
  });
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

// ---------------------------------------------------------------------------
// The Approver gate (0268) — the T&C's credit-assessment clause.
//
// A rent-to-own agreement is born `pending_approval` and materialises NOTHING
// (no billing schedule, no RU asset, no entitlement) until a human decides. The
// Stripe checkout route already refuses anything that is not `active`, so this
// gate also blocks the card charge for free.
//
// Gate: finance + principal ONLY. Deliberately narrower than internalOnly() —
// that set includes `bd`, and a BD who sells rentals must not approve their own
// credit application. The DB says the same thing in rental_can_approve(); this
// is the friendly-403 twin, not the boundary.
// ---------------------------------------------------------------------------

const APPROVER_ROLES = new Set<string>(["finance", "principal"]);

function approverOnly(c: { var: { auth: { role: string } } }) {
  if (!APPROVER_ROLES.has(c.var.auth.role)) {
    throw new HTTPException(403, {
      message: "Only finance or the principal can decide a rental application",
    });
  }
}

/** Approve or reject, the ChangeRequest precedent's one-field shape. */
const decideRentalAgreementSchema = z
  .object({
    approve: z.boolean(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.approve || (v.note != null && v.note.length > 0), {
    message: "A rejection needs a reason",
    path: ["note"],
  });

// GET /approvals — the approver's worklist. ONE definer RPC returns the
// application plus the particulars a human needs to judge it (customer, store,
// salesperson, signature state, and the total credit the decision extends).
rentalRouter.get("/approvals", async (c) => {
  approverOnly(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("rental_pending_approvals");
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  return c.json({ approvals: (data ?? []) as unknown[] });
});

// POST /agreements/:id/decide — Approve puts the contract live and materialises
// its money; Reject fails the application and leaves nothing behind. Both are
// one atomic SECURITY DEFINER RPC on the USER's JWT — never service_role.
rentalRouter.post("/agreements/:id/decide", async (c) => {
  approverOnly(c);
  const id = c.req.param("id");
  const parsed = await parseJsonBody(c, decideRentalAgreementSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const { approve, note } = parsed.data;

  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = approve
    ? await sb.rpc("rental_approve_agreement", { p_agreement_id: id, p_note: note ?? null })
    : await sb.rpc("rental_reject_agreement", { p_agreement_id: id, p_reason: note ?? "" });

  if (error) {
    const detail = (error as { details?: string | null }).details ?? "";
    if (detail === "forbidden") {
      return c.json({ error: "forbidden", code: "forbidden", message: error.message }, 403);
    }
    if (detail === "agreement_not_found") {
      return c.json({ error: "not_found", code: detail, message: error.message }, 404);
    }
    if (detail === "not_pending" || detail === "reason_required") {
      return c.json({ error: "decide_blocked", code: detail, message: error.message }, 422);
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }

  const out = data as {
    agreement: DB.RentalAgreementRow;
    unit?: DB.RentalStockUnitRow | null;
    entitlementId?: string | null;
    visitsTotal?: number;
    // 0275 — approve proceeds the Sales Order; reject cancels it. Both report
    // what actually happened so the desk can say so instead of guessing.
    orderProceeded?: boolean;
    orderBlockedBy?: string | null;
    orderCancelled?: boolean;
  } | null;
  if (!out?.agreement) {
    return c.json(
      { error: "rpc_failed", code: "rpc_failed", message: "decision returned no agreement" },
      500,
    );
  }
  return c.json({
    agreement: Adapters.rentalAgreementFromRow(out.agreement),
    unit: out.unit ? Adapters.rentalStockUnitFromRow(out.unit) : null,
    entitlementId: out.entitlementId ?? null,
    visitsTotal: out.visitsTotal ?? 0,
    orderProceeded: out.orderProceeded ?? false,
    orderBlockedBy: out.orderBlockedBy ?? null,
    orderCancelled: out.orderCancelled ?? false,
  });
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
    // Escape ilike wildcards (a literal %/_ must not widen the match; PostgREST
    // also treats * as %) and drop .or() syntax characters (comma/parens would
    // split the clause).
    const pattern =
      "%" + q.replace(/[,()*]/g, " ").replace(/[\\%_]/g, (m) => "\\" + m) + "%";
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

// ---------------------------------------------------------------------------
// POS sell lane (0255) — the store-facing side: browse offers, sign an
// agreement, collect the first month + card-on-file via Stripe Checkout.
// ---------------------------------------------------------------------------

// GET /pos-plans — the stripped offer list (rental_plans_pos view: active
// plans, NO split columns — CF rental-pos-config-projection). Any seller role.
rentalRouter.get("/pos-plans", async (c) => {
  sellerOnly(c);
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.from(RENTAL_PLANS_POS).select("*");
  if (error) throw new HTTPException(500, { message: error.message });
  const plans = ((data ?? []) as DB.RentalPlanPosRow[])
    .slice()
    .sort((a, b) => a.sku.localeCompare(b.sku) || a.term_months - b.term_months)
    .map((r) => Adapters.posRentalPlanFromRow(r));
  return c.json({ plans });
});

/**
 * The create_rental_agreement RPC's jsonb payload.
 *
 * `unit` / `entitlementId` are NULL since 0268: a signup is an APPLICATION, and
 * the asset + entitlement are only materialised when finance approves. The keys
 * stay in the shape so an older client degrades to "nothing yet".
 */
type CreateAgreementRpcResult = {
  agreement: DB.RentalAgreementRow;
  customer: DB.CustomerRow;
  unit: DB.RentalStockUnitRow | null;
  entitlementId: string | null;
  visitsTotal: number;
  pendingApproval?: boolean;
  /** 0275 — the Sales Order minted alongside the agreement. */
  orderId?: string | null;
  so?: number | null;
};

// POST /agreements — sign a rent-to-own agreement at the POS. ONE atomic
// SECURITY DEFINER RPC: the client names a plan_id, the DB re-reads
// price/split and writes customer + agreement. Since 0268 the agreement is born
// `pending_approval` and NOTHING is materialised until finance approves — no
// billing schedule, no RU asset, no entitlement. No money in the payload.
rentalRouter.post("/agreements", async (c) => {
  sellerOnly(c);
  const parsed = await parseJsonBody(c, createRentalAgreementInputSchema);
  if (!parsed.ok) return c.json(parsed.body, parsed.status);
  const d = parsed.data;
  const sb = userClient(c.env, c.var.auth.jwt);
  const { data, error } = await sb.rpc("create_rental_agreement", {
    p_plan_id: d.planId,
    p_customer_name: d.customerName,
    p_customer_phone: d.customerPhone,
    p_customer_email: d.customerEmail ?? null,
    p_customer_address: d.customerAddress ?? null,
    p_dealer_id: d.dealerId ?? null,
    p_salesperson_id: d.salespersonId ?? null,
    p_start_date: d.startDate ?? null,
    p_notes: d.notes ?? null,
    // 0275 — the Sales Order the rental mints needs this to reach operations.
    p_delivery_date: d.deliveryDate ?? null,
  });
  if (error) {
    const detail = (error as { details?: string | null }).details ?? "";
    if (detail === "forbidden") {
      return c.json({ error: "forbidden", code: "forbidden", message: error.message }, 403);
    }
    if (detail === "plan_not_found") {
      return c.json({ error: "not_found", code: "plan_not_found", message: error.message }, 404);
    }
    if (
      detail === "plan_inactive" ||
      detail === "invalid_customer" ||
      detail === "invalid_phone" ||
      detail === "invalid_start_date" ||
      detail === "invalid_salesperson" ||
      // 0275 — a rental now mints a Sales Order, so it needs a store; and a
      // combo plan carries no SKU to deliver (CF rental-combo-agreement-sku-null).
      detail === "dealer_required" ||
      detail === "plan_has_no_sku"
    ) {
      return c.json({ error: "invalid_param", code: detail, message: error.message }, 422);
    }
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  const out = data as CreateAgreementRpcResult | null;
  if (!out?.agreement) {
    return c.json({ error: "rpc_failed", code: "rpc_failed", message: "signup returned no agreement" }, 500);
  }
  return c.json(
    {
      agreement: Adapters.rentalAgreementFromRow(out.agreement),
      customer: Adapters.customerFromRow(out.customer),
      // null until finance approves (0268) — never adapt a null row
      unit: out.unit ? Adapters.rentalStockUnitFromRow(out.unit) : null,
      entitlementId: out.entitlementId,
      visitsTotal: out.visitsTotal,
      pendingApproval: out.pendingApproval ?? true,
      // 0275 — the Sales Order this rental now has, so the POS can show it.
      orderId: out.orderId ?? null,
      so: out.so ?? null,
    },
    201,
  );
});

// ── Stripe subscription checkout for an agreement ──────────────────────────
// Mirrors the 0223 order-balance flow (stripe-checkout.ts): sessions tracked
// in stripe_checkout_sessions (purpose 'rental_subscription'), webhook OR the
// POS poll's live-reconcile finishes the job — whichever lands first.
//
// Store JWTs cannot read rental_agreements (internal-only RLS, by design), so
// these two routes load through the service client and enforce ownership
// EXPLICITLY: a store may only touch its own dealer's agreements. That is the
// 0223 sessions-table pattern (no client policy; Hono is the gate).

const AGREEMENT_ID = z.string().uuid();
/** Stripe Checkout session ids: cs_test_… / cs_live_… */
const RENTAL_SESSION_ID = z.string().regex(/^cs_[A-Za-z0-9_]+$/);

/** Checkout links live ~24h (5 min under Stripe's ceiling for clock skew). */
const RENTAL_SESSION_TTL_SECONDS = 24 * 60 * 60 - 5 * 60;

const RENTAL_SESSION_COLS =
  "id, agreement_id, session_id, amount, purpose, url, status, payment_method_detail, receipt_url, created_at, expires_at, paid_at";

type RentalSessionRow = {
  agreement_id: string;
  session_id: string;
  amount: number | string;
  status: "open" | "paid" | "expired";
  url: string;
  payment_method_detail: string | null;
  receipt_url: string | null;
  paid_at: string | null;
  expires_at: string | null;
};

function shapeRentalSession(row: RentalSessionRow) {
  return {
    sessionId: row.session_id,
    url: row.url,
    amount: Number(row.amount),
    status: row.status,
    paidAt: row.paid_at,
    expiresAt: row.expires_at,
    paymentMethodDetail: row.payment_method_detail,
    receiptUrl: row.receipt_url,
  };
}

type AgreementWithCustomer = DB.RentalAgreementRow & {
  customers: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    stripe_customer_id: string | null;
  } | null;
};

/** Service-client agreement load + the explicit ownership gate. */
async function fetchAgreementForCheckout(c: Context<AppEnv>, id: string): Promise<AgreementWithCustomer> {
  const admin = adminClient(c.env);
  const { data, error } = await admin
    .from(RENTAL_AGREEMENTS)
    .select("*, customers(id, name, phone, email, stripe_customer_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) throw new HTTPException(404, { message: "Agreement not found" });
  const ag = data as AgreementWithCustomer;
  const role = c.var.auth.role;
  const internal = role === "principal" || role === "operation" || role === "finance" || role === "bd";
  if (!internal && (!c.var.auth.dealerId || ag.dealer_id !== c.var.auth.dealerId)) {
    // Same 404-not-403 shape as order visibility — existence is not leaked.
    throw new HTTPException(404, { message: "Agreement not found" });
  }
  return ag;
}

// POST /agreements/:id/stripe/checkout — mint the subscription Checkout link
// (QR at the counter / WhatsApp). First month collects at completion; the
// webhook/poll wraps the subscription into the fixed-term schedule and stamps
// the ids onto the agreement.
rentalRouter.post("/agreements/:id/stripe/checkout", async (c) => {
  sellerOnly(c);
  requireStripeConfigured(c);
  const idCheck = AGREEMENT_ID.safeParse(c.req.param("id"));
  if (!idCheck.success) throw new HTTPException(404, { message: "Agreement not found" });

  const ag = await fetchAgreementForCheckout(c, idCheck.data);
  // 0268: this check is now ALSO the money gate — an application sits at
  // `pending_approval` until finance decides, so no card can be charged before
  // the credit assessment. Say which of the two it is; "not active" alone left
  // a store staring at a dead button with no idea whose move it was.
  if (ag.status !== "active") {
    const pending = ag.status === "pending_approval";
    return c.json(
      {
        error: "rental_checkout_blocked",
        code: pending ? "pending_approval" : "wrong_status",
        message: pending
          ? "Waiting for finance to approve this rental — you can collect once it is approved."
          : ag.status === "rejected"
            ? "This rental application was rejected."
            : "Agreement is not active.",
      },
      422,
    );
  }
  if (ag.stripe_subscription_id) {
    return c.json(
      { error: "rental_checkout_blocked", code: "already_subscribed", message: "This agreement already has an active Stripe subscription." },
      409,
    );
  }
  if (Number(ag.monthly_fee) <= 0) {
    return c.json(
      { error: "rental_checkout_blocked", code: "fee_missing", message: "Agreement has no monthly fee to collect." },
      422,
    );
  }
  if (!ag.plan_id) {
    return c.json(
      { error: "rental_checkout_blocked", code: "plan_not_synced", message: "Agreement has no plan link — collect manually." },
      422,
    );
  }

  const admin = adminClient(c.env);
  const { data: planData, error: planErr } = await admin
    .from(RENTAL_PLANS)
    .select("stripe_price_id, monthly_fee")
    .eq("id", ag.plan_id)
    .maybeSingle();
  if (planErr) throw new HTTPException(500, { message: planErr.message });
  const plan = planData as { stripe_price_id: string | null; monthly_fee: number | string } | null;
  if (!plan?.stripe_price_id) {
    return c.json(
      { error: "rental_checkout_blocked", code: "plan_not_synced", message: "Plan is not synced to Stripe yet — ask the principal to open Catalog → Rental and press Sync." },
      422,
    );
  }
  // The Stripe price charges the PLAN's current fee. A re-priced plan no
  // longer matches this agreement's signed snapshot — block rather than
  // silently charging a different figure (guardrail #4: no silent money).
  if (Number(plan.monthly_fee) !== Number(ag.monthly_fee)) {
    return c.json(
      { error: "rental_checkout_blocked", code: "plan_repriced", message: "The plan's fee changed after signup — re-sign the agreement on the current plan." },
      422,
    );
  }

  const stripe = stripeClient(c.env);

  // One Stripe Customer per canonical phone, minted lazily and reused.
  let stripeCustomerId = ag.customers?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    const cust = await stripe.customers.create({
      name: ag.customers?.name ?? undefined,
      phone: ag.customers?.phone ?? undefined,
      email: ag.customers?.email ?? undefined,
      metadata: {
        carres_source: CARRES_SOURCE,
        carres_kind: "customer",
        carres_customer_id: ag.customer_id,
      },
    });
    stripeCustomerId = cust.id;
    // Best-effort write-back; a concurrent mint leaves ours orphaned (harmless).
    await admin
      .from(CUSTOMERS)
      .update({ stripe_customer_id: cust.id })
      .eq("id", ag.customer_id)
      .is("stripe_customer_id", null);
  }

  const webBase = (c.env.PUBLIC_WEB_URL ?? "https://carres-portal.pages.dev").replace(/\/$/, "");
  const expiresAt = Math.floor(Date.now() / 1000) + RENTAL_SESSION_TTL_SECONDS;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    subscription_data: {
      metadata: {
        carres_source: CARRES_SOURCE,
        carres_kind: "rental_agreement",
        carres_agreement_id: ag.id,
        carres_agreement_no: ag.agreement_no,
        carres_sku: ag.sku,
        carres_term_months: String(ag.term_months),
      },
    },
    metadata: {
      kind: "rental_subscription",
      agreement_id: ag.id,
      agreement_no: ag.agreement_no,
      created_by: c.var.auth.id,
    },
    success_url: `${webBase}/pay/success?ra=${encodeURIComponent(ag.agreement_no)}`,
    cancel_url: `${webBase}/pay/cancelled?ra=${encodeURIComponent(ag.agreement_no)}`,
    expires_at: expiresAt,
  });
  if (!session.url) {
    throw new HTTPException(500, { message: "Stripe returned no checkout URL" });
  }

  const { data: row, error: insErr } = await admin
    .from("stripe_checkout_sessions")
    .insert({
      agreement_id: ag.id,
      session_id: session.id,
      amount: Number(ag.monthly_fee),
      purpose: "rental_subscription",
      url: session.url,
      status: "open",
      created_by: c.var.auth.id,
      expires_at: new Date(expiresAt * 1000).toISOString(),
    })
    .select(RENTAL_SESSION_COLS)
    .single();
  if (insErr) {
    // Money safety: a link we can't track must not stay payable.
    await stripe.checkout.sessions.expire(session.id).catch(() => {});
    const m = mapPgError(insErr);
    return c.json(m.body, m.status);
  }

  return c.json({ session: shapeRentalSession(row as RentalSessionRow) }, 201);
});

// GET /agreements/:id/stripe/checkout/:sid — status poll + live reconcile
// while open, so the counter QR flow works even before the webhook endpoint
// is configured (the 0223 self-sufficiency doctrine). Completing here wraps
// the fixed-term schedule FIRST, then links — both idempotent, so the
// webhook racing this poll is harmless.
rentalRouter.get("/agreements/:id/stripe/checkout/:sid", async (c) => {
  sellerOnly(c);
  requireStripeConfigured(c);
  const idCheck = AGREEMENT_ID.safeParse(c.req.param("id"));
  const sidCheck = RENTAL_SESSION_ID.safeParse(c.req.param("sid"));
  if (!idCheck.success || !sidCheck.success) {
    throw new HTTPException(404, { message: "Checkout session not found" });
  }

  const ag = await fetchAgreementForCheckout(c, idCheck.data);

  const admin = adminClient(c.env);
  const { data: row, error } = await admin
    .from("stripe_checkout_sessions")
    .select(RENTAL_SESSION_COLS)
    .eq("session_id", sidCheck.data)
    .eq("agreement_id", idCheck.data)
    .maybeSingle();
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!row) throw new HTTPException(404, { message: "Checkout session not found" });

  let current = row as RentalSessionRow;
  if (current.status === "open") {
    const stripe = stripeClient(c.env);
    const live = await stripe.checkout.sessions.retrieve(current.session_id);
    const subId =
      typeof live.subscription === "string" ? live.subscription : live.subscription?.id ?? null;
    if (live.status === "complete" && subId) {
      // Schedule wrap BEFORE link: a failure here 500s the poll (and the
      // webhook retries), so a subscription can never stay open-ended with
      // the agreement already marked linked.
      await ensureFixedTermSchedule(stripe, subId, Number(ag.term_months));
      const { error: rpcErr } = await admin.rpc("link_rental_subscription", {
        p_session_id: current.session_id,
        p_stripe_subscription_id: subId,
        p_stripe_customer_id:
          typeof live.customer === "string" ? live.customer : live.customer?.id ?? null,
      });
      if (rpcErr) throw new HTTPException(500, { message: rpcErr.message });
    } else if (live.status === "expired") {
      await admin
        .from("stripe_checkout_sessions")
        .update({ status: "expired" })
        .eq("session_id", current.session_id)
        .eq("status", "open");
    }
    const { data: fresh } = await admin
      .from("stripe_checkout_sessions")
      .select(RENTAL_SESSION_COLS)
      .eq("session_id", current.session_id)
      .maybeSingle();
    if (fresh) current = fresh as RentalSessionRow;
  }

  return c.json({ session: shapeRentalSession(current) });
});

export default rentalRouter;
