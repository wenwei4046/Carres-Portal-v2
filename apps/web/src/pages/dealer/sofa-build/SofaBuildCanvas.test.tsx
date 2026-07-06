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
import { render, screen, fireEvent, within } from "@testing-library/react";
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
  offered?: ModelSofaCompartmentDto[];
  heights?: string[];
  compartmentPool?: SofaCompartmentDto[];
  onAddBuild?: (p: unknown) => void;
  onClose?: () => void;
}) {
  const onAddBuild = vi.fn(props?.onAddBuild);
  const onClose = vi.fn(props?.onClose);
  render(
    <SofaBuildCanvas
      model={MODEL}
      skus={SKUS}
      compartmentPool={props?.compartmentPool ?? POOL}
      modelCompartments={props?.offered ?? OFFERED}
      sofaCombos={props?.combos ?? []}
      fabricTierConfig={{ sofaTier2Delta: 300, sofaTier3Delta: 600 }}
      fabricTierOverride={null}
      sofaFabrics={FABRICS}
      heights={props?.heights}
      onAddBuild={onAddBuild}
      onClose={onClose}
    />,
  );
  return { onAddBuild, onClose };
}

function addModule(code: string) {
  fireEvent.click(screen.getByTestId(`module-palette-item-${code}`));
}

/** jsdom has no PointerEvent — dispatch a coordinate-carrying MouseEvent under
 *  the pointer event's type (React's onPointer* handlers fire on the type). */
