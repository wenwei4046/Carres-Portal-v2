/**
 * SofaConfigurePage — full-page sofa configurator (Quick pick + Customize).
 *   · quick picks list this model's active combos (title / composition / price)
 *   · picking one loads the canvas pre-seeded (mode flips to Customize)
 *   · no combos → lands straight on Customize (Quick pick tab disabled)
 *   · comboSeedCells lays modules flush left→right, tops aligned
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type {
  CatalogFabricDto,
  CatalogResponse,
  ModelSofaCompartmentDto,
  ProductModelDto,
  ProductSkuDto,
  PwpCodeDto,
  PwpDiscoverDto,
  PwpRuleDto,
  SofaComboDto,
  SofaCompartmentDto,
  SofaFabricDto,
} from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import {
  analyzeSofa,
  cellsBbox,
  findModule,
  groupSofas,
  moduleFootprint,
  ROOM_H,
  ROOM_W,
} from "@carres/shared";

// Mock the PWP availability hook (usePwpAvailableForPhone) so the component's
// useQuery has no QueryClient dependency + the voucher result is controllable.
const { pwpMock, roleMock, deleteMock } = vi.hoisted(() => ({
  pwpMock: { current: { data: { vouchers: [] as { code: string }[] }, isFetching: false } },
  roleMock: { current: null as string | null },
  deleteMock: { mutate: vi.fn(), isPending: false },
}));
vi.mock("@/lib/queries", () => ({
  usePwpAvailableForPhone: () => pwpMock.current,
  // 0206 — principal deletes a quick pick from its card.
  useDeleteSofaCombo: () => deleteMock,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// The principal-only "Create combo" gate reads useAuth((s) => s.role).
vi.mock("@/lib/auth", () => ({
  useAuth: (selector: (s: { role: string | null }) => unknown) =>
    selector({ role: roleMock.current }),
}));

import SofaConfigurePage, { centerSeedInRoom, comboSeedCells } from "./SofaConfigurePage";

beforeAll(() => {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// Default to a non-principal role; the Create-combo gate tests opt in.
beforeEach(() => {
  roleMock.current = null;
  deleteMock.mutate.mockClear();
});

const MODEL: ProductModelDto = {
  id: "00000000-0000-0000-0000-000000000001",
  category: "sofa",
  modelKey: "booqit",
  name: "Booqit",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "custom",
};

const POOL: SofaCompartmentDto[] = [
  { id: "c-1alhf", code: "1A(LHF)", description: null, seatCount: 1, armConfig: "LHF", iconUrl: null, defaultPrice: 1200, sortOrder: 0, active: true },
  { id: "c-2arhf", code: "2A(RHF)", description: null, seatCount: 2, armConfig: "RHF", iconUrl: null, defaultPrice: 1900, sortOrder: 1, active: true },
];

const OFFERED: ModelSofaCompartmentDto[] = POOL.map((p, i) => ({
  modelId: MODEL.id,
  compartmentId: p.id,
  priceOverride: null,
  sortOrder: i,
}));

const FABRICS: SofaFabricDto[] = [
  { id: "f-1", modelId: MODEL.id, fabricName: "Linen Beige", surcharge: 0, colors: null, tier: "PRICE_1" },
];

// Master Fabrics-tab rows across two series (0202 `series`). A model opts in via
// allowedOptions.fabrics (the fabric CODES). Used to exercise the SERIES → COLOUR
// cascade + KIV.
const MASTER_FABRICS: CatalogFabricDto[] = [
  { id: "mf-ez1", fabricCode: "EZ-001", series: "EZ", description: "Pearl", supplierCode: null, sofaTier: "PRICE_2", bedframeTier: "PRICE_1", active: true, sortOrder: 0 },
  { id: "mf-ez2", fabricCode: "EZ-002", series: "EZ", description: "Sand", supplierCode: null, sofaTier: "PRICE_2", bedframeTier: "PRICE_1", active: true, sortOrder: 1 },
  { id: "mf-k1", fabricCode: "K-001", series: "K", description: "Coal", supplierCode: null, sofaTier: "PRICE_2", bedframeTier: "PRICE_1", active: true, sortOrder: 2 },
];

const COMBO: SofaComboDto = {
  id: "00000000-0000-0000-0000-00000000c001",
  modelId: MODEL.id,
  slots: [["1A(LHF)"], ["2A(RHF)"]],
  tier: null,
  pricesByHeight: { "24": 2990, "28": 3190 },
  costByHeight: null,
  pwpPricesByHeight: null,
  label: "Corner starter",
  effectiveFrom: "2026-06-01",
  active: true,
  discontinuedAt: null,
  // 0206 — a Quick Pick preset so it appears in the Quick pick tab.
  isQuickPick: true,
};

const PRESET_SKU: ProductSkuDto = {
  id: "sku-preset",
  modelId: MODEL.id,
  sku: "BOOQIT-PRESET",
  variant: "3-seater",
  variantKind: "preset",
  price: 2990,
  cost: null,
  supplierId: null,
};

// ── PWP real-apply fixtures ──────────────────────────────────────────────────
// Rule: buying a MATTRESS unlocks THIS sofa combo at its PWP price (sofa
// rewards are combo-targeted, 0186 sofa-as-reward). The combo carries a PWP
// price at 24″ so the swapped engine total is deterministic (1,500).
const PWP_COMBO: SofaComboDto = { ...COMBO, pwpPricesByHeight: { "24": 1500 } };

const SOFA_RULE: PwpRuleDto = {
  id: "rule-sofa",
  type: "pwp",
  triggerCategory: "mattress",
  triggerTargets: [],
  rewardCategory: "sofa",
  rewardTargets: [{ scope: "combo", modelId: "", comboIds: [PWP_COMBO.id] }],
  qtyPerTrigger: 1,
  active: true,
  carryForward: true,
  carryForwardDays: null,
};

const MATT_MODEL_ID = "00000000-0000-0000-0000-0000000000ma";

function pwpCatalog(over?: Partial<CatalogResponse>): CatalogResponse {
  return {
    models: [
      MODEL,
      { id: MATT_MODEL_ID, category: "mattress", modelKey: "matt-x", name: "Matt X", blurb: null, colors: null, gaps: null, sofaMode: null },
    ],
    skus: [
      { id: "cs-1", modelId: MODEL.id, sku: PRESET_SKU.sku, variant: "3-seater", variantKind: "preset", price: 2990, cost: null, supplierId: null, posActive: true, description: null, pwpPrice: null },
      { id: "cs-2", modelId: MATT_MODEL_ID, sku: "MATT-A", variant: "Queen", variantKind: "size", price: 1200, cost: null, supplierId: null, posActive: true, description: null, pwpPrice: null },
    ],
    sofaFabrics: FABRICS,
    addons: [],
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
    sofaCompartments: POOL,
    modelSofaCompartments: OFFERED,
    sofaCombos: [PWP_COMBO],
    modelDefaultFreeGifts: [],
    freeItemCampaigns: [],
    pwpRules: [SOFA_RULE],
    ...over,
  } as CatalogResponse;
}

/** A cart holding the MATTRESS trigger line. */
const TRIGGER_CART: DraftLine[] = [
  { localId: "T1", sku: "MATT-A", qty: 1, attrs: null, unitPrice: 1200, label: "Matt X · Queen" },
];

