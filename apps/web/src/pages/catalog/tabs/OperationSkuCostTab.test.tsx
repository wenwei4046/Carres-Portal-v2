/**
 * OperationSkuCostTab (0226) — the Operation Catalog costing view of the
 * shared SKU list. Covers:
 *  - renders code/description/product/category/size + COST column; NO selling
 *    price, NO PWP, NO margin anywhere
 *  - "not set" placeholder when cost is null
 *  - Edit Costs toggle → inline cost input commits { cost } via
 *    usePatchCatalogSku; blank clears to null
 *  - category chip + search filtering
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse, ProductModelDto, ProductSkuDto } from "@carres/shared";
import OperationSkuCostTab from "./OperationSkuCostTab";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const mockPatchMutate = vi.fn();
vi.mock("@/lib/queries", () => ({
  /* 2026-08-24 - the supplier picker/filter/column reads the roster through
   * this hook; one named supplier is enough to pin the render path. */
  useOperationSuppliers: () => ({
    data: { suppliers: [{ id: "00000000-0000-4000-8000-0000000000s1".replace("s","a"), name: "Hookka" }] },
    isLoading: false,
  }),
  usePatchCatalogSku: () => ({ mutate: mockPatchMutate, isPending: false }),
}));

const MODEL_MAT: ProductModelDto = {
  id: "m-mat",
  category: "mattress",
  modelKey: "cloud",
  name: "Carres Cloud",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
};

const MODEL_SOFA: ProductModelDto = {
  id: "m-sofa",
  category: "sofa",
  modelKey: "luna",
  name: "Luna Sofa",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "preset",
};

const SKU_COST_SET: ProductSkuDto = {
  id: "s1",
  modelId: "m-mat",
  sku: "CLOUD-KING",
  variant: "King",
  variantKind: "size",
  price: 3500,
  cost: 2100,
  supplierId: null,
};

const SKU_COST_NULL: ProductSkuDto = {
  id: "s2",
  modelId: "m-sofa",
  sku: "LUNA-3S",
  variant: "3-seater",
  variantKind: "preset",
  price: 4200,
  cost: null,
  supplierId: null,
};

function makeCatalog(skus: ProductSkuDto[]): CatalogResponse {
  return {
    models: [MODEL_MAT, MODEL_SOFA],
    skus,
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  };
}

beforeEach(() => {
  mockPatchMutate.mockReset();
});

describe("OperationSkuCostTab — costing view", () => {
  it("renders the COST column and never the selling price / PWP / margin", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET, SKU_COST_NULL])} />);
    expect(screen.getByText("Cost")).toBeInTheDocument();
    expect(screen.queryByText("PWP Price")).not.toBeInTheDocument();
    expect(screen.queryByText("Margin")).not.toBeInTheDocument();
    // Cost value renders; the SELLING price (3500 / 4200) never appears.
    expect(screen.getByTestId("opcost-cost-CLOUD-KING").textContent).toContain("2,100.00");
    expect(screen.queryByText(/3,500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/4,200/)).not.toBeInTheDocument();
    // Null cost → muted "not set".
    expect(screen.getByTestId("opcost-cost-LUNA-3S").textContent).toContain("not set");
  });

  it("Edit Costs → inline input commits { cost } via usePatchCatalogSku", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const input = screen.getByLabelText("CLOUD-KING cost");
    fireEvent.change(input, { target: { value: "2250" } });
    fireEvent.blur(input);
    expect(mockPatchMutate).toHaveBeenCalledTimes(1);
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({
      id: "s1",
      patch: { cost: 2250 },
    });
  });

  it("blank cost input clears to null", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const input = screen.getByLabelText("CLOUD-KING cost");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(mockPatchMutate).toHaveBeenCalledTimes(1);
    expect(mockPatchMutate.mock.calls[0][0]).toEqual({
      id: "s1",
      patch: { cost: null },
    });
  });

  it("unchanged cost on blur → no PATCH", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET])} />);
    fireEvent.click(screen.getByTestId("opcost-edit-costs"));
    const input = screen.getByLabelText("CLOUD-KING cost");
    fireEvent.blur(input); // defaultValue 2100 untouched
    expect(mockPatchMutate).not.toHaveBeenCalled();
  });

  it("category chips + search filter the list", () => {
    render(<OperationSkuCostTab catalog={makeCatalog([SKU_COST_SET, SKU_COST_NULL])} />);
    expect(screen.getByTestId("opcost-row-CLOUD-KING")).toBeInTheDocument();
    expect(screen.getByTestId("opcost-row-LUNA-3S")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sofa" }));
    expect(screen.queryByTestId("opcost-row-CLOUD-KING")).not.toBeInTheDocument();
    expect(screen.getByTestId("opcost-row-LUNA-3S")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByTestId("opcost-sku-search"), { target: { value: "cloud" } });
    expect(screen.getByTestId("opcost-row-CLOUD-KING")).toBeInTheDocument();
    expect(screen.queryByTestId("opcost-row-LUNA-3S")).not.toBeInTheDocument();
  });
});
