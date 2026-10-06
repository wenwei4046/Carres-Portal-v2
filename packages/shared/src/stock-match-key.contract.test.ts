import { describe, expect, it } from "vitest";
import { stockMatchKey } from "./line-category";
import { normalizeSkuKey } from "./sku-code";
import productionSkus from "./__fixtures__/production-skus.json";
import catalogSkus from "./__fixtures__/production-catalog-skus.json";

/**
 * THE STOCK MATCH KEY IS THE PORTAL'S ONE RULE FOR LINKING TWO VOCABULARIES —
 * `order_lines.sku` (what the Catalog calls the goods) against
 * `ops_stock_items.sku` (what the warehouse calls them). Migration 0471 gives
 * it a SQL twin, `public.stock_match_key(text)`, because the reservation door
 * has to refuse a mismatched Unit in the database rather than trust a browser.
 *
 * TWO IMPLEMENTATIONS OF ONE ARITHMETIC IS A LAW D RISK (`docs/ERP-ARCHITECTURE.md`),
 * and this file is how the repository already answers it elsewhere: the
 * document partition is computed twice and the server recomputes rather than
 * trusts, "which is agreement rather than trust". The agreement here is pinned
 * to the REAL corpus, not to invented strings.
 *
 * `__fixtures__/production-skus.json` is the complete distinct SKU set measured
 * on production 2026-09-10 — 327 values across `ops_stock_items`, `order_lines`
 * and `product_skus`. On that day both implementations were run over it and
 * agreed on every value. When this fixture is refreshed, re-run the same
 * comparison against the SQL function before trusting a new key.
 */
describe("stockMatchKey · the production corpus", () => {
  it("carries the fixture the SQL twin was proven against", () => {
    expect(productionSkus.length).toBe(327);
    expect(new Set(productionSkus).size).toBe(productionSkus.length);
  });

  /**
   * THE PROPERTY THE RESERVATION DOOR RESTS ON: two DIFFERENT products never
   * share a key. Measured on the Catalog, because the Catalog is where one
   * product is written exactly once — `ops_stock_items` and `order_lines`
   * deliberately hold several spellings of one product (`-K` and `-King`), and
   * those SHOULD collapse together; that is the whole job of the key.
   *
   * Zero groups, measured 2026-09-10 by the same group-by run in SQL on
   * production against all 236 rows of `product_skus`.
   */
  it("gives no two distinct Catalog products the same key", () => {
    const byKey = new Map<string, string[]>();
    for (const sku of catalogSkus) {
      const key = stockMatchKey(sku);
      byKey.set(key, [...(byKey.get(key) ?? []), sku]);
    }
    const collisions = [...byKey.entries()].filter(([, skus]) => skus.length > 1);
    expect(collisions).toEqual([]);
    expect(catalogSkus.length).toBe(236);
  });

  it("keeps colour, fabric and the hand of a piece apart", () => {
    expect(stockMatchKey("1013Jager/Fab3-Queen/PC151-01")).not.toBe(
      stockMatchKey("1013Jager/Fab3-Queen/PC151-14"),
    );
    expect(stockMatchKey("5539-1A(LHF)")).not.toBe(stockMatchKey("5539-1A(RHF)"));
    expect(stockMatchKey("Cozy 910/D10+L1+G12+HB48-FBF/CX1211-10(White)-K")).not.toBe(
      stockMatchKey("Cozy 910/D10+L1+G14+HB50-FBF/CX1211-10(White)-K"),
    );
  });

  it("keeps the sizes apart, including the two-letter ones", () => {
    expect(stockMatchKey("CODY-K")).toBe("cody|K");
    expect(stockMatchKey("CODY-Q")).toBe("cody|Q");
    expect(stockMatchKey("CODY-S")).toBe("cody|S");
    /* Super King and Super Single are NOT the single-letter forms. */
    expect(stockMatchKey("CODY-SK")).not.toBe(stockMatchKey("CODY-K"));
    expect(stockMatchKey("CODY-SS")).not.toBe(stockMatchKey("CODY-S"));
  });

  it("joins the two spellings of one size", () => {
    expect(stockMatchKey("Hana LV622-MD/SC-1521-1(White)-King")).toBe(
      stockMatchKey("Hana LV622-MD/SC-1521-1(White)-K"),
    );
  });

  /**
   * The SQL twin uses `[^a-z0-9_]` rather than `[^a-z]` precisely because
   * JavaScript's `\b` counts digits and `_` as word characters. This pins the
   * TypeScript behaviour the SQL was written to match: a size word glued to a
   * digit is NOT a size word.
   */
  it("does not lift a size word that is glued to a digit", () => {
    expect(stockMatchKey("MODEL-Queen2")).toBe("modelqueen2");
    expect(stockMatchKey("3King")).toBe("3king");
  });

  it("returns the plain normalisation when there is no size at all", () => {
    for (const sku of productionSkus) {
      const key = stockMatchKey(sku);
      if (!key.includes("|")) expect(key).toBe(normalizeSkuKey(sku));
    }
  });
});