function firePointer(el: Element, type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
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
    // switch to PRICE_2 fabric → +300 global delta (select values are the
    // unified selling-fabric KEYS: `sf:<sofa_fabrics id>` / `cf:<fabric code>`)
    fireEvent.change(screen.getByTestId("sofa-build-fabric"), { target: { value: "sf:f-2" } });
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,800.00");
    // height picker present with the canonical heights
    const heightSel = screen.getByTestId("sofa-build-height") as HTMLSelectElement;
    expect(heightSel.value).toBe("24");
  });

  // 0204 — the size axis follows the sofa_size pool; per-size prices win.
  it("heights drive the size picker (incl. non-numeric 'Flat'), default 24", () => {
    renderCanvas({ heights: ["24", "32", "Flat"] });
    const sel = screen.getByTestId("sofa-build-height") as HTMLSelectElement;
    expect(sel.value).toBe("24");
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["24", "32", "Flat"]);
    // Non-numeric size renders WITHOUT the inch mark.
    expect(Array.from(sel.options).map((o) => o.textContent)).toEqual(["24″", "32″", "Flat"]);
  });

  it("switching size re-prices the build + the palette via the per-size map", () => {
    const offered: ModelSofaCompartmentDto[] = POOL.map((p, i) => ({
      modelId: MODEL.id,
      compartmentId: p.id,
      priceOverride: null,
      sortOrder: i,
      skuPrice: p.defaultPrice,
      // Only 1S is size-priced: RM 1,990 at 32; other sizes inherit the flat 1,500.
      skuPricesBySize: p.code === "1S" ? { "32": 1990 } : null,
    }));
    renderCanvas({ offered, heights: ["24", "32", "Flat"] });
    addModule("1S");
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,500.00");
    fireEvent.change(screen.getByTestId("sofa-build-height"), { target: { value: "32" } });
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,990.00");
    // The palette card shows the sized price too.
    expect(screen.getByTestId("module-palette-item-1S")).toHaveTextContent("1,990.00");
    // A size with no entry falls back to the flat price.
    fireEvent.change(screen.getByTestId("sofa-build-height"), { target: { value: "Flat" } });
    expect(screen.getByTestId("sofa-build-total")).toHaveTextContent("RM 1,500.00");
  });

  it("Expand room grows the floor 1.5× (same ratio); Reset restores 600×480", () => {
    renderCanvas();
    const room = screen.getByTestId("sofa-build-room");
    expect(room).toHaveStyle({ width: "600px", height: "480px" });
    fireEvent.click(screen.getByTestId("sofa-room-expand"));
    expect(room).toHaveStyle({ width: "900px", height: "720px" });
    expect(screen.getByTestId("sofa-room-expand")).toHaveTextContent("Reset room");
    fireEvent.click(screen.getByTestId("sofa-room-expand"));
    expect(room).toHaveStyle({ width: "600px", height: "480px" });
  });

  it("controlled size: the redundant bottom size picker is hidden (the host owns it)", () => {
    // When the size is controlled (heightValue provided), the host renders its
    // own size chips, so the canvas footer's picker would be redundant and is
    // omitted (Loo 2026-07-06).
    render(
      <SofaBuildCanvas
        model={MODEL}
        skus={SKUS}
        compartmentPool={POOL}
        modelCompartments={OFFERED}
        sofaCombos={[]}
        fabricTierConfig={{ sofaTier2Delta: 300, sofaTier3Delta: 600 }}
        fabricTierOverride={null}
        sofaFabrics={FABRICS}
        heights={["24", "26", "Flat"]}
        heightValue="26"
        onHeightChange={vi.fn()}
        onAddBuild={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("sofa-build-height")).toBeNull();
  });

  it("Create combo: no button without onCreateCombo (dealer flow)", () => {
    renderCanvas();
    addModule("1S");
    expect(screen.queryByTestId("sofa-build-create-combo")).toBeNull();
  });

  it("Create combo: with onCreateCombo, a valid build hands up its module codes", () => {
    const onCreateCombo = vi.fn();
    render(
      <SofaBuildCanvas
        model={MODEL}
        skus={SKUS}
        compartmentPool={POOL}
        modelCompartments={OFFERED}
        sofaCombos={[]}
        fabricTierConfig={{ sofaTier2Delta: 300, sofaTier3Delta: 600 }}
        fabricTierOverride={null}
        sofaFabrics={FABRICS}
        onCreateCombo={onCreateCombo}
        onAddBuild={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    addModule("1S");
    const btn = screen.getByTestId("sofa-build-create-combo");
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onCreateCombo).toHaveBeenCalledWith(["1S"]);
  });

  /** A flush 1A(LHF)+1A(RHF) pair = ONE closed sofa, pre-placed. */
  function renderClosedPair() {
    render(
      <SofaBuildCanvas
        model={MODEL}
        skus={SKUS}
        compartmentPool={POOL}
        modelCompartments={OFFERED}
        sofaCombos={[]}
        fabricTierConfig={{ sofaTier2Delta: 300, sofaTier3Delta: 600 }}
        fabricTierOverride={null}
        sofaFabrics={FABRICS}
        onAddBuild={vi.fn()}
        onClose={vi.fn()}
        initialCells={[
          { moduleCode: "1A(LHF)", x: 100, y: 100, rot: 0 },
          { moduleCode: "1A(RHF)", x: 195, y: 100, rot: 0 }, // flush → ONE closed sofa
        ]}
      />,
    );
    return screen.getAllByTestId(/^sofa-cell-sc_/);
  }

  it("a CLOSED sofa drags as ONE piece — grabbing any cell moves the whole group", () => {
    const [c1, c2] = renderClosedPair();
    expect(c1).toHaveStyle({ left: "100px" });
    expect(c2).toHaveStyle({ left: "195px" });
    firePointer(c1!, "pointerdown", 0, 0);
    firePointer(c1!, "pointermove", 60, 40);
    firePointer(c1!, "pointerup", 60, 40);
    // BOTH cells translate by the same delta (no snap targets, room clamp inert)
    expect(c1).toHaveStyle({ left: "160px", top: "140px" });
    expect(c2).toHaveStyle({ left: "255px", top: "140px" });
  });

  it("switching size re-abuts a linked sofa — it grows as ONE piece", () => {
    const [c1, c2] = renderClosedPair(); // 1A pair flush at 24″ (95 wide each)
    fireEvent.change(screen.getByTestId("sofa-build-height"), { target: { value: "28" } });
    // 1A at 28″ is 105 wide → the right piece re-abuts instead of overlapping
    expect(c1).toHaveStyle({ left: "100px", top: "100px" });
    expect(c2).toHaveStyle({ left: "205px", top: "100px" });
  });

  it("clicking a complete sofa selects the WHOLE item — group toolbar, no per-cell pill", () => {
    const [c1] = renderClosedPair();
    firePointer(c1!, "pointerdown", 0, 0);
    firePointer(c1!, "pointerup", 0, 0);
    const tools = screen.getByTestId("sofa-group-tools");
    expect(within(tools).getByTestId("sofa-group-rotate")).toBeInTheDocument();
    expect(within(tools).getByTestId("sofa-group-edit")).toHaveTextContent("Edit modules");
    expect(within(tools).getByTestId("sofa-group-delete")).toBeInTheDocument();
    // the whole item is selected — no single-module rotate/delete pill
    expect(screen.queryAllByTestId(/^sofa-cell-delete-/)).toHaveLength(0);
  });

  it("group rotate turns the whole sofa 90° about its centre", () => {
    const [c1, c2] = renderClosedPair();
    firePointer(c1!, "pointerdown", 0, 0);
    firePointer(c1!, "pointerup", 0, 0);
    fireEvent.click(screen.getByTestId("sofa-group-rotate"));
    // 190×95 bbox centred at (195, 147.5) → a 95×190 vertical stack
    expect(c1).toHaveStyle({ left: "147.5px", top: "52.5px" });
    expect(c2).toHaveStyle({ left: "147.5px", top: "147.5px" });
  });

  it("Edit modules unlocks per-module editing — single select + single drag", () => {
    const [c1, c2] = renderClosedPair();
    firePointer(c1!, "pointerdown", 0, 0);
    firePointer(c1!, "pointerup", 0, 0);
    fireEvent.click(screen.getByTestId("sofa-group-edit"));
    expect(screen.queryByTestId("sofa-group-tools")).not.toBeInTheDocument();
    // dragging one module now moves ONLY that module (pull it out of the sofa)
    firePointer(c2!, "pointerdown", 0, 0);
    firePointer(c2!, "pointermove", 0, 150);
    firePointer(c2!, "pointerup", 0, 150);
    expect(c1).toHaveStyle({ left: "100px", top: "100px" });
    expect(c2).toHaveStyle({ top: "250px" });
    // and the single-module pill is reachable again
    expect(screen.queryAllByTestId(/^sofa-cell-delete-/)).toHaveLength(1);
  });

  it("an UNCLOSED pair still drags per-cell (assembly mode)", () => {
    render(
      <SofaBuildCanvas
        model={MODEL}
        skus={SKUS}
        compartmentPool={POOL}
        modelCompartments={OFFERED}
        sofaCombos={[]}
        fabricTierConfig={{ sofaTier2Delta: 300, sofaTier3Delta: 600 }}
        fabricTierOverride={null}
        sofaFabrics={FABRICS}
        onAddBuild={vi.fn()}
        onClose={vi.fn()}
        initialCells={[
          // two LHF pieces — joined but right end open ⇒ NOT closed
          { moduleCode: "1A(LHF)", x: 100, y: 100, rot: 0 },
          { moduleCode: "1NA", x: 195, y: 100, rot: 0 },
        ]}
      />,
    );
    const [c1, c2] = screen.getAllByTestId(/^sofa-cell-sc_/);
    firePointer(c2!, "pointerdown", 0, 0);
    firePointer(c2!, "pointermove", 0, 200);
    firePointer(c2!, "pointerup", 0, 200);
    // only the grabbed piece moved
    expect(c1).toHaveStyle({ left: "100px", top: "100px" });
    expect(c2).toHaveStyle({ top: "300px" });
  });

  it("canvas cells draw the uploaded compartment art (flush) when the pool row has one", () => {
    const pool = POOL.map((p) =>
      p.code === "1S" ? { ...p, iconUrl: "https://cdn/1s.png" } : p,
    );
    renderCanvas({ compartmentPool: pool });
    addModule("1S");
    // the palette icon uses the same img testid — assert within the flush box
    const box = screen.getByTestId("compartment-silhouette-img-flush");
    const img = within(box).getByTestId("compartment-silhouette-img");
    expect(img).toHaveAttribute("src", "https://cdn/1s.png");
  });

  it("clicking empty canvas deselects — the floating rotate/delete tools dismiss", () => {
    renderCanvas();
    addModule("1S"); // addModule auto-selects → tools visible
    const cell = screen.getAllByTestId(/^sofa-cell-sc_/)[0]!;
    const id = cell.getAttribute("data-testid")!.replace("sofa-cell-", "");
    expect(screen.getByTestId(`sofa-cell-delete-${id}`)).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId("sofa-build-room"));
    expect(screen.queryByTestId(`sofa-cell-delete-${id}`)).not.toBeInTheDocument();
  });

  it("disables Add with a reason for a non-closed build (no-arms piece alone)", () => {
    renderCanvas();
    addModule("1NA"); // no arms → never closes alone
    const add = screen.getByTestId("sofa-build-add");
    expect(add).toBeDisabled();
    expect(add).toHaveTextContent(/Resolve/);
    // 2990s parity: the Add button is the ONLY closure messaging — an
    // unclosed group gets no red outline and no per-group caption on canvas.
    expect(screen.queryByTestId("sofa-group-not-closed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sofa-group-outline")).not.toBeInTheDocument();
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
