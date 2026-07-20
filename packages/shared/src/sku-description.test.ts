import { describe, expect, it } from "vitest";
import { autoBedSkuDescription, sofaSkuDescription } from "./sku-description";

// The Maintenance size-pool rows (value = short code, dimensions = cm spec) —
// mirrors the seeded mattress_size pool.
const POOL = [
  { value: "K", dimensions: "183X190CM" },
  { value: "Q", dimensions: "152X190CM" },
  { value: "S", dimensions: "90X190CM" },
  { value: "SS", dimensions: "107X190CM" },
  { value: "SK", dimensions: "200X200CM" },
];

describe("autoBedSkuDescription", () => {
  it("mattress King → MATTRESS-CR-183X190CM", () => {
    expect(autoBedSkuDescription("mattress", "King", POOL)).toBe("MATTRESS-CR-183X190CM");
  });

  it("bedframe Queen → BEDFRAME-CR-152X190CM", () => {
    expect(autoBedSkuDescription("bedframe", "Queen", POOL)).toBe("BEDFRAME-CR-152X190CM");
  });

  it("matches the pool row via the canonical size table (short code, full name, any case)", () => {
    // Pool stores "K"; the size can arrive as the code, the name, or a spelling.
    expect(autoBedSkuDescription("mattress", "K", POOL)).toBe("MATTRESS-CR-183X190CM");
    expect(autoBedSkuDescription("mattress", "king", POOL)).toBe("MATTRESS-CR-183X190CM");
    expect(autoBedSkuDescription("mattress", "super-single", POOL)).toBe(
      "MATTRESS-CR-107X190CM",
    );
    // And the reverse: a pool authored with full names still matches a short code.
    const namedPool = [{ value: "Super King", dimensions: "200x200cm" }];
    expect(autoBedSkuDescription("bedframe", "SK", namedPool)).toBe("BEDFRAME-CR-200X200CM");
  });

  it("upper-cases lower-cased pool dimensions", () => {
    expect(
      autoBedSkuDescription("mattress", "K", [{ value: "K", dimensions: "183x190cm" }]),
    ).toBe("MATTRESS-CR-183X190CM");
  });

  it("returns null for non-bed categories (sofa/accessory/service stay manual or sofa-format)", () => {
    for (const cat of ["sofa", "accessory", "service"]) {
      expect(autoBedSkuDescription(cat, "King", POOL)).toBeNull();
    }
  });

  it("returns null when the size has no pool row", () => {
    expect(autoBedSkuDescription("mattress", "Custom 200", POOL)).toBeNull();
  });

  it("returns null when the pool row has no / blank dimensions", () => {
    expect(
      autoBedSkuDescription("mattress", "K", [{ value: "K", dimensions: null }]),
    ).toBeNull();
    expect(
      autoBedSkuDescription("mattress", "K", [{ value: "K", dimensions: "  " }]),
    ).toBeNull();
  });

  it("returns null for an empty size token / empty pool", () => {
    expect(autoBedSkuDescription("mattress", "", POOL)).toBeNull();
    expect(autoBedSkuDescription("mattress", "K", [])).toBeNull();
  });
});

describe("sofaSkuDescription", () => {
  it("is `Sofa {Model} {code}`", () => {
    expect(sofaSkuDescription("Angsa", "1A(LHF)")).toBe("Sofa Angsa 1A(LHF)");
  });
});
