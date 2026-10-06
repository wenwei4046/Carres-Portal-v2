/**
 * CartDrawer — 2990s Products parity Phase 8d (cross-order voucher carry-forward,
 * migration 0188). Asserts the CROSS-ORDER affordance the cart adds on top of the
 * P8c same-cart Auto-Fill:
 *   - phone-gated: with NO customer phone the cross-order row shows a "enter phone"
 *     hint (no discovery, no bind);
 *   - auto-suggest: a phone-matched AVAILABLE voucher whose covering rule applies
 *     shows "Redeem saved …"; clicking binds attrs.pwp = { ruleId, code,
 *     claimGroup, crossOrder: true } + forces the price;
 *   - manual entry: typing a code → onApplyVoucherCode; a phone-matched code binds
 *     (crossOrder); a mismatched-phone code shows "different customer" + no bind;
 *   - DORMANT: 0 active rules → no PwpRow at all → no discovery / no cross row.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type {
  CatalogResponse,
  PwpCodeDto,
  PwpDiscoverDto,
  PwpRuleDto,
} from "@carres/shared";
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

function voucher(over: Partial<PwpDiscoverDto> & { code: string }): PwpDiscoverDto {
  return {
    ruleId: "rule-pwp",
    type: "pwp",
    rewardCategory: "bedframe",
    rewardTargets: [],
    sourceOrderId: "99999999-9999-9999-9999-999999999999",
    expiresAt: null,
    phoneMatches: true,
    nameMatches: true,
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
const noReserved: PwpCodeDto[] = [];

describe("CartDrawer — PWP cross-order voucher (P8d)", () => {
  it("phone EMPTY → shows the enter-phone hint, no bind affordance", () => {
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone=""
        pwpAvailableVouchers={[voucher({ code: "PWP-AAAA1111" })]}
        onApplyVoucherCode={vi.fn()}
      />,
    );
    expect(screen.getByTestId("pwp-cross-need-phone-R1")).toBeInTheDocument();
    // No suggestion / manual field when phone is absent.
    expect(screen.queryByTestId("pwp-cross-input-R1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pwp-cross-suggest-R1-PWP-AAAA1111")).not.toBeInTheDocument();
  });

  it("auto-suggest: a phone-matched AVAILABLE voucher binds { …, crossOrder: true } + forces price", () => {
    const onChange = vi.fn();
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[voucher({ code: "PWP-AAAA1111", phoneMatches: true })]}
        onApplyVoucherCode={vi.fn()}
      />,
    );
    const suggest = screen.getByTestId("pwp-cross-suggest-R1-PWP-AAAA1111");
    fireEvent.click(suggest);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const reward = next.lines.find((l) => l.localId === "R1")!;
    expect(reward.unitPrice).toBe(300);
    expect(reward.origUnitPrice).toBe(800);
    expect((reward.attrs as Record<string, unknown>).pwp).toEqual({
      ruleId: "rule-pwp",
      code: "PWP-AAAA1111",
      claimGroup: "cg-1",
      crossOrder: true,
    });
  });

  it("auto-suggest hides a NON-matching-phone voucher (phoneMatches false)", () => {
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={vi.fn()}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[voucher({ code: "PWP-BBBB2222", phoneMatches: false })]}
        onApplyVoucherCode={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("pwp-cross-suggest-R1-PWP-BBBB2222")).not.toBeInTheDocument();
  });

  it("manual entry: a phone-matched code binds (crossOrder)", async () => {
    const onChange = vi.fn();
    const lookup = vi.fn(async () => voucher({ code: "PWP-CCCC3333", phoneMatches: true }));
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[]}
        onApplyVoucherCode={lookup}
      />,
    );
    fireEvent.change(screen.getByTestId("pwp-cross-input-R1"), {
      target: { value: "PWP-CCCC3333" },
    });
    fireEvent.click(screen.getByTestId("pwp-cross-apply-R1"));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(lookup).toHaveBeenCalledWith("PWP-CCCC3333");
    const reward = (onChange.mock.calls[0][0] as WizardDraft).lines.find((l) => l.localId === "R1")!;
    expect((reward.attrs as Record<string, unknown>).pwp).toMatchObject({
      code: "PWP-CCCC3333",
      crossOrder: true,
    });
  });

  it("manual entry: a MISMATCHED-phone code shows 'different customer' + no bind", async () => {
    const onChange = vi.fn();
    const lookup = vi.fn(async () => voucher({ code: "PWP-DDDD4444", phoneMatches: false }));
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[]}
        onApplyVoucherCode={lookup}
      />,
    );
    fireEvent.change(screen.getByTestId("pwp-cross-input-R1"), {
      target: { value: "PWP-DDDD4444" },
    });
    fireEvent.click(screen.getByTestId("pwp-cross-apply-R1"));
    await waitFor(() => expect(screen.getByTestId("pwp-cross-error-R1")).toBeInTheDocument());
    expect(screen.getByTestId("pwp-cross-error-R1").textContent).toMatch(/different customer/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("manual entry: a code not found → 'not found' + no bind", async () => {
    const onChange = vi.fn();
    const lookup = vi.fn(async () => null);
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={onChange}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[]}
        onApplyVoucherCode={lookup}
      />,
    );
    fireEvent.change(screen.getByTestId("pwp-cross-input-R1"), {
      target: { value: "PWP-NONE0000" },
    });
    fireEvent.click(screen.getByTestId("pwp-cross-apply-R1"));
    await waitFor(() => expect(screen.getByTestId("pwp-cross-error-R1")).toBeInTheDocument());
    expect(screen.getByTestId("pwp-cross-error-R1").textContent).toMatch(/not found/i);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("DORMANT: 0 active rules → no PwpRow → no cross-order affordance at all", () => {
    render(
      <CartDrawer
        draft={cartTriggerPlusReward()}
        onChange={vi.fn()}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[voucher({ code: "PWP-EEEE5555" })]}
        onApplyVoucherCode={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("pwp-cross-R1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pwp-cross-need-phone-R1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pwp-cross-suggest-R1-PWP-EEEE5555")).not.toBeInTheDocument();
  });
});

/**
 * ⭐ THE REWARD-ONLY CART (2026-08-24) — the journey carry-forward exists for.
 *
 * The customer bought a mattress in June and comes back in August for the
 * bedframe ALONE. Every test above puts a trigger in the cart, which is the one
 * case a saved voucher is not needed: the same-cart offer already covers it.
 *
 * Two gates hid the surface from a reward-only cart, and BOTH had to go:
 *   1. `PwpRow` returned null when `coveringPwpForLine` was empty — no trigger,
 *      no row, so not even the box to type a voucher number into.
 *   2. `ruleForVoucher` required the voucher's rule to be in that same-cart
 *      covering set, so a typed code was refused with "doesn't apply to this
 *      product" when it did apply.
 */
