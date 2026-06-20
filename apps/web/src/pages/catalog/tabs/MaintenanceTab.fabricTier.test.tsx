/**
 * MaintenanceTab — FabricTierDeltasCard tests.
 *
 * Covers Task-5 requirements:
 *  - Global tier delta card renders (P2 + P3 inputs + summary).
 *  - Principal can edit and save global deltas.
 *  - Non-principal sees read-only disabled inputs (no Save button).
 *  - Summary text reflects the catalog config values.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse } from "@carres/shared";
import MaintenanceTab from "./MaintenanceTab";

// ---------------------------------------------------------------------------
// Toast mock
// ---------------------------------------------------------------------------
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Mutation stubs
// ---------------------------------------------------------------------------
const mockTierConfigMutate = vi.fn();
const mockFloorConfigMutate = vi.fn();
const mockAddonMutate = vi.fn();

vi.mock("@/lib/queries", () => ({
  usePatchFloorConfig:       () => ({ mutate: mockFloorConfigMutate, isPending: false }),
  useUpdateFabricTierConfig: () => ({ mutate: mockTierConfigMutate, isPending: false }),
  useCreateAddon:            () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  usePatchAddon:             () => ({ mutate: mockAddonMutate, mutateAsync: vi.fn(), isPending: false }),
  useDeleteAddon:            () => ({ mutate: vi.fn(), isPending: false }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
function makeCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    fabricTierConfig: { sofaTier2Delta: 100, sofaTier3Delta: 200 },
    modelFabricTierOverrides: [],
    ...overrides,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockTierConfigMutate.mockReset();
  mockFloorConfigMutate.mockReset();
  vi.clearAllMocks();
});

describe("FabricTierDeltasCard — render", () => {
  it("renders the Fabric tier deltas heading", () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={true} />));
    expect(screen.getByText("Fabric tier deltas")).toBeInTheDocument();
  });

  it("shows P2 and P3 numeric inputs", () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={true} />));
    expect(screen.getByTestId("global-tier2-delta")).toBeInTheDocument();
    expect(screen.getByTestId("global-tier3-delta")).toBeInTheDocument();
  });

  it("renders summary with config values", () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={true} />));
    const summary = screen.getByTestId("fabric-tier-summary");
    expect(summary.textContent).toContain("100.00");
    expect(summary.textContent).toContain("200.00");
  });

  it("summary falls back to 0.00 when fabricTierConfig is absent", () => {
    render(
      wrap(
        <MaintenanceTab
          catalog={makeCatalog({ fabricTierConfig: undefined })}
          isPrincipal={true}
        />,
      ),
    );
    const summary = screen.getByTestId("fabric-tier-summary");
    expect(summary.textContent).toContain("0.00");
  });
});

describe("FabricTierDeltasCard — principal-gating", () => {
  it("principal: inputs are enabled + Save button present", () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={true} />));
    const t2 = screen.getByTestId("global-tier2-delta") as HTMLInputElement;
    const t3 = screen.getByTestId("global-tier3-delta") as HTMLInputElement;
    expect(t2).not.toBeDisabled();
    expect(t3).not.toBeDisabled();
    expect(screen.getByTestId("global-tier-save")).toBeInTheDocument();
  });

  it("non-principal: inputs are disabled, no Save button", () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={false} />));
    const t2 = screen.getByTestId("global-tier2-delta") as HTMLInputElement;
    const t3 = screen.getByTestId("global-tier3-delta") as HTMLInputElement;
    expect(t2).toBeDisabled();
    expect(t3).toBeDisabled();
    expect(screen.queryByTestId("global-tier-save")).not.toBeInTheDocument();
  });

  it("principal: changing inputs and saving calls mutate with correct values", async () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={true} />));
    const t2 = screen.getByTestId("global-tier2-delta");
    const t3 = screen.getByTestId("global-tier3-delta");
    fireEvent.change(t2, { target: { value: "120" } });
    fireEvent.change(t3, { target: { value: "250" } });
    fireEvent.click(screen.getByTestId("global-tier-save"));
    await waitFor(() => expect(mockTierConfigMutate).toHaveBeenCalledOnce());
    const call = mockTierConfigMutate.mock.calls[0][0];
    expect(call.sofaTier2Delta).toBe(120);
    expect(call.sofaTier3Delta).toBe(250);
  });

  it("principal: Save is disabled when values are unchanged (not dirty)", () => {
    render(wrap(<MaintenanceTab catalog={makeCatalog()} isPrincipal={true} />));
    const saveBtn = screen.getByTestId("global-tier-save") as HTMLButtonElement;
    // No changes made — dirty=false → disabled
    expect(saveBtn).toBeDisabled();
  });
});
