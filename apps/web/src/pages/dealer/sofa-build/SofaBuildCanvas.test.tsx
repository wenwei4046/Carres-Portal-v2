/**
 * SofaBuildCanvas — Phase-3 Task-3 drag plan-view builder tests.
 *
 * jsdom has no real layout (getBoundingClientRect is 0×0) and no ResizeObserver,
 * so we test what's feasible without a layout engine:
 *   · add a palette module → a cell renders on the room
 *   · delete a selected cell
 *   · the fabric + seat-height pickers drive computeSofaPrice
 *   · the Add gate is disabled (with the blocking reason) for a non-closed build
 *     and enabled for a self-closing single-piece sofa (1S = both arms)
 *   · the matched-combo badge + "saves RM N" show when a combo applies
 *   · onAddBuild fires with the expected payload (cells + height + fabric + total)
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type {
  ProductModelDto,
  ProductSkuDto,
  SofaCompartmentDto,
  ModelSofaCompartmentDto,
  SofaComboDto,
  SofaFabricDto,
} from "@carres/shared";
import SofaBuildCanvas from "./SofaBuildCanvas";

// jsdom lacks ResizeObserver — the component guards against its absence, but
// stub it so the effect path is also exercised.
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
  modelKey: "ohana-modular",
  name: "Ohana Modular",
  blurb: null,
  colors: null,
  gaps: null,
  sofaMode: "custom",
};

const SKUS: ProductSkuDto[] = [];

// Pool: 1A(LHF) arm-left, 1S both-arms (self-closing), 1NA no-arms.
const POOL: SofaCompartmentDto[] = [
  { id: "c-1alhf", code: "1A(LHF)", description: null, seatCount: 1, armConfig: "LHF", iconUrl: null, defaultPrice: 1200, sortOrder: 0, active: true },
  { id: "c-1s", code: "1S", description: null, seatCount: 1, armConfig: "both", iconUrl: null, defaultPrice: 1500, sortOrder: 1, active: true },
  { id: "c-1na", code: "1NA", description: null, seatCount: 1, armConfig: "none", iconUrl: null, defaultPrice: 1000, sortOrder: 2, active: true },
];

const OFFERED: ModelSofaCompartmentDto[] = POOL.map((p, i) => ({
  modelId: MODEL.id,
  compartmentId: p.id,
  priceOverride: null,
  sortOrder: i,
}));

const FABRICS: SofaFabricDto[] = [
  { id: "f-1", modelId: MODEL.id, fabricName: "Linen Beige", surcharge: 0, colors: null, tier: "PRICE_1" },
  { id: "f-2", modelId: MODEL.id, fabricName: "Velvet Forest", surcharge: 0, colors: null, tier: "PRICE_2" },
];

function renderCanvas(props?: {
  combos?: SofaComboDto[];
  onAddBuild?: (p: unknown) => void;
  onClose?: () => void;
}) {
  const onAddBuild = vi.fn(props?.onAddBuild);
  const onClose = vi.fn(props?.onClose);
  render(
    <SofaBuildCanvas
      model={MODEL}
      skus={SKUS}
      compartmentPool={POOL}
      modelCompartments={OFFERED}
      sofaCombos={props?.combos ?? []}
      fabricTierConfig={{ sofaTier2Delta: 300, sofaTier3Delta: 600 }}
      fabricTierOverride={null}
      sofaFabrics={FABRICS}
      onAddBuild={onAddBuild}
      onClose={onClose}
    />,
  );
  return { onAddBuild, onClose };
}

function addModule(code: string) {
  fireEvent.click(screen.getByTestId(`module-palette-item-${code}`));
}

describe("SofaBuildCanvas", () => {
  it("renders the offered palette + a starting price of 0", () => {
    renderCanvas();
    expect(screen.getByTestId("sofa-build-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("module-palette-item-1A(LHF)")).toBeInTheDocument();
    expect(screen.getByTestId("module-palette-item-1S")).toBeInTheDocument();
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 0.00");
  });

  it("adds a module to the room and reflects its à-la-carte price", () => {
    renderCanvas();
    addModule("1A(LHF)");
    // one cell rendered
    const cells = screen.getAllByTestId(/^sofa-cell-sc_/);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toHaveAttribute("data-code", "1A(LHF)");
    // price = 1200 à-la-carte (PRICE_1 fabric → no delta)
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,200.00");
  });

  it("deletes a selected cell via the trash tool", () => {
    renderCanvas();
    addModule("1A(LHF)");
    const cell = screen.getAllByTestId(/^sofa-cell-sc_/)[0]!;
    const id = cell.getAttribute("data-testid")!.replace("sofa-cell-", "");
    fireEvent.click(screen.getByTestId(`sofa-cell-delete-${id}`));
    expect(screen.queryAllByTestId(/^sofa-cell-sc_/)).toHaveLength(0);
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 0.00");
  });

  it("the seat-height + fabric pickers exist and a PRICE_2 fabric adds the tier delta", () => {
    renderCanvas();
    addModule("1S"); // 1500
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,500.00");
    // switch to PRICE_2 fabric → +300 global delta
    fireEvent.change(screen.getByTestId("sofa-build-fabric"), { target: { value: "f-2" } });
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,800.00");
    // height picker present with the canonical heights
    const heightSel = screen.getByTestId("sofa-build-height") as HTMLSelectElement;
    expect(heightSel.value).toBe("24");
  });

  it("disables Add with a reason for a non-closed build (no-arms piece alone)", () => {
    renderCanvas();
    addModule("1NA"); // no arms → never closes alone
    const add = screen.getByTestId("sofa-build-add");
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent(/Resolve/);
    // the canvas shows a not-closed pill for the group
    expect(screen.getByTestId("sofa-group-not-closed")).toBeInTheDocument();
  });

  it("enables Add for a self-closing single piece (1S = both arms) and emits the payload", () => {
    const onAddBuild = vi.fn();
    renderCanvas({ onAddBuild });
    addModule("1S");
    const add = screen.getByTestId("sofa-build-add");
    expect(add).not.toBeDisabled();
    expect(add).toHaveTextContent("Add to cart");
    fireEvent.click(add);
    expect(onAddBuild).toHaveBeenCalledTimes(1);
    const payload = onAddBuild.mock.calls[0]![0];
    expect(payload.cells).toEqual([
      expect.objectContaining({ moduleCode: "1S", rot: 0 }),
    ]);
    expect(payload.height).toBe("24");
    expect(payload.fabricTier).toBe("PRICE_1");
    expect(payload.fabricId).toBe("f-1");
    expect(payload.fabricName).toBe("Linen Beige");
    expect(payload.total).toBe(1500);
    expect(payload.priceBasis).toBe("a_la_carte");
    expect(payload.fabricDeferred).toBe(false);
  });

  it("'Confirm later' defers the fabric: null fabric + base tier + fabricDeferred", () => {
    const onAddBuild = vi.fn();
    renderCanvas({ onAddBuild });
    addModule("1S");
    fireEvent.change(screen.getByTestId("sofa-build-fabric"), { target: { value: "__defer__" } });
    fireEvent.click(screen.getByTestId("sofa-build-add"));
    const payload = onAddBuild.mock.calls[0]![0];
    expect(payload.fabricDeferred).toBe(true);
    expect(payload.fabricId).toBeNull();
    expect(payload.fabricName).toBeNull();
    expect(payload.fabricTier).toBe("PRICE_1"); // base tier when deferred
  });

  it("shows the matched-combo badge + savings when a combo applies", () => {
    // A combo covering one 1S at RM 1,000 (cheaper than the 1,500 à-la-carte).
    const combos: SofaComboDto[] = [
      {
        id: "combo-1",
        modelId: MODEL.id,
        slots: [["1S"]],
        tier: null,
        pricesByHeight: { "24": 1000 },
        costByHeight: null,
        pwpPricesByHeight: null,
        label: "1S deal",
        effectiveFrom: "2020-01-01",
        active: true,
        discontinuedAt: null,
      },
    ];
    renderCanvas({ combos });
    addModule("1S");
    // total = combo price 1000 (basis combo)
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,000.00");
    const badge = screen.getByTestId("sofa-build-combo-badge");
    expect(badge).toHaveTextContent("Combo applied");
    expect(badge).toHaveTextContent("saves RM 500.00"); // 1500 subset − 1000 combo
    // the matched cell carries a combo badge
    expect(screen.getByTestId("sofa-cell-combo-badge")).toBeInTheDocument();
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    renderCanvas({ onClose });
    fireEvent.click(screen.getByTestId("sofa-build-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("rotate tool turns the selected cell 90deg", () => {
    renderCanvas();
    addModule("1A(LHF)");
    const cell = screen.getAllByTestId(/^sofa-cell-sc_/)[0]!;
    const id = cell.getAttribute("data-testid")!.replace("sofa-cell-", "");
    // baseline: the silhouette wrapper renders at rotate(0deg)
    expect(
      screen.getByTestId(`sofa-cell-${id}`).querySelector('[style*="rotate(0deg)"]'),
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId(`sofa-cell-rotate-${id}`));
    // after rotate the inner wrapper actually carries rotate(90deg) (guards
    // rotateCell — not just that the img still renders)
    const refreshed = screen.getByTestId(`sofa-cell-${id}`);
    expect(refreshed.querySelector('[style*="rotate(90deg)"]')).toBeTruthy();
    expect(refreshed.querySelector('[style*="rotate(0deg)"]')).toBeFalsy();
  });
});
