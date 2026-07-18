/**
 * AddProductOverlay (0231 add-product P1) — pins the P2 exclusion (sofa models
 * offering compartments are hidden) and the 0089 mutex lock against the
 * order's existing lines.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CatalogResponse, Order } from "@carres/shared";
import AddProductOverlay from "./AddProductOverlay";

const M_MATTRESS = "00000000-0000-0000-0000-00000000m001";
const M_SOFA_BUILD = "00000000-0000-0000-0000-00000000m002";
const M_SOFA_FLAT = "00000000-0000-0000-0000-00000000m003";

const CATALOG = {
  models: [
    { id: M_MATTRESS, category: "mattress", modelKey: "CLOUD", name: "Cloud Mattress", blurb: null, photoUrl: null },
    { id: M_SOFA_BUILD, category: "sofa", modelKey: "MODULARSOFA", name: "Modular Sofa", blurb: null, photoUrl: null },
    { id: M_SOFA_FLAT, category: "sofa", modelKey: "FLATSOFA", name: "Flat Sofa", blurb: null, photoUrl: null },
  ],
  skus: [
    { id: "s1", modelId: M_MATTRESS, sku: "SKU-M", variant: "King", variantKind: "size", price: 1500, cost: null, supplierId: null },
    { id: "s2", modelId: M_SOFA_BUILD, sku: "SKU-SB", variant: "3-seater", variantKind: "preset", price: 3000, cost: null, supplierId: null },
    { id: "s3", modelId: M_SOFA_FLAT, sku: "SKU-SF", variant: "2-seater", variantKind: "preset", price: 2000, cost: null, supplierId: null },
  ],
  sofaFabrics: [],
  addons: [],
  floorConfig: { id: 1, freeUpToFloor: 3, perFloorPerItem: 20 },
  // MODULARSOFA offers compartments → the visual-builder path → hidden in P1.
  modelSofaCompartments: [{ modelId: M_SOFA_BUILD, compartmentId: "c1", priceOverride: null }],
} as unknown as CatalogResponse;

function order(lines: Array<{ sku: string }> = []): Order {
  return {
    id: "00000000-0000-0000-0000-000000001301",
    so: 1301,
    status: "place",
    customer: { name: "T", phone: null, address: null },
    delivery: {},
    lines: lines.map((l, i) => ({ id: `l${i}`, orderId: "x", sku: l.sku, qty: 1, attrs: null, unitPrice: 1 })),
  } as unknown as Order;
}

function renderOverlay(o: Order) {
  render(
    <AddProductOverlay
      order={o}
      catalog={CATALOG}
      busy={false}
      error={null}
      onPick={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("AddProductOverlay", () => {
  it("hides sofa models that offer compartments (build path = P2), keeps flat sofa", () => {
    renderOverlay(order());
    expect(screen.queryByTestId("pos-card-MODULARSOFA")).toBeNull();
    expect(screen.getByTestId("pos-card-FLATSOFA")).toBeTruthy();
    expect(screen.getByTestId("pos-card-CLOUD")).toBeTruthy();
  });

  it("locks the sofa card when the order already holds a mattress (0089 mutex)", () => {
    renderOverlay(order([{ sku: "SKU-M" }]));
    const sofaCard = screen.getByTestId("pos-card-FLATSOFA") as HTMLButtonElement;
    expect(sofaCard.disabled).toBe(true);
    const mattressCard = screen.getByTestId("pos-card-CLOUD") as HTMLButtonElement;
    expect(mattressCard.disabled).toBe(false);
  });

  it("shows the error banner when an add failed", () => {
    render(
      <AddProductOverlay
        order={order()}
        catalog={CATALOG}
        busy={false}
        error="Sofa can't mix with mattress / bed frame in one order."
        onPick={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pos-add-error").textContent).toContain("can't mix");
  });
});
