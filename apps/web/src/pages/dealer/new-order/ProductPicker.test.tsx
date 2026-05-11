import { describe, it, expect } from "vitest";
import type { ProductCategory } from "@carres/shared";
import type { DraftLine } from "./draft";
import { lockedCategoriesFor } from "./ProductPicker";

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
