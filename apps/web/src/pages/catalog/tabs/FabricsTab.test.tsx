/**
 * FabricsTab (0202) — the 2990s "Products › Fabrics" port.
 *
 * Covers:
 *  - view table renders code / series / description / supplier / tier pills
 *  - "N of M records" + search filter
 *  - Edit gated to principal; draft tier pill click-cycles; Save batch payload
 *  - Fabric Pricing sidebar item renders the shared FabricTierDeltasCard
 *
 * Mocking strategy mirrors SkuMasterTab.test: @/lib/queries mocked at module
 * level (FabricsTab needs 2 hooks; the shared FabricTierDeltasCard needs 1).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogFabricDto, CatalogResponse } from "@carres/shared";
import FabricsTab from "./FabricsTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockBatchSaveMutate = vi.fn();
const mockTierConfigMutate = vi.fn();
const mockCompartmentMutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  useBatchSaveCatalogFabrics: () => ({
    mutate: mockBatchSaveMutate,
    isPending: false,
  }),
  // Per-model tier override (moved here from Modular, Loo 2026-07-06).
  useUpsertModelFabricTierOverride: () => ({ mutate: vi.fn(), isPending: false }),
  useCatalogFabricsHistory: () => ({
    data: {
      history: [
        {
          id: "h1",
          entries: [],
          effectiveFrom: "2026-06-28",
          notes: null,
          createdAt: "2026-06-28T00:00:00Z",
        },
      ],
    },
    isLoading: false,
  }),
  useUpdateFabricTierConfig: () => ({
    mutate: mockTierConfigMutate,
    isPending: false,
  }),
  // Per-compartment fabric-tier special (0205) — reuses the compartment PATCH.
  useUpdateSofaCompartment: () => ({ mutate: mockCompartmentMutate, isPending: false }),
}));

const FABRIC_BF: CatalogFabricDto = {
  id: "f1",
  fabricCode: "BF-01",
  series: null,
  description: "BF-01",
  supplierCode: "PC151-01",
  sofaTier: "PRICE_2",
  bedframeTier: "PRICE_2",
  active: true,
  sortOrder: 1,
};

const FABRIC_CG: CatalogFabricDto = {
  id: "f2",
  fabricCode: "CG-001",
  series: "KOONA VELVET H2O",
  description: "CG-001 Pearl",
  supplierCode: "KN390-1",
  sofaTier: "PRICE_1",
  bedframeTier: "PRICE_3",
  active: true,
  sortOrder: 2,
};

function makeCatalog(
  fabrics: CatalogFabricDto[],
  sofaCompartments: CatalogResponse["sofaCompartments"] = [],
): CatalogResponse {
  return {
    models: [],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    fabricTierConfig: { sofaTier2Delta: 100, sofaTier3Delta: 250 },
    fabrics,
    sofaCompartments,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  mockBatchSaveMutate.mockReset();
  mockCompartmentMutate.mockReset();
});

describe("FabricsTab — view table", () => {
  it("renders code / series / description / supplier / tier pills + record count", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF, FABRIC_CG])} isPrincipal={false} />));
    expect(screen.getByTestId("fabric-row-BF-01")).toBeInTheDocument();
    expect(screen.getByText("PC151-01")).toBeInTheDocument();
    expect(screen.getByText("KOONA VELVET H2O")).toBeInTheDocument();
    expect(screen.getByText("CG-001 Pearl")).toBeInTheDocument();
    // tier pills: BF sofa Price 2, CG sofa Price 1 + bedframe Price 3
    expect(screen.getByTestId("fabric-sofa-tier-BF-01").textContent).toBe("Price 2");
    expect(screen.getByTestId("fabric-sofa-tier-CG-001").textContent).toBe("Price 1");
    expect(screen.getByTestId("fabric-bed-tier-CG-001").textContent).toContain("Price 3");
    expect(screen.getByText("2 of 2 records")).toBeInTheDocument();
    // Effective-from line fed by the newest history snapshot
    expect(screen.getByTestId("fabrics-effective").textContent).toContain("2026-06-28");
  });

  it("search filters by code / description / series / supplier", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF, FABRIC_CG])} isPrincipal={false} />));
    fireEvent.change(screen.getByTestId("fabrics-search"), { target: { value: "koona" } });
    expect(screen.queryByTestId("fabric-row-BF-01")).not.toBeInTheDocument();
    expect(screen.getByTestId("fabric-row-CG-001")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 records")).toBeInTheDocument();
  });

  it("Edit is principal-only", () => {
    const { unmount } = render(
      wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF])} isPrincipal={false} />),
    );
    expect(screen.queryByTestId("fabrics-edit")).not.toBeInTheDocument();
    unmount();
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF])} isPrincipal={true} />));
    expect(screen.getByTestId("fabrics-edit")).toBeInTheDocument();
  });
});

describe("FabricsTab — view-mode tier click-cycle (2990s behaviour)", () => {
  it("principal clicks a tier pill in the table → immediate batch save with the cycled tier", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF, FABRIC_CG])} isPrincipal={true} />));
    // BF-01 sofa tier is Price 2 → one click cycles to Price 3, saved at once
    fireEvent.click(screen.getByRole("button", { name: /BF-01 sofa tier — Price 2/ }));
    expect(mockBatchSaveMutate).toHaveBeenCalledTimes(1);
    const payload = mockBatchSaveMutate.mock.calls[0][0];
    expect(payload.notes).toBe("BF-01 Sofa tier → Price 3");
    expect(payload.entries).toHaveLength(2);
    expect(payload.entries[0]).toMatchObject({ fabricCode: "BF-01", sofaTier: "PRICE_3", bedframeTier: "PRICE_2" });
    // the other fabric rides along unchanged
    expect(payload.entries[1]).toMatchObject({ fabricCode: "CG-001", sofaTier: "PRICE_1", bedframeTier: "PRICE_3" });
  });

  it("bedframe pill cycles independently; Price 1 → Price 2", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_CG])} isPrincipal={true} />));
    fireEvent.click(screen.getByRole("button", { name: /CG-001 sofa tier — Price 1/ }));
    expect(mockBatchSaveMutate.mock.calls[0][0].entries[0]).toMatchObject({
      fabricCode: "CG-001",
      sofaTier: "PRICE_2",
      bedframeTier: "PRICE_3",
    });
  });

  it("non-principal sees static pills — no tier buttons", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF])} isPrincipal={false} />));
    expect(screen.queryByRole("button", { name: /BF-01 sofa tier/ })).not.toBeInTheDocument();
    expect(screen.getByTestId("fabric-sofa-tier-BF-01").textContent).toBe("Price 2");
  });
});

describe("FabricsTab — edit draft", () => {
  it("tier pill click-cycles and Save sends the batch payload", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF])} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("fabrics-edit"));
    // cycle the sofa tier: Price 2 → Price 3
    fireEvent.click(screen.getByRole("button", { name: /row 1 sofa tier — Price 2/ }));
    expect(
      screen.getByRole("button", { name: /row 1 sofa tier — Price 3/ }),
    ).toBeInTheDocument();
    // edit the series (the "+ Add series" input)
    fireEvent.change(screen.getByLabelText("row 1 series"), {
      target: { value: "PAW PRINT" },
    });
    fireEvent.click(screen.getByTestId("fabrics-save"));
    expect(mockBatchSaveMutate).toHaveBeenCalledTimes(1);
    expect(mockBatchSaveMutate.mock.calls[0][0]).toEqual({
      entries: [
        {
          fabricCode: "BF-01",
          series: "PAW PRINT",
          description: "BF-01",
          supplierCode: "PC151-01",
          sofaTier: "PRICE_3",
          bedframeTier: "PRICE_2",
          active: true,
        },
      ],
    });
  });

  it("duplicate fabric codes block Save", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF, FABRIC_CG])} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("fabrics-edit"));
    fireEvent.change(screen.getByLabelText("row 2 fabric code"), {
      target: { value: "BF-01" },
    });
    expect(screen.getByTestId("fabrics-save")).toBeDisabled();
    fireEvent.click(screen.getByTestId("fabrics-save"));
    expect(mockBatchSaveMutate).not.toHaveBeenCalled();
  });
});

describe("FabricsTab — Fabric Pricing sidebar", () => {
  it("renders the shared FabricTierDeltasCard", () => {
    render(wrap(<FabricsTab catalog={makeCatalog([FABRIC_BF])} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("maint-nav-pricing"));
    expect(screen.getByTestId("fabric-tier-summary")).toBeInTheDocument();
  });
});