describe("CartDrawer — cross-order voucher on a REWARD-ONLY cart", () => {
  /** A cart with the BEDFRAME reward and NO mattress trigger. */
  function rewardOnlyCart(): WizardDraft {
    return {
      ...emptyDraft(),
      lines: [
        { localId: "R1", sku: "BED-A", qty: 1, attrs: null, unitPrice: 800, label: "Bed X · Queen" },
      ],
    };
  }

  function renderRewardOnly(over: Partial<React.ComponentProps<typeof CartDrawer>> = {}) {
    return render(
      <CartDrawer
        draft={rewardOnlyCart()}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[voucher({ code: "PWP-AAAA1111" })]}
        onApplyVoucherCode={vi.fn()}
        {...over}
      />,
    );
  }

  it("⭐ offers the saved voucher with NO trigger in the cart", () => {
    renderRewardOnly();
    expect(screen.getByTestId("pwp-cross-suggest-R1-PWP-AAAA1111")).toBeInTheDocument();
  });

  it("⭐ binding it forces the price and stamps crossOrder", () => {
    const onChange = vi.fn();
    renderRewardOnly({ onChange });
    fireEvent.click(screen.getByTestId("pwp-cross-suggest-R1-PWP-AAAA1111"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as WizardDraft;
    const marked = next.lines[0]!;
    expect(marked.unitPrice).toBe(300);
    const marker = (marked.attrs as Record<string, unknown>).pwp as Record<string, unknown>;
    expect(marker.crossOrder).toBe(true);
    expect(marker.code).toBe("PWP-AAAA1111");
  });

  it("the manual code box is reachable without a trigger", () => {
    // Discovery is phone-based; a customer whose phone is not on file still has
    // the printed code on their old SO, so the box must exist regardless.
    renderRewardOnly({ pwpAvailableVouchers: [] });
    expect(screen.getByTestId("pwp-cross-input-R1")).toBeInTheDocument();
  });

  it("the SAME-CART chips do NOT appear — there is no trigger to grant from", () => {
    // The two surfaces stay separate. Showing a same-cart chip here would offer
    // a claim the server refuses, which is the honest-pricing rule inverted.
    renderRewardOnly();
    expect(screen.queryByTestId("pwp-toggle-R1-rule-pwp")).not.toBeInTheDocument();
  });

  it("NEGATIVE CONTROL: a voucher whose FROZEN scope misses this line is not offered", () => {
    // The snapshot says mattress; the line is a bedframe. Judged by the voucher's
    // own snapshot, never by today's rule.
    renderRewardOnly({
      pwpAvailableVouchers: [voucher({ code: "PWP-BBBB2222", rewardCategory: "mattress" })],
    });
    expect(screen.queryByTestId("pwp-cross-suggest-R1-PWP-BBBB2222")).not.toBeInTheDocument();
  });

  it("NEGATIVE CONTROL: a line no rule could ever reward shows nothing at all", () => {
    // `rewardCapableRules` is the visibility gate — a product that is never a
    // reward keeps a normal cart exactly as quiet as it is today.
    render(
      <CartDrawer
        draft={{
          ...emptyDraft(),
          lines: [
            { localId: "R1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen" },
          ],
        }}
        onChange={noop}
        onProceed={noop}
        onClose={noop}
        catalog={catalog({ pwpRules: [pwpRule] })}
        pwpReservedCodes={noReserved}
        pwpClaimGroup="cg-1"
        customerPhone="0123456789"
        pwpAvailableVouchers={[voucher({ code: "PWP-AAAA1111" })]}
        onApplyVoucherCode={vi.fn()}
      />,
    );
    // MATT-A is a TRIGGER product, never a reward under this rule.
    expect(screen.queryByTestId("pwp-cross-input-R1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pwp-cross-need-phone-R1")).not.toBeInTheDocument();
  });

  it("DORMANT: no active rules → no voucher surface on a reward-only cart", () => {
    renderRewardOnly({ catalog: catalog({ pwpRules: [] }) });
    expect(screen.queryByTestId("pwp-cross-input-R1")).not.toBeInTheDocument();
  });
});
