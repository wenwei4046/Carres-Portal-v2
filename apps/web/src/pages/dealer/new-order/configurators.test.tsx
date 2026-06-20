import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type {
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
} from "@carres/shared";
import type { DraftLine } from "./draft";
import { lockedCategoriesFor } from "./configurators";
import { SofaConfigurator } from "./configurators";
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
function fabric(
  id: string,
  modelId: string,
  name: string,
  surcharge: number,
  tier: SofaFabricDto["tier"] = "PRICE_1",
): SofaFabricDto {
  return { id, modelId, fabricName: name, surcharge, colors: null, tier };
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

// -----------------------------------------------------------------------------
// SofaConfigurator — fabric-tier delta path (migration 0176).
// The DraftLine contract (keys/shape) must be UNCHANGED for P1. New key
// `fabric_tier` is additive; `fabric_surcharge` holds the resolved delta.
// -----------------------------------------------------------------------------
const MODEL: ProductModelDto = sofaModel("m-kestrel", "Kestrel");
const SKU: ProductSkuDto = presetSku("s1", "m-kestrel", "3-seater", 5000);
const CONFIG: FabricTierGlobalConfig = { sofaTier2Delta: 100, sofaTier3Delta: 200 };

function renderSofa(
  fabrics: SofaFabricDto[],
  opts: {
    fabricTierConfig?: FabricTierGlobalConfig | null;
    modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  } = {},
) {
  const onAdd = vi.fn();
  render(
    <SofaConfigurator
      model={MODEL}
      skus={[SKU]}
      fabrics={fabrics}
      fabricTierConfig={opts.fabricTierConfig}
      modelFabricTierOverrides={opts.modelFabricTierOverrides}
      onAdd={onAdd}
    />,
  );
  // Pick the only preset and click Add.
  fireEvent.change(screen.getByLabelText(/preset/i), { target: { value: "s1" } });
  fireEvent.click(screen.getByText("+ Add"));
  return onAdd;
}

describe("SofaConfigurator — fabric tier delta", () => {
  it("P1 fabric + no config → delta 0, unitPrice = sku.price (unchanged behavior)", () => {
    const onAdd = renderSofa([fabric("f1", "m-kestrel", "Linen", 300, "PRICE_1")]);
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(5000); // sku.price + 0
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_surcharge).toBe(0);
    expect(attrs.fabric_tier).toBe("PRICE_1");
    expect(attrs.fabric_id).toBe("f1");
    expect(attrs.fabric_name).toBe("Linen");
  });

  it("P1 fabric + config present → delta still 0 (P1 always base)", () => {
    const onAdd = renderSofa([fabric("f1", "m-kestrel", "Linen", 300, "PRICE_1")], {
      fabricTierConfig: CONFIG,
    });
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(5000);
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_surcharge).toBe(0);
    expect(attrs.fabric_tier).toBe("PRICE_1");
  });

  it("P2 fabric + global config → applies tier2Delta", () => {
    const onAdd = renderSofa([fabric("f2", "m-kestrel", "Velvet Teal", 0, "PRICE_2")], {
      fabricTierConfig: CONFIG,
    });
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(5100); // 5000 + 100
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_surcharge).toBe(100);
    expect(attrs.fabric_tier).toBe("PRICE_2");
  });

  it("P3 fabric + global config → applies tier3Delta", () => {
    const onAdd = renderSofa([fabric("f3", "m-kestrel", "Silk Premium", 0, "PRICE_3")], {
      fabricTierConfig: CONFIG,
    });
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(5200); // 5000 + 200
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_surcharge).toBe(200);
    expect(attrs.fabric_tier).toBe("PRICE_3");
  });

  it("P2 fabric + per-model override wins over global config", () => {
    const overrides: ModelFabricTierOverrideDto[] = [
      { modelId: "m-kestrel", tier2Delta: 50, tier3Delta: null },
    ];
    const onAdd = renderSofa([fabric("f2", "m-kestrel", "Velvet Teal", 0, "PRICE_2")], {
      fabricTierConfig: CONFIG,
      modelFabricTierOverrides: overrides,
    });
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(5050); // 5000 + override 50 (not global 100)
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_surcharge).toBe(50);
  });

  it("P2 fabric + no config (pre-0176 bundle) → delta 0 (safe fallback)", () => {
    const onAdd = renderSofa([fabric("f2", "m-kestrel", "Velvet Teal", 0, "PRICE_2")]);
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(5000); // 5000 + 0 (safe fallback)
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_surcharge).toBe(0);
  });

  it("DraftLine shape is unchanged: has localId/sku/qty/attrs/unitPrice/label (P1 path)", () => {
    const onAdd = renderSofa([fabric("f1", "m-kestrel", "Linen", 300, "PRICE_1")]);
    const line = onAdd.mock.calls[0][0] as DraftLine;
    // All required DraftLine keys present.
    expect(typeof line.localId).toBe("string");
    expect(line.sku).toBe("3-seater-sku");
    expect(line.qty).toBe(1);
    expect(typeof line.label).toBe("string");
    expect(typeof line.unitPrice).toBe("number");
    // attrs keys: mode, fabric_id, fabric_name, fabric_surcharge, fabric_tier (additive).
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.mode).toBe("preset");
    expect(attrs.fabric_id).toBeDefined();
    expect(attrs.fabric_name).toBeDefined();
    expect(attrs.fabric_surcharge).toBeDefined();
    expect(attrs.fabric_tier).toBeDefined();
  });

  it("no-fabric sofa → attrs has mode only, unitPrice = sku.price", () => {
    const onAdd = renderSofa([]); // no fabrics
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(5000);
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.mode).toBe("preset");
    expect(attrs.fabric_id).toBeUndefined();
    expect(attrs.fabric_surcharge).toBeUndefined();
    expect(attrs.fabric_tier).toBeUndefined();
  });
});
