/**
 * PosConfigurePage — the PWP & Promo voucher bar (2990s configurator rail
 * parity). A REAL apply, not a hint: the emitted DraftLine is PWP-claimed via
 * the SAME markLinePwp* helpers the cart uses, so the submit pipeline sees an
 * identical claim to one made in the CartDrawer.
 *
 *   - DORMANT: no catalog / no active pwp_rules → the section never renders,
 *     and the emitted DraftLine is byte-identical to before;
 *   - Auto Fill: a same-cart RESERVED code under a covering rule binds
 *     attrs.pwp = { ruleId, code, claimGroup }, forces the preview price to the
 *     sku's pwpPrice, and locks qty at 1;
 *   - manual entry of a reserved code binds the same claim;
 *   - manual entry of a cross-order (saved) voucher goes through
 *     onApplyVoucherCode and stamps crossOrder: true — phone-gated;
 *   - Remove reverts to the normal price.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type {
  CatalogResponse,
  ProductModelDto,
  ProductSkuDto,
  PwpCodeDto,
  PwpDiscoverDto,
  PwpRuleDto,
} from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import PosConfigurePage from "./PosConfigurePage";

const MATT = "22222222-2222-2222-2222-222222222222";
const BED = "55555555-5555-5555-5555-555555555555";

function mattressModel(): ProductModelDto {
  return {
    id: MATT,
    category: "mattress",
    modelKey: "matt-x",
    name: "Matt X",
    blurb: null,
    colors: null,
    gaps: null,
    sofaMode: null,
  } as ProductModelDto;
}

const mattressSkus: ProductSkuDto[] = [
  {
    id: "s1",
    modelId: MATT,
    sku: "MATT-A",
    variant: "Queen",
    variantKind: "size",
    price: 1200,
    cost: null,
    supplierId: null,
  } as ProductSkuDto,
];

function catalogSku(
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

/** Rule: buying a BEDFRAME unlocks a MATTRESS at its PWP price. */
const pwpRule: PwpRuleDto = {
  id: "rule-pwp",
  type: "pwp",
  triggerCategory: "bedframe",
  triggerTargets: [],
  rewardCategory: "mattress",
  rewardTargets: [],
  qtyPerTrigger: 1,
  active: true,
  carryForward: true,
  carryForwardDays: null,
};

function catalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      { id: MATT, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
      { id: BED, category: "bedframe", modelKey: "bed-x", name: "Bed X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      catalogSku({ sku: "MATT-A", modelId: MATT, pwpPrice: 999 }),
      catalogSku({ sku: "BED-A", modelId: BED, price: 800 }),
    ],
    sofaFabrics: [],
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    sofaCombos: [],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    pwpRules: [pwpRule],
    ...over,
  } as CatalogResponse;
}

/** A cart holding the BEDFRAME trigger. */
const triggerCart: DraftLine[] = [
  { localId: "T1", sku: "BED-A", qty: 1, attrs: null, unitPrice: 800, label: "Bed X · Queen" },
];

function reservedCode(over: Partial<PwpCodeDto> & { code: string; ruleId: string }): PwpCodeDto {
  return {
    type: "pwp",
    rewardCategory: "mattress",
    rewardTargets: [],
    status: "RESERVED",
    ownerStaffId: "11111111-1111-1111-1111-111111111111",
    cartLineKey: "T1",
    triggerItemCode: "BED-A",
    claimGroup: null,
    redeemedOrderId: null,
    redeemedItemSku: null,
    sourceOrderId: null,
    customerId: null,
    boundCustomerPhone: null,
    ownerDealerId: null,
    expiresAt: null,
    createdAt: "2026-07-11T00:00:00Z",
    updatedAt: "2026-07-11T00:00:00Z",
    ...over,
  };
}

function voucher(over: Partial<PwpDiscoverDto> & { code: string }): PwpDiscoverDto {
  return {
    ruleId: "rule-pwp",
    type: "pwp",
    rewardCategory: "mattress",
    rewardTargets: [],
    sourceOrderId: null,
    expiresAt: null,
    phoneMatches: true,
    nameMatches: true,
    ...over,
  };
}

const noop = () => {};

function renderPage(over: Partial<Parameters<typeof PosConfigurePage>[0]> = {}) {
  const onAdd = vi.fn();
  render(
    <PosConfigurePage
      model={mattressModel()}
      meta={undefined}
      skus={mattressSkus}
      catalog={catalog()}
      cartLines={triggerCart}
      pwpReservedCodes={[reservedCode({ code: "PWP-1234ABCD", ruleId: "rule-pwp" })]}
      pwpClaimGroup="cg-1"
      onAdd={onAdd}
      onClose={noop}
      {...over}
    />,
  );
  return { onAdd };
}

