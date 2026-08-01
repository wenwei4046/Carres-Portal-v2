/**
 * CatalogStep — the card wall's composition (Loo 2026-08-01, 2990s parity).
 *
 * Pins: one band per family under "All open" with the LEFT RAIL's own word ·
 * no header when a single rail leaves one band · and the two things the wall
 * used to get wrong because rental cards were a third card source nobody
 * counted — the Rental rail showing "No pieces match." over its own offers,
 * and the toolbar printing "0 pieces" above them.
 *
 * The configure surfaces are stubbed: their behaviour has its own suites.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { CatalogResponse, PosRentalPlan } from "@carres/shared";
import type { WizardDraft } from "../new-order/draft";

vi.mock("./SofaConfigurePage", () => ({ default: () => <div /> }));
vi.mock("./PosConfigurePage", () => ({ default: () => <div /> }));
vi.mock("./RentalConfigurePage", () => ({ default: () => <div /> }));
vi.mock("./BundleConfigurePage", () => ({ default: () => <div /> }));
vi.mock("./ConfigureDrawer", () => ({ default: () => <div /> }));
vi.mock("./CartDrawer", () => ({ default: () => <div /> }));

import CatalogStep from "./CatalogStep";

const M_MATT_A = "00000000-0000-0000-0000-0000000000a1";
const M_MATT_B = "00000000-0000-0000-0000-0000000000a2";
const M_BEDFRAME = "00000000-0000-0000-0000-0000000000b1";
const M_ACCESSORY = "00000000-0000-0000-0000-0000000000c1";

const CATALOG = {
  models: [
    { id: M_MATT_A, category: "mattress", modelKey: "AKKA", name: "Akka", blurb: null, photoUrl: null },
    { id: M_MATT_B, category: "mattress", modelKey: "ARRUS", name: "Arrus", blurb: null, photoUrl: null },
    { id: M_BEDFRAME, category: "bedframe", modelKey: "L1201F", name: "L1201F", blurb: null, photoUrl: null },
    { id: M_ACCESSORY, category: "accessory", modelKey: "PILLOW", name: "Pillow", blurb: null, photoUrl: null },
  ],
  skus: [
    { id: "s1", modelId: M_MATT_A, sku: "SKU-A", variant: "King", variantKind: "size", price: 1500, cost: null, supplierId: null },
    { id: "s2", modelId: M_MATT_B, sku: "SKU-B", variant: "Queen", variantKind: "size", price: 1200, cost: null, supplierId: null },
    { id: "s3", modelId: M_BEDFRAME, sku: "SKU-C", variant: "King", variantKind: "size", price: 900, cost: null, supplierId: null },
    { id: "s4", modelId: M_ACCESSORY, sku: "SKU-D", variant: "", variantKind: "size", price: 90, cost: null, supplierId: null },
  ],
  sofaFabrics: [],
  addons: [],
  bundles: [],
  floorConfig: { id: 1, freeUpToFloor: 3, perFloorPerItem: 20 },
} as unknown as CatalogResponse;

const DRAFT = { lines: [], addons: [] } as unknown as WizardDraft;

const RENTAL_PLANS = [
  { id: "p1", sku: "SKU-A", termMonths: 84, monthlyPrice: 59 },
] as unknown as PosRentalPlan[];

function renderCatalog(rentalPlans?: PosRentalPlan[]) {
  return render(
    <CatalogStep
      draft={DRAFT}
      onChange={vi.fn()}
      catalog={CATALOG}
      onProceed={vi.fn()}
      cartOpen={false}
      onCartOpenChange={vi.fn()}
      rentalPlans={rentalPlans}
    />,
  );
}

describe("CatalogStep — category bands", () => {
  it("All open renders one band per family, in wall order, with the rail's own word", () => {
    const { container } = renderCatalog();
    const chips = [...container.querySelectorAll(".cat-section__chip")].map((n) => n.textContent);
    // Rail words, not card-badge words: "Bed frames" (rail), never "Bedframe".
    expect(chips).toEqual(["Mattresses", "Bed frames", "Accessories"]);
  });

  it("a band counts only its own cards", () => {
    const { container } = renderCatalog();
    const bands = [...container.querySelectorAll(".cat-section")];
    expect(within(bands[0] as HTMLElement).getByText("2 pieces")).toBeTruthy();
    expect(within(bands[1] as HTMLElement).getByText("1 piece")).toBeTruthy();
  });

  it("an empty family gets no band at all — never a header over nothing", () => {
    const { container } = renderCatalog();
    const chips = [...container.querySelectorAll(".cat-section__chip")].map((n) => n.textContent);
    expect(chips).not.toContain("Sofas");
  });

  it("one rail = one band = no header (the rail and the toolbar already name it)", () => {
    const { container } = renderCatalog();
    fireEvent.click(screen.getByTestId("pos-rail-mattress"));
    expect(container.querySelectorAll(".cat-section__chip")).toHaveLength(0);
    expect(screen.getByTestId("pos-card-AKKA")).toBeTruthy();
  });

  it("a search that narrows to one family drops the headers with it", async () => {
    const { container } = renderCatalog();
    fireEvent.change(screen.getByLabelText("Search catalog"), { target: { value: "akka" } });
    // The search box is debounced (180ms) — wait for the wall to catch up.
    await waitFor(() => expect(screen.queryByTestId("pos-card-PILLOW")).toBeNull());
    expect(container.querySelectorAll(".cat-section__chip")).toHaveLength(0);
    expect(screen.getByTestId("pos-card-AKKA")).toBeTruthy();
  });
});

describe("CatalogStep — the Rental rail", () => {
  it("shows its offers instead of 'No pieces match.'", () => {
    renderCatalog(RENTAL_PLANS);
    fireEvent.click(screen.getByTestId("pos-rail-rental"));
    expect(screen.queryByText("No pieces match.")).toBeNull();
    expect(screen.getByTestId("pos-card-AKKA")).toBeTruthy();
  });

  it("counts its cards in the toolbar — rentals are pieces too", () => {
    renderCatalog(RENTAL_PLANS);
    fireEvent.click(screen.getByTestId("pos-rail-rental"));
    expect(screen.getByText("1 piece")).toBeTruthy();
  });

  it("still never mixes into All open — one product, one card on the wall", () => {
    const { container } = renderCatalog(RENTAL_PLANS);
    const chips = [...container.querySelectorAll(".cat-section__chip")].map((n) => n.textContent);
    expect(chips).not.toContain("Rental");
    expect(screen.getByText("4 pieces")).toBeTruthy();
  });

  it("a genuinely empty wall still says so", async () => {
    renderCatalog();
    fireEvent.change(screen.getByLabelText("Search catalog"), { target: { value: "zzzz" } });
    expect(await screen.findByText("No pieces match.")).toBeTruthy();
  });
});
