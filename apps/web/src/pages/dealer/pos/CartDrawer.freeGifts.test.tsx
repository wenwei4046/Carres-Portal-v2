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
    // Product name (the accessory MODEL name) beats the sku description.
    expect(row.textContent).toContain("Acc X");
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

// max_free_qty is a per-campaign TOTAL across the whole ORDER (server F3) —
// the cart must stop offering (and revert an over-bumped claim) live, so the
// salesperson never builds a cart the server would 409.
describe("CartDrawer — per-order free cap (max_free_qty)", () => {
  const campaign = {
    id: "camp-1",
    name: "Pillow promo",
    active: true,
    maxFreeQty: 2,
    eligible: [{ modelId: MATT, scope: "model" as const }],
  };
  const freedLine = (localId: string): DraftLine =>
    ({
      localId,
      sku: "MATT-A",
      qty: 1,
      attrs: { free_item: { campaignId: "camp-1", name: "Pillow promo" } },
      unitPrice: 0,
      origUnitPrice: 1200,
      label: "Matt X · Queen",
    }) as DraftLine;
  const paidLine = (localId: string, qty = 1): DraftLine => ({
    localId,
    sku: "MATT-A",
    qty,
    attrs: null,
    unitPrice: 1200,
    label: "Matt X · Queen",
  });
  function draftWithLines(lines: DraftLine[]): WizardDraft {
    return { ...emptyDraft(), lines };
  }

  it("once the order's allowance is spent, other eligible lines stop offering + show the limit hint", () => {
    render(
      <CartDrawer
        draft={draftWithLines([freedLine("L1"), paidLine("L2")])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [{ ...campaign, maxFreeQty: 1 }] })}
      />,
    );
    expect(screen.queryByTestId("make-free-L2-camp-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("free-limit-reached-L2")).toBeInTheDocument();
  });

  it("remaining allowance still offers: max 2 with 1 freed offers a qty-1 line, not a qty-2 line", () => {
    render(
      <CartDrawer
        draft={draftWithLines([freedLine("L1"), paidLine("L2"), paidLine("L3", 2)])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [campaign] })}
      />,
    );
    expect(screen.getByTestId("make-free-L2-camp-1")).toBeInTheDocument();
    expect(screen.queryByTestId("make-free-L3-camp-1")).not.toBeInTheDocument();
    expect(screen.getByTestId("free-limit-reached-L3")).toBeInTheDocument();
  });

  it("bumping a freed line's qty past the cap reverts the claim to the real price", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={draftWithLines([freedLine("L1")])}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [{ ...campaign, maxFreeQty: 1 }] })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Increase quantity"));
    const next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.lines[0]!.qty).toBe(2);
    expect(next.lines[0]!.unitPrice).toBe(1200);
    expect((next.lines[0]!.attrs as Record<string, unknown> | null)?.free_item).toBeUndefined();
  });

  it("bumping within the cap keeps the line free", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={draftWithLines([freedLine("L1")])}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [campaign] })}
      />,
    );
    fireEvent.click(screen.getByLabelText("Increase quantity"));
    const next = onChange.mock.calls[0][0] as WizardDraft;
    expect(next.lines[0]!.qty).toBe(2);
    expect(next.lines[0]!.unitPrice).toBe(0);
    expect((next.lines[0]!.attrs as Record<string, unknown>).free_item).toEqual({
      campaignId: "camp-1",
      name: "Pillow promo",
    });
  });
});

/**
 * THE FREE-ITEM LIMIT MESSAGE (2026-08-24) — the reported GWP friction.
 *
 * When a campaign covers a line but cannot be offered on it, the drawer used to
 * speak ONLY if some OTHER line had already taken free units. `max_free_qty`
 * defaults to 1 (0185) and `mergeLine` folds a second tap of the same product
 * into one qty-2 line — so the very first campaign a principal ever creates
 * lands on qty 2 / cap 1 / nothing freed, where that gate is false and the
 * "Make free" chip vanished with NO message at all.
 *
 * ⭐ The two reasons need DIFFERENT fixes, so they are different sentences.
 * Collapsing them back into one generic string would technically keep these
 * tests' testid assertions alive, which is why each asserts its own text.
 */