function reservedCode(over: Partial<PwpCodeDto> & { code: string; ruleId: string }): PwpCodeDto {
  return {
    type: "pwp",
    rewardCategory: "sofa",
    rewardTargets: SOFA_RULE.rewardTargets,
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
    createdAt: "2026-07-11T00:00:00Z",
    updatedAt: "2026-07-11T00:00:00Z",
    ...over,
  };
}

function renderPage(over?: {
  combos?: SofaComboDto[];
  onClose?: () => void;
  skus?: ProductSkuDto[];
  fabrics?: SofaFabricDto[];
  masterFabrics?: CatalogFabricDto[] | null;
  model?: ProductModelDto;
  catalog?: CatalogResponse | null;
  cartLines?: DraftLine[];
  pwpReservedCodes?: PwpCodeDto[];
  pwpClaimGroup?: string;
  customerPhone?: string;
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
  wizardTopbar?: { contextLabel: string };
}) {
  const onAdd = vi.fn();
  const onClose = vi.fn(over?.onClose);
  render(
    <SofaConfigurePage
      model={over?.model ?? MODEL}
      meta={undefined}
      skus={over?.skus ?? []}
      fabrics={over?.fabrics ?? FABRICS}
      masterFabrics={over?.masterFabrics ?? null}
      fabricTierConfig={null}
      modelFabricTierOverrides={null}
      sofaCompartments={POOL}
      modelCompartments={OFFERED}
      sofaCombos={over?.combos ?? [COMBO]}
      catalog={over?.catalog}
      cartLines={over?.cartLines}
      pwpReservedCodes={over?.pwpReservedCodes}
      pwpClaimGroup={over?.pwpClaimGroup}
      customerPhone={over?.customerPhone}
      onApplyVoucherCode={over?.onApplyVoucherCode}
      onAdd={onAdd}
      onClose={onClose}
      wizardTopbar={over?.wizardTopbar}
    />,
  );
  return { onAdd, onClose };
}

