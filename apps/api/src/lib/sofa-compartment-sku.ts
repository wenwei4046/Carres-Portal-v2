import { deriveSkuCode, sofaSkuDescription } from "@carres/shared";
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
 * is minted `pos_active = true` — offering a compartment IS putting it on sale
 * (Loo 2026-07-24: every model authored after Booqit stayed invisible in POS
 * because the old first-insert-OFF default left the model with zero sellable
 * skus, and the POS card gate needs ≥1). The Modular tab still owns the toggle
 * from then on — a RE-offer of a LIVE row preserves it (like price/cost, the
 * 2026-07-06 1A(LHF) fix), but re-offering a previously UN-offered row flips it
 * back ON (its OFF came from the un-offer, not a principal's choice).
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
  args: {
    modelId: string;
    compartmentId: string;
    priceOverride: number | null;
    /* 2026-08-24 - override the auto-resolved supplier on a model's FIRST
     * compartment. Once one supplier'd sku exists on the model, step 4's own
     * inherit-from-siblings branch already wins over any fallback, so this
     * only matters the one time it is genuinely ambiguous. Absent keeps the
     * existing inherit-then-category-cover fallback byte-identical. */
    supplierId?: string | null;
    /* The supplier's own code for THIS compartment (2026-08-24). Absent means
     * LEAVE ALONE — the key is omitted from the upsert payload entirely rather
     * than written as null, so a re-offer cannot blank a code somebody keyed
     * from the quotation. Compare `supplierId`, which a sibling SKU overrules:
     * a code is per piece, so an explicit one always wins. */
    supplierCode?: string | null;
  },
): Promise<CompartmentSkuResult> {
  // 1. The model gives the sku prefix (model_key), the category (supplier +
  //    mutex soundness derive from it) and the name (description prefix).
  const { data: model, error: mErr } = await sb
    .from("product_models")
    .select("model_key, category, name")
    .eq("id", args.modelId)
    .maybeSingle();
  if (mErr) return { ok: false, ...mapPgError(mErr) };
  if (!model || !model.model_key) return notFound("model");

  // 2. The compartment pool row gives the code (sku suffix + variant + the
  //    description suffix).
  const { data: comp, error: cErr } = await sb
    .from("sofa_compartments")
    .select("code")
    .eq("id", args.compartmentId)
    .maybeSingle();
  if (cErr) return { ok: false, ...mapPgError(cErr) };
  if (!comp) return notFound("compartment");

  // 3. SEED price for a first-time offer only: override wins (incl. an explicit
  //    0), else UNPRICED (0). The pool's `default_price` is deliberately NOT a
  //    fallback (Loo 2026-07-20 — legacy pool prices leaked onto fresh models'
  //    SKUs): prices live in SKU Master only. On a RE-offer the existing row's
  //    price is preserved (like `cost`) — a principal's SKU-Master edit must
  //    survive un-offer → re-offer.
  const seedPrice = args.priceOverride ?? 0;

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
    // A sibling SKU's own supplier still wins over a caller override - the
    // model already has a real answer, and one compartment cannot silently
    // fork it onto a second supplier.
    supplierId = (own?.supplier_id as string | null | undefined) ?? null;
    if (!supplierId && args.supplierId) {
      const { data: chosen, error: chosenErr } = await sb
        .from("suppliers")
        .select("id")
        .eq("id", args.supplierId)
        .maybeSingle();
      if (chosenErr) return { ok: false, ...mapPgError(chosenErr) };
      if (!chosen) return notFound("supplierId");
      supplierId = chosen.id as string;
    }
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
    .select("compartment_id, discontinued_at")
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

  // Upsert on the UNIQUE sku (idempotent re-offer); compartment_id (0178)
  // links it back to its type. `price` is included ONLY on first insert — a
  // re-offer preserves the SKU-Master-authored price (like `cost`).
  // `pos_active` (Loo 2026-07-24 — offer = on sale):
  //   · first insert → ON. The POS product card needs ≥1 sellable sku on the
  //     model; the old first-insert-OFF default left every freshly authored
  //     sofa model invisible in POS (only Booqit showed — its rows were
  //     hand-flipped) with nothing pointing at the Modular toggle.
  //   · re-offer of a LIVE row → preserved. Never clobber a principal's
  //     deliberate per-sku OFF (the 2026-07-06 1A(LHF) mystery: an
  //     always-false re-assert kept silently switching rows OFF).
  //   · re-offer of an UN-offered (discontinued) row → back ON. Its OFF was
  //     forced by discontinueCompartmentSku, not chosen — untick→re-tick must
  //     round-trip to sellable or the model goes dark again.
  const isReoffer = clash != null;
  const wasUnoffered =
    isReoffer && (clash as { discontinued_at: string | null }).discontinued_at != null;
  const { error: upErr } = await sb.from("product_skus").upsert(
    {
      sku,
      model_id: args.modelId,
      compartment_id: args.compartmentId,
      variant: comp.code,
      variant_kind: "part",
      ...(isReoffer
        ? wasUnoffered
          ? { pos_active: true }
          : {}
        : { price: seedPrice, pos_active: true }),
      supplier_id: supplierId,
      /* Omitted entirely when the caller said nothing — see the arg's note.
         A trimmed-empty string is a deliberate CLEAR, so the keyer can undo a
         typo; only `undefined` means "leave whatever is there". */
      ...(args.supplierCode === undefined
        ? {}
        : { supplier_code: args.supplierCode?.trim() || null }),
      // "Sofa {Model} {code}" (Loo 2026-07-06) — the SKU Master row names the
      // model+compartment pair, NOT the pool compartment's own description
      // (e.g. "Sofa Angsa 1A(LHF)", not "Left hand facing"). Format lives in
      // @carres/shared (sofaSkuDescription) with the bed auto-descriptions.
      description: sofaSkuDescription(model.name as string, comp.code as string),
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
