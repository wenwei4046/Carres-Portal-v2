/**
 * CartDrawer — 2990s Products parity Phase 7 (free gifts + free items).
 * Asserts the POS preview wiring:
 *   - a default-gift config surfaces a display-only "Free gift" row;
 *   - an eligible line shows a "Make free" affordance that marks attrs.free_item
 *     + forces the preview price to 0 (no-funding);
 *   - with NO config the cart is byte-identical (no gift row, no Make-free).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft, type DraftLine, type WizardDraft } from "../new-order/draft";
import CartDrawer from "./CartDrawer";

const MATT = "22222222-2222-2222-2222-222222222222";
const ACC = "44444444-4444-4444-4444-444444444444";

function sku(over: Partial<CatalogResponse["skus"][number]> & { sku: string; modelId: string }) {
  return {
    id: `id-${over.sku}`,
    variant: "Queen",
    variantKind: "size" as const,
    price: 1200,
    cost: null,
    supplierId: null,
    posActive: true,
    description: `${over.sku} desc`,
    ...over,
  };
}

function catalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: MATT, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: ACC, category: "accessory", modelKey: "acc-x", name: "Acc X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [sku({ sku: "MATT-A", modelId: MATT }), sku({ sku: "PILLOW", modelId: ACC, price: 100, description: "Memory Pillow" })],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    combos: [],
    sofaCombos: [],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    ...over,
  };
}

function draftWith(line: Partial<DraftLine>): WizardDraft {
  return {
    ...emptyDraft(),
    lines: [{ localId: "L1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen", ...line }],
  };
}

const noop = () => {};

describe("CartDrawer — default free gift preview", () => {
  it("shows a 'Free gift' row when the model has a configured gift", () => {
    render(
      <CartDrawer
        draft={draftWith({})}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] }] })}
      />,
    );
    const row = screen.getByTestId("gift-preview-PILLOW");
    expect(row.textContent).toContain("Memory Pillow");
    expect(row.textContent).toContain("FREE");
  });

  it("DORMANT: no config → no gift preview block", () => {
    render(<CartDrawer draft={draftWith({})} onChange={noop} onProceed={noop} onClose={noop} catalog={catalog()} />);
    expect(screen.queryByTestId("cart-gift-preview")).not.toBeInTheDocument();
  });

  it("no catalog prop → byte-identical (no gift block, no Make-free)", () => {
    render(<CartDrawer draft={draftWith({})} onChange={noop} onProceed={noop} onClose={noop} />);
    expect(screen.queryByTestId("cart-gift-preview")).not.toBeInTheDocument();
    expect(screen.queryByTestId("make-free-L1-camp-1")).not.toBeInTheDocument();
  });
});

describe("CartDrawer — free item 'Make free'", () => {
  const campaign = {
    id: "camp-1",
    name: "Pillow promo",
    active: true,
    maxFreeQty: 2,
    eligible: [{ modelId: MATT, scope: "model" as const }],
  };

  it("an eligible line shows Make-free; clicking marks attrs.free_item + zeroes the price", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={draftWith({})}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [campaign] })}
      />,
    );
    const btn = screen.getByTestId("make-free-L1-camp-1");
    fireEvent.click(btn);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const marked = next.lines[0]!;
    expect(marked.unitPrice).toBe(0);
    expect((marked.attrs as Record<string, unknown>).free_item).toEqual({ campaignId: "camp-1", name: "Pillow promo" });
    expect(marked.origUnitPrice).toBe(1200);
  });

  it("a freed line renders FREE + an Undo that restores the price", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={draftWith({ unitPrice: 0, origUnitPrice: 1200, attrs: { free_item: { campaignId: "camp-1", name: "Pillow promo" } } })}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [campaign] })}
      />,
    );
    expect(screen.getByTestId("cart-line-free-L1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("undo-free-L1"));
    const next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.lines[0]!.unitPrice).toBe(1200);
    expect((next.lines[0]!.attrs as Record<string, unknown> | null)?.free_item).toBeUndefined();
  });

  it("a line not covered by any campaign shows no Make-free", () => {
    render(
      <CartDrawer
        draft={draftWith({})}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [{ ...campaign, eligible: [{ modelId: ACC, scope: "model" as const }] }] })}
      />,
    );
    expect(screen.queryByTestId("make-free-L1-camp-1")).not.toBeInTheDocument();
  });
});
