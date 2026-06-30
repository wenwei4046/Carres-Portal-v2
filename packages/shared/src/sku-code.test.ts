import { describe, expect, it } from "vitest";

import { deriveSkuCode, normalizeSkuKey } from "./sku-code";

describe("deriveSkuCode", () => {
  it("upper-cases the model key and joins with a dash", () => {
    expect(deriveSkuCode("5539", "1A(LHF)")).toBe("5539-1A(LHF)");
    expect(deriveSkuCode("breeze-firmcare", "K")).toBe("BREEZE-FIRMCARE-K");
  });
});

describe("normalizeSkuKey", () => {
  it("collapses the order vs warehouse cosmetic drift to one key", () => {
    // The real-data case (project-catalog-empty-sku-naming): order uses dash +
    // CamelCase, the warehouse Excel uses a space + Titlecase — same product.
    expect(normalizeSkuKey("Breeze FirmCare-B1201F-Q")).toBe("breezefirmcareb1201fq");
    expect(normalizeSkuKey("Breeze Firmcare B1201F-Q")).toBe("breezefirmcareb1201fq");
    expect(normalizeSkuKey("Breeze FirmCare-B1201F-Q")).toBe(
      normalizeSkuKey("Breeze Firmcare B1201F-Q"),
    );
  });

  it("keeps the size suffix significant so a Queen never matches a King", () => {
    expect(normalizeSkuKey("Breeze Firmcare B1201F-K")).not.toBe(
      normalizeSkuKey("Breeze FirmCare-B1201F-Q"),
    );
  });

  it("strips parens and slashes from compartment / config codes", () => {
    expect(normalizeSkuKey("1A(LHF)")).toBe("1alhf");
    expect(normalizeSkuKey('SF03-HK5531/28"(2 Seater)/M2402-4 Sand')).toBe(
      "sf03hk5531282seaterm24024sand",
    );
  });

  it("is idempotent and tolerates empty / punctuation-only input", () => {
    const k = normalizeSkuKey("Haven Firmcare H1401F-K");
    expect(normalizeSkuKey(k)).toBe(k);
    expect(normalizeSkuKey("")).toBe("");
    expect(normalizeSkuKey("--/  /--")).toBe("");
  });
});
