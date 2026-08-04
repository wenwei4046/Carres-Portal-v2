import { describe, expect, it } from "vitest";

import { readyStockOffer, type FreeStockUnit } from "./ready-stock-offer";

const unit = (itemId: string, qty = 1, sku = "SONIC-K"): FreeStockUnit => ({
  itemId,
  sku,
  qty,
  condition: "new",
  warehouse: "Carres Klang",
});

describe("readyStockOffer — card P10", () => {
  it("offers nothing at all when the floor holds nothing", () => {
    // The card's ❌ "show a marker when free stock is 0", made structural:
    // there is no offer to render rather than an offer that renders as a zero.
    expect(readyStockOffer(5, [])).toBeNull();
    expect(readyStockOffer(5, [unit("a", 0)])).toBeNull();
  });

  it("suggests every free unit when the build needs more than the floor has", () => {
    const o = readyStockOffer(5, [unit("a"), unit("b")])!;
    expect(o.available).toBe(2);
    expect(o.takeable).toBe(2);
    expect(o.itemIds).toEqual(["a", "b"]);
    expect(o.warehouse).toBe("Carres Klang");
  });

  it("never suggests more than the build still needs", () => {
    // Reserving 5 against a requirement for 2 locks three units to a customer
    // who did not order them.
    const o = readyStockOffer(2, [unit("a"), unit("b"), unit("c"), unit("d")])!;
    expect(o.available).toBe(4);
    expect(o.takeable).toBe(2);
    expect(o.itemIds).toEqual(["a", "b"]);
  });

  it("keeps the door's own FIFO order, so it names the units the draw claims", () => {
    const o = readyStockOffer(2, [unit("oldest"), unit("middle"), unit("newest")])!;
    expect(o.itemIds).toEqual(["oldest", "middle"]);
  });

  it("counts a bulk record as its units, not as one", () => {
    // 0218 bulk rows are ONE record of N units; K4 records the record's qty.
    const o = readyStockOffer(9, [unit("bulk", 5), unit("single")])!;
    expect(o.available).toBe(6);
    expect(o.takeable).toBe(6);
    expect(o.itemIds).toEqual(["bulk", "single"]);
  });

  it("states the stock BUT offers no take when only a too-large record is free", () => {
    // The register moves WHOLE records — K4 refuses to split a bulk row — so a
    // demand for 1 against a single 2-unit record can take nothing without
    // over-reserving. `available 2 · takeable 0` is the honest pair; collapsing
    // them to one number would be a lie whichever number won.
    const o = readyStockOffer(1, [unit("pair", 2)])!;
    expect(o.available).toBe(2);
    expect(o.takeable).toBe(0);
    expect(o.itemIds).toEqual([]);
  });

  it("skips a record too large for the remainder and keeps looking", () => {
    // Refusing the 1-unit record behind the 3-unit one would leave a unit on
    // the floor for no reason a human could name.
    const o = readyStockOffer(2, [unit("three", 3), unit("one", 1)])!;
    expect(o.available).toBe(4);
    expect(o.takeable).toBe(1);
    expect(o.itemIds).toEqual(["one"]);
  });

  it("carries the register's own spelling — the door matches on it", () => {
    // `ops_stock_pool_draw` compares `ops_stock_items.sku` exactly. A suggestion
    // that reported the CATALOG code would name a SKU the door cannot find.
    const o = readyStockOffer(1, [unit("a", 1, "Sonic L1202S-K")])!;
    expect(o.stockSku).toBe("Sonic L1202S-K");
  });

  it("takes nothing for a build that needs nothing", () => {
    const o = readyStockOffer(0, [unit("a")])!;
    expect(o.available).toBe(1);
    expect(o.takeable).toBe(0);
  });
});
