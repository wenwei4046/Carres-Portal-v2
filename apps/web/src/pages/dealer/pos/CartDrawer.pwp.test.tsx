/**
 * CartDrawer — 2990s Products parity Phase 8b (PWP / promo "Use PWP price").
 * Asserts the POS toggle wiring:
 *   - a reward line shows the toggle ONLY when a qualifying trigger is in the
 *     cart with spare allowance (shared resolvePwp), previewing the server-forced
 *     price (the sku's pwpPrice, or FREE for promo);
 *   - clicking marks attrs.pwp = { ruleId } + forces the preview price;
 *   - a claimed line shows the rule + an Undo that restores the price;
 *   - with NO trigger / NO config the toggle is absent (DORMANT byte-identical).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse, PwpRuleDto } from "@carres/shared";
import { emptyDraft, type DraftLine, type WizardDraft } from "../new-order/draft";
import CartDrawer from "./CartDrawer";

const MATT = "22222222-2222-2222-2222-222222222222";
const BED = "55555555-5555-5555-5555-555555555555";

function sku(
  over: Partial<CatalogResponse["skus"][number]> & { sku: string; modelId: string },
) {
  return {
    id: `id-${over.sku}`,
    variant: "Queen",
    variantKind: "size" as const,
    price: 1200,
    cost: null,
    supplierId: null,
    posActive: true,
    description: `${over.sku} desc`,
    pwpPrice: null as number | null,
    ...over,
  };
}

function catalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: MATT, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: BED, category: "bedframe", modelKey: "bed-x", name: "Bed X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      sku({ sku: "MATT-A", modelId: MATT }),
      sku({ sku: "BED-A", modelId: BED, price: 800, description: "Bed Frame", pwpPrice: 300 }),
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    combos: [],
    sofaCombos: [],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    pwpRules: [],
    ...over,
  };
}

const pwpRule: PwpRuleDto = {
  id: "rule-pwp",
  type: "pwp",
  triggerCategory: "mattress",
  triggerTargets: [],
  rewardCategory: "bedframe",
  rewardTargets: [],
  qtyPerTrigger: 1,
  active: true,
};
const promoRule: PwpRuleDto = { ...pwpRule, id: "rule-promo", type: "promo" };

/** A cart with a MATTRESS trigger (T1) + a BEDFRAME reward (R1). */
function cartTriggerPlusReward(rewardOver: Partial<DraftLine> = {}): WizardDraft {
  return {
    ...emptyDraft(),
    lines: [
      { localId: "T1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen" },
      { localId: "R1", sku: "BED-A", qty: 1, attrs: null, unitPrice: 800, label: "Bed X · Queen", ...rewardOver },
    ],
  };
}

const noop = () => {};

describe("CartDrawer — PWP 'Use PWP price'", () => {
  it("a reward line with a trigger present shows the PWP toggle previewing the pwpPrice", () => {
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
      />,
    );
    const btn = screen.getByTestId("pwp-toggle-R1-rule-pwp");
    expect(btn.textContent).toContain("RM 300.00");
  });

  it("clicking the toggle marks attrs.pwp = { ruleId } + forces the preview price", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
      />,
    );
    fireEvent.click(screen.getByTestId("pwp-toggle-R1-rule-pwp"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const reward = next.lines.find((l) => l.localId === "R1")!;
    expect(reward.unitPrice).toBe(300);
    expect(reward.origUnitPrice).toBe(800);
    expect((reward.attrs as Record<string, unknown>).pwp).toEqual({ ruleId: "rule-pwp" });
  });

  it("a promo reward previews FREE and zeroes the price on claim", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [promoRule] })}
      />,
    );
    const btn = screen.getByTestId("pwp-toggle-R1-rule-promo");
    expect(btn.textContent).toContain("FREE");
    fireEvent.click(btn);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const reward = next.lines.find((l) => l.localId === "R1")!;
    expect(reward.unitPrice).toBe(0);
    expect((reward.attrs as Record<string, unknown>).pwp).toEqual({ ruleId: "rule-promo" });
  });

  it("a claimed PWP line renders the claim + an Undo that restores the price", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={cartTriggerPlusReward({ unitPrice: 300, origUnitPrice: 800, attrs: { pwp: { ruleId: "rule-pwp" } } })}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
      />,
    );
    expect(screen.getByTestId("pwp-claimed-R1").textContent).toContain("RM 300.00");
    fireEvent.click(screen.getByTestId("undo-pwp-R1"));
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const reward = next.lines.find((l) => l.localId === "R1")!;
    expect(reward.unitPrice).toBe(800);
    expect((reward.attrs as Record<string, unknown> | null)?.pwp).toBeUndefined();
  });

  it("a claimed promo line renders FREE", () => {
    render(
      <CartDrawer
        draft={cartTriggerPlusReward({ unitPrice: 0, origUnitPrice: 800, attrs: { pwp: { ruleId: "rule-promo" } } })}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [promoRule] })}
      />,
    );
    expect(screen.getByTestId("cart-line-free-R1")).toBeInTheDocument();
  });

  it("no trigger in the cart → no PWP toggle", () => {
    // Reward only — no mattress trigger present.
    const draft = {
      ...emptyDraft(),
      lines: [{ localId: "R1", sku: "BED-A", qty: 1, attrs: null, unitPrice: 800, label: "Bed X · Queen" }],
    };
    render(
      <CartDrawer draft={draft} onChange={noop} onProceed={noop} onClose={noop} catalog={catalog({ pwpRules: [pwpRule] })} />,
    );
    expect(screen.queryByTestId("pwp-toggle-R1-rule-pwp")).not.toBeInTheDocument();
  });

  it("DORMANT: no rules → no PWP toggle", () => {
    render(
      <CartDrawer draft={cartTriggerPlusReward()} onChange={noop} onProceed={noop} onClose={noop} catalog={catalog()} />,
    );
    expect(screen.queryByTestId("pwp-toggle-R1-rule-pwp")).not.toBeInTheDocument();
  });

  it("no catalog prop → byte-identical (no PWP toggle)", () => {
    render(<CartDrawer draft={cartTriggerPlusReward()} onChange={noop} onProceed={noop} onClose={noop} />);
    expect(screen.queryByTestId("pwp-toggle-R1-rule-pwp")).not.toBeInTheDocument();
  });
});
