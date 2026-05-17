import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { CatalogResponse, ProductCategory } from "@carres/shared";
import type { DraftLine } from "./draft";
import ProductPicker, { lockedCategoriesFor } from "./ProductPicker";

/**
 * Unit tests for the category mutex rule (Loo 2026-05-11, migration 0089).
 * The function decides which category tabs the picker should disable based
 * on the lines already on the draft.
 *
 *   sofa             → locks mattress + bedframe
 *   mattress         → locks sofa (bedframe stays open)
 *   bedframe         → locks sofa (mattress stays open)
 *   mattress + bedframe → locks sofa
 *   (empty)          → nothing locked
 */
function line(sku: string): DraftLine {
  return {
    localId: `local-${sku}`,
    sku,
    qty: 1,
    attrs: null,
    unitPrice: 100,
    label: sku,
  };
}

const catalog: Map<string, ProductCategory> = new Map([
  ["MA-001", "mattress"],
  ["BF-001", "bedframe"],
  ["SF-001", "sofa"],
]);

describe("lockedCategoriesFor", () => {
  it("locks nothing when draft is empty", () => {
    const locked = lockedCategoriesFor([], catalog);
    expect(locked.size).toBe(0);
  });

  it("locks sofa when draft has mattress", () => {
    const locked = lockedCategoriesFor([line("MA-001")], catalog);
    expect(locked.has("sofa")).toBe(true);
    expect(locked.has("mattress")).toBe(false);
    expect(locked.has("bedframe")).toBe(false);
  });

  it("locks sofa when draft has bedframe", () => {
    const locked = lockedCategoriesFor([line("BF-001")], catalog);
    expect(locked.has("sofa")).toBe(true);
    expect(locked.has("bedframe")).toBe(false);
    expect(locked.has("mattress")).toBe(false);
  });

  it("locks sofa when draft has both mattress + bedframe", () => {
    const locked = lockedCategoriesFor(
      [line("MA-001"), line("BF-001")],
      catalog,
    );
    expect(locked.has("sofa")).toBe(true);
    expect(locked.has("mattress")).toBe(false);
    expect(locked.has("bedframe")).toBe(false);
  });

  it("locks mattress + bedframe when draft has sofa", () => {
    const locked = lockedCategoriesFor([line("SF-001")], catalog);
    expect(locked.has("mattress")).toBe(true);
    expect(locked.has("bedframe")).toBe(true);
    expect(locked.has("sofa")).toBe(false);
  });

  it("ignores unknown SKUs gracefully (no category → no lock)", () => {
    const locked = lockedCategoriesFor([line("UNKNOWN-SKU")], catalog);
    expect(locked.size).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// 2026-05-18 (Loo screenshot — DL-1006 Kestrel L-shape saved with
// `attrs = { mode: "preset" }` despite Kestrel having 2 fabrics configured).
// Regression test for the model-switch state-leak bug in SofaConfigurator:
// useState(fabrics[0]?.id) ran only on initial mount, so switching from sofa
// model A to sofa model B kept the OLD model's fabricId in state. Stale id
// didn't match any new-model fabric → `fabrics.find(...) = undefined` →
// `if (fabric)` skipped → line saved without fabric.
//
// Fix: `key={selected.id}` on SofaConfigurator forces a remount on model
// change so useState re-inits from the new model's fabrics.
// -----------------------------------------------------------------------------
describe("SofaConfigurator — model-switch state reset", () => {
  function makeCatalog(): CatalogResponse {
    return {
      models: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          category: "sofa",
          modelKey: "alpha",
          name: "Sofa Alpha",
          blurb: null,
          colors: null,
          gaps: null,
          sofaMode: "preset",
          discontinuedAt: null,
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          category: "sofa",
          modelKey: "bravo",
          name: "Sofa Bravo",
          blurb: null,
          colors: null,
          gaps: null,
          sofaMode: "preset",
          discontinuedAt: null,
        },
      ],
      skus: [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          modelId: "11111111-1111-1111-1111-111111111111",
          sku: "sofa:alpha:preset:s1",
          variant: "Alpha S1",
          variantKind: "preset",
          price: 1000,
          cost: 500,
          supplierId: null,
          discontinuedAt: null,
        },
        {
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          modelId: "22222222-2222-2222-2222-222222222222",
          sku: "sofa:bravo:preset:s1",
          variant: "Bravo S1",
          variantKind: "preset",
          price: 2000,
          cost: 800,
          supplierId: null,
          discontinuedAt: null,
        },
      ],
      sofaFabrics: [
        {
          id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          modelId: "11111111-1111-1111-1111-111111111111",
          fabricName: "Alpha-only Cotton",
          surcharge: 0,
          colors: null,
          discontinuedAt: null,
        },
        {
          id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
          modelId: "22222222-2222-2222-2222-222222222222",
          fabricName: "Bravo-only Leather",
          surcharge: 600,
          colors: null,
          discontinuedAt: null,
        },
      ],
      addons: [],
      floorConfig: { id: 1, freeUpToFloor: 1, perFloorPerItem: 0 },
    };
  }

  it("switching sofa models mid-flight uses the NEW model's fabric, not the previous one", () => {
    const onAddLine = vi.fn();
    render(
      <ProductPicker
        catalog={makeCatalog()}
        onAddLine={onAddLine}
        draftLines={[]}
      />,
    );

    // Open sofa category.
    fireEvent.click(screen.getByTestId("category-tab-sofa"));

    // Pick model A first — this mounts SofaConfigurator with Alpha-only Cotton
    // as the default fabric.
    fireEvent.click(screen.getByText("Sofa Alpha"));
    expect(screen.getByText("Alpha-only Cotton")).toBeTruthy();

    // Switch to model B WITHOUT deselecting. With the bug, SofaConfigurator
    // stays mounted and fabricId still references Alpha's fabric — which
    // doesn't exist in Bravo's fabric list, so the resulting line would carry
    // attrs without a fabric_id. With the key={selected.id} fix, the
    // configurator remounts and fabricId re-inits to Bravo's first fabric.
    fireEvent.click(screen.getByText("Sofa Bravo"));

    // Pick a Bravo variant + Add. We rely on the controlled select reflecting
    // the new model's first fabric (Bravo-only Leather) automatically.
    const variantSelect = screen.getByLabelText(/preset/i) as HTMLSelectElement;
    fireEvent.change(variantSelect, {
      target: { value: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" },
    });
    fireEvent.click(screen.getByText("+ Add"));

    expect(onAddLine).toHaveBeenCalledTimes(1);
    const addedLine = onAddLine.mock.calls[0][0] as DraftLine;
    expect(addedLine.sku).toBe("sofa:bravo:preset:s1");
    const attrs = addedLine.attrs as Record<string, unknown> | null;
    expect(attrs).not.toBeNull();
    // Bravo-only Leather (id 'dddd...') is Bravo's only fabric and must be
    // what the add() captured — never Alpha's Cotton (id 'cccc...').
    expect(attrs?.fabric_id).toBe("dddddddd-dddd-dddd-dddd-dddddddddddd");
    expect(attrs?.fabric_name).toBe("Bravo-only Leather");
    // Sanity: must not have leaked Alpha's fabric.
    expect(attrs?.fabric_id).not.toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
  });
});

// Silence "within" unused-import warning if RTL bundling complains.
void within;
