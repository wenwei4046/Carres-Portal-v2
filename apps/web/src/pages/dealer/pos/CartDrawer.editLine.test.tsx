/**
 * CartDrawer — the ✎ edit pencil (Loo 2026-07-12). Shown per line ONLY when a
 * configurator can re-open it (`lineEditTarget`: sofa builds + mattress /
 * bedframe) AND the caller wired `onEditLine`; clicking hands the line up.
 * Accessory / unknown-sku lines and callers without the prop stay pencil-free.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft, type DraftLine, type WizardDraft } from "../new-order/draft";
import CartDrawer from "./CartDrawer";

const CATALOG = {
  models: [
    { id: "m-sofa", category: "sofa", modelKey: "booqit", name: "Booqit", blurb: null, colors: null, gaps: null, sofaMode: "custom" },
    { id: "m-matt", category: "mattress", modelKey: "lumi", name: "Lumi", blurb: null, colors: null, gaps: null, sofaMode: null },
    { id: "m-acc", category: "accessory", modelKey: "prot", name: "Protector", blurb: null, colors: null, gaps: null, sofaMode: null },
  ],
  skus: [
    { id: "s1", modelId: "m-sofa", sku: "BOOQIT-P", variant: "3-seater", variantKind: "preset", price: 2990, cost: null, supplierId: null },
    { id: "s2", modelId: "m-matt", sku: "LUMI-Q", variant: "Queen", variantKind: "size", price: 1200, cost: null, supplierId: null },
    { id: "s3", modelId: "m-acc", sku: "PROT-1", variant: "Standard", variantKind: "size", price: 99, cost: null, supplierId: null },
  ],
  sofaFabrics: [],
  addons: [],
  floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  sofaCompartments: [],
  modelSofaCompartments: [],
  sofaCombos: [],
  modelDefaultFreeGifts: [],
  freeItemCampaigns: [],
  pwpRules: [],
} as unknown as CatalogResponse;

const SOFA_LINE: DraftLine = {
  localId: "L-sofa",
  sku: "BOOQIT-P",
  qty: 1,
  unitPrice: 3100,
  label: "Booqit · 1A(LHF) + 2A(RHF) · 24″",
  attrs: { mode: "build", sofa_build: { cells: [{ moduleCode: "1A(LHF)", x: 60, y: 60, rot: 0 }], height: "24" } },
};
const MATT_LINE: DraftLine = {
  localId: "L-matt",
  sku: "LUMI-Q",
  qty: 1,
  unitPrice: 1200,
  label: "Lumi · Queen",
  attrs: null,
};
const ACC_LINE: DraftLine = {
  localId: "L-acc",
  sku: "PROT-1",
  qty: 2,
  unitPrice: 99,
  label: "Protector · Standard",
  attrs: null,
};

function draftWith(lines: DraftLine[]): WizardDraft {
  return { ...emptyDraft(), lines };
}
const noop = () => {};

describe("CartDrawer — edit pencil", () => {
  it("shows the pencil on sofa-build + mattress lines, not on accessory lines", () => {
    const onEditLine = vi.fn();
    render(
      <CartDrawer
        draft={draftWith([SOFA_LINE, MATT_LINE, ACC_LINE])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={CATALOG}
        onEditLine={onEditLine}
      />,
    );
    expect(screen.getByTestId("cart-line-edit-L-sofa")).toBeTruthy();
    expect(screen.getByTestId("cart-line-edit-L-matt")).toBeTruthy();
    expect(screen.queryByTestId("cart-line-edit-L-acc")).toBeNull();

    fireEvent.click(screen.getByTestId("cart-line-edit-L-sofa"));
    expect(onEditLine).toHaveBeenCalledTimes(1);
    expect(onEditLine.mock.calls[0][0]).toMatchObject({ localId: "L-sofa", sku: "BOOQIT-P" });
  });

  it("renders NO pencil when onEditLine isn't wired (older callers / tests)", () => {
    render(
      <CartDrawer
        draft={draftWith([SOFA_LINE, MATT_LINE])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={CATALOG}
      />,
    );
    expect(screen.queryByTestId("cart-line-edit-L-sofa")).toBeNull();
    expect(screen.queryByTestId("cart-line-edit-L-matt")).toBeNull();
  });

  it("renders NO pencil without a catalog (editability can't be resolved)", () => {
    render(
      <CartDrawer
        draft={draftWith([SOFA_LINE])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        onEditLine={() => {}}
      />,
    );
    expect(screen.queryByTestId("cart-line-edit-L-sofa")).toBeNull();
  });
});
