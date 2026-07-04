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
  SofaComboDto,
  SofaCompartmentDto,
  SofaFabricDto,
} from "@carres/shared";
import { analyzeSofa, findModule, groupSofas, moduleFootprint } from "@carres/shared";
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

function renderPage(over?: { combos?: SofaComboDto[]; onClose?: () => void }) {
  const onAdd = vi.fn();
  const onClose = vi.fn(over?.onClose);
  render(
    <SofaConfigurePage
      model={MODEL}
      meta={undefined}
      skus={[]}
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
});

describe("SofaConfigurePage", () => {
  it("defaults to Quick pick when combos exist and lists them with title + composition + price", () => {
    renderPage();
    const grid = screen.getByTestId("sofa-quick-picks");
    expect(within(grid).getByText("Corner starter")).toBeTruthy();
    expect(within(grid).getByText("1A(LHF) + 2A(RHF)")).toBeTruthy();
    expect(within(grid).getByText(/From RM 2,990/)).toBeTruthy();
  });

  it("loading a pick flips to Customize with the canvas pre-seeded as ONE connected sofa", () => {
    renderPage();
    fireEvent.click(screen.getByTestId(`sofa-quick-pick-${COMBO.id}`));
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
});
