/**
 * CartDrawer — 2990s Products parity Phase 8c (PWP voucher Auto-Fill, migration
 * 0187). Asserts the SAME-CART voucher binding wiring on top of P8b's price
 * preview:
 *   - a reward line with a backing RESERVED code (under its covering rule) shows
 *     the toggle ENABLED; clicking binds attrs.pwp = { ruleId, code, claimGroup }
 *     (the reserved code + the per-cart claimGroup) and forces the preview price;
 *   - a RESERVED code already bound to another reward line is NOT re-offered (one
 *     code = one reward) → the toggle is disabled when none is free;
 *   - with the voucher layer present but NO reserved code, the toggle is disabled
 *     ("buy the trigger to unlock");
 *   - with NO claimGroup wired (DORMANT / P8b-only callers), the toggle falls
 *     back to the code-less P8b claim ({ ruleId } only) — byte-identical.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { CatalogResponse, PwpCodeDto, PwpRuleDto } from "@carres/shared";
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
  carryForward: true,
  carryForwardDays: null,
};

/** A RESERVED pwp_code minted under `ruleId` (the rest dormant/null per P8c). */
function reservedCode(over: Partial<PwpCodeDto> & { code: string; ruleId: string }): PwpCodeDto {
  return {
    type: "pwp",
    rewardCategory: "bedframe",
    rewardTargets: [],
    status: "RESERVED",
    ownerStaffId: "11111111-1111-1111-1111-111111111111",
    cartLineKey: "T1",
    triggerItemCode: "MATT-A",
    claimGroup: null,
    redeemedOrderId: null,
    redeemedItemSku: null,
    sourceOrderId: null,
    customerId: null,
    boundCustomerPhone: null,
    ownerDealerId: null,
    expiresAt: null,
    createdAt: "2026-06-28T00:00:00Z",
    updatedAt: "2026-06-28T00:00:00Z",
    ...over,
  };
}

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

describe("CartDrawer — PWP voucher Auto-Fill (P8c)", () => {
  it("with a RESERVED code + claimGroup, clicking binds { ruleId, code, claimGroup } + forces the price", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={[reservedCode({ code: "PWP-1234ABCD", ruleId: "rule-pwp" })]}
        pwpClaimGroup="cg-cart-1"
      />,
    );
    const btn = screen.getByTestId("pwp-toggle-R1-rule-pwp");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const reward = next.lines.find((l) => l.localId === "R1")!;
    expect(reward.unitPrice).toBe(300);
    expect(reward.origUnitPrice).toBe(800);
    expect((reward.attrs as Record<string, unknown>).pwp).toEqual({
      ruleId: "rule-pwp",
      code: "PWP-1234ABCD",
      claimGroup: "cg-cart-1",
    });
  });

  it("with the voucher layer on but NO reserved code, the toggle is disabled (buy the trigger to unlock)", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={[]}
        pwpClaimGroup="cg-cart-1"
      />,
    );
    const btn = screen.getByTestId("pwp-toggle-R1-rule-pwp");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a RESERVED code already bound to another reward line is not re-offered", () => {
    const onChange = vi.fn();
    // Two reward lines, ONE reserved code already bound to R1 → R2 has none free.
    const draft: WizardDraft = {
      ...emptyDraft(),
      lines: [
        { localId: "T1", sku: "MATT-A", qty: 2, attrs: null, unitPrice: 1200, label: "Matt X · Queen" },
        {
          localId: "R1",
          sku: "BED-A",
          qty: 1,
          unitPrice: 300,
          origUnitPrice: 800,
          attrs: { pwp: { ruleId: "rule-pwp", code: "PWP-1234ABCD", claimGroup: "cg-cart-1" } },
          label: "Bed X · Queen",
        },
        { localId: "R2", sku: "BED-A", qty: 1, attrs: null, unitPrice: 800, label: "Bed X · Queen" },
      ],
    };
    render(
      <CartDrawer
        draft={draft}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={[reservedCode({ code: "PWP-1234ABCD", ruleId: "rule-pwp" })]}
        pwpClaimGroup="cg-cart-1"
      />,
    );
    // R1 is claimed → shows the claim, not a toggle.
    expect(screen.getByTestId("pwp-claimed-R1")).toBeInTheDocument();
    // R2's toggle exists but is disabled (the only reserved code is taken by R1).
    const r2 = screen.getByTestId("pwp-toggle-R2-rule-pwp");
    expect(r2).toBeDisabled();
  });

  it("DORMANT (no claimGroup wired) → the toggle falls back to the code-less P8b claim", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        /* no pwpReservedCodes / pwpClaimGroup — older/dormant caller */
      />,
    );
    const btn = screen.getByTestId("pwp-toggle-R1-rule-pwp");
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const reward = next.lines.find((l) => l.localId === "R1")!;
    expect(reward.unitPrice).toBe(300);
    expect((reward.attrs as Record<string, unknown>).pwp).toEqual({ ruleId: "rule-pwp" });
  });
});
