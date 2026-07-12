/**
 * OrderSummaryRail — the free gift the server appends at submit is shown here as
 * an RM0 item so the SO preview matches what's booked (Loo 2026-07-06:
 * "convert to sales order can't detect the gift item").
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CatalogResponse } from "@carres/shared";
import { emptyDraft, type DraftLine, type WizardDraft } from "../new-order/draft";
import OrderSummaryRail from "./OrderSummaryRail";

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

describe("OrderSummaryRail — default free gift", () => {
  it("lists the free gift as an RM0 item and counts it (ITEMS · 2)", () => {
    render(
      <OrderSummaryRail
        draft={draftWith({})}
        catalog={catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] }] })}
      />,
    );
    const gift = screen.getByTestId("summary-gift-PILLOW");
    // Product name (the accessory MODEL name) beats the sku description.
    expect(gift.textContent).toContain("Acc X");
    expect(gift.textContent).toContain("FREE");
    // The mattress + the gift = 2 items.
    expect(screen.getByText("Items · 2")).toBeInTheDocument();
  });

  it("a campaign-freed trigger still shows its gift (regression: 'Make free' kept the GWP)", () => {
    render(
      <OrderSummaryRail
        draft={draftWith({ unitPrice: 0, attrs: { free_item: { campaignId: "c1" } } })}
        catalog={catalog({ modelDefaultFreeGifts: [{ modelId: MATT, gifts: [{ giftSku: "PILLOW", qty: 1 }] }] })}
      />,
    );
    expect(screen.getByTestId("summary-gift-PILLOW")).toBeInTheDocument();
  });

  it("DORMANT: no gift configured → no gift row", () => {
    render(<OrderSummaryRail draft={draftWith({})} catalog={catalog()} />);
    expect(screen.queryByTestId("summary-gift-PILLOW")).not.toBeInTheDocument();
    expect(screen.getByText("Items · 1")).toBeInTheDocument();
  });
});

describe("OrderSummaryRail — item row label split (Loo 2026-07-12)", () => {
  it("bold model name on top, config as the muted detail line", () => {
    render(
      <OrderSummaryRail
        draft={draftWith({ label: 'Booqit · 1A(LHF) + 2A(RHF) · 24″ · CG-007 Deep Grey · leg 4"' })}
        catalog={catalog()}
      />,
    );
    // Name and detail render as SEPARATE nodes (not one long bold line).
    expect(screen.getByText("Booqit")).toBeInTheDocument();
    expect(screen.getByText('1A(LHF) + 2A(RHF) · 24″ · CG-007 Deep Grey · leg 4"')).toBeInTheDocument();
    expect(screen.getByText("qty 1")).toBeInTheDocument();
  });

  it("a variant-less label ('Mattress Protector · ') strands no separator", () => {
    render(
      <OrderSummaryRail draft={draftWith({ label: "Mattress Protector · " })} catalog={catalog()} />,
    );
    expect(screen.getByText("Mattress Protector")).toBeInTheDocument();
    // No empty detail line — the row is name + qty only.
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  it("a sofa BUILD line shows the photo tile + the Custom(bare codes) spec lines (prototype style)", () => {
    render(
      <OrderSummaryRail
        draft={draftWith({
          sku: "BOOQIT-P",
          unitPrice: 3240,
          label: 'Booqit · 1B(LHF) + CNR + 2A(RHF) · 24″ · CG-007 Deep Grey · leg 4"',
          attrs: {
            mode: "build",
            fabric_name: "CG-007 Deep Grey",
            fabric_surcharge: 250,
            fabric_deferred: false,
            leg_height: '4"',
            leg_surcharge: 0,
            sofa_build: {
              cells: [
                { moduleCode: "1B(LHF)", x: 60, y: 60, rot: 0 },
                { moduleCode: "2A(RHF)", x: 160, y: 60, rot: 0 },
              ],
              height: "24",
            },
          },
        })}
        catalog={catalog()}
      />,
    );
    const row = screen.getByTestId("summary-build-L1");
    // Bold line = model + composition; detail = Custom (bare codes) · size · qty.
    expect(row.textContent).toContain("Booqit · 1B(LHF) + CNR + 2A(RHF)");
    expect(row.textContent).toContain("Custom (1B+CNR+2A) · 24″ · qty 1");
    // Fabric surcharge itemised, prototype-style.
    expect(row.textContent).toContain("Fabric · CG-007 Deep Grey · +RM 250");
    expect(row.textContent).toContain('Leg 4"');
    // The tile is the PHOTO treatment (Loo reverted the plan-view sketch) —
    // the spec lines carry the structure instead.
    expect(row.querySelector(".summary__item-photo")).toBeTruthy();
    expect(row.querySelector(".summary__item-photo--plan")).toBeNull();
  });
});
