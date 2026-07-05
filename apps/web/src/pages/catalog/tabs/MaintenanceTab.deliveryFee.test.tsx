/**
 * MaintenanceTab — Delivery TRIP fee (0184) tests.
 *
 * Covers Phase 6 web requirements:
 *  - The Delivery trip fee config section renders + a principal can edit + save
 *    (→ useUpdateDeliveryFeeConfig payload).
 *  - The Special delivery rules section + RuleTargetPicker: a principal can add a
 *    rule, tick a model target + set a fee, save (→ useCreateSpecialDeliveryFeeRule
 *    payload carries a finalized RuleTarget[]).
 *  - Non-principal sees a read-only veneer (no Save / no Add affordances).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CatalogResponse } from "@carres/shared";
import MaintenanceTab from "./MaintenanceTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// ---------------------------------------------------------------------------
// Mutation stubs
// ---------------------------------------------------------------------------
const mockUpdateDeliveryConfig = vi.fn();
const mockCreateRule = vi.fn().mockResolvedValue({});
const mockUpdateRule = vi.fn().mockResolvedValue({});
const mockDeleteRule = vi.fn();

vi.mock("@/lib/queries", () => ({
  usePatchFloorConfig:        () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFabricTierConfig:  () => ({ mutate: vi.fn(), isPending: false }),
  useCreateSofaCompartment:   () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useUpdateSofaCompartment:   () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSofaCompartment:   () => ({ mutate: vi.fn(), isPending: false }),
  // 0201 — option pool hooks (PoolPanel children)
  useBatchSaveOptionPool:     () => ({ mutate: vi.fn(), isPending: false }),
  useCatalogConfigHistory:    () => ({ data: undefined, isLoading: false }),
  // 0184 — delivery trip fee hooks under test
  useUpdateDeliveryFeeConfig:      () => ({ mutate: mockUpdateDeliveryConfig, isPending: false }),
  useCreateSpecialDeliveryFeeRule: () => ({ mutate: vi.fn(), mutateAsync: mockCreateRule, isPending: false }),
  useUpdateSpecialDeliveryFeeRule: () => ({ mutate: vi.fn(), mutateAsync: mockUpdateRule, isPending: false }),
  useDeleteSpecialDeliveryFeeRule: () => ({ mutate: mockDeleteRule, isPending: false }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const MODEL_ID = "00000000-0000-0000-0000-0000000000a1";

function makeCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      {
        id: MODEL_ID,
        category: "mattress",
        modelKey: "cloud",
        name: "Carres Cloud",
        blurb: null,
        colors: null,
        gaps: null,
        sofaMode: null,
        allowedOptions: { sizes: ["Queen", "King"] },
      },
    ],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    fabricTierConfig: { sofaTier2Delta: 0, sofaTier3Delta: 0 },
    modelFabricTierOverrides: [],
    deliveryFeeConfig: {
      baseFee: 0,
      crossCategoryFee: 0,
      chargedCategories: ["sofa", "mattress", "bedframe"],
      mattressBedframeLeadDays: 14,
      sofaLeadDays: 21,
    },
    specialDeliveryFeeRules: [],
    ...overrides,
  };
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

/** 0201 — the tab is sidebar-driven now: delivery config lives behind the
 *  "Delivery Fees" nav item, so every test opens that panel first. */
