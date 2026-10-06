/**
 * OperationComboCostTab — the costing door onto sofa combos.
 *
 * What these tests pin:
 *  - the grid answers "what does this combo cost us", per seat height;
 *  - a height with no recorded cost reads "not set", never RM 0.00 — 0 is a
 *    real cost and a blank is not a zero;
 *  - the SELLING price never appears here. That is the whole boundary: the
 *    admin tab owns price and every edit, this one only reads cost;
 *  - Quick Pick presets are excluded — they are POS shortcuts, not priced
 *    combos, exactly as the admin tab's pricing count excludes them;
 *  - it is READ-ONLY (Ownership Law B): no input, no button, no form.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CatalogResponse, ProductModelDto, SofaComboDto } from "@carres/shared";
import OperationComboCostTab from "./OperationComboCostTab";

const MODEL_A: ProductModelDto = {
  id: "m-sofa-a",
  name: "Aspen",
  category: "sofa",
} as unknown as ProductModelDto;

const MODEL_B: ProductModelDto = {
  id: "m-sofa-b",
  name: "Brava",
  category: "sofa",
} as unknown as ProductModelDto;

/** Cost recorded at 28 only — 32 is deliberately absent. */
const COMBO_A: SofaComboDto = {
  id: "sc-a",
  modelId: MODEL_A.id,
  slots: [["2A(LHF)", "2A(RHF)"], ["L(LHF)"]],
  tier: "PRICE_1",
  pricesByHeight: { "28": 2640, "32": 2800 },
  costByHeight: { "28": 1980 },
  pwpPricesByHeight: null,
  label: "Corner Set",
  effectiveFrom: "2026-06-21",
  active: true,
  discontinuedAt: null,
};

/** No tier, no label, and a genuine ZERO cost at 28 — not the same as blank. */
const COMBO_B: SofaComboDto = {
  id: "sc-b",
  modelId: MODEL_B.id,
  slots: [["3S"]],
  tier: null,
  pricesByHeight: { "28": 1500 },
  costByHeight: { "28": 0 },
  pwpPricesByHeight: null,
  label: null,
  effectiveFrom: "2026-06-21",
  active: true,
  discontinuedAt: null,
};

const COMBO_QUICK: SofaComboDto = {
  ...COMBO_A,
  id: "sc-quick",
  label: "Quick pick preset",
  isQuickPick: true,
};

function makeCatalog(sofaCombos: SofaComboDto[]): CatalogResponse {
  return {
    models: [MODEL_A, MODEL_B],
    skus: [],
    sofaFabrics: [],
    addons: [],
    sofaCombos,
    floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 50 },
  } as unknown as CatalogResponse;
}

describe("OperationComboCostTab — what a combo costs us", () => {
  it("prints the recorded cost at the height it was recorded at", () => {
    render(<OperationComboCostTab catalog={makeCatalog([COMBO_A])} />);
    expect(screen.getByTestId("opcombo-cost-sc-a-28").textContent).toContain("1,980.00");
  });

  it("reads 'not set' where no cost was recorded, and never RM 0.00", () => {
    render(<OperationComboCostTab catalog={makeCatalog([COMBO_A])} />);
    const blank = screen.getByTestId("opcombo-cost-sc-a-32");
    expect(blank.textContent).toBe("not set");
    expect(blank.textContent).not.toContain("0.00");
  });

  it("keeps a real zero cost distinct from a blank one", () => {
    render(<OperationComboCostTab catalog={makeCatalog([COMBO_B])} />);
    expect(screen.getByTestId("opcombo-cost-sc-b-28").textContent).toContain("RM 0.00");
    expect(screen.getByTestId("opcombo-cost-sc-b-30").textContent).toBe("not set");
  });

  it("shows the parts and the model, so the row identifies itself", () => {
    render(<OperationComboCostTab catalog={makeCatalog([COMBO_A])} />);
    const row = screen.getByTestId("opcombo-row-sc-a");
    expect(row.textContent).toContain("Aspen");
    expect(row.textContent).toContain("2A(LHF)|2A(RHF) + L(LHF)");
    expect(row.textContent).toContain("Corner Set");
  });

  it("never shows the selling price — that stays on the admin tab", () => {
    render(<OperationComboCostTab catalog={makeCatalog([COMBO_A, COMBO_B])} />);
    // 2,640.00 / 2,800.00 / 1,500.00 are prices, not costs.
    for (const price of ["2,640", "2,800", "1,500"]) {
      expect(screen.queryByText(new RegExp(price))).toBeNull();
    }
  });

  it("is read-only: no input, no button, no form control anywhere", () => {
    const { container } = render(
      <OperationComboCostTab catalog={makeCatalog([COMBO_A, COMBO_B])} />,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
    // The only inputs are the filter controls, which write nothing.
    expect(container.querySelector('[data-testid="opcombo-row-sc-a"] input')).toBeNull();
    expect(container.querySelector('[data-testid="opcombo-row-sc-a"] select')).toBeNull();
  });

  it("excludes Quick Pick presets — they are POS shortcuts, not priced combos", () => {
    render(<OperationComboCostTab catalog={makeCatalog([COMBO_A, COMBO_QUICK])} />);
    expect(screen.queryByTestId("opcombo-row-sc-quick")).toBeNull();
    expect(screen.getByTestId("opcombo-count").textContent).toContain("1 combo");
  });

  it("renders 'Any' when a combo is not tied to one fabric tier", () => {
    render(<OperationComboCostTab catalog={makeCatalog([COMBO_B])} />);
    expect(screen.getByTestId("opcombo-row-sc-b").textContent).toContain("Any");
  });

  it("says so plainly when there is nothing to show", () => {
    render(<OperationComboCostTab catalog={makeCatalog([])} />);
    expect(screen.getByTestId("opcombo-empty")).toBeInTheDocument();
  });
});
