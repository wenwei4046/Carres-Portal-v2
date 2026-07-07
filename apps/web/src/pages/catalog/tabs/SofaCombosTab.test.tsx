/**
 * SofaCombosTab — the renamed "Combos" tab (Overall Combo removed 2026-07-06).
 * A thin host: sofa-model picker + the SofaCombosPanel (card grid). The panel's
 * own behaviour is covered in SofaCombosPanel.test.tsx; here we just prove the
 * tab wires the picker + panel + principal gate + the sofa-model empty state.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse, SofaComboDto } from "@carres/shared";
import SofaCombosTab from "./SofaCombosTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The hosted SofaCombosPanel reads these three hooks.
vi.mock("@/lib/queries", () => ({
  useCreateSofaCombo: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useUpdateSofaCombo: () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue({}), isPending: false }),
  useDeleteSofaCombo: () => ({ mutate: vi.fn(), isPending: false }),
}));

const SOFA_MODEL = "11111111-1111-1111-1111-111111111111";
const COMP = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

function makeCatalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: SOFA_MODEL, category: "sofa", modelKey: "sofa-x", name: "Sofa X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    sofaCompartments: [
      { id: COMP, code: "2A(LHF)", description: "2-seat left", seatCount: 2, armConfig: null, iconUrl: null, defaultPrice: 1000, sortOrder: 0, active: true },
    ],
    modelSofaCompartments: [
      { modelId: SOFA_MODEL, compartmentId: COMP, priceOverride: null, sortOrder: 0 },
    ],
    sofaCombos: [],
    ...over,
  };
}

const sampleCombo: SofaComboDto = {
  id: "sc-1",
  modelId: SOFA_MODEL,
  slots: [["2A(LHF)"]],
  tier: null,
  pricesByHeight: { "28": 2000 },
  costByHeight: null,
  pwpPricesByHeight: null,
  label: "Corner Set",
  effectiveFrom: "2026-06-21",
  active: true,
  discontinuedAt: null,
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

describe("SofaCombosTab", () => {
  it("renders the Sofa combos title + model picker", () => {
    render(wrap(<SofaCombosTab catalog={makeCatalog()} isPrincipal={true} />));
    expect(screen.getByText("Sofa combos")).toBeInTheDocument();
    expect(screen.getByTestId("sofa-combos-model")).toBeInTheDocument();
  });

  it("principal: a model group hosts the New combo control", () => {
    render(
      wrap(<SofaCombosTab catalog={makeCatalog({ sofaCombos: [sampleCombo] })} isPrincipal={true} />),
    );
    expect(screen.getByTestId("sofa-combo-add")).toBeInTheDocument();
  });

  it("non-principal: read-only (no New control) even when a model has combos", () => {
    render(
      wrap(<SofaCombosTab catalog={makeCatalog({ sofaCombos: [sampleCombo] })} isPrincipal={false} />),
    );
    expect(screen.getByText("Corner Set")).toBeInTheDocument();
    expect(screen.queryByTestId("sofa-combo-add")).not.toBeInTheDocument();
  });

  it("groups combos under a per-model heading and renders each as a card", () => {
    render(
      wrap(<SofaCombosTab catalog={makeCatalog({ sofaCombos: [sampleCombo] })} isPrincipal={true} />),
    );
    // per-model heading carries the pricing-combo count.
    expect(screen.getByText(/\(1 combo\)/)).toBeInTheDocument();
    expect(screen.getByTestId("sofa-combos-grid")).toBeInTheDocument();
    expect(screen.getByTestId("sofa-combo-row-sc-1")).toBeInTheDocument();
    expect(screen.getByText("Corner Set")).toBeInTheDocument();
  });

  it("a Quick Pick preset is not shown as a pricing combo", () => {
    const qp = { ...sampleCombo, id: "sc-qp", isQuickPick: true };
    render(wrap(<SofaCombosTab catalog={makeCatalog({ sofaCombos: [qp] })} isPrincipal={true} />));
    expect(screen.queryByTestId("sofa-combo-row-sc-qp")).not.toBeInTheDocument();
    // no pricing combos → the "pick a model" empty state.
    expect(screen.getByText(/No sofa combos yet/i)).toBeInTheDocument();
  });

  it("shows a friendly empty state when there are no sofa models", () => {
    render(wrap(<SofaCombosTab catalog={makeCatalog({ models: [] })} isPrincipal={true} />));
    expect(screen.getByText(/No sofa models yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("sofa-combos-model")).not.toBeInTheDocument();
  });
});
