import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ProductCategory, ProductModelDto, ProductSkuDto, SofaFabricDto } from "@carres/shared";
import type { DraftLine } from "./draft";
import { lockedCategoriesFor } from "./configurators";
import ConfigureDrawer from "../pos/ConfigureDrawer";

/**
 * Sofa-mutex rule (Loo 2026-05-11, migration 0089): the picker disables
 * conflicting category tabs based on the lines already on the draft.
 *   sofa → locks mattress + bedframe; mattress|bedframe → locks sofa.
 */
function line(sku: string): DraftLine {
  return { localId: `local-${sku}`, sku, qty: 1, attrs: null, unitPrice: 100, label: sku };
}

const skuCats: Map<string, ProductCategory> = new Map([
  ["MA-001", "mattress"],
  ["BF-001", "bedframe"],
  ["SF-001", "sofa"],
]);

describe("lockedCategoriesFor", () => {
  it("locks nothing when draft is empty", () => {
    expect(lockedCategoriesFor([], skuCats).size).toBe(0);
  });
  it("locks sofa when draft has mattress (bedframe stays open)", () => {
    const locked = lockedCategoriesFor([line("MA-001")], skuCats);
    expect(locked.has("sofa")).toBe(true);
    expect(locked.has("mattress")).toBe(false);
    expect(locked.has("bedframe")).toBe(false);
  });
  it("locks mattress + bedframe when draft has sofa", () => {
    const locked = lockedCategoriesFor([line("SF-001")], skuCats);
    expect(locked.has("mattress")).toBe(true);
    expect(locked.has("bedframe")).toBe(true);
    expect(locked.has("sofa")).toBe(false);
  });
  it("ignores unknown SKUs gracefully", () => {
    expect(lockedCategoriesFor([line("UNKNOWN")], skuCats).size).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// SO-1006 regression (Loo 2026-05-18): switching sofa models must NOT leak the
// previous model's fabric. ConfigureDrawer keys the configurator by model.id,
// so a different model forces a fresh mount and useState(fabrics[0]?.id)
// re-inits. If the key is removed, the stale fabricId persists and the line is
// added with the wrong / no fabric.
// -----------------------------------------------------------------------------
function sofaModel(id: string, name: string): ProductModelDto {
  return { id, category: "sofa", modelKey: name.toLowerCase(), name, blurb: null, colors: null, gaps: null, sofaMode: "preset" };
}
function presetSku(id: string, modelId: string, variant: string, price: number): ProductSkuDto {
  return { id, modelId, sku: `${variant}-sku`, variant, variantKind: "preset", price, cost: null, supplierId: null };
}
function fabric(id: string, modelId: string, name: string, surcharge: number): SofaFabricDto {
  return { id, modelId, fabricName: name, surcharge, colors: null };
}

describe("ConfigureDrawer — sofa model-switch fabric reset", () => {
  it("uses the NEW model's fabric after switching models", () => {
    const onAdd = vi.fn();
    const alpha = sofaModel("m-alpha", "Sofa Alpha");
    const bravo = sofaModel("m-bravo", "Sofa Bravo");

    const { rerender } = render(
      <ConfigureDrawer
        model={alpha}
        meta={undefined}
        skus={[presetSku("s-alpha", "m-alpha", "Alpha S1", 1000)]}
        fabrics={[fabric("fab-alpha", "m-alpha", "Alpha Cotton", 0)]}
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText("Alpha Cotton")).toBeTruthy();

    // Switch to model Bravo — model.id changes → configurator remounts.
    rerender(
      <ConfigureDrawer
        model={bravo}
        meta={undefined}
        skus={[presetSku("s-bravo", "m-bravo", "Bravo S1", 2000)]}
        fabrics={[fabric("fab-bravo", "m-bravo", "Bravo Leather", 600)]}
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/preset/i), { target: { value: "s-bravo" } });
    fireEvent.click(screen.getByText("+ Add"));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const added = onAdd.mock.calls[0][0] as DraftLine;
    expect(added.sku).toBe("Bravo S1-sku");
    const attrs = added.attrs as Record<string, unknown>;
    expect(attrs.fabric_id).toBe("fab-bravo");
    expect(attrs.fabric_id).not.toBe("fab-alpha");
  });
});
