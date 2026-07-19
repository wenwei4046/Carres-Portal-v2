import type { BundleSlot, CatalogResponse, ProductBundleDto } from "@carres/shared";
import { explodeBundle } from "@carres/shared";
import { offeredSpecialsFor } from "../new-order/special-addons-picker";

/**
 * Bundle V2 flow helpers (0241) — PURE, so the walker UI stays thin and the
 * money math unit-tests cleanly.
 *
 * A bundle resolves to SLOTS (a fixed bundle derives one pinned slot per
 * component); each slot resolves to a PICK (sku + qty + the configure
 * surface's emitted specs/price); the picks assemble into grouped cart lines:
 * base = the bundle price split Σ-exactly across the picked SKUs' catalog
 * prices, plus each pick's own SPEC SURCHARGE on top (emitted − catalog), so
 * options/specials stay honestly priced (the server re-verifies their totals)
 * while the bundle discount lives entirely in the base split.
 */

/** One resolved slot pick — the configure surface's emission, normalized. */
export interface BundleSlotPick {
  sku: string;
  /** Catalog unit price of the picked sku (the explode weight). */
  catalogPrice: number;
  /** The surface's emitted unit price = catalog + options/specials/remark. */
  unitPrice: number;
  qty: number;
  attrs: Record<string, unknown> | null;
  label: string;
}

/** Normalize a bundle to walkable slots. Fixed bundles pin one slot per
 *  component; custom bundles use their authored slots. */
export function deriveBundleSlots(
  bundle: ProductBundleDto,
  modelIdOf: (sku: string) => string | null,
): BundleSlot[] {
  if (bundle.kind === "custom") return bundle.slots;
  return bundle.components.map((comp) => ({
    qty: comp.qty,
    modelIds: [modelIdOf(comp.sku) ?? ""],
    variant: "fixed" as const,
    sku: comp.sku,
  }));
}

/** True when the slot needs the customer's input at the POS: a product choice,
 *  a variant choice, or a product with spec axes (bed frame / sofa always;
 *  mattress & flat categories only when special add-ons are offered). */
export function slotNeedsConfig(slot: BundleSlot, catalog: CatalogResponse): boolean {
  const models = slot.modelIds
    .map((id) => catalog.models.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (models.length > 1) return true;
  const model = models[0];
  if (!model) return false; // unresolvable — the card is disabled anyway
  if (model.category === "bedframe" || model.category === "sofa") return true;
  const liveSkus = catalog.skus.filter((s) => s.modelId === model.id && !s.discontinuedAt);
  if (slot.variant === "any" && liveSkus.length > 1) return true;
  return offeredSpecialsFor(model, catalog.specialAddons).length > 0;
}

/** True when adding this bundle must open the slot walker (vs the V1 direct
 *  add). Custom bundles always walk; a fixed bundle walks only when a
 *  component has something to ask. */
export function bundleNeedsConfig(bundle: ProductBundleDto, catalog: CatalogResponse): boolean {
  const modelIdOf = (sku: string) => catalog.skus.find((s) => s.sku === sku)?.modelId ?? null;
  return deriveBundleSlots(bundle, modelIdOf).some((slot) => slotNeedsConfig(slot, catalog));
}

/** An assembled (localId-less) cart line for one exploded bundle piece. */
export interface AssembledBundleLine {
  sku: string;
  qty: number;
  unitPrice: number;
  attrs: Record<string, unknown>;
  label: string;
}

/**
 * Assemble the final grouped cart lines from the resolved picks: explode the
 * bundle price across the picked SKUs (catalog-price weights, Σ-exact), then
 * add each pick's own spec surcharge (emitted − catalog) on top of its split
 * share, carrying the pick's attrs + the bundle markers. Returns null when the
 * explode refuses (unpriceable pick).
 */
export function assembleBundleLines(
  bundle: Pick<ProductBundleDto, "id" | "name" | "price">,
  picks: BundleSlotPick[],
  group: string,
): AssembledBundleLine[] | null {
  const components = picks.map((p) => ({ sku: p.sku, qty: p.qty }));
  const priceByComponent = picks.map((p) => p.catalogPrice);
  const r = explodeBundle(components, bundle.price, (sku) => {
    // Same-SKU picks are distinguished by component index inside explodeBundle
    // itself; the priceOf lookup only needs A price per sku — picks of the
    // same sku share the same catalog price by definition.
    const i = picks.findIndex((p) => p.sku === sku);
    return i >= 0 ? priceByComponent[i]! : null;
  });
  if (!r.ok) return null;
  return r.lines.map((l) => {
    const pick = picks[l.component]!;
    const surcharge = Math.round((pick.unitPrice - pick.catalogPrice) * 100) / 100;
    return {
      sku: l.sku,
      qty: l.qty,
      unitPrice: Math.round((l.unitPrice + surcharge) * 100) / 100,
      attrs: {
        ...(pick.attrs ?? {}),
        bundle_key: bundle.id,
        bundle_label: bundle.name,
        bundle_group: group,
        bundle_slot: l.slot,
      },
      label: pick.label,
    };
  });
}