// Loo 2026-07-26 (2990s reference) — the sofa header stays ONE row in the
// wizard: compact brand (logo + store, NO step pills) beside the ← arrow.
describe("SofaConfigurePage — wizard brand (compact)", () => {
  it("renders logo + crumb without step pills; keeps the ← arrow; logo = back", () => {
    const { onClose } = renderPage({ wizardTopbar: { contextLabel: "Carres Mont Kiara" } });
    const strip = screen.getByTestId("cfg-topbar-brand");
    expect(strip.textContent).toContain("POS · Carres Mont Kiara");
    expect(strip.textContent).not.toContain("Customer"); // no step pills
    expect(screen.getByTestId("sofa-configure-back")).toBeTruthy(); // arrow stays
    fireEvent.click(screen.getByTestId("cfg-topbar-logo"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("comboSeedCells", () => {
  it("lays slot-first codes flush left→right with a shared top y", () => {
    const cells = comboSeedCells(COMBO, "24");
    expect(cells.map((c) => c.moduleCode)).toEqual(["1A(LHF)", "2A(RHF)"]);
    const fp0 = moduleFootprint(findModule("1A(LHF)")!, 0, "24");
    expect(cells[1].x - cells[0].x).toBe(fp0.w); // flush — no gap
    expect(cells[1].y).toBe(cells[0].y); // tops aligned
    expect(cells.every((c) => c.rot === 0)).toBe(true);
  });

  it("a single-corner combo seeds as an L the arm-cap analysis accepts", () => {
    const cornerCombo: SofaComboDto = {
      ...COMBO,
      slots: [["1B(LHF)"], ["CNR"], ["2A(RHF)"]],
    };
    const cells = comboSeedCells(cornerCombo, "24");
    const withIds = cells.map((c, i) => ({ ...c, id: String(i) }));
    const groups = groupSofas(withIds, "24");
    expect(groups).toHaveLength(1); // one connected sofa
    expect(analyzeSofa(groups[0], "24").closed).toBe(true); // no arm collision
  });

  it("a Corner + 2-seater + 1-seater combo draws the 2990s L — 2-seater is the LONG top bar, 1-seater the SHORT chaise leg", () => {
    const cornerCombo: SofaComboDto = {
      ...COMBO,
      slots: [["1B(LHF)"], ["CNR"], ["2A(RHF)"]],
    };
    const cells = comboSeedCells(cornerCombo, "24");
    // Left→right walk order — leftmost closing side (the chaise) first.
    expect(cells.map((c) => c.moduleCode)).toEqual(["1B(LHF)", "CNR", "2A(RHF)"]);
    const [one, cnr, two] = cells;
    const cnrFp = moduleFootprint(findModule("CNR")!, 0, "24");
    const twoFp = moduleFootprint(findModule("2A(RHF)")!, 0, "24");
    const oneFp = moduleFootprint(findModule("1B(LHF)")!, 270, "24");
    // Corner top-left; 2A flush to its right on the SAME row (the long bar).
    expect(two.y).toBe(cnr.y);
    expect(two.x).toBe(cnr.x + cnrFp.w);
    expect(two.rot).toBe(0);
    // 1B drops straight below the corner (the short chaise leg), back on the outer left.
    expect(one.x).toBe(cnr.x);
    expect(one.y).toBe(cnr.y + cnrFp.h);
    expect(one.rot).toBe(270);
    // Overall ratio: WIDER than deep (253×200 at 24″) — the old seed drew 200×253.
    const w = cnrFp.w + twoFp.w;
    const h = cnrFp.h + oneFp.h;
    expect(w).toBe(253);
    expect(h).toBe(200);
    expect(w).toBeGreaterThan(h);
  });

  it("an RHF-chaise corner combo mirrors the whole L (2-seater left, chaise drops bottom-right)", () => {
    const mirrored: SofaComboDto = {
      ...COMBO,
      slots: [["2A(LHF)"], ["CNR"], ["1B(RHF)"]],
    };
    const cells = comboSeedCells(mirrored, "24");
    expect(cells.map((c) => c.moduleCode)).toEqual(["2A(LHF)", "CNR", "1B(RHF)"]);
    const [two, cnr, one] = cells;
    const twoFp = moduleFootprint(findModule("2A(LHF)")!, 0, "24");
    const cnrFp = moduleFootprint(findModule("CNR")!, 0, "24");
    expect(two.rot).toBe(0);
    expect(cnr.x).toBe(two.x + twoFp.w);
    expect(cnr.rot).toBe(90); // arms N+E — outward on the mirrored side
    expect(one.y).toBe(cnr.y + cnrFp.h);
    expect(one.rot).toBe(90);
    // Still ONE closed sofa under the canvas's own analysis.
    const withIds = cells.map((c, i) => ({ ...c, id: String(i) }));
    const groups = groupSofas(withIds, "24");
    expect(groups).toHaveLength(1);
    expect(analyzeSofa(groups[0], "24").closed).toBe(true);
  });
});

describe("centerSeedInRoom", () => {
  it("translates a seed so its footprint bbox centres in the room", () => {
    const centered = centerSeedInRoom(comboSeedCells(COMBO, "24"), "24");
    const bb = cellsBbox(centered.map((c, i) => ({ ...c, id: String(i) })), "24")!;
    expect(Math.abs(bb.x + bb.w / 2 - ROOM_W / 2)).toBeLessThanOrEqual(1);
    expect(Math.abs(bb.y + bb.h / 2 - ROOM_H / 2)).toBeLessThanOrEqual(1);
    // uniform translate — relative geometry (and thus connectivity) intact
    const src = comboSeedCells(COMBO, "24");
    expect(centered[1].x - centered[0].x).toBe(src[1].x - src[0].x);
    expect(centered[1].y - centered[0].y).toBe(src[1].y - src[0].y);
  });
});

describe("SofaConfigurePage", () => {
  it("defaults to Quick pick when combos exist and lists them with title + composition + price", () => {
    renderPage();
    const grid = screen.getByTestId("sofa-quick-picks");
    expect(within(grid).getByText("Corner starter")).toBeTruthy();
    expect(within(grid).getByText("1A(LHF) + 2A(RHF)")).toBeTruthy();
    expect(within(grid).getByText(/From RM 2,990/)).toBeTruthy();
  });

  it("0206 — a price-less quick pick shows the à-la-carte component total (no combo)", () => {
    const priceless: SofaComboDto = {
      ...COMBO,
      id: "00000000-0000-0000-0000-0000000c0aa1",
      label: "Bare layout",
      pricesByHeight: {}, // no price → priced live from the components
    };
    renderPage({ combos: [priceless] });
    const grid = screen.getByTestId("sofa-quick-picks");
    // 1A(LHF) 1200 + 2A(RHF) 1900 = 3100 (à-la-carte; the price-less combo is
    // skipped by the engine, so there is no combo override).
    expect(within(grid).getByText("From RM 3,100")).toBeTruthy();
    expect(screen.getByTestId("sofa-qp-total").textContent).toContain("3,100");
  });

  it("0206 — a plain combo (isQuickPick=false) is hidden; only the quick pick shows", () => {
    const plain: SofaComboDto = {
      ...COMBO,
      id: "00000000-0000-0000-0000-0000000c0099",
      label: "Pricing only",
      isQuickPick: false,
    };
    renderPage({ combos: [COMBO, plain] });
    const grid = screen.getByTestId("sofa-quick-picks");
    expect(within(grid).getByText("Corner starter")).toBeTruthy(); // the quick pick
    // the pricing-only combo is filtered out of the Quick pick tab
    expect(screen.queryByTestId(`sofa-quick-pick-${plain.id}`)).toBeNull();
    expect(within(grid).queryByText("Pricing only")).toBeNull();
  });

  it("0206 — principal sees a delete (trash) icon per quick pick; confirm → deletes", () => {
    roleMock.current = "principal";
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    const del = screen.getByTestId(`sofa-quick-pick-delete-${COMBO.id}`);
    expect(del).toBeInTheDocument();
    fireEvent.click(del);
    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteMock.mutate).toHaveBeenCalledWith(COMBO.id, expect.anything());
    confirmSpy.mockRestore();
  });

  it("0206 — a non-principal (salesperson) sees NO delete icon", () => {
    renderPage(); // roleMock defaults to null (non-principal)
    expect(screen.queryByTestId(`sofa-quick-pick-delete-${COMBO.id}`)).toBeNull();
  });

  it("0206 — cancelling the confirm does NOT delete", () => {
    roleMock.current = "principal";
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage();
    fireEvent.click(screen.getByTestId(`sofa-quick-pick-delete-${COMBO.id}`));
    expect(deleteMock.mutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("Customize header size chips drive the size; the redundant bottom picker is gone", () => {
    renderPage();
    fireEvent.click(screen.getByTestId("sofa-mode-custom"));
    const chips = screen.getByTestId("sofa-cust-sizes");
    // no option pools in the fixture → the full canonical axis, incl 26/37
    expect(within(chips).getByTestId("sofa-cust-size-26")).toBeInTheDocument();
    expect(within(chips).getByTestId("sofa-cust-size-37")).toBeInTheDocument();
    fireEvent.click(within(chips).getByTestId("sofa-cust-size-26"));
    expect(within(chips).getByTestId("sofa-cust-size-26").getAttribute("aria-pressed")).toBe("true");
    // the header chips own the size now → the canvas's bottom picker is removed
    expect(screen.queryByTestId("sofa-build-height")).toBeNull();
  });

  it("Customize header LIVE total prices the seeded build and follows size changes", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage();
    fireEvent.click(screen.getByTestId(`sofa-quick-pick-${COMBO.id}`));
    fireEvent.click(screen.getByTestId("sofa-qp-customize"));
    // The seeded 1A+2A layout matches COMBO → its 24″ combo price, live in the header.
    expect(screen.getByTestId("sofa-cust-total").textContent).toContain("2,990");
    // Size flip reprices through the canvas engine → the header follows.
    fireEvent.click(screen.getByTestId("sofa-cust-size-28"));
    expect(screen.getByTestId("sofa-cust-total").textContent).toContain("3,190");
  });

  it("Customize header LIVE total shows a placeholder while the canvas is empty", () => {
    renderPage({ combos: [] }); // straight onto an empty Customize canvas
    expect(screen.getByTestId("sofa-cust-total").textContent).toContain("—");
  });

  it("Create combo: the button is hidden for a non-principal in Customize", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    roleMock.current = "dealer";
    renderPage();
    fireEvent.click(screen.getByTestId("sofa-mode-custom"));
    expect(screen.queryByTestId("sofa-build-create-combo")).toBeNull();
  });

  it("Create combo: a principal sees the button in Customize", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    roleMock.current = "principal";
    renderPage();
    fireEvent.click(screen.getByTestId("sofa-mode-custom"));
    expect(screen.getByTestId("sofa-build-create-combo")).toBeInTheDocument();
  });

  it("card click SELECTS; Customize → loads the canvas pre-seeded as ONE connected sofa", () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`sofa-quick-pick-${COMBO.id}`));
    // Selecting a card does NOT jump to the canvas (prototype behaviour).
    expect(screen.queryByTestId("sofa-build-canvas")).toBeNull();
    fireEvent.click(screen.getByTestId("sofa-qp-customize"));
    expect(screen.getByTestId("sofa-build-canvas")).toBeTruthy();
    const room = screen.getByTestId("sofa-build-room");
    // The flush-seeded modules join as a single connected group — exactly one
    // group outline proves both cells landed AND touch (the seed's contract).
    expect(within(room).getAllByTestId("sofa-group-outline")).toHaveLength(1);
  });

  it("each card's Continue-in-Customize loads THAT pick onto the canvas", () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`sofa-quick-pick-customize-${COMBO.id}`));
    expect(screen.getByTestId("sofa-build-canvas")).toBeTruthy();
    const room = screen.getByTestId("sofa-build-room");
    // the pick's modules land pre-assembled as ONE connected sofa
    expect(within(room).getAllByTestId("sofa-group-outline")).toHaveLength(1);
    // and the loaded pick became the selection (header echoes it back on return)
    expect(screen.getByTestId("sofa-build-total").textContent).toContain("2,990");
  });

  it("composition + title read the sofa arm→arm left-to-right, not slot/label order", () => {
    const cornerPick: SofaComboDto = {
      ...COMBO,
      id: "00000000-0000-0000-0000-00000000c0f1",
      slots: [["2A(RHF)"], ["CNR"], ["1B(LHF)"]], // authored back-to-front
      label: "CNR + 1B(LHF) + 2A(RHF)", // authored label = a permutation code-join
    };
    renderPage({ combos: [cornerPick] });
    const grid = screen.getByTestId("sofa-quick-picks");
    // Title + composition both read the physical walk — the LHF chaise arm
    // opens, the corner links, the RHF 2-seater arm closes the sofa.
    expect(within(grid).getAllByText("1B(LHF) + CNR + 2A(RHF)")).toHaveLength(2);
    expect(within(grid).queryByText("CNR + 1B(LHF) + 2A(RHF)")).toBeNull();
  });

  it("hovering a quick pick does NOT move the hero preview — only clicking selects", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    const solo: SofaComboDto = {
      ...COMBO,
      id: "00000000-0000-0000-0000-00000000c003",
      slots: [["1NA"]],
      label: "Solo",
    };
    renderPage({ combos: [COMBO, solo] });
    const name = () => screen.getByTestId("sofa-config-name").textContent ?? "";
    expect(name()).toContain("1A(LHF) + 2A(RHF)"); // hero = first pick
    const soloCard = screen.getByTestId(`sofa-quick-pick-${solo.id}`);
    fireEvent.mouseOver(soloCard);
    fireEvent.mouseEnter(soloCard);
    expect(name()).toContain("1A(LHF) + 2A(RHF)"); // hover must not steal the hero
    fireEvent.click(soloCard);
    expect(name()).toContain("1NA"); // click selects
  });

  it("no combos → lands straight on Customize with the Quick pick tab disabled", () => {
    renderPage({ combos: [] });
    expect(screen.getByTestId("sofa-build-canvas")).toBeTruthy();
    expect((screen.getByTestId("sofa-mode-quick") as HTMLButtonElement).disabled).toBe(true);
  });

  it("back button closes the page", () => {
    const { onClose } = renderPage();
    fireEvent.click(screen.getByTestId("sofa-configure-back"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an L/R flip toggle on a handed combo's active card, defaulting to L", () => {
    renderPage();
    const flip = screen.getByTestId(`sofa-flip-${COMBO.id}`);
    const [l, r] = within(flip).getAllByText(/^[LR]$/);
    expect(l.className).toContain("is-on"); // L active by default
    expect(r.className).not.toContain("is-on");
  });

  it("clicking the flip toggle mirrors the shown composition L↔R", () => {
    renderPage();
    const grid = screen.getByTestId("sofa-quick-picks");
    expect(within(grid).getByText("1A(LHF) + 2A(RHF)")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`sofa-flip-${COMBO.id}`));
    // reversed slot order + LHF↔RHF swap
    expect(within(grid).getByText("2A(LHF) + 1A(RHF)")).toBeTruthy();
    expect(within(grid).queryByText("1A(LHF) + 2A(RHF)")).toBeNull();
  });

  it("a flipped pick seeds the mirrored layout onto the canvas", () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`sofa-flip-${COMBO.id}`));
    fireEvent.click(screen.getByTestId("sofa-qp-customize"));
    // still one connected sofa, but mirrored (2A now on the left)
    const room = screen.getByTestId("sofa-build-room");
    expect(within(room).getAllByTestId("sofa-group-outline")).toHaveLength(1);
  });

  it("shows the selected configuration name + size in the header (quick mode)", () => {
    renderPage();
    const name = screen.getByTestId("sofa-config-name").textContent ?? "";
    expect(name).toContain("1A(LHF) + 2A(RHF)");
    expect(name).toContain("24″");
  });

  it("the header config name follows the L/R flip", () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`sofa-flip-${COMBO.id}`));
    expect(screen.getByTestId("sofa-config-name").textContent).toContain("2A(LHF) + 1A(RHF)");
  });

  it("hides the flip toggle for a symmetric (orientation-free) combo", () => {
    const symmetric: SofaComboDto = {
      ...COMBO,
      id: "00000000-0000-0000-0000-00000000c002",
      slots: [["1NA"]],
      label: "Solo",
    };
    renderPage({ combos: [symmetric] });
    expect(screen.queryByTestId(`sofa-flip-${symmetric.id}`)).toBeNull();
  });

  it("header size toggle reprices the LIVE TOTAL from the preset's per-height price", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage(); // COMBO.pricesByHeight = { 24: 2990, 28: 3190 }
    expect(screen.getByTestId("sofa-qp-total").textContent).toContain("2,990");
    fireEvent.click(screen.getByTestId("sofa-qp-height-28"));
    expect(screen.getByTestId("sofa-qp-total").textContent).toContain("3,190");
  });

  it("header Add to Cart emits a DraftLine (fabric deferred + remark)", () => {
    const { onAdd, onClose } = renderPage({ skus: [PRESET_SKU] });
    fireEvent.change(screen.getByTestId("sofa-qp-remark"), { target: { value: "match showroom" } });
    fireEvent.click(screen.getByTestId("sofa-qp-add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const line = onAdd.mock.calls[0]![0];
    expect(line.unitPrice).toBe(2990); // base @ 24″, fabric deferred → no delta
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_deferred).toBe(true);
    expect(attrs.remark).toBe("match showroom");
    expect(onClose).toHaveBeenCalled();
  });

  it("fabric: sole series auto-collapses; colour KIV by default; picking a colour selects it", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage(); // one legacy fabric → single "Other" series → no series step
    expect(screen.queryByTestId("sofa-qp-fabric-series")).toBeNull();
    const colour = screen.getByTestId("sofa-qp-fabric") as HTMLSelectElement;
    expect(colour.value).toBe("__kiv__"); // colour-level KIV until chosen
    fireEvent.change(colour, { target: { value: "sf:f-1" } });
    expect(colour.value).toBe("sf:f-1");
    expect(colour.options[colour.selectedIndex]!.textContent).toMatch(/Linen Beige/);
  });

  it("fabric: multiple series → pick a series to reveal its colours; other series excluded", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage({
      model: { ...MODEL, allowedOptions: { fabrics: ["EZ-001", "EZ-002", "K-001"] } },
      masterFabrics: MASTER_FABRICS,
    });
    const series = screen.getByTestId("sofa-qp-fabric-series") as HTMLSelectElement;
    expect(series.value).toBe(""); // series-level KIV by default
    expect(screen.queryByTestId("sofa-qp-fabric")).toBeNull(); // no colours until a series
    fireEvent.change(series, { target: { value: "EZ" } });
    const colour = screen.getByTestId("sofa-qp-fabric") as HTMLSelectElement;
    expect(colour.value).toBe("__kiv__"); // colour KIV until chosen
    const labels = Array.from(colour.options).map((o) => o.textContent ?? "");
    expect(labels.some((l) => /EZ-001/.test(l))).toBe(true);
    expect(labels.some((l) => /EZ-002/.test(l))).toBe(true);
    expect(labels.some((l) => /K-001/.test(l))).toBe(false); // only the EZ series
  });

  it("series chosen + colour KIV → line carries fabric_series, stays deferred, no tier delta", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    const { onAdd } = renderPage({
      model: { ...MODEL, allowedOptions: { fabrics: ["EZ-001", "EZ-002"] } },
      fabrics: [], // no legacy rows → EZ is the ONLY series
      masterFabrics: MASTER_FABRICS.filter((f) => f.series === "EZ"),
      skus: [PRESET_SKU],
    });
    // sole EZ series → auto-collapsed; colour defaults to KIV
    expect(screen.queryByTestId("sofa-qp-fabric-series")).toBeNull();
    expect((screen.getByTestId("sofa-qp-fabric") as HTMLSelectElement).value).toBe("__kiv__");
    fireEvent.click(screen.getByTestId("sofa-qp-add"));
    const line = onAdd.mock.calls[0]![0];
    expect(line.unitPrice).toBe(2990); // base @ 24″ — no tier delta while colour is KIV
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_series).toBe("EZ");
    expect(attrs.fabric_deferred).toBe(true);
  });

  it("renders a to-scale plan view with width + depth cm callouts", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage();
    expect(screen.getByTestId("sofa-plan-view")).toBeTruthy();
    expect(screen.getByTestId("sofa-plan-width").textContent).toMatch(/\d+ cm/);
    expect(screen.getByTestId("sofa-plan-depth").textContent).toMatch(/\d+ cm/);
    // The hero SVG fills the stage-sized .sof-qp__heroBox (2990s hero presence),
    // not a fixed-height strip. Box aspect = layout bbox + the SVG's own pad.
    const box = screen
      .getByTestId("sofa-plan-view")
      .querySelector(".sof-qp__heroBox") as HTMLElement;
    expect(box).toBeTruthy();
    expect(box.style.aspectRatio).toMatch(/^\d+ \/ \d+$/);
    expect(box.querySelector('[data-testid="sofa-plan-svg"]')).toBeTruthy();
  });

  it("DORMANT: no catalog → no PWP box at all", () => {
    renderPage();
    expect(screen.queryByTestId("sofa-pwp")).toBeNull();
  });

  it("DORMANT: a catalog with only inactive rules → no PWP box", () => {
    renderPage({
      catalog: pwpCatalog({ pwpRules: [{ ...SOFA_RULE, active: false }] }),
    });
    expect(screen.queryByTestId("sofa-pwp")).toBeNull();
  });
});

