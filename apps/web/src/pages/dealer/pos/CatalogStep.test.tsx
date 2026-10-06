import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import { mockMatchMedia } from "@/test/setup";
import { emptyDraft } from "../new-order/draft";
import CatalogStep from "./CatalogStep";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn() } }));

const scrollIntoView = vi.fn();

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

/** Catalog with one single-sku accessory (no options to pick). */
function catalogWithAccessory(): CatalogResponse {
  return {
    ...catalog(),
    models: [
      ...catalog().models,
      { id: "m-acc", category: "accessory", modelKey: "pasir-rug", name: "Pasir Wool Rug", blurb: "Hand-tufted", colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      ...catalog().skus,
      { id: "s-acc", modelId: "m-acc", sku: "PASIR-RUG", variant: "200×290cm", variantKind: "preset", price: 200, cost: null, supplierId: null },
    ],
  };
}

describe("CatalogStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  it("a single-sku accessory adds STRAIGHT to the cart (no configurator drawer)", () => {
    const onChange = vi.fn();
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={onChange}
        catalog={catalogWithAccessory()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("pos-card-pasir-rug"));
    // No configurator opened — it went straight to the cart.
    expect(screen.queryByTestId("pos-configure-drawer")).toBeNull();
    expect(screen.queryByTestId("pos-configure-page")).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.lines).toHaveLength(1);
    expect(next.lines[0].sku).toBe("PASIR-RUG");
    expect(next.lines[0].unitPrice).toBe(200);
    expect(next.lines[0].qty).toBe(1);
  });

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

  it("shows only the five popular phone chips while the drawer keeps every available entry", () => {
    mockMatchMedia(true);
    const onCategoryOpenChange = vi.fn();
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={() => {}}
        catalog={catalogWithAccessory()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
        categoryOpen
        onCategoryOpenChange={onCategoryOpenChange}
      />,
    );

    for (const key of ["all", "mattress", "bedframe", "sofa", "accessory"]) {
      expect(screen.getByTestId(`pos-mobile-chip-${key}`)).toBeTruthy();
    }
    expect(screen.queryByTestId("pos-mobile-chip-addons")).toBeNull();
    expect(screen.getByTestId("pos-category-drawer-addons")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pos-category-drawer-addons"));
    expect(screen.getByText("0 add-ons")).toBeTruthy();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(onCategoryOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("centers a newly active popular chip on phone without scrolling on initial render", () => {
    mockMatchMedia(true);
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={() => {}}
        catalog={catalogWithAccessory()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );

    expect(scrollIntoView).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("pos-mobile-chip-accessory"));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  });

  it("does not auto-scroll chips outside the phone breakpoint", () => {
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={() => {}}
        catalog={catalogWithAccessory()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId("pos-mobile-chip-accessory"));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not fail when the environment has no matchMedia implementation", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={() => {}}
        catalog={catalogWithAccessory()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );

    expect(() => fireEvent.click(screen.getByTestId("pos-mobile-chip-accessory"))).not.toThrow();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("drawer shortcuts reuse the existing category and reset behavior, then close", () => {
    const onCategoryOpenChange = vi.fn();
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={() => {}}
        catalog={catalog()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
        categoryOpen
        onCategoryOpenChange={onCategoryOpenChange}
      />,
    );

    fireEvent.click(screen.getByTestId("pos-category-drawer-bestsellers"));
    expect(screen.getByTestId("pos-mobile-chip-mattress")).toHaveAttribute("aria-pressed", "true");
    expect(onCategoryOpenChange).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByLabelText("Search catalog"), { target: { value: "cloud" } });
    fireEvent.click(screen.getByTestId("pos-category-drawer-reset"));
    expect(screen.getByLabelText("Search catalog")).toHaveValue("");
    expect(screen.getByTestId("pos-mobile-chip-all")).toHaveAttribute("aria-pressed", "true");
    expect(onCategoryOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("disables locked categories in both the phone chips and drawer", () => {
    const cat = catalogWithAccessory();
    cat.models = [
      ...cat.models,
      {
        id: "m-sofa",
        category: "sofa",
        modelKey: "sofa",
        name: "Carres Sofa",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: null,
      },
    ];
    cat.skus = [
      ...cat.skus,
      {
        id: "s-sofa",
        modelId: "m-sofa",
        sku: "SOFA-1",
        variant: "Standard",
        variantKind: "preset",
        price: 2990,
        cost: null,
        supplierId: null,
      },
    ];
    const draft = emptyDraft();
    draft.lines = [
      {
        localId: "line-sofa",
        sku: "SOFA-1",
        qty: 1,
        unitPrice: 2990,
        label: "Carres Sofa",
        attrs: null,
      },
    ];

    render(
      <CatalogStep
        draft={draft}
        onChange={() => {}}
        catalog={cat}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
        categoryOpen
        onCategoryOpenChange={() => {}}
      />,
    );

    expect(screen.getByTestId("pos-mobile-chip-mattress")).toBeDisabled();
    expect(screen.getByTestId("pos-mobile-chip-bedframe")).toBeDisabled();
    expect(screen.getByTestId("pos-category-drawer-mattress")).toBeDisabled();
    expect(screen.getByTestId("pos-category-drawer-bedframe")).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 0239 — product bundles at the POS
// ---------------------------------------------------------------------------
describe("CatalogStep — bundles", () => {
  /** catalogWithAccessory + one active bundle over 3 of its SKUs at RM 5,000. */
  function catalogWithBundle(): CatalogResponse {
    return {
      ...catalogWithAccessory(),
      bundles: [
        {
          id: "bundle-1",
          name: "Cloud Pair + Rug",
          price: 5000,
          kind: "fixed" as const,
          slots: [],
          components: [
            { sku: "CLOUD-QUEEN", qty: 1 },
            { sku: "CLOUD-KING", qty: 1 },
            { sku: "PASIR-RUG", qty: 1 },
          ],
          active: true,
          sortOrder: 0,
        },
      ],
    };
  }

  it("shows the Bundles rail + card, and a tap adds the exploded group summing EXACTLY to the bundle price", () => {
    const onChange = vi.fn();
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={onChange}
        catalog={catalogWithBundle()}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );

    // Rail entry appears only because a bundle exists.
    expect(screen.getByTestId("pos-rail-bundles")).toBeTruthy();
    const card = screen.getByTestId("pos-bundle-card-bundle-1");
    expect(card).toBeTruthy();
    expect(screen.getByText("Cloud Pair + Rug")).toBeTruthy();

    fireEvent.click(card);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.lines).toHaveLength(3);
    // Σ unitPrice × qty === the bundle price, to the cent.
    const cents = next.lines.reduce(
      (s: number, l: { unitPrice: number; qty: number }) => s + Math.round(l.unitPrice * 100) * l.qty,
      0,
    );
    expect(cents).toBe(500000);
    // Every line carries the SAME bundle_group + the bundle identity.
    const groups = new Set(next.lines.map((l: { attrs: Record<string, unknown> }) => l.attrs.bundle_group));
    expect(groups.size).toBe(1);
    for (const l of next.lines) {
      expect(l.attrs.bundle_key).toBe("bundle-1");
      expect(l.attrs.bundle_label).toBe("Cloud Pair + Rug");
    }
    // Proportional: the King line carries the biggest share.
    const bySku = new Map(
      next.lines.map((l: { sku: string; unitPrice: number }) => [l.sku, l.unitPrice]),
    );
    expect(Number(bySku.get("CLOUD-KING"))).toBeGreaterThan(Number(bySku.get("CLOUD-QUEEN")));
    expect(Number(bySku.get("PASIR-RUG"))).toBeLessThan(Number(bySku.get("CLOUD-QUEEN")));
  });

  it("a bundle whose component is off the POS catalog renders disabled", () => {
    const cat = catalogWithBundle();
    // Simulate the API filtering an OFF sku out of the POS bundle payload.
    cat.skus = cat.skus.filter((s) => s.sku !== "PASIR-RUG");
    const onChange = vi.fn();
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={onChange}
        catalog={cat}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );
    const card = screen.getByTestId("pos-bundle-card-bundle-1");
    expect(card).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(card);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a fixed bundle whose component has spec axes opens the slot walker (0241), not a direct add", () => {
    const cat = catalogWithBundle();
    // Turn the rug into a BEDFRAME component — bed frames always ask for specs.
    cat.models = cat.models.map((m) =>
      m.id === "m-acc" ? { ...m, category: "bedframe" as const } : m,
    );
    const onChange = vi.fn();
    render(
      <CatalogStep
        draft={emptyDraft()}
        onChange={onChange}
        catalog={cat}
        onProceed={() => {}}
        cartOpen={false}
        onCartOpenChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("pos-bundle-card-bundle-1"));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("bundle-configure-page")).toBeTruthy();
    // The two spec-less mattress slots auto-resolved; the bedframe slot asks.
    expect(screen.getByTestId("bundle-walker-add")).toBeDisabled();
  });

  it("no bundles → no Bundles rail entry", () => {
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
    expect(screen.queryByTestId("pos-rail-bundles")).toBeNull();
  });
});
