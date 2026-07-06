/**
 * SofaConfigurePage — full-page sofa configurator (Quick pick + Customize).
 *   · quick picks list this model's active combos (title / composition / price)
 *   · picking one loads the canvas pre-seeded (mode flips to Customize)
 *   · no combos → lands straight on Customize (Quick pick tab disabled)
 *   · comboSeedCells lays modules flush left→right, tops aligned
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type {
  ModelSofaCompartmentDto,
  ProductModelDto,
  ProductSkuDto,
  SofaComboDto,
  SofaCompartmentDto,
  SofaFabricDto,
} from "@carres/shared";
import { analyzeSofa, findModule, groupSofas, moduleFootprint } from "@carres/shared";

// Mock the PWP availability hook (usePwpAvailableForPhone) so the component's
// useQuery has no QueryClient dependency + the voucher result is controllable.
const { pwpMock } = vi.hoisted(() => ({
  pwpMock: { current: { data: { vouchers: [] as { code: string }[] }, isFetching: false } },
}));
vi.mock("@/lib/queries", () => ({
  usePwpAvailableForPhone: () => pwpMock.current,
}));

import SofaConfigurePage, { comboSeedCells } from "./SofaConfigurePage";

beforeAll(() => {
  if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
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

function renderPage(over?: {
  combos?: SofaComboDto[];
  onClose?: () => void;
  skus?: ProductSkuDto[];
}) {
  const onAdd = vi.fn();
  const onClose = vi.fn(over?.onClose);
  render(
    <SofaConfigurePage
      model={MODEL}
      meta={undefined}
      skus={over?.skus ?? []}
      fabrics={FABRICS}
      fabricTierConfig={null}
      modelFabricTierOverrides={null}
      sofaCompartments={POOL}
      modelCompartments={OFFERED}
      sofaCombos={over?.combos ?? [COMBO]}
      onAdd={onAdd}
      onClose={onClose}
    />,
  );
  return { onAdd, onClose };
}

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

describe("SofaConfigurePage", () => {
  it("defaults to Quick pick when combos exist and lists them with title + composition + price", () => {
    renderPage();
    const grid = screen.getByTestId("sofa-quick-picks");
    expect(within(grid).getByText("Corner starter")).toBeTruthy();
    expect(within(grid).getByText("1A(LHF) + 2A(RHF)")).toBeTruthy();
    expect(within(grid).getByText(/From RM 2,990/)).toBeTruthy();
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

  it("header Add to Cart emits a DraftLine (fabric deferred + remark + PWP hint)", () => {
    pwpMock.current = { data: { vouchers: [{ code: "PWP-1234ABCD" }] }, isFetching: false };
    const { onAdd, onClose } = renderPage({ skus: [PRESET_SKU] });
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "PWP-1234ABCD" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    fireEvent.change(screen.getByTestId("sofa-qp-remark"), { target: { value: "match showroom" } });
    fireEvent.click(screen.getByTestId("sofa-qp-add"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    const line = onAdd.mock.calls[0]![0];
    expect(line.unitPrice).toBe(2990); // base @ 24″, fabric deferred → no delta
    const attrs = line.attrs as Record<string, unknown>;
    expect(attrs.fabric_deferred).toBe(true);
    expect(attrs.remark).toBe("match showroom");
    expect(attrs.pwp_pending_code).toBe("PWP-1234ABCD");
    expect(onClose).toHaveBeenCalled();
  });

  it("fabric pills: Confirm later selected by default; clicking a fabric selects it", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage();
    expect(screen.getByTestId("sofa-qp-fabric-defer").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("sofa-qp-fabric-sf:f-1"));
    expect(screen.getByTestId("sofa-qp-fabric-sf:f-1").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("sofa-qp-fabric-defer").getAttribute("aria-pressed")).toBe("false");
  });

  it("renders a to-scale plan view with width + depth cm callouts", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage();
    expect(screen.getByTestId("sofa-plan-view")).toBeTruthy();
    expect(screen.getByTestId("sofa-plan-width").textContent).toMatch(/\d+ cm/);
    expect(screen.getByTestId("sofa-plan-depth").textContent).toMatch(/\d+ cm/);
  });

  it("shows the INSERT PWP code input by default", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage();
    expect(screen.getByTestId("sofa-pwp-input")).toBeTruthy();
  });

  it("a valid PWP code shows the applied chip", () => {
    pwpMock.current = { data: { vouchers: [{ code: "PWP-1234ABCD" }] }, isFetching: false };
    renderPage();
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "pwp-1234abcd" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    expect(screen.getByTestId("sofa-pwp-applied").textContent).toContain("PWP-1234ABCD");
  });

  it("an unknown PWP code shows a validation error", () => {
    pwpMock.current = { data: { vouchers: [] }, isFetching: false };
    renderPage();
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "BADCODE" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    expect(screen.getByTestId("sofa-pwp-error")).toBeTruthy();
  });

  it("clears the applied code via remove", () => {
    pwpMock.current = { data: { vouchers: [{ code: "PWP-1234ABCD" }] }, isFetching: false };
    renderPage();
    fireEvent.change(screen.getByTestId("sofa-pwp-input"), { target: { value: "PWP-1234ABCD" } });
    fireEvent.click(screen.getByTestId("sofa-pwp-apply"));
    expect(screen.getByTestId("sofa-pwp-applied")).toBeTruthy();
    fireEvent.click(screen.getByTestId("sofa-pwp-remove"));
    expect(screen.queryByTestId("sofa-pwp-applied")).toBeNull();
    expect(screen.getByTestId("sofa-pwp-input")).toBeTruthy();
  });
});
