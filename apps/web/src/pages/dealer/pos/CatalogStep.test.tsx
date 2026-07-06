import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft } from "../new-order/draft";
import CatalogStep from "./CatalogStep";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

function catalog(): CatalogResponse {
  return {
    models: [
      { id: "m-mat", category: "mattress", modelKey: "cloud", name: "Carres Cloud", blurb: "Pocket spring", colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      { id: "s1", modelId: "m-mat", sku: "CLOUD-QUEEN", variant: "Queen", variantKind: "size", price: 2890, cost: null, supplierId: null },
      { id: "s2", modelId: "m-mat", sku: "CLOUD-KING", variant: "King", variantKind: "size", price: 3490, cost: null, supplierId: null },
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  };
}

describe("CatalogStep", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the rail + product card and adds a configured line to the cart", () => {
    const onChange = vi.fn();
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={onChange}
        catalog={catalog()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );

    // Rail + card present.
    expect(screen.getByTestId("pos-rail-all")).toBeTruthy();
    expect(screen.getByTestId("pos-card-cloud")).toBeTruthy();
    expect(screen.getByText("Carres Cloud")).toBeTruthy();

    // A mattress card jumps straight into the full-page configurator
    // (prototype's ConfiguratorScreen), not the drawer.
    fireEvent.click(screen.getByTestId("pos-card-cloud"));
    expect(screen.getByTestId("pos-configure-page")).toBeTruthy();

    // Pick size + add to cart.
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].sku).toBe("CLOUD-QUEEN");
    expect(next.lines[0].unitPrice).toBe(2890);
  });

  it("renders the empty-search state (after debounce)", async () => {
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={() => {}}
        catalog={catalog()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Search catalog"), { target: { value: "zzzznope" } });
    // search is debounced ~180ms; findByText polls until the filter applies.
    expect(await screen.findByText(/No pieces match/)).toBeTruthy();
  });
});
