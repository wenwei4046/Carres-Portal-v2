import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CatalogResponse, SpecialAddonDto } from "@carres/shared";
import SpecialAddonsTab from "./SpecialAddonsTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const createAsync = vi.fn();
const patchAsync = vi.fn();
const delAsync = vi.fn();
vi.mock("@/lib/queries", () => ({
  useCreateSpecialAddon: () => ({ mutate: vi.fn(), mutateAsync: createAsync, isPending: false }),
  usePatchSpecialAddon: () => ({ mutate: vi.fn(), mutateAsync: patchAsync, isPending: false }),
  useDeleteSpecialAddon: () => ({ mutate: vi.fn(), mutateAsync: delAsync, isPending: false }),
  // 0201 — option pool hooks (PoolPanel panels in the sidebar layout).
  useBatchSaveOptionPool: () => ({ mutate: vi.fn(), isPending: false }),
  useCatalogConfigHistory: () => ({ data: undefined, isLoading: false }),
  // Order Add-ons section (hosted here since 0201).
  useCreateAddon: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  usePatchAddon: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteAddon: () => ({ mutate: vi.fn(), isPending: false }),
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
});
