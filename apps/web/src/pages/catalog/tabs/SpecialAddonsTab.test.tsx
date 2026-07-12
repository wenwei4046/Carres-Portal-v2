import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CatalogResponse, SpecialAddonDto } from "@carres/shared";
import SpecialAddonsTab from "./SpecialAddonsTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const createAsync = vi.fn();
const patchAsync = vi.fn();
const delAsync = vi.fn();
const addonCreateAsync = vi.fn();
const addonPatchMutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  useCreateSpecialAddon: () => ({ mutate: vi.fn(), mutateAsync: createAsync, isPending: false }),
  usePatchSpecialAddon: () => ({ mutate: vi.fn(), mutateAsync: patchAsync, isPending: false }),
  useDeleteSpecialAddon: () => ({ mutate: vi.fn(), mutateAsync: delAsync, isPending: false }),
  // 0201 — option pool hooks (PoolPanel panels in the sidebar layout).
  useBatchSaveOptionPool: () => ({ mutate: vi.fn(), isPending: false }),
  useCatalogConfigHistory: () => ({ data: undefined, isLoading: false }),
  // Order Add-ons section (hosted here since 0201).
  useCreateAddon: () => ({ mutate: vi.fn(), mutateAsync: addonCreateAsync, isPending: false }),
  usePatchAddon: () => ({ mutate: addonPatchMutate, mutateAsync: vi.fn(), isPending: false }),
  useDeleteAddon: () => ({ mutate: vi.fn(), isPending: false }),
  // Stair-carry fee (hosted in the Order Add-ons panel since 2026-07-06).
  usePatchFloorConfig: () => ({ mutate: vi.fn(), isPending: false }),
}));

const SA: SpecialAddonDto = {
  id: "sa1",
  code: "right-drawer",
  label: "Right Drawer",
  soDescription: "Right pull-out drawer",
  categories: ["bedframe"],
  sellingPrice: -40,
  cost: null,
  optionGroups: [{ label: "Thickness", required: true, choices: [{ label: '8"', extra: -10 }] }],
  active: true,
  sortOrder: 0,
};

function catalog(specialAddons: SpecialAddonDto[]): CatalogResponse {
  return {
    models: [],
    skus: [],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    specialAddons,
  } as CatalogResponse;
}

beforeEach(() => {
  createAsync.mockReset().mockResolvedValue({ specialAddon: SA });
  patchAsync.mockReset().mockResolvedValue({ specialAddon: SA });
  delAsync.mockReset().mockResolvedValue({ ok: true });
  addonCreateAsync.mockReset().mockResolvedValue({ addon: {} });
  addonPatchMutate.mockReset();
});

/** 0201 — the tab is sidebar-driven now: the special_addons editor lives
 *  behind the "Product Add-ons" nav item, so every test opens it first. */
function renderProductPanel(cat: CatalogResponse, isPrincipal: boolean) {
  render(<SpecialAddonsTab catalog={cat} isPrincipal={isPrincipal} />);
  fireEvent.click(screen.getByTestId("maint-nav-product"));
}