describe("CartDrawer — free item limit message", () => {
  const cap1 = {
    id: "camp-1",
    name: "Pillow promo",
    active: true,
    maxFreeQty: 1,
    eligible: [{ modelId: MATT, scope: "model" as const }],
  };

  function draftWithLines(lines: Array<Partial<DraftLine>>): WizardDraft {
    return {
      ...emptyDraft(),
      lines: lines.map((l, i) => ({
        localId: `L${i + 1}`,
        sku: "MATT-A",
        qty: 1,
        attrs: null,
        unitPrice: 1200,
        label: "Matt X · Queen",
        ...l,
      })),
    };
  }

  it("⭐ qty over the cap with NOTHING freed yet SPEAKS — this was the silent case", () => {
    render(
      <CartDrawer
        draft={draftWithLines([{ qty: 2 }])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [cap1] })}
      />,
    );
    // The chip is correctly gone — a qty-2 line cannot take a 1-unit allowance.
    expect(screen.queryByTestId("make-free-L1-camp-1")).not.toBeInTheDocument();
    // …but the reason must now be on screen, with the fix named (COPY rule 6).
    const hint = screen.getByTestId("free-limit-reached-L1");
    expect(hint).toHaveTextContent(/Only 1 free per order/i);
    expect(hint).toHaveTextContent(/Set this line to 1/i);
  });

  it("NEGATIVE CONTROL: a line within the cap still gets the chip, not the hint", () => {
    // Guards against "fixing" the branch by always rendering the hint.
    render(
      <CartDrawer
        draft={draftWithLines([{ qty: 1 }])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [cap1] })}
      />,
    );
    expect(screen.getByTestId("make-free-L1-camp-1")).toBeInTheDocument();
    expect(screen.queryByTestId("free-limit-reached-L1")).not.toBeInTheDocument();
  });

  it("allowance spent on ANOTHER line says so, and points at that line", () => {
    render(
      <CartDrawer
        draft={draftWithLines([
          { unitPrice: 0, origUnitPrice: 1200, attrs: { free_item: { campaignId: "camp-1", name: "Pillow promo" } } },
          { qty: 1 },
        ])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [cap1] })}
      />,
    );
    // L1 is the freed line — it shows FREE + Undo, never the hint.
    expect(screen.getByTestId("cart-line-free-L1")).toBeInTheDocument();
    expect(screen.queryByTestId("free-limit-reached-L1")).not.toBeInTheDocument();
    // L2 is covered but unofferable BECAUSE of L1.
    const hint = screen.getByTestId("free-limit-reached-L2");
    expect(hint).toHaveTextContent(/1 of 1 free used on another line/i);
    expect(hint).toHaveTextContent(/Undo it there/i);
  });

  it("the two reasons are DIFFERENT sentences — they carry different fixes", () => {
    // One says "shrink this line", the other says "undo the other line". A
    // single generic string would send the dealer to the wrong place.
    const { unmount } = render(
      <CartDrawer
        draft={draftWithLines([{ qty: 2 }])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [cap1] })}
      />,
    );
    const overCap = screen.getByTestId("free-limit-reached-L1").textContent ?? "";
    unmount();

    render(
      <CartDrawer
        draft={draftWithLines([
          { unitPrice: 0, origUnitPrice: 1200, attrs: { free_item: { campaignId: "camp-1", name: "Pillow promo" } } },
          { qty: 1 },
        ])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [cap1] })}
      />,
    );
    const spentElsewhere = screen.getByTestId("free-limit-reached-L2").textContent ?? "";

    expect(overCap).not.toBe(spentElsewhere);
    expect(overCap.length).toBeGreaterThan(0);
    expect(spentElsewhere.length).toBeGreaterThan(0);
  });

  it("a larger cap is reported with ITS number, not a hardcoded 1", () => {
    const cap3 = { ...cap1, id: "camp-3", maxFreeQty: 3 };
    render(
      <CartDrawer
        draft={draftWithLines([{ qty: 5 }])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ freeItemCampaigns: [cap3] })}
      />,
    );
    expect(screen.getByTestId("free-limit-reached-L1")).toHaveTextContent(/Only 3 free per order/i);
  });

  it("DORMANT: no campaign covers the line → neither chip nor hint", () => {
    render(
      <CartDrawer
        draft={draftWithLines([{ qty: 2 }])}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog()}
      />,
    );
    expect(screen.queryByTestId("free-limit-reached-L1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("make-free-L1-camp-1")).not.toBeInTheDocument();
  });
});
