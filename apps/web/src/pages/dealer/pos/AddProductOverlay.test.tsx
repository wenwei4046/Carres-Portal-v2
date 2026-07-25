/**
 * AddProductOverlay (0231/0232 add-product P1+P2) — pins the surface routing
 * (mattress/bedframe → PosConfigurePage, offered-compartment sofa →
 * SofaConfigurePage, rest → ConfigureDrawer), the 0089 mutex lock against the
 * order's existing lines, and the error banner. The heavy configure surfaces
 * are stubbed — their own behavior is covered by their own suites.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse, Order } from "@carres/shared";

vi.mock("./SofaConfigurePage", () => ({
  default: () => <div data-testid="stub-sofa-page" />,
}));
vi.mock("./PosConfigurePage", () => ({
  default: () => <div data-testid="stub-pos-page" />,
}));
vi.mock("./ConfigureDrawer", () => ({
  default: () => <div data-testid="stub-drawer" />,
}));

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
  // 0257 — Services tab: active order add-ons are offerable; DELIVERY* keys
  // are server-exclusive and must stay hidden.
  addons: [
    { key: "dispose-mattress", name: "Dispose old mattress", price: 80, active: true, sizeOptions: ["King", "Queen"] },
    { key: "dispose-sofa", name: "Dispose old sofa", price: 50, active: true, sizeOptions: null },
    { key: "DELIVERY", name: "Delivery fee", price: 0, active: true, sizeOptions: null },
    { key: "retired", name: "Retired addon", price: 10, active: false, sizeOptions: null },
  ],
  floorConfig: { id: 1, freeUpToFloor: 3, perFloorPerItem: 20 },
  // MODULARSOFA offers compartments → the visual-builder path (P2: allowed).
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

function renderOverlay(
  o: Order,
  error: string | null = null,
  onPickServices = vi.fn(),
) {
  render(
    <AddProductOverlay
      order={o}
      catalog={CATALOG}
      busy={false}
      error={error}
      onPick={vi.fn()}
      onPickServices={onPickServices}
      serviceCta="Add to order"
      onClose={vi.fn()}
    />,
  );
  return onPickServices;
}

describe("AddProductOverlay", () => {
  it("P2 — offered-compartment sofa models SHOW and open SofaConfigurePage", () => {
    renderOverlay(order());
    fireEvent.click(screen.getByTestId("pos-card-MODULARSOFA"));
    expect(screen.getByTestId("stub-sofa-page")).toBeTruthy();
  });

  it("mattress opens PosConfigurePage (wizard surface convention)", () => {
    renderOverlay(order());
    fireEvent.click(screen.getByTestId("pos-card-CLOUD"));
    expect(screen.getByTestId("stub-pos-page")).toBeTruthy();
  });

  it("a flat (no-compartment) sofa opens the ConfigureDrawer", () => {
    renderOverlay(order());
    fireEvent.click(screen.getByTestId("pos-card-FLATSOFA"));
    expect(screen.getByTestId("stub-drawer")).toBeTruthy();
  });

  it("locks the sofa cards when the order already holds a mattress (0089 mutex)", () => {
    renderOverlay(order([{ sku: "SKU-M" }]));
    expect((screen.getByTestId("pos-card-FLATSOFA") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("pos-card-MODULARSOFA") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("pos-card-CLOUD") as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the error banner when an add failed", () => {
    renderOverlay(order(), "Sofa can't mix with mattress / bed frame in one order.");
    expect(screen.getByTestId("pos-add-error").textContent).toContain("can't mix");
  });

  // 0257 — Services tab: the wizard's order add-ons become addable post-create.
  it("services tab lists offerable add-ons only and emits the picks", () => {
    const onPickServices = renderOverlay(order());
    fireEvent.click(screen.getByText("Services"));
    const panel = screen.getByTestId("pos-add-services");
    // Active, non-server-exclusive only: DELIVERY + inactive stay hidden.
    expect(panel.textContent).toContain("Dispose old sofa");
    expect(panel.textContent).toContain("Dispose old mattress");
    expect(panel.textContent).not.toContain("Delivery fee");
    expect(panel.textContent).not.toContain("Retired addon");

    // Nothing picked → CTA disabled.
    const cta = screen.getByTestId("pos-add-services-confirm") as HTMLButtonElement;
    expect(cta.disabled).toBe(true);

    // Pick the size-less service → CTA enables → emits the DraftAddon.
    fireEvent.click(screen.getByText("Dispose old sofa"));
    expect(cta.disabled).toBe(false);
    fireEvent.click(cta);
    expect(onPickServices).toHaveBeenCalledTimes(1);
    const picks = onPickServices.mock.calls[0][0] as Array<{ key: string; qty: number }>;
    expect(picks).toHaveLength(1);
    expect(picks[0].key).toBe("dispose-sofa");
    expect(picks[0].qty).toBe(1);
  });

  it("a sized service gates the CTA until every unit has a size", () => {
    renderOverlay(order());
    fireEvent.click(screen.getByText("Services"));
    fireEvent.click(screen.getByText("Dispose old mattress"));
    const cta = screen.getByTestId("pos-add-services-confirm") as HTMLButtonElement;
    expect(cta.disabled).toBe(true); // size not picked yet
    fireEvent.change(screen.getByLabelText("Dispose old mattress size"), {
      target: { value: "Queen" },
    });
    expect(cta.disabled).toBe(false);
  });
});