describe("SpecialAddonsTab", () => {
  it("renders rows with negative price shown as a minus", () => {
    renderProductPanel(catalog([SA]), true);
    expect(screen.getByTestId("special-row-right-drawer")).toBeInTheDocument();
    expect(screen.getByText("−RM 40.00")).toBeInTheDocument();
  });

  it("non-principal: no + New button, edit shows 'View'", () => {
    renderProductPanel(catalog([SA]), false);
    expect(screen.queryByTestId("special-new")).not.toBeInTheDocument();
    expect(screen.getByTestId("special-edit-right-drawer")).toHaveTextContent("View");
  });

  it("principal can create a new special add-on with a follow-up question", async () => {
    renderProductPanel(catalog([]), true);
    fireEvent.click(screen.getByTestId("special-new"));
    fireEvent.change(screen.getByTestId("special-code"), { target: { value: "no-side-panel" } });
    fireEvent.change(screen.getByTestId("special-label"), { target: { value: "No Side Panel" } });
    fireEvent.change(screen.getByTestId("special-price"), { target: { value: "-40" } });
    // pick a category (required) — click the Bedframe chip
    fireEvent.click(screen.getByRole("button", { name: "Bedframe" }));
    fireEvent.click(screen.getByText("Create"));
    await waitFor(() => expect(createAsync).toHaveBeenCalledOnce());
    const arg = createAsync.mock.calls[0][0];
    expect(arg).toMatchObject({ code: "no-side-panel", label: "No Side Panel", sellingPrice: -40 });
    expect(arg.categories).toContain("bedframe");
  });

  it("create is blocked until a category is chosen", () => {
    renderProductPanel(catalog([]), true);
    fireEvent.click(screen.getByTestId("special-new"));
    fireEvent.change(screen.getByTestId("special-code"), { target: { value: "x-thing" } });
    fireEvent.change(screen.getByTestId("special-label"), { target: { value: "X Thing" } });
    // no category picked yet → Create disabled
    expect(screen.getByText("Create").closest("button")).toBeDisabled();
  });

  it("Add add-on form: Name/Description/Price only — key + Service SKU auto-generate from the name", async () => {
    render(<SpecialAddonsTab catalog={catalog([])} isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("maint-nav-order"));
    fireEvent.click(screen.getByText("+ Add add-on"));

    // No key / service-sku inputs anymore — just the 3 fields.
    expect(screen.queryByPlaceholderText("dispose-mattress")).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId("addon-name"), {
      target: { value: "Dispose old rug (large)" },
    });
    fireEvent.change(screen.getByTestId("addon-description"), {
      target: { value: "Haul away the customer's old rug" },
    });
    fireEvent.change(screen.getByTestId("addon-price"), { target: { value: "60" } });

    // Live preview of the derived identifiers.
    const preview = screen.getByTestId("addon-auto-preview");
    expect(preview).toHaveTextContent("dispose-old-rug-large");
    expect(preview).toHaveTextContent("SVC-DISPOSE-OLD-RUG-LARGE");

    fireEvent.click(screen.getByText("Add"));
    await waitFor(() => expect(addonCreateAsync).toHaveBeenCalledOnce());
    expect(addonCreateAsync.mock.calls[0][0]).toEqual({
      key: "dispose-old-rug-large",
      name: "Dispose old rug (large)",
      price: 60,
      serviceSku: "SVC-DISPOSE-OLD-RUG-LARGE",
      serviceDescription: "Haul away the customer's old rug",
    });
  });

  it("Order Add-ons rows show an editable Description (from the linked Service SKU) that PATCHes serviceDescription", () => {
    const cat = {
      ...catalog([]),
      addons: [
        {
          key: "dispose-mattress",
          name: "Dispose old mattress",
          price: 80,
          active: true,
          serviceSku: "SVC-DISPOSE-MATTRESS",
        },
        // Server-owned delivery row — no linked SKU → dash, not an input.
        { key: "DELIVERY", name: "Delivery fee", price: 0, active: true, serviceSku: null },
      ],
      skus: [
        {
          sku: "SVC-DISPOSE-MATTRESS",
          description: "Dispose old mattress",
        },
      ],
    } as unknown as CatalogResponse;
    render(<SpecialAddonsTab catalog={cat} isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("maint-nav-order"));

    const descInput = screen.getByLabelText("dispose-mattress description") as HTMLInputElement;
    expect(descInput.value).toBe("Dispose old mattress");
    // The unlinked DELIVERY row has no description input.
    expect(screen.queryByLabelText("DELIVERY description")).not.toBeInTheDocument();

    fireEvent.change(descInput, { target: { value: "We collect & dispose responsibly" } });
    fireEvent.blur(descInput);
    expect(addonPatchMutate).toHaveBeenCalledWith(
      {
        key: "dispose-mattress",
        patch: { serviceDescription: "We collect & dispose responsibly" },
      },
      expect.anything(),
    );
  });

  it("Order Add-ons panel hosts the stair-carry fee editor (moved from Delivery)", () => {
    render(<SpecialAddonsTab catalog={catalog([])} isPrincipal={true} />);
    fireEvent.click(screen.getByTestId("maint-nav-order"));
    const stair = screen.getByTestId("stair-carry-section");
    expect(stair).toBeInTheDocument();
    expect(stair).toHaveTextContent("Stair-carry fee");
    // seeded from the catalog's floor_config (freeUpToFloor 1 / RM 50 per floor)
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("50")).toBeInTheDocument();
  });
});
