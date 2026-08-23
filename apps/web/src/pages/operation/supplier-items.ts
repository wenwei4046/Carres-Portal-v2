import type { CatalogResponse } from "@carres/shared";
import type { SupplierRow } from "@/lib/queries";

/**
 * SUPPLIER ITEMS — the identity chain Loo named, as ONE row.
 *
 *     internal SKU code  <>  item name  <>  supplier SKU  <>  supplier name
 *
 * ⭐ THIS IS A JOIN, NEVER A SECOND TABLE. Loo asked that adding a SKU also
 * update the Suppliers tab; the cheap-looking way to do that is a synced copy,
 * and it would be a defect — two records of one fact, drifting the first time
 * a write misses one of them (ownership Laws C and D). A join has nothing to
 * keep in step: the catalog IS the list, read a second way.
 *
 * Composed CLIENT-SIDE from bundles both screens already hold — no new API
 * route, no new query, no server work.
 */
export interface SupplierItemRow {
  /** `${supplierId}:${skuId}` — stable across reorders, unique per row. */
  key: string;
  supplierId: string;
  supplierName: string;
  /** THEIR code for it. `null` = we have not recorded one yet — the column
   *  landed on 2026-08-21 (0375), so most rows are null until someone keys the
   *  quotation in. That emptiness is the POINT of this screen. */
  supplierCode: string | null;
  description: string | null;
  /** OUR code. */
  sku: string;
  /** OUR name: `Model · Variant`, or the model alone when a category carries
   *  no variant axis (accessory / service). */
  ourName: string;
  category: string | null;
}

/**
 * INNER join on supplier_id: a SKU nobody supplies is not a supplier's item,
 * and printing it here with an empty Supplier column would invite someone to
 * "fix" a row that is correct — service and guarantee SKUs have no supplier by
 * design (0171 made the column nullable for exactly them).
 *
 * A SKU whose supplier_id points at a supplier the roster does not return is
 * DROPPED rather than shown with a blank name: that is a data fault worth
 * finding in the catalog, not a row to render.
 */
export function buildSupplierItems(
  catalog: CatalogResponse | undefined,
  suppliers: readonly SupplierRow[] | undefined,
): SupplierItemRow[] {
  if (!catalog || !suppliers?.length) return [];
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));

  const rows: SupplierItemRow[] = [];
  for (const sku of catalog.skus) {
    if (!sku.supplierId) continue;
    const supplier = supplierById.get(sku.supplierId);
    if (!supplier) continue;
    const model = modelById.get(sku.modelId);
    rows.push({
      key: `${supplier.id}:${sku.id}`,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierCode: sku.supplierCode ?? null,
      description: sku.description ?? null,
      sku: sku.sku,
      ourName: [model?.name ?? "", sku.variant].filter(Boolean).join(" · "),
      category: model?.category ?? null,
    });
  }
  /* Supplier first, then OUR code — the order someone reads a quotation in:
     find the supplier, then walk their items. */
  rows.sort(
    (a, b) => a.supplierName.localeCompare(b.supplierName) || a.sku.localeCompare(b.sku),
  );
  return rows;
}

/** How many of a supplier's items still have no supplier code — the number
 *  that says how much of the quotation is left to key in. */
export function missingSupplierCodeCount(rows: readonly SupplierItemRow[]): number {
  return rows.filter((r) => !r.supplierCode?.trim()).length;
}
