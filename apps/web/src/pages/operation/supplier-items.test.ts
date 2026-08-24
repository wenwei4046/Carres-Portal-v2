import { describe, expect, it } from "vitest";
import { buildSupplierItems, missingSupplierCodeCount } from "./supplier-items";
import type { CatalogResponse } from "@carres/shared";
import type { SupplierRow } from "@/lib/queries";

/**
 * SUPPLIER ITEMS — a JOIN, never a second table.
 *
 * Loo asked that adding a SKU also update the Suppliers tab. The cheap-looking
 * way is a synced copy, and it would be a defect: two records of one fact,
 * drifting the first time a write misses one (Laws C and D). A join has
 * nothing to keep in step, and these tests exist to keep it that way.
 */
const SUPPLIERS = [
  { id: "s1", name: "Hookka", kind: "factory_pickup", cat_covered: [], lead_time: null, contact: null, whatsapp_group_url: null },
  { id: "s2", name: "Ace Foam", kind: "own_logistics", cat_covered: [], lead_time: null, contact: null, whatsapp_group_url: null },
] as unknown as SupplierRow[];

function catalog(skus: unknown[]): CatalogResponse {
  return {
    models: [
      { id: "m1", name: "Hookka Lounger", category: "sofa" },
      { id: "m2", name: "Mattress Protector", category: "accessory" },
    ],
    skus,
  } as unknown as CatalogResponse;
}

const SKU_SOFA = { id: "k1", modelId: "m1", sku: "sofa:hookka-3s", variant: "3-Seater", supplierId: "s1", supplierCode: "HK-3S", description: "Fabric A" };
const SKU_NO_CODE = { id: "k2", modelId: "m1", sku: "sofa:hookka-2s", variant: "2-Seater", supplierId: "s1", supplierCode: null, description: null };
const SKU_NO_SUPPLIER = { id: "k3", modelId: "m2", sku: "acc:protector", variant: "", supplierId: null, supplierCode: null, description: null };

describe("buildSupplierItems", () => {
  it("joins the four identities into one row", () => {
    const [row] = buildSupplierItems(catalog([SKU_SOFA]), SUPPLIERS);
    expect(row).toMatchObject({
      supplierName: "Hookka",
      supplierCode: "HK-3S",
      sku: "sofa:hookka-3s",
      ourName: "Hookka Lounger · 3-Seater",
      description: "Fabric A",
    });
  });

  it("INNER joins — a SKU nobody supplies is not a supplier's item", () => {
    // Service/guarantee SKUs have no supplier BY DESIGN (0171 made the column
    // nullable for exactly them). Rendering them with a blank Supplier would
    // invite someone to "fix" a row that is already correct.
    const rows = buildSupplierItems(catalog([SKU_SOFA, SKU_NO_SUPPLIER]), SUPPLIERS);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sku).toBe("sofa:hookka-3s");
  });

  it("drops a SKU pointing at a supplier the roster does not hold", () => {
    // That is a data fault worth finding in the catalog, not a row to render
    // with an empty name.
    const orphan = { ...SKU_SOFA, id: "k9", supplierId: "GONE" };
    expect(buildSupplierItems(catalog([orphan]), SUPPLIERS)).toHaveLength(0);
  });

  it("keeps a missing supplier code as null — that emptiness is the point", () => {
    // The column landed 2026-08-21, so most rows are null until the quotation
    // is keyed in. This screen exists to show WHICH.
    const rows = buildSupplierItems(catalog([SKU_NO_CODE]), SUPPLIERS);
    expect(rows[0]!.supplierCode).toBeNull();
  });

  it("sorts supplier first, then our code — the order a quotation is read in", () => {
    const other = { ...SKU_SOFA, id: "k4", sku: "acc:aaa", modelId: "m2", variant: "", supplierId: "s2" };
    const rows = buildSupplierItems(catalog([SKU_SOFA, SKU_NO_CODE, other]), SUPPLIERS);
    expect(rows.map((r) => r.supplierName)).toEqual(["Ace Foam", "Hookka", "Hookka"]);
    expect(rows.slice(1).map((r) => r.sku)).toEqual(["sofa:hookka-2s", "sofa:hookka-3s"]);
  });

  it("a no-variant category prints the model alone, with no trailing separator", () => {
    const acc = { ...SKU_NO_SUPPLIER, id: "k5", supplierId: "s2" };
    expect(buildSupplierItems(catalog([acc]), SUPPLIERS)[0]!.ourName).toBe("Mattress Protector");
  });

  it("returns nothing rather than throwing while either bundle is still loading", () => {
    expect(buildSupplierItems(undefined, SUPPLIERS)).toEqual([]);
    expect(buildSupplierItems(catalog([SKU_SOFA]), undefined)).toEqual([]);
    expect(buildSupplierItems(catalog([SKU_SOFA]), [])).toEqual([]);
  });
});

describe("missingSupplierCodeCount", () => {
  it("counts what is left to key in, treating blank as missing", () => {
    const rows = buildSupplierItems(
      catalog([SKU_SOFA, SKU_NO_CODE, { ...SKU_SOFA, id: "k6", sku: "x", supplierCode: "   " }]),
      SUPPLIERS,
    );
    expect(missingSupplierCodeCount(rows)).toBe(2);
  });
});