describe("PosConfigurePage — PWP voucher bar", () => {
  it("DORMANT: no catalog → no section; emitted line unchanged", () => {
    const onAdd = vi.fn();
    render(
      <PosConfigurePage
        model={mattressModel()}
        meta={undefined}
        skus={mattressSkus}
        onAdd={onAdd}
        onClose={noop}
      />,
    );
    expect(screen.queryByTestId("cfg-pwp-section")).toBeNull();
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0];
    expect(line.unitPrice).toBe(1200);
    expect(line.attrs).toBeNull();
  });

  it("no active rules → no section even with a catalog", () => {
    renderPage({ catalog: catalog({ pwpRules: [{ ...pwpRule, active: false }] }) });
    expect(screen.queryByTestId("cfg-pwp-section")).toBeNull();
  });

  it("Auto Fill binds { ruleId, code, claimGroup }, forces the PWP price, locks qty at 1", () => {
    const { onAdd } = renderPage();
    fireEvent.click(screen.getByTestId("cfg-size-s1"));

    // The ready hint + Auto Fill appear once the reward size is picked.
    expect(screen.getByTestId("cfg-pwp-ready")).toBeTruthy();
    fireEvent.click(screen.getByTestId("cfg-pwp-autofill"));

    const applied = screen.getByTestId("cfg-pwp-applied");
    expect(applied.textContent).toContain("PWP-1234ABCD");
    expect(applied.textContent).toContain("999");
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("999");
    // qty is locked at 1 while a voucher is applied.
    expect(screen.getByLabelText("Increase quantity")).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0];
    expect(line.sku).toBe("MATT-A");
    expect(line.qty).toBe(1);
    expect(line.unitPrice).toBe(999);
    expect(line.origUnitPrice).toBe(1200);
    expect(line.attrs?.pwp).toEqual({
      ruleId: "rule-pwp",
      code: "PWP-1234ABCD",
      claimGroup: "cg-1",
    });
  });

  it("typing a same-cart RESERVED code + Apply binds it like Auto Fill", () => {
    const { onAdd } = renderPage();
    fireEvent.click(screen.getByTestId("cfg-size-s1"));

    fireEvent.change(screen.getByTestId("cfg-pwp-input"), {
      target: { value: "pwp-1234abcd" },
    });
    fireEvent.click(screen.getByTestId("cfg-pwp-apply"));

    expect(screen.getByTestId("cfg-pwp-applied").textContent).toContain("PWP-1234ABCD");
    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    expect(onAdd.mock.calls[0][0].attrs?.pwp).toEqual({
      ruleId: "rule-pwp",
      code: "PWP-1234ABCD",
      claimGroup: "cg-1",
    });
  });

  it("a cross-order (saved) voucher applies via onApplyVoucherCode and stamps crossOrder", async () => {
    const lookup = vi.fn().mockResolvedValue(voucher({ code: "PWP-CROSS111" }));
    const { onAdd } = renderPage({
      pwpReservedCodes: [],
      customerPhone: "0123456789",
      onApplyVoucherCode: lookup,
    });
    fireEvent.click(screen.getByTestId("cfg-size-s1"));

    fireEvent.change(screen.getByTestId("cfg-pwp-input"), {
      target: { value: "pwp-cross111" },
    });
    fireEvent.click(screen.getByTestId("cfg-pwp-apply"));

    const applied = await screen.findByTestId("cfg-pwp-applied");
    expect(lookup).toHaveBeenCalledWith("PWP-CROSS111");
    expect(applied.textContent).toContain("PWP-CROSS111");

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    expect(onAdd.mock.calls[0][0].attrs?.pwp).toEqual({
      ruleId: "rule-pwp",
      code: "PWP-CROSS111",
      claimGroup: "cg-1",
      crossOrder: true,
    });
  });

  it("cross-order apply without a customer phone is refused with the step-02 hint", () => {
    const lookup = vi.fn();
    renderPage({ pwpReservedCodes: [], onApplyVoucherCode: lookup });
    fireEvent.click(screen.getByTestId("cfg-size-s1"));

    fireEvent.change(screen.getByTestId("cfg-pwp-input"), {
      target: { value: "PWP-CROSS111" },
    });
    fireEvent.click(screen.getByTestId("cfg-pwp-apply"));

    expect(lookup).not.toHaveBeenCalled();
    expect(screen.getByTestId("cfg-pwp-error").textContent).toContain("step 02");
  });

  it("a voucher for a different customer is refused", async () => {
    const lookup = vi
      .fn()
      .mockResolvedValue(voucher({ code: "PWP-CROSS111", phoneMatches: false }));
    renderPage({
      pwpReservedCodes: [],
      customerPhone: "0123456789",
      onApplyVoucherCode: lookup,
    });
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.change(screen.getByTestId("cfg-pwp-input"), {
      target: { value: "PWP-CROSS111" },
    });
    fireEvent.click(screen.getByTestId("cfg-pwp-apply"));

    const err = await screen.findByTestId("cfg-pwp-error");
    expect(err.textContent).toContain("different customer");
    expect(screen.queryByTestId("cfg-pwp-applied")).toBeNull();
  });

  it("Remove reverts to the normal price and re-enables qty", () => {
    const { onAdd } = renderPage();
    fireEvent.click(screen.getByTestId("cfg-size-s1"));
    fireEvent.click(screen.getByTestId("cfg-pwp-autofill"));
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("999");

    fireEvent.click(screen.getByTestId("cfg-pwp-remove"));
    expect(screen.queryByTestId("cfg-pwp-applied")).toBeNull();
    expect(screen.getByTestId("cfg-live-total").textContent).toContain("1,200");
    expect(screen.getByLabelText("Increase quantity")).toHaveProperty("disabled", false);

    fireEvent.click(screen.getByTestId("cfg-add-to-cart"));
    const line = onAdd.mock.calls[0][0];
    expect(line.unitPrice).toBe(1200);
    expect(line.attrs).toBeNull();
  });

  it("no qualifying trigger in the cart → no Auto Fill; a reserved code typed in is refused", () => {
    renderPage({ cartLines: [] });
    fireEvent.click(screen.getByTestId("cfg-size-s1"));

    expect(screen.queryByTestId("cfg-pwp-autofill")).toBeNull();
    fireEvent.change(screen.getByTestId("cfg-pwp-input"), {
      target: { value: "PWP-1234ABCD" },
    });
    fireEvent.click(screen.getByTestId("cfg-pwp-apply"));
    expect(screen.getByTestId("cfg-pwp-error").textContent).toContain(
      "doesn't apply to this product",
    );
  });
});
