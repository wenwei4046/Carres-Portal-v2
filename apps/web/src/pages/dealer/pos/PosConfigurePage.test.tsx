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
  it("carries color + gap in attrs and label, like the drawer", () => {
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
    // Colour defaults to the first option; switch to the second.
    fireEvent.click(screen.getByTestId("cfg-colour-Natural oak"));
    // Gap defaults to the first option ('10"'); switch to '12"'.
    fireEvent.click(screen.getByTestId('cfg-gap-12"'));

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0];
    expect(line.sku).toBe("JAGER-K");
    expect(line.attrs).toMatchObject({ color: "Natural oak", gap: '12"' });
    expect(line.unitPrice).toBe(1990);
    expect(line.label).toBe('Jager · King · Natural oak · gap 12"');
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
