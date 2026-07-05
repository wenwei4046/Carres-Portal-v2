import { deriveSkuCode } from "@carres/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPgError } from "./route-helpers";

/**
 * Sofa engine Phase 5 — auto-sync a compartment into a REAL `product_skus` row.
 *
 * The explode (Phase 5) turns one built sofa into one `order_line` per
 * compartment, each carrying a synthetic `sku = {MODEL_KEY}-{code}`. For every
 * downstream sku→product_skus join to stay sound — the 0089 category mutex
 * (joins `sku → product_skus → product_models.category`; an unknown sku drops
 * out silently), PO-by-supplier, per-unit stock, SO-Maintenance — that sku MUST
 * be a real row under the SOFA model. So when the principal offers a compartment
 * on a model (a `model_sofa_compartments` write), we mint/refresh its
 * `product_skus` row here, exactly the way combo components are real SKUs (0177).
 *
 * Principal-owned + contract-safe: this runs only inside the principal-gated
 * `model_sofa_compartments` route on the principal's USER JWT (never
 * service_role), so the 0175 price-lock trigger allows the price write. The sku
 * is `pos_active = false` — it NEVER appears as a standalone product in the flat
 * POS grid (that is how the builder coexists with the 628 legacy flat sofa SKUs);
 * it is reachable only via the builder + the exploded order lines.
 */

// Sofa is NOT supplierless; service/accessory are (mirror catalog.ts).
const SUPPLIERLESS_CATEGORIES = new Set(["service", "accessory"]);

export type CompartmentSkuResult =
  | { ok: true; sku?: string }
  | {
      ok: false;
      status: 403 | 404 | 409 | 422 | 500;
      body: { error: string; code: string; message: string };
    };

const notFound = (what: string): CompartmentSkuResult => ({
  ok: false,
  status: 404,
  body: { error: "not_found", code: "not_found", message: `${what} not found` },
});

/**
 * Upsert (idempotent) the real `product_skus` row for an offered compartment.
 * Called AFTER `principalOnly` + with the principal's `userClient`. `cost` is
 * intentionally OMITTED from the upsert payload so a manually-set cost survives
 * a re-sync (on first insert it defaults to null); `discontinued_at` is reset to
 * null so re-offering a previously un-offered compartment re-activates its sku.
 */
export async function syncCompartmentSku(
  sb: SupabaseClient,
  args: { modelId: string; compartmentId: string; priceOverride: number | null },
): Promise<CompartmentSkuResult> {
  // 1. The model gives the sku prefix (model_key) + the category (supplier +
  //    mutex soundness derive from it).
  const { data: model, error: mErr } = await sb
    .from("product_models")
    .select("model_key, category")
    .eq("id", args.modelId)
    .maybeSingle();
  if (mErr) return { ok: false, ...mapPgError(mErr) };
  if (!model || !model.model_key) return notFound("model");

  // 2. The compartment pool row gives the code (sku suffix + variant),
  //    description, and the fallback price.
  const { data: comp, error: cErr } = await sb
    .from("sofa_compartments")
    .select("code, description, default_price")
    .eq("id", args.compartmentId)
    .maybeSingle();
  if (cErr) return { ok: false, ...mapPgError(cErr) };
  if (!comp) return notFound("compartment");

  // 3. SEED price for a first-time offer only: override wins (incl. an explicit
  //    0), else the legacy pool default. The synced SKU's price is the
  //    AUTHORITATIVE à-la-carte source (SKU Master — Loo, 2026-07-05), so on a
  //    RE-offer the existing row's price is preserved (like `cost`) — a
  //    principal's SKU-Master edit must survive un-offer → re-offer.
  const seedPrice = args.priceOverride ?? (comp.default_price as number | null) ?? 0;

  // 4. Supplier: inherit THIS model's own supplier (each sofa model has exactly
  //    one across its flat SKUs) so PO-by-sku routes the compartment to the
  //    right factory; fall back to the category-wide cover (the generate-skus
  //    path, for a brand-new compartment-only model), else null (tolerated — the
  //    null-supplier PO guard covers it; we never block the offer on supplier).
  let supplierId: string | null = null;
  if (!SUPPLIERLESS_CATEGORIES.has(model.category as string)) {
    const { data: own, error: ownErr } = await sb
      .from("product_skus")
      .select("supplier_id")
      .eq("model_id", args.modelId)
      .not("supplier_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (ownErr) return { ok: false, ...mapPgError(ownErr) };
    supplierId = (own?.supplier_id as string | null | undefined) ?? null;
    if (!supplierId) {
      const { data: cover, error: covErr } = await sb
        .from("suppliers")
        .select("id")
        .contains("cat_covered", [model.category])
        .limit(1)
        .maybeSingle();
      if (covErr) return { ok: false, ...mapPgError(covErr) };
      supplierId = (cover?.id as string | undefined) ?? null;
    }
  }

  // 5. Collision guard: never clobber a DIFFERENT product. The sku is
  //    deterministic `{MODEL_KEY}-{code}` and `sofa_compartments.code` is UNIQUE,
  //    so an existing row with this sku is either THIS compartment (re-offer,
  //    compartment_id set → safe to upsert) or a flat catalog product that
  //    happens to collide (compartment_id NULL → REFUSE; auto-sync must not flip
  //    a real product to pos_active=false / variant_kind='part').
  const sku = deriveSkuCode(model.model_key as string, comp.code as string);
  const { data: clash, error: clashErr } = await sb
    .from("product_skus")
    .select("compartment_id")
    .eq("sku", sku)
    .maybeSingle();
  if (clashErr) return { ok: false, ...mapPgError(clashErr) };
  if (clash && (clash as { compartment_id: string | null }).compartment_id == null) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "rule_violation",
        code: "sku_collision",
        message: `Cannot auto-create compartment sku '${sku}' — it collides with an existing product. Rename the compartment code or the model key.`,
      },
    };
  }

  // Upsert on the UNIQUE sku (idempotent re-offer). pos_active=false keeps it
  // out of the flat POS grid; compartment_id (0178) links it back to its type.
  // `price` is included ONLY on first insert (no existing row) — a re-offer
  // preserves the SKU-Master-authored price, exactly like `cost`.
  const isReoffer = clash != null;
  const { error: upErr } = await sb.from("product_skus").upsert(
    {
      sku,
      model_id: args.modelId,
      compartment_id: args.compartmentId,
      variant: comp.code,
      variant_kind: "part",
      ...(isReoffer ? {} : { price: seedPrice }),
      supplier_id: supplierId,
      pos_active: false,
      description: comp.description ?? null,
      discontinued_at: null,
    },
    { onConflict: "sku" },
  );
  if (upErr) return { ok: false, ...mapPgError(upErr) };
  return { ok: true, sku };
}

/**
 * Soft-discontinue a compartment's sku when it is un-offered. NEVER deletes —
 * historical `order_lines` may FK the sku. Idempotent: 0 matched rows is a
 * no-op. A later re-offer re-activates it via `syncCompartmentSku`
 * (`discontinued_at` reset to null).
 */
export async function discontinueCompartmentSku(
  sb: SupabaseClient,
  args: { modelId: string; compartmentId: string },
): Promise<CompartmentSkuResult> {
  const { error } = await sb
    .from("product_skus")
    .update({ pos_active: false, discontinued_at: new Date().toISOString() })
    .eq("model_id", args.modelId)
    .eq("compartment_id", args.compartmentId);
  if (error) return { ok: false, ...mapPgError(error) };
  return { ok: true };
}