describe("SofaConfigurePage — PWP voucher real apply", () => {
  const pwpOver = () => ({
    skus: [PRESET_SKU],
    combos: [PWP_COMBO],
    catalog: pwpCatalog(),
    cartLines: TRIGGER_CART,
    pwpReservedCodes: [reservedCode({ code: "PWP-1234ABCD", ruleId: SOFA_RULE.id })],
    pwpClaimGroup: "cg-1",
  });

  it("Auto Fill binds the reserved code, previews the PWP total, and emits a claimed line", () => {
    const { onAdd } = renderPage(pwpOver());

    fireEvent.click(screen.getByTestId("sofa-pwp-autofill"));
    expect(screen.getByTestId("sofa-pwp-applied").textContent).toContain("PWP-1234ABCD");
    // Live total swaps to the combo's PWP price at 24″ (1,500), noted as PWP.
    expect(screen.getByTestId("sofa-qp-total").textContent).toContain("1,500");

    fireEvent.click(screen.getByTestId("sofa-qp-add"));
    const line = onAdd.mock.calls[0]![0] as DraftLine;
    expect(line.unitPrice).toBe(1500);
    expect(line.origUnitPrice).toBe(2990);
    expect((line.attrs as Record<string, unknown>).pwp).toEqual({
      ruleId: SOFA_RULE.id,
      code: "PWP-1234ABCD",
      claimGroup: "cg-1",
    });
  });

  it("typing the reserved code + Apply binds it like Auto Fill", () => {
    renderPage(pwpOver());
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "pwp-1234abcd" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    expect(screen.getByTestId("sofa-pwp-applied").textContent).toContain("PWP-1234ABCD");
  });

  it("an unknown PWP code shows a validation error", () => {
    renderPage(pwpOver());
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "BADCODE" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    expect(screen.getByTestId("sofa-pwp-error")).toBeTruthy();
    expect(screen.queryByTestId("sofa-pwp-applied")).toBeNull();
  });

  it("no qualifying trigger in the cart → no Auto Fill; the reserved code is refused", () => {
    renderPage({ ...pwpOver(), cartLines: [] });
    expect(screen.queryByTestId("sofa-pwp-autofill")).toBeNull();
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "PWP-1234ABCD" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    expect(screen.getByTestId("sofa-pwp-error").textContent).toContain("sofa layout");
  });

  it("clears the applied code via remove (total back to normal)", () => {
    renderPage(pwpOver());
    fireEvent.click(screen.getByTestId("sofa-pwp-autofill"));
    expect(screen.getByTestId("sofa-pwp-applied")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sofa-pwp-remove"));
    expect(screen.queryByTestId("sofa-pwp-applied")).toBeNull();
    expect(screen.getByTestId("sofa-pwp-input")).toBeTruthy();
    expect(screen.getByTestId("sofa-qp-total").textContent).toContain("2,990");
  });

  it("cross-order apply without a customer phone is refused with the step-02 hint", () => {
    const lookup = vi.fn();
    renderPage({ ...pwpOver(), pwpReservedCodes: [], onApplyVoucherCode: lookup });
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "PWP-CROSS111" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    expect(lookup).not.toHaveBeenCalled();
    expect(screen.getByTestId("sofa-pwp-error").textContent).toContain("step 02");
  });
});
