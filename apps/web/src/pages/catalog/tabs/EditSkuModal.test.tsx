import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import EditSkuModal from "./EditSkuModal";

/**
 * EditSkuModal — per-row editor, focused on the COGS/cost money path added with
 * the Retail | COGS toggle (Loo 2026-06-15). Cost is the only nullable money
 * field here, so its null-clear + changed-fields-only diff is the real risk
 * surface (the inline grid deliberately can't null a value — only this modal can).
 * Query hooks stubbed (vi.mock @/lib/queries) so no react-query provider needed.
 */

const patchSku = vi.fn();
const patchModel = vi.fn();

vi.mock("@/lib/queries", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries")>("@/lib/queries");
  return {
    ...actual,
    usePatchCatalogSku: () => ({ mutateAsync: patchSku, isPending: false }),
    usePatchCatalogModel: () => ({ mutateAsync: patchModel, isPending: false }),
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
    id: "00000000-0000-0000-0000-0000000000a1",
    modelId: MODEL.id,
    sku: "BF01-A",
    variant: "K",
    variantKind: "size",
    price: 1200,
    cost: 800,
    supplierId: null,
    posActive: true,
    description: null,
    ...over,
  };
}

beforeEach(() => {
  patchSku.mockReset();
  patchSku.mockResolvedValue({});
  patchModel.mockReset();
  patchModel.mockResolvedValue({});
});

describe("EditSkuModal — COGS/cost field", () => {
  it("clearing the cost field PATCHes cost:null (the modal-only null-clear path)", async () => {
    render(<EditSkuModal sku={sku({ cost: 800 })} model={MODEL} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("edit-sku-cost"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchSku).toHaveBeenCalledTimes(1));
    expect(patchSku.mock.calls[0][0]).toMatchObject({ id: "00000000-0000-0000-0000-0000000000a1" });
    expect(patchSku.mock.calls[0][0].patch).toEqual({ cost: null });
    // Only the SKU's cost changed — the model name was untouched.
    expect(patchModel).not.toHaveBeenCalled();
  });

  it("editing only the price on a cost-null SKU omits the cost key (changed-fields-only)", async () => {
    render(<EditSkuModal sku={sku({ cost: null, price: 1200 })} model={MODEL} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("edit-sku-price"), { target: { value: "1300" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchSku).toHaveBeenCalledTimes(1));
    const patch = patchSku.mock.calls[0][0].patch;
    expect(patch).toEqual({ price: 1300 });
    expect(patch).not.toHaveProperty("cost");
  });

  it("a negative cost keeps Save disabled", () => {
    render(<EditSkuModal sku={sku({ cost: 800 })} model={MODEL} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("edit-sku-cost"), { target: { value: "-5" } });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("setting a cost on a previously-null SKU PATCHes the new number", async () => {
    render(<EditSkuModal sku={sku({ cost: null })} model={MODEL} onClose={() => {}} />);
    fireEvent.change(screen.getByTestId("edit-sku-cost"), { target: { value: "640" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patchSku).toHaveBeenCalledTimes(1));
    expect(patchSku.mock.calls[0][0].patch).toEqual({ cost: 640 });
  });
});
