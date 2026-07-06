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
const mockCreatePwp = vi.fn().mockResolvedValue({ pwpRule: {} });
const mockUpdatePwp = vi.fn().mockResolvedValue({ pwpRule: {} });
const mockDeletePwp = vi.fn();

vi.mock("@/lib/queries", () => ({
  useUpsertModelFreeGifts: () => ({ mutate: vi.fn(), mutateAsync: mockUpsertGifts, isPending: false }),
  useDeleteModelFreeGifts: () => ({ mutate: vi.fn(), mutateAsync: mockDeleteGifts, isPending: false }),
  useCreateFreeItemCampaign: () => ({ mutate: vi.fn(), mutateAsync: mockCreateCampaign, isPending: false }),
  useUpdateFreeItemCampaign: () => ({ mutate: vi.fn(), mutateAsync: mockUpdateCampaign, isPending: false }),
  useDeleteFreeItemCampaign: () => ({ mutate: mockDeleteCampaign, isPending: false }),
  useCreatePwpRule: () => ({ mutate: vi.fn(), mutateAsync: mockCreatePwp, isPending: false }),
  useUpdatePwpRule: () => ({ mutate: vi.fn(), mutateAsync: mockUpdatePwp, isPending: false }),
  useDeletePwpRule: () => ({ mutate: mockDeletePwp, isPending: false }),
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
    pwpRules: [],
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
  mockCreatePwp.mockResolvedValue({ pwpRule: {} });
  mockUpdatePwp.mockResolvedValue({ pwpRule: {} });
});

// ---------------------------------------------------------------------------
// Principal-gating
// ---------------------------------------------------------------------------
describe("PromoTab — gating", () => {
  it("principal: shows the gift model picker + the three 2990s header buttons + New Free Item", () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    expect(screen.getByTestId("promo-gift-model-select")).toBeInTheDocument();
    expect(screen.getByTestId("campaign-add")).toBeInTheDocument();
    expect(screen.getByTestId("pwp-add")).toBeInTheDocument();
    expect(screen.getByTestId("promo-add")).toBeInTheDocument();
    expect(screen.getByTestId("gwp-add")).toBeInTheDocument();
  });

  it("non-principal: no gift picker, no campaign add, no rule add; existing config read-only", () => {
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            modelDefaultFreeGifts: [{ modelId: MATTRESS_MODEL, gifts: [{ giftSku: "PILLOW", qty: 1, label: "Free pillow" }] }],
            freeItemCampaigns: [
              { id: "camp-1", name: "Pillow promo", active: true, maxFreeQty: 1, eligible: [{ modelId: MATTRESS_MODEL, scope: "model" }] },
            ],
            pwpRules: [
              {
                id: "pwp-1",
                type: "pwp",
                triggerCategory: "mattress",
                triggerTargets: [{ modelId: MATTRESS_MODEL, scope: "model" }],
                rewardCategory: "accessory",
                rewardTargets: [],
                qtyPerTrigger: 1,
                active: true,
                carryForward: true,
                carryForwardDays: null,
              },
            ],
          })}
          isPrincipal={false}
        />,
      ),
    );
    expect(screen.queryByTestId("promo-gift-model-select")).not.toBeInTheDocument();
    expect(screen.queryByTestId("campaign-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pwp-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("promo-add")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gwp-add")).not.toBeInTheDocument();
    // Lists still render
    expect(screen.getByTestId(`gift-model-card-${MATTRESS_MODEL}`)).toBeInTheDocument();
    expect(screen.getByText("Pillow promo")).toBeInTheDocument();
    expect(screen.getByTestId("pwp-row-pwp-1")).toBeInTheDocument();
    // ...but no edit controls
    expect(screen.queryByTestId(`gift-edit-${MATTRESS_MODEL}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId("campaign-edit-camp-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pwp-edit-pwp-1")).not.toBeInTheDocument();
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

  it("size chips fall back to SKU-derived variants when allowed_options.sizes is empty", async () => {
    // Loo 2026-07-06: Cloud Series Mattress had allowed_options.sizes = null but
    // real King/Queen SKUs — the "Only for specific sizes" tick showed nothing.
    // makeCatalog's mattress model has NO allowedOptions; its MATT-A sku carries
    // variant "S" (variantKind "size") → the chip must still render.
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.change(screen.getByTestId("promo-gift-model-select"), { target: { value: MATTRESS_MODEL } });
    fireEvent.click(screen.getByTestId("promo-gift-add"));
    fireEvent.change(screen.getByTestId("gift-row-sku-0"), { target: { value: "PILLOW" } });
    fireEvent.click(screen.getByTestId("gift-row-cond-toggle-0"));

    // The SKU-derived size chip "S" renders and ticks into the payload.
    fireEvent.click(screen.getByRole("button", { name: "S" }));
    fireEvent.click(screen.getByTestId("gift-save"));
    await waitFor(() => expect(mockUpsertGifts).toHaveBeenCalledOnce());
    const gifts = mockUpsertGifts.mock.calls[0][0].input.gifts;
    expect(gifts[0].condition).toEqual({ scope: "variant", sizeCodes: ["S"] });
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

// ---------------------------------------------------------------------------
// PWP / Promo rules (0186, Phase 8a)
// ---------------------------------------------------------------------------
describe("PromoTab — PWP / promo rules", () => {
  it("create: + New PWP presets kind=pwp, active defaults ON (2990s) → Save calls useCreatePwpRule", async () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("pwp-add"));

    // kind chips preset to pwp; active defaults true (2990s parity)
    expect(screen.getByTestId("pwp-kind-pwp")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("pwp-active")).toBeChecked();

    // trigger=mattress, reward=accessory. Bump qty to 2.
    fireEvent.change(screen.getByTestId("pwp-qty"), { target: { value: "2" } });

    // tick the mattress model in the TRIGGER picker (the first RuleTargetPicker)
    const triggerRow = screen.getByTestId(`rtp-model-${MATTRESS_MODEL}`);
    fireEvent.click(within(triggerRow).getByRole("checkbox"));

    fireEvent.click(screen.getByTestId("pwp-save"));

    await waitFor(() => expect(mockCreatePwp).toHaveBeenCalledOnce());
    const arg = mockCreatePwp.mock.calls[0][0];
    expect(arg.type).toBe("pwp");
    expect(arg.active).toBe(true);
    expect(arg.qtyPerTrigger).toBe(2);
    expect(arg.triggerCategory).toBe("mattress");
    expect(arg.rewardCategory).toBe("accessory");
    expect(arg.triggerTargets).toEqual([{ modelId: MATTRESS_MODEL, scope: "model" }]);
    // empty reward targeting = whole category (allowed)
    expect(arg.rewardTargets).toEqual([]);
  });

  it("+ New Promo presets kind=promo", async () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("promo-add"));
    expect(screen.getByTestId("pwp-kind-promo")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("pwp-save"));
    await waitFor(() => expect(mockCreatePwp).toHaveBeenCalledOnce());
    expect(mockCreatePwp.mock.calls[0][0].type).toBe("promo");
  });

  it("create with empty trigger targeting = whole category is still valid", async () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("pwp-add"));
    // touch nothing else — qty defaults to 1, empty targets allowed
    expect(screen.getByTestId("pwp-save")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("pwp-save"));
    await waitFor(() => expect(mockCreatePwp).toHaveBeenCalledOnce());
    const arg = mockCreatePwp.mock.calls[0][0];
    expect(arg.qtyPerTrigger).toBe(1);
    expect(arg.triggerTargets).toEqual([]);
    expect(arg.rewardTargets).toEqual([]);
  });

  it("Save disabled when qtyPerTrigger < 1", () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("pwp-add"));
    fireEvent.change(screen.getByTestId("pwp-qty"), { target: { value: "0" } });
    expect(screen.getByTestId("pwp-save")).toBeDisabled();
  });

  it("rules render grouped by kind", () => {
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            pwpRules: [
              { id: "pwp-1", type: "pwp", triggerCategory: "mattress", triggerTargets: [{ modelId: MATTRESS_MODEL, scope: "model" }], rewardCategory: "accessory", rewardTargets: [], qtyPerTrigger: 1, active: true, carryForward: true, carryForwardDays: null },
              { id: "promo-1", type: "promo", triggerCategory: "sofa", triggerTargets: [], rewardCategory: "accessory", rewardTargets: [], qtyPerTrigger: 2, active: false, carryForward: true, carryForwardDays: null },
            ],
          })}
          isPrincipal={true}
        />,
      ),
    );
    expect(screen.getByTestId("pwp-group-pwp")).toBeInTheDocument();
    expect(screen.getByTestId("pwp-group-promo")).toBeInTheDocument();
    expect(screen.getByTestId("pwp-row-pwp-1")).toBeInTheDocument();
    expect(screen.getByTestId("pwp-row-promo-1")).toBeInTheDocument();
  });

  it("Edit pre-fills + Save calls useUpdatePwpRule with the patch", async () => {
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            pwpRules: [
              { id: "pwp-1", type: "pwp", triggerCategory: "mattress", triggerTargets: [{ modelId: MATTRESS_MODEL, scope: "model" }], rewardCategory: "accessory", rewardTargets: [], qtyPerTrigger: 1, active: false, carryForward: true, carryForwardDays: null },
            ],
          })}
          isPrincipal={true}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("pwp-edit-pwp-1"));
    expect(screen.getByTestId("pwp-kind-pwp")).toHaveAttribute("aria-pressed", "true");
    expect((screen.getByTestId("pwp-qty") as HTMLInputElement).value).toBe("1");
    fireEvent.click(screen.getByTestId("pwp-active")); // flip ON
    fireEvent.click(screen.getByTestId("pwp-save"));

    await waitFor(() => expect(mockUpdatePwp).toHaveBeenCalledOnce());
    const arg = mockUpdatePwp.mock.calls[0][0];
    expect(arg.id).toBe("pwp-1");
    expect(arg.patch.active).toBe(true);
    expect(arg.patch.triggerTargets).toEqual([{ modelId: MATTRESS_MODEL, scope: "model" }]);
  });

  it("a sofa trigger with no explicit selection disables Save (2990s parity)", () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("pwp-add"));
    fireEvent.change(screen.getByTestId("pwp-trigger-category"), { target: { value: "sofa" } });
    expect(screen.getByTestId("pwp-save")).toBeDisabled();
  });

  it("Delete confirms then calls useDeletePwpRule", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            pwpRules: [
              { id: "pwp-1", type: "pwp", triggerCategory: "mattress", triggerTargets: [], rewardCategory: "accessory", rewardTargets: [], qtyPerTrigger: 1, active: true, carryForward: true, carryForwardDays: null },
            ],
          })}
          isPrincipal={true}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("pwp-delete-pwp-1"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDeletePwp).toHaveBeenCalledWith("pwp-1", expect.anything());
    confirmSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// New GWP — bulk gift modal (2990s parity)
// ---------------------------------------------------------------------------
describe("PromoTab — New GWP bulk modal", () => {
  it("tick a model + pick an accessory → Add calls useUpsertModelFreeGifts per model", async () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("gwp-add"));

    fireEvent.click(screen.getByTestId(`gwp-model-${MATTRESS_MODEL}`));
    fireEvent.change(screen.getByTestId("gwp-row-sku-0"), { target: { value: "PILLOW" } });
    fireEvent.change(screen.getByTestId("gwp-row-qty-0"), { target: { value: "2" } });
    fireEvent.change(screen.getByTestId("gwp-row-label-0"), { target: { value: "MING PAO CANADA" } });

    fireEvent.click(screen.getByTestId("gwp-apply"));

    await waitFor(() => expect(mockUpsertGifts).toHaveBeenCalledOnce());
    const arg = mockUpsertGifts.mock.calls[0][0];
    expect(arg.modelId).toBe(MATTRESS_MODEL);
    expect(arg.input.gifts).toEqual([{ giftSku: "PILLOW", qty: 2, label: "MING PAO CANADA" }]);
  });

  it("appends to a model's existing gifts (merge, not replace)", async () => {
    render(
      wrap(
        <PromoTab
          catalog={makeCatalog({
            modelDefaultFreeGifts: [
              { modelId: MATTRESS_MODEL, gifts: [{ giftSku: "PILLOW", qty: 1, label: "Old promo" }] },
            ],
          })}
          isPrincipal={true}
        />,
      ),
    );
    fireEvent.click(screen.getByTestId("gwp-add"));
    fireEvent.click(screen.getByTestId(`gwp-model-${MATTRESS_MODEL}`));
    fireEvent.change(screen.getByTestId("gwp-row-sku-0"), { target: { value: "PILLOW" } });
    fireEvent.change(screen.getByTestId("gwp-row-label-0"), { target: { value: "New promo" } });
    fireEvent.click(screen.getByTestId("gwp-apply"));

    await waitFor(() => expect(mockUpsertGifts).toHaveBeenCalledOnce());
    const gifts = mockUpsertGifts.mock.calls[0][0].input.gifts;
    // different label = different entry — the old one survives
    expect(gifts).toEqual([
      { giftSku: "PILLOW", qty: 1, label: "Old promo" },
      { giftSku: "PILLOW", qty: 1, label: "New promo" },
    ]);
  });

  it("a size tick attaches a variant condition to mattress/bedframe gifts", async () => {
    const catalog = makeCatalog();
    catalog.models = catalog.models.map((m) =>
      m.id === MATTRESS_MODEL ? { ...m, allowedOptions: { sizes: ["King", "Queen"] } } : m,
    );
    render(wrap(<PromoTab catalog={catalog} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("gwp-add"));
    fireEvent.click(screen.getByTestId(`gwp-model-${MATTRESS_MODEL}`));
    fireEvent.change(screen.getByTestId("gwp-row-sku-0"), { target: { value: "PILLOW" } });
    fireEvent.click(screen.getByTestId("gwp-size-KING"));
    fireEvent.click(screen.getByTestId("gwp-apply"));

    await waitFor(() => expect(mockUpsertGifts).toHaveBeenCalledOnce());
    const gifts = mockUpsertGifts.mock.calls[0][0].input.gifts;
    expect(gifts[0].condition).toEqual({ scope: "variant", sizeCodes: ["KING"] });
  });

  it("Apply is disabled until at least one model is selected", () => {
    render(wrap(<PromoTab catalog={makeCatalog()} isPrincipal={true} />));
    fireEvent.click(screen.getByTestId("gwp-add"));
    expect(screen.getByTestId("gwp-apply")).toBeDisabled();
  });
});