function renderDeliveryPanel(catalog: CatalogResponse, isPrincipal: boolean) {
  render(wrap(<MaintenanceTab catalog={catalog} isPrincipal={isPrincipal} />));
  fireEvent.click(screen.getByTestId("maint-nav-delivery"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateRule.mockResolvedValue({});
  mockUpdateRule.mockResolvedValue({});
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Delivery trip fee config", () => {
  it("renders the config section with the seeded values", () => {
    renderDeliveryPanel(makeCatalog(), true);
    expect(screen.getByText("Delivery trip fee")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-base-fee")).toHaveValue(0);
    expect(screen.getByTestId("delivery-cross-fee")).toHaveValue(0);
    // charged-category chips
    expect(screen.getByTestId("delivery-cat-sofa")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("delivery-cat-service")).toHaveAttribute("aria-pressed", "false");
  });

  it("a principal edits base + cross fee and saves the patch payload", () => {
    renderDeliveryPanel(makeCatalog(), true);
    fireEvent.change(screen.getByTestId("delivery-base-fee"), { target: { value: "80" } });
    fireEvent.change(screen.getByTestId("delivery-cross-fee"), { target: { value: "120" } });
    fireEvent.click(screen.getByTestId("delivery-fee-save"));
    expect(mockUpdateDeliveryConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateDeliveryConfig.mock.calls[0][0]).toMatchObject({
      baseFee: 80,
      crossCategoryFee: 120,
      chargedCategories: ["sofa", "mattress", "bedframe"],
      mattressBedframeLeadDays: 14,
      sofaLeadDays: 21,
    });
  });

  it("toggling a charged category is reflected in the saved payload", () => {
    renderDeliveryPanel(makeCatalog(), true);
    // turn ON service, turn OFF sofa
    fireEvent.click(screen.getByTestId("delivery-cat-service"));
    fireEvent.click(screen.getByTestId("delivery-cat-sofa"));
    // dirty now (base unchanged) — save
    fireEvent.click(screen.getByTestId("delivery-fee-save"));
    const payload = mockUpdateDeliveryConfig.mock.calls[0][0];
    expect(payload.chargedCategories).toContain("service");
    expect(payload.chargedCategories).not.toContain("sofa");
  });

  it("non-principal sees read-only config (disabled inputs, no Save)", () => {
    renderDeliveryPanel(makeCatalog(), false);
    expect(screen.getByTestId("delivery-base-fee")).toBeDisabled();
    expect(screen.queryByTestId("delivery-fee-save")).not.toBeInTheDocument();
  });
});

describe("Special delivery rules + RuleTargetPicker", () => {
  it("a principal adds a rule with a model target and a fee", async () => {
    renderDeliveryPanel(makeCatalog(), true);
    // open the add form
    fireEvent.click(screen.getByRole("button", { name: "+ Add rule" }));

    // tick the model in the RuleTargetPicker
    const modelRow = screen.getByTestId(`rtp-model-${MODEL_ID}`);
    fireEvent.click(within(modelRow).getByRole("checkbox"));

    // set a standalone fee
    fireEvent.change(screen.getByTestId("rule-standalone-fee"), { target: { value: "150" } });
    fireEvent.change(screen.getByTestId("rule-label"), { target: { value: "Bulky transport" } });

    fireEvent.click(screen.getByTestId("rule-save"));

    await waitFor(() => expect(mockCreateRule).toHaveBeenCalledTimes(1));
    const payload = mockCreateRule.mock.calls[0][0];
    expect(payload).toMatchObject({
      standaloneFee: 150,
      crossCategoryFollowupFee: 0,
      label: "Bulky transport",
      active: true,
    });
    expect(payload.target).toEqual([{ modelId: MODEL_ID, scope: "model" }]);
  });

  it("Save stays disabled until at least one target is ticked", () => {
    renderDeliveryPanel(makeCatalog(), true);
    fireEvent.click(screen.getByRole("button", { name: "+ Add rule" }));
    fireEvent.change(screen.getByTestId("rule-standalone-fee"), { target: { value: "150" } });
    expect(screen.getByTestId("rule-save")).toBeDisabled();
  });

  it("lists an existing rule and deletes it", () => {
    const catalog = makeCatalog({
      specialDeliveryFeeRules: [
        {
          id: "rule-1",
          target: [{ modelId: MODEL_ID, scope: "model" }],
          standaloneFee: 99,
          crossCategoryFollowupFee: 30,
          label: "Heavy item",
          active: true,
          sortOrder: 0,
        },
      ],
    });
    // confirm() must return true for the delete to fire
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDeliveryPanel(catalog, true);
    expect(screen.getByText("Heavy item")).toBeInTheDocument();
    const row = screen.getByTestId("delivery-rule-row-rule-1");
    fireEvent.click(within(row).getByRole("button", { name: "Delete" }));
    expect(mockDeleteRule).toHaveBeenCalledTimes(1);
    expect(mockDeleteRule.mock.calls[0][0]).toBe("rule-1");
  });

  it("non-principal sees no Add rule button and no row actions", () => {
    const catalog = makeCatalog({
      specialDeliveryFeeRules: [
        {
          id: "rule-1",
          target: [{ modelId: MODEL_ID, scope: "model" }],
          standaloneFee: 99,
          crossCategoryFollowupFee: 30,
          label: "Heavy item",
          active: true,
          sortOrder: 0,
        },
      ],
    });
    renderDeliveryPanel(catalog, false);
    expect(screen.queryByRole("button", { name: "+ Add rule" })).not.toBeInTheDocument();
    const row = screen.getByTestId("delivery-rule-row-rule-1");
    expect(within(row).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
