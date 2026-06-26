/**
 * PromoTab — 2990s Products parity Phase 7 (Default Free Gifts + Free Item
 * Campaigns, migration 0185). Mirrors the CombosTab test style with mocked
 * mutation hooks.
 *
 * Covers:
 *  - Principal vs non-principal gating (Add controls present / absent).
 *  - Default gift: pick a model → pick an accessory SKU + qty + Save calls
 *    useUpsertModelFreeGifts with { modelId, input: { gifts } }.
 *  - Existing gift config renders + Edit opens the inline editor.
 *  - Free item campaign: fill name + maxFreeQty + tick a model in the
 *    RuleTargetPicker + Save calls useCreateFreeItemCampaign with the payload.
 *  - Campaign Edit pre-fills + Save calls useUpdateFreeItemCampaign; Delete
 *    confirms then calls useDeleteFreeItemCampaign.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import PromoTab from "./PromoTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockUpsertGifts = vi.fn().mockResolvedValue({ modelDefaultFreeGifts: {} });
const mockDeleteGifts = vi.fn().mockResolvedValue({ ok: true });
const mockCreateCampaign = vi.fn().mockResolvedValue({ freeItemCampaign: {} });
const mockUpdateCampaign = vi.fn().mockResolvedValue({ freeItemCampaign: {} });
const mockDeleteCampaign = vi.fn();

vi.mock("@/lib/queries", () => ({
  useUpsertModelFreeGifts: () => ({ mutate: vi.fn(), mutateAsync: mockUpsertGifts, isPending: false }),
  useDeleteModelFreeGifts: () => ({ mutate: vi.fn(), mutateAsync: mockDeleteGifts, isPending: false }),
  useCreateFreeItemCampaign: () => ({ mutate: vi.fn(), mutateAsync: mockCreateCampaign, isPending: false }),
  useUpdateFreeItemCampaign: () => ({ mutate: vi.fn(), mutateAsync: mockUpdateCampaign, isPending: false }),
  useDeleteFreeItemCampaign: () => ({ mutate: mockDeleteCampaign, isPending: false }),
}));

const MATTRESS_MODEL = "22222222-2222-2222-2222-222222222222";
const ACCESSORY_MODEL = "44444444-4444-4444-4444-444444444444";

function sku(over: Partial<CatalogResponse["skus"][number]> & { sku: string; modelId: string }) {
  return {
    id: `id-${over.sku}`,
    variant: "S",
    variantKind: "size" as const,
    price: 1000,
    cost: null,
    supplierId: null,
    posActive: true,
    description: `${over.sku} desc`,
    ...over,
  };
}

function makeCatalog(overrides?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: MATTRESS_MODEL, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: ACCESSORY_MODEL, category: "accessory", modelKey: "acc-x", name: "Acc X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      sku({ sku: "MATT-A", modelId: MATTRESS_MODEL, price: 1200 }),
      sku({ sku: "PILLOW", modelId: ACCESSORY_MODEL, price: 100, description: "Memory Pillow" }),
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    combos: [],
    sofaCombos: [],
    sofaCompartments: [],
    modelSofaCompartments: [],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    ...overrides,
  };
}

function wrap(ui: React.ReactNode) {
  // No QueryClient needed — every hook is mocked.
  return <>{ui}</>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpsertGifts.mockResolvedValue({ modelDefaultFreeGifts: {} });
  mockCreateCampaign.mockResolvedValue({ freeItemCampaign: {} });
  mockUpdateCampaign.mockResolvedValue({ freeItemCampaign: {} });
});

// ---------------------------------------------------------------------------
// Principal-gating
// ---------------------------------------------------------------------------
describe("PromoTab — gating", () => {
  it("principal: shows the gift model picker + the New campaign control", () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    expect(screen.getByTestId("promo-gift-model-select")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-add")).toBeInTheDocument();
  });

  it("non-principal: no gift picker, no campaign add; existing config read-only", () => {
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            modelDefaultFreeGifts: [{ modelId: MATTRESS_MODEL, gifts: [{ giftSku: "PILLOW", qty: 1, label: "Free pillow" }] }],
            freeItemCampaigns: [
              { id: "camp-1", name: "Pillow promo", active: true, maxFreeQty: 1, eligible: [{ modelId: MATTRESS_MODEL, scope: "model" }] },
            ],
          })}
          isPrincipal={false}
        />,
      ),
    );
    expect(screen.queryByTestId("promo-gift-model-select")).not.toBeInTheDocument();
    expect(screen.queryByTestId("campaign-add")).not.toBeInTheDocument();
    // Lists still render
    expect(screen.getByTestId(`gift-model-card-${MATTRESS_MODEL}`)).toBeInTheDocument();
    expect(screen.getByText("Pillow promo")).toBeInTheDocument();
    // ...but no edit controls
    expect(screen.queryByTestId(`gift-edit-${MATTRESS_MODEL}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("campaign-edit-camp-1")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Default free gifts
// ---------------------------------------------------------------------------
describe("PromoTab — default free gifts", () => {
  it("add a gift to a model → Save calls useUpsertModelFreeGifts with the payload", async () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));

    // pick the mattress model + Configure
    fireEvent.change(screen.getByTestId("promo-gift-model-select"), { target: { value: MATTRESS_MODEL } });
    fireEvent.click(screen.getByTestId("promo-gift-add"));

    // pick the accessory gift + qty 2 + label
    fireEvent.change(screen.getByTestId("gift-row-sku-0"), { target: { value: "PILLOW" } });
    fireEvent.change(screen.getByTestId("gift-row-qty-0"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("gift-row-label-0"), { target: { value: "Free pillow" } });

    fireEvent.click(screen.getByTestId("gift-save"));

    await waitFor(() => expect(mockUpsertGifts).toHaveBeenCalledOnce());
    const arg = mockUpsertGifts.mock.calls[0][0];
    expect(arg.modelId).toBe(MATTRESS_MODEL);
    expect(arg.input.gifts).toEqual([{ giftSku: "PILLOW", qty: 2, label: "Free pillow" }]);
  });

  it("Save is disabled until at least one row has a gift SKU", () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.change(screen.getByTestId("promo-gift-model-select"), { target: { value: MATTRESS_MODEL } });
    fireEvent.click(screen.getByTestId("promo-gift-add"));
    expect(screen.getByTestId("gift-save")).toBeDisabled();
  });

  it("existing config renders + Edit opens the inline editor pre-filled", () => {
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            modelDefaultFreeGifts: [{ modelId: MATTRESS_MODEL, gifts: [{ giftSku: "PILLOW", qty: 1, label: "Free pillow" }] }],
          })}
          isPrincipal={true}
        />,
      ),
    );
    const card = screen.getByTestId(`gift-model-card-${MATTRESS_MODEL}`);
    expect(within(card).getByText(/Matt X/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`gift-edit-${MATTRESS_MODEL}`));
    // editor mounts with the pre-filled gift sku
    expect((screen.getByTestId("gift-row-sku-0") as HTMLSelectElement).value).toBe("PILLOW");
  });

  it("a size condition rides into the saved payload", async () => {
    // give the model an offered size so the variant refinement renders chips
    const catalog = makeCatalog();
    catalog.models = catalog.models.map((m) =>
      m.id === MATTRESS_MODEL ? { ...m, allowedOptions: { sizes: ["King", "Queen"] } } : m,
    );
    render(wrap(<PromoTab catalog={catalog} isPrincipal={true} />));
    fireEvent.change(screen.getByTestId("promo-gift-model-select"), { target: { value: MATTRESS_MODEL } });
    fireEvent.click(screen.getByTestId("promo-gift-add"));
    fireEvent.change(screen.getByTestId("gift-row-sku-0"), { target: { value: "PILLOW" } });

    // turn on the condition + tick King
    fireEvent.click(screen.getByTestId("gift-row-cond-toggle-0"));
    fireEvent.click(screen.getByText("King"));

    fireEvent.click(screen.getByTestId("gift-save"));
    await waitFor(() => expect(mockUpsertGifts).toHaveBeenCalledOnce());
    const gifts = mockUpsertGifts.mock.calls[0][0].input.gifts;
    expect(gifts[0].condition).toEqual({ scope: "variant", sizeCodes: ["KING"] });
  });
});

// ---------------------------------------------------------------------------
// Free item campaigns
// ---------------------------------------------------------------------------
describe("PromoTab — free item campaigns", () => {
  it("create: name + maxFreeQty + tick a model → Save calls useCreateFreeItemCampaign", async () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("campaign-add"));

    fireEvent.change(screen.getByTestId("campaign-name"), { target: { value: "Pillow promo" } });
    fireEvent.change(screen.getByTestId("campaign-maxqty"), { target: { value: "2" } });
    fireEvent.click(screen.getByTestId("campaign-active"));

    // tick the mattress model in the RuleTargetPicker (its checkbox)
    const modelRow = screen.getByTestId(`rtp-model-${MATTRESS_MODEL}`);
    fireEvent.click(within(modelRow).getByRole("checkbox"));

    fireEvent.click(screen.getByTestId("campaign-save"));

    await waitFor(() => expect(mockCreateCampaign).toHaveBeenCalledOnce());
    const arg = mockCreateCampaign.mock.calls[0][0];
    expect(arg.name).toBe("Pillow promo");
    expect(arg.active).toBe(true);
    expect(arg.maxFreeQty).toBe(2);
    expect(arg.eligible).toEqual([{ modelId: MATTRESS_MODEL, scope: "model" }]);
  });

  it("Save disabled until name + ≥1 eligible target", () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("campaign-add"));
    expect(screen.getByTestId("campaign-save")).toBeDisabled();
    fireEvent.change(screen.getByTestId("campaign-name"), { target: { value: "Promo" } });
    // still no eligible target → disabled
    expect(screen.getByTestId("campaign-save")).toBeDisabled();
  });

  it("Edit pre-fills + Save calls useUpdateFreeItemCampaign with the patch", async () => {
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            freeItemCampaigns: [
              { id: "camp-1", name: "Pillow promo", active: false, maxFreeQty: 1, eligible: [{ modelId: MATTRESS_MODEL, scope: "model" }] },
            ],
          })}
          isPrincipal={true}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("campaign-edit-camp-1"));
    expect((screen.getByTestId("campaign-name") as HTMLInputElement).value).toBe("Pillow promo");
    fireEvent.click(screen.getByTestId("campaign-active")); // flip ON
    fireEvent.click(screen.getByTestId("campaign-save"));

    await waitFor(() => expect(mockUpdateCampaign).toHaveBeenCalledOnce());
    const arg = mockUpdateCampaign.mock.calls[0][0];
    expect(arg.id).toBe("camp-1");
    expect(arg.patch.active).toBe(true);
  });

  it("Delete confirms then calls useDeleteFreeItemCampaign", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            freeItemCampaigns: [
              { id: "camp-1", name: "Pillow promo", active: true, maxFreeQty: 1, eligible: [{ modelId: MATTRESS_MODEL, scope: "model" }] },
            ],
          })}
          isPrincipal={true}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("campaign-delete-camp-1"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeleteCampaign).toHaveBeenCalledWith("camp-1", expect.anything());
    confirmSpy.mockRestore();
  });
});
