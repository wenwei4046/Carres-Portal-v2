/**
 * PosConfigurePage — the full-page mattress / bed-frame configurator
 * (design contract: prototype/pos-configurator.jsx, lockTab mode).
 *
 * What matters here is the DraftLine CONTRACT: the page must emit exactly
 * what the old drawer configurators emitted (same sku / attrs / unitPrice /
 * label), because the whole submit pipeline downstream is unchanged.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import PosConfigurePage, { footprintForVariant, hexForColourName } from "./PosConfigurePage";

function mattressModel(): ProductModelDto {
  return {
    id: "m-mat",
    category: "mattress",
    modelKey: "cloud",
    name: "Carres Cloud",
    blurb: "Pocket spring",
    colors: null,
    gaps: null,
    sofaMode: null,
  } as ProductModelDto;
}

function bedModel(): ProductModelDto {
  return {
    id: "m-bed",
    category: "bedframe",
    modelKey: "jager",
    name: "Jager",
    blurb: null,
    colors: ["Walnut", "Natural oak"],
    gaps: ['10"', '12"'],
    sofaMode: null,
  } as ProductModelDto;
}

const mattressSkus: ProductSkuDto[] = [
  { id: "s1", modelId: "m-mat", sku: "CLOUD-QUEEN", variant: "Queen", variantKind: "size", price: 2890, cost: null, supplierId: null } as ProductSkuDto,
  { id: "s2", modelId: "m-mat", sku: "CLOUD-KING", variant: "King", variantKind: "size", price: 3490, cost: null, supplierId: null } as ProductSkuDto,
];

const bedSkus: ProductSkuDto[] = [
  { id: "b1", modelId: "m-bed", sku: "JAGER-K", variant: "King", variantKind: "size", price: 1990, cost: null, supplierId: null } as ProductSkuDto,
];

describe("footprintForVariant", () => {
  it("maps the four MY sizes + bare codes + explicit dims; unknown → null", () => {
    expect(footprintForVariant("King")).toMatchObject({ w: 183, d: 190 });
    expect(footprintForVariant("Fab2-Queen")).toMatchObject({ w: 152, d: 190 });
    expect(footprintForVariant("Super Single")).toMatchObject({ w: 107, d: 190 });
    expect(footprintForVariant("Single")).toMatchObject({ w: 91, d: 190 });
    expect(footprintForVariant("(K)")).toMatchObject({ w: 183, d: 190 });
    expect(footprintForVariant("152 x 190")).toMatchObject({ w: 152, d: 190 });
    expect(footprintForVariant("Fab3")).toBeNull();
    expect(footprintForVariant(null)).toBeNull();
  });
});

describe("hexForColourName", () => {
  it("maps known tones and falls back to oak", () => {
    expect(hexForColourName("Walnut")).toBe("#6B4A2B");
    expect(hexForColourName("Anything else")).toBe("#C8A878");
  });
});

describe("PosConfigurePage — mattress", () => {
  it("adds the same DraftLine the drawer configurator produced", () => {
    const onAdd = vi.fn();
    const onClose = vi.fn();
    render(
      <PosConfigurePage
        model={mattressModel()}
        meta={undefined}
        skus={mattressSkus}
        onAdd={onAdd}
        onClose={onClose}
      />,
    );

    // Add is gated until a size is picked.
    expect(screen.getByTestId("cfg-add-to-cart")).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("2,890");

    // Qty stepper multiplies the live total.
    fireEvent.click(screen.getByLabelText("Increase quantity"));
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("5,780");

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const line = onAdd.mock.calls[0][0];
    expect(line.sku).toBe("CLOUD-QUEEN");
    expect(line.qty).toBe(2);
    expect(line.unitPrice).toBe(2890);
    expect(line.attrs).toBeNull(); // no specials picked → null, like the drawer
    expect(line.label).toBe("Carres Cloud · Queen");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("PosConfigurePage — bed frame", () => {
  it("carries gap in attrs + label; NO colour picker (finish comes from fabric)", () => {
    const onAdd = vi.fn();
    render(
      <PosConfigurePage
        model={bedModel()}
        meta={undefined}
        skus={bedSkus}
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("cfg-size-b1"));
    // The old model.colors picker is gone (bedModel still carries colours).
    expect(screen.queryByTestId("cfg-colour-Natural oak")).toBeNull();
    // Gap defaults to the first option ('10"'); switch to '12"'.
    fireEvent.click(screen.getByTestId('cfg-gap-12"'));

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0];
    expect(line.sku).toBe("JAGER-K");
    expect(line.attrs).toMatchObject({ gap: '12"' });
    expect("color" in line.attrs).toBe(false);
    expect(line.unitPrice).toBe(1990);
    expect(line.label).toBe('Jager · King · gap 12"');
  });

  it("renders the plan-view canvas with the frame footprint once sized", () => {
    render(
      <PosConfigurePage
        model={bedModel()}
        meta={undefined}
        skus={bedSkus}
        onAdd={() => {}}
        onClose={() => {}}
      />,
    );
    // Empty state first.
    expect(screen.getByText(/Pick a size to see the frame/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("cfg-size-b1"));
    // King frame = 183+18 × 190+12.
    expect(screen.getByText("201 cm")).toBeTruthy();
    expect(screen.getByText("202 cm")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 0201/0202-wiring — divan / gap / leg / fabric sourced from the Maintenance
// pools (∩ Modular ticks), surcharges folded into the line + attrs.options.
// ---------------------------------------------------------------------------

import type { CatalogFabricDto, CatalogOptionPoolDto } from "@carres/shared";

let poolSeq = 0;
function poolRow(pool: CatalogOptionPoolDto["pool"], value: string, surcharge: number | null, active = true): CatalogOptionPoolDto {
  poolSeq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(poolSeq).padStart(12, "0")}`,
    pool,
    value,
    label: null,
    dimensions: null,
    surcharge,
    active,
    sortOrder: poolSeq,
  };
}

const POOLS: CatalogOptionPoolDto[] = [
  poolRow("divan_height", '8"', null),
  poolRow("divan_height", '10"', 125),
  poolRow("divan_height", '14"', 375, false), // inactive — never shows
  poolRow("gap", '10"', null),
  poolRow("gap", '12"', null),
  poolRow("gap", '16"', null),
  poolRow("bedframe_leg_height", "No Leg", null),
  poolRow("bedframe_leg_height", '4"', 60),
];

const FABRICS: CatalogFabricDto[] = [
  {
    id: "00000000-0000-4000-8000-0000000000f1",
    fabricCode: "PC151-01",
    series: null,
    description: "Oat weave",
    supplierCode: null,
    sofaTier: "PRICE_1",
    bedframeTier: "PRICE_2",
    active: true,
    sortOrder: 1,
  },
];

describe("PosConfigurePage — bed frame Maintenance options (0201/0202)", () => {
  function renderBed(onAdd: (l: unknown) => void, modelOver: Partial<ProductModelDto> = {}) {
    render(
      <PosConfigurePage
        model={{ ...bedModel(), ...modelOver } as ProductModelDto}
        meta={undefined}
        skus={bedSkus}
        optionPools={POOLS}
        fabrics={FABRICS}
        fabricTierConfig={{ sofaTier2Delta: 150, sofaTier3Delta: 300 }}
        onAdd={onAdd}
        onClose={() => {}}
      />,
    );
  }

  it("divan + leg picks fold their pool surcharge into the price + attrs.options", () => {
    const onAdd = vi.fn();
    renderBed(onAdd);
    fireEvent.click(screen.getByTestId("cfg-size-b1"));
    fireEvent.click(screen.getByTestId('cfg-divan-10"'));
    fireEvent.click(screen.getByTestId('cfg-leg-4"'));
    // 1990 + 125 + 60 = 2175
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("2,175");
    // Total height = divan 10" + leg 4" = 14".
    expect(screen.getByTestId("cfg-total-height").textContent).toContain('14"');

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0] as {
      unitPrice: number;
      attrs: { options: unknown[]; options_total: number };
    };
    expect(line.unitPrice).toBe(2175);
    expect(line.attrs.options_total).toBe(185);
    expect(line.attrs.options).toEqual([
      { kind: "divan_height", value: '10"', surcharge: 125 },
      { kind: "bedframe_leg_height", value: '4"', surcharge: 60 },
    ]);
  });

  it("an INACTIVE pool value never renders; ticks narrow the offered set", () => {
    const onAdd = vi.fn();
    // Model ticks divan to just 8" (allowed_options.divan_heights).
    renderBed(onAdd, { allowedOptions: { divan_heights: ['8"'] } });
    expect(screen.queryByTestId('cfg-divan-8"')).toBeTruthy();
    expect(screen.queryByTestId('cfg-divan-10"')).toBeNull();
    expect(screen.queryByTestId('cfg-divan-14"')).toBeNull();
  });

  it("gap chips come from the pool ∩ the model's legacy gaps column", () => {
    renderBed(() => {});
    // bedModel gaps column = 10"/12" — 16" (pool-only) must NOT show.
    expect(screen.queryByTestId('cfg-gap-10"')).toBeTruthy();
    expect(screen.queryByTestId('cfg-gap-12"')).toBeTruthy();
    expect(screen.queryByTestId('cfg-gap-16"')).toBeNull();
  });

  it("fabric IS the finish: no picker without ticks; swatch chips render + priced when ticked", () => {
    const onAdd = vi.fn();
    renderBed(onAdd);
    expect(screen.queryByTestId("cfg-fabric-section")).toBeNull();

    const onAdd2 = vi.fn();
    render(
      <PosConfigurePage
        model={{ ...bedModel(), allowedOptions: { fabrics: ["PC151-01"] } } as ProductModelDto}
        meta={undefined}
        skus={bedSkus}
        optionPools={POOLS}
        fabrics={FABRICS}
        fabricTierConfig={{ sofaTier2Delta: 150, sofaTier3Delta: 300 }}
        onAdd={onAdd2}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getAllByTestId("cfg-size-b1")[1]!);
    // The fabric IS the finish — pick the swatch chip (only render 2 has it).
    fireEvent.click(screen.getByTestId("cfg-fabric-PC151-01"));
    // 1990 + bedframeTier PRICE_2 delta 150 = 2140.
    expect(screen.getAllByTestId("cfg-live-total")[1]!.textContent).toContain("2,140");
    fireEvent.click(screen.getAllByTestId("cfg-add-to-cart")[1]!);
    const line = onAdd2.mock.calls[0][0] as { attrs: { options: unknown[] } };
    expect(line.attrs.options).toEqual([
      { kind: "fabric", value: "PC151-01", label: "Oat weave", surcharge: 150 },
    ]);
  });

  it("no picks → attrs carry NO options keys (legacy shape preserved)", () => {
    const onAdd = vi.fn();
    renderBed(onAdd);
    fireEvent.click(screen.getByTestId("cfg-size-b1"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0] as { attrs: Record<string, unknown> };
    expect("options" in line.attrs).toBe(false);
    expect("options_total" in line.attrs).toBe(false);
  });
});
