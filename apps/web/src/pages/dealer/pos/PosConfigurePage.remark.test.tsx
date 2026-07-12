/**
 * PosConfigurePage — Remark + optional ± RM price adjustment (Loo 2026-07-12).
 * A special remark sometimes adjusts the price; the amount is OPTIONAL (empty
 * = plain note), per-unit, folded into unitPrice + stamped on attrs
 * (`remark` / `remark_surcharge`). Non-sofa unitPrice is client-priced, so no
 * server change backs this — but the line must never go below RM 0.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import PosConfigurePage from "./PosConfigurePage";

const mattModel = {
  id: "m-mat",
  category: "mattress",
  modelKey: "lumi",
  name: "Lumi",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: null,
} as ProductModelDto;

const mattSkus = [
  { id: "s1", modelId: "m-mat", sku: "LUMI-Q", variant: "Queen", variantKind: "size", price: 1200, cost: null, supplierId: null } as ProductSkuDto,
];

function renderMatt(onAdd: (l: DraftLine) => void, editLine?: DraftLine) {
  render(
    <PosConfigurePage
      model={mattModel}
      meta={undefined}
      skus={mattSkus}
      editLine={editLine}
      onAdd={onAdd}
      onClose={() => {}}
    />,
  );
}

describe("PosConfigurePage — remark + price adjustment", () => {
  it("a surcharge folds into the live total + the emitted attrs/unitPrice", () => {
    const onAdd = vi.fn();
    renderMatt(onAdd);
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.change(screen.getByTestId("cfg-remark"), {
      target: { value: "custom quilting" },
    });
    fireEvent.change(screen.getByTestId("cfg-remark-price"), { target: { value: "200" } });
    // 1200 + 200
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("1,400");

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0] as DraftLine;
    expect(line.unitPrice).toBe(1400);
    expect(line.attrs).toMatchObject({ remark: "custom quilting", remark_surcharge: 200 });
  });

  it("a remark WITHOUT an amount is a plain note (price untouched); a discount subtracts", () => {
    const onAdd = vi.fn();
    renderMatt(onAdd);
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.change(screen.getByTestId("cfg-remark"), { target: { value: "match showroom" } });
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const plain = onAdd.mock.calls[0][0] as DraftLine;
    expect(plain.unitPrice).toBe(1200);
    expect(plain.attrs).toMatchObject({ remark: "match showroom" });
    expect("remark_surcharge" in (plain.attrs as Record<string, unknown>)).toBe(false);

    fireEvent.change(screen.getByTestId("cfg-remark-price"), { target: { value: "-100" } });
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("1,100");
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const disc = onAdd.mock.calls[1][0] as DraftLine;
    expect(disc.unitPrice).toBe(1100);
    expect(disc.attrs).toMatchObject({ remark_surcharge: -100 });
  });

  it("no remark at all → attrs stay null (legacy mattress shape)", () => {
    const onAdd = vi.fn();
    renderMatt(onAdd);
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    expect((onAdd.mock.calls[0][0] as DraftLine).attrs).toBeNull();
  });

  it("a discount below RM 0 blocks Add with an inline warning", () => {
    const onAdd = vi.fn();
    renderMatt(onAdd);
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.change(screen.getByTestId("cfg-remark-price"), { target: { value: "-1300" } });
    expect(screen.getByTestId("cfg-remark-negative")).toBeTruthy();
    expect(screen.getByTestId("cfg-add-to-cart")).toHaveProperty("disabled", true);
  });

  it("EDIT restores the stored remark + adjustment", () => {
    const onAdd = vi.fn();
    renderMatt(onAdd, {
      localId: "L1",
      sku: "LUMI-Q",
      qty: 1,
      unitPrice: 1400,
      label: "Lumi · Queen",
      attrs: { remark: "custom quilting", remark_surcharge: 200 },
    });
    expect((screen.getByTestId("cfg-remark") as HTMLTextAreaElement).value).toBe(
      "custom quilting",
    );
    expect((screen.getByTestId("cfg-remark-price") as HTMLInputElement).value).toBe("200");
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("1,400");
  });
});
