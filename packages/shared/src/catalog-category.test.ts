import { describe, expect, it } from "vitest";
import {
  legacyKeywordCategory,
  makeCategoryOf,
  storageCategoryOf,
} from "./catalog-category";

/**
 * V2 · the CATALOG category rule (ERP-ARCHITECTURE §3.1 / §4) — the ONE
 * answer to "what kind of product is this?". Everyone asks this; no screen
 * re-derives a category from a SKU string.
 */

const CATALOG = [
  { sku: "MATTRESS:BREEZE-B1201F-Q", category: "mattress" },
  { sku: "M1401-K", category: "mattress" },
  { sku: "JAGER-FAB3-KING", category: "bedframe" },
  { sku: "HK5531-2L", category: "sofa" },
  { sku: "ESSENTIAL-PILLOW-L", category: "accessory" },
  { sku: "DISPOSAL-1", category: "service" },
  { sku: "10Y-GUARANTEE", category: "guarantee" },
] as const;

describe("makeCategoryOf — the catalog answers", () => {
  const categoryOf = makeCategoryOf(CATALOG);

  it("answers from the catalog on an exact sku", () => {
    expect(categoryOf("HK5531-2L")).toBe("sofa");
    expect(categoryOf("10Y-GUARANTEE")).toBe("guarantee");
  });

  it("survives cosmetic drift — case + separators (normalizeSkuKey)", () => {
    // The same product keyed with drifted punctuation still resolves.
    expect(categoryOf("hk5531 2l")).toBe("sofa");
    expect(categoryOf("m1401 - k")).toBe("mattress");
  });

  it("catalog answer WINS over the keyword fallback", () => {
    // "ESSENTIAL-PILLOW-L" would read accessory by keyword too, but the point
    // is precedence: a catalog row that contradicts the keywords must win.
    const contrarian = makeCategoryOf([
      { sku: "HK5531-2L", category: "accessory" },
    ]);
    expect(contrarian("HK5531-2L")).toBe("accessory");
  });

  it("falls back to the keyword rule for a sku the catalog has never seen", () => {
    // Trial-data free text (AutoCount import). Dies at go-live; until then the
    // fallback lives INSIDE this one function, nowhere else.
    expect(categoryOf('HK5531/28"(2 SEATER + LSHAPE)/M2402-4 SAND')).toBe(
      "sofa",
    );
    expect(categoryOf("FORTE-L1202F-K")).toBe("mattress");
    expect(categoryOf("TRANSPORT FEES")).toBe("service");
  });
});

describe("legacyKeywordCategory — the documented fallback", () => {
  it("maps core keywords to the catalog vocabulary", () => {
    expect(legacyKeywordCategory("BREEZE FIRMCARE-B1201F-K")).toBe("mattress");
    expect(legacyKeywordCategory("1013JAGER/FAB3-KING/PC151-01")).toBe(
      "bedframe",
    );
    expect(legacyKeywordCategory("SF03-HK5535/30\"(3 SEATER)")).toBe("sofa");
  });

  it("splits non-core into accessory vs service like lineKind does", () => {
    expect(legacyKeywordCategory("ESSENTIAL MEMORY PILLOW(L)")).toBe(
      "accessory",
    );
    expect(
      legacyKeywordCategory("MICROFIBER WATERPROOF MATTRESS PROTECTOR-Q"),
    ).toBe("accessory");
    expect(legacyKeywordCategory("MATTRESS DISPOSAL")).toBe("service");
    expect(legacyKeywordCategory("NO LIFT PER FLOOR CHARGE")).toBe("service");
  });
});

describe("storageCategoryOf — the storage rate asks the catalog (Decision ①)", () => {
  it("mattress + bedframe bill at the MS/BF rate", () => {
    expect(storageCategoryOf("mattress")).toBe("msbf");
    expect(storageCategoryOf("bedframe")).toBe("msbf");
  });
  it("sofa bills at the SOF rate", () => {
    expect(storageCategoryOf("sofa")).toBe("sof");
  });
  it("accessory / service / guarantee are out of storage scope", () => {
    expect(storageCategoryOf("accessory")).toBe("other");
    expect(storageCategoryOf("service")).toBe("other");
    expect(storageCategoryOf("guarantee")).toBe("other");
  });
});

describe("D9's measured failure — closed by ownership", () => {
  it("a live free-text sofa line resolves to the SOF storage rate", () => {
    const categoryOf = makeCategoryOf([]);
    // The prefix-only storageCategoryForSku read this as "other" — no rate —
    // on EVERY live SKU. Through the one resolver it reads sofa → sof.
    const cat = categoryOf('DSL9055/28"(2 SEATER + LSHAPE)/M2402-1 PEARL');
    expect(cat).toBe("sofa");
    expect(storageCategoryOf(cat)).toBe("sof");
  });
});
