import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse, ProductModelDto, ProductSkuDto } from "@carres/shared";
import SkuMasterTab from "./SkuMasterTab";

/**
 * SKU Master — Retail | COGS toggle (Loo 2026-06-15). Retail = product_skus.price,
 * COGS = product_skus.cost; both arrive in the one /api/catalog bundle, so the
 * toggle only re-reads the other field. These tests prove the column header,
 * displayed value, "not set" fallback, and inline-edit PATCH all follow the
 * active mode. Query hooks are stubbed (vi.mock @/lib/queries) so no react-query
 * provider is needed — mirrors the operation component test pattern.
 */

const mutateSku = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    usePatchCatalogSku: () => ({ mutate: mutateSku, isPending: false }),
    useDeleteCatalogSku: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

const MODEL: ProductModelDto = {
  id: "00000000-0000-0000-0000-0000000000m1",
  category: "bedframe",
  modelKey: "cozy-910",
  name: "Cozy 910",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
};

function sku(over: Partial<ProductSkuDto>): ProductSkuDto {
  return {
    id: "00000000-0000-0000-0000-0000000000s0",
    modelId: MODEL.id,
    sku: "BF01-X",
    variant: "K",
    variantKind: "size",
    price: 0,
    cost: null,
    supplierId: null,
    posActive: true,
    ...over,
  };
}

const CATALOG: CatalogResponse = {
  models: [MODEL],
  skus: [
    sku({ id: "00000000-0000-0000-0000-0000000000a1", sku: "BF01-A", price: 1200, cost: 800 }),
    sku({ id: "00000000-0000-0000-0000-0000000000b2", sku: "BF01-B", price: 1500, cost: null }),
  ],
  sofaFabrics: [],
  addons: [],
  floorConfig: { id: 1, freeUpToFloor: 0, perFloorPerItem: 0 },
};

beforeEach(() => {
  mutateSku.mockReset();
});

describe("SkuMasterTab — Retail | COGS toggle", () => {
  it("retail (default) shows the price column, COGS flips it to cost + not-set", () => {
    render(<SkuMasterTab catalog={CATALOG} />);

    // Retail view: header "Price", both SKUs show their selling price.
    expect(screen.getByText("Price", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("RM 1,200.00")).toBeInTheDocument();
    expect(screen.getByText("RM 1,500.00")).toBeInTheDocument();

    // Flip to COGS: header "Cost", A shows its cost, B (cost=null) shows "cost not set".
    fireEvent.click(screen.getByTestId("pm-tab-cogs"));
    expect(screen.getByText("Cost", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("RM 800.00")).toBeInTheDocument();
    expect(screen.getByText("cost not set")).toBeInTheDocument();
    // The retail prices are gone from the value column.
    expect(screen.queryByText("RM 1,200.00")).not.toBeInTheDocument();
  });

  it("inline edit in COGS mode PATCHes cost, not price", () => {
    render(<SkuMasterTab catalog={CATALOG} />);
    fireEvent.click(screen.getByTestId("pm-tab-cogs"));
    fireEvent.click(screen.getByTestId("sku-edit-prices")); // "Edit Costs"

    const input = screen.getByLabelText("BF01-A cost") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "950" } });
    fireEvent.blur(input);

    expect(mutateSku).toHaveBeenCalledTimes(1);
    expect(mutateSku.mock.calls[0][0]).toMatchObject({
      id: "00000000-0000-0000-0000-0000000000a1",
      patch: { cost: 950 },
    });
  });

  it("inline edit in retail mode still PATCHes price (no regression)", () => {
    render(<SkuMasterTab catalog={CATALOG} />);
    fireEvent.click(screen.getByTestId("sku-edit-prices")); // "Edit Prices"

    const input = screen.getByLabelText("BF01-A price") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "1300" } });
    fireEvent.blur(input);

    expect(mutateSku).toHaveBeenCalledTimes(1);
    expect(mutateSku.mock.calls[0][0]).toMatchObject({
      id: "00000000-0000-0000-0000-0000000000a1",
      patch: { price: 1300 },
    });
  });
});
