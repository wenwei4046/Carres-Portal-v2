import { describe, expect, it } from "vitest";

import {
  csvRecordToImportRow,
  deriveModelKey,
  hasPricingIntent,
  MAX_IMPORT_MONEY,
  normalizeCategory,
  normalizeVariantKind,
  parseBoolish,
  parseMoney,
  skuImportInput,
} from "./sku-import";

describe("parseMoney", () => {
  it("treats blank as no value (not an error)", () => {
    expect(parseMoney("")).toEqual({ value: null, error: false });
    expect(parseMoney("   ")).toEqual({ value: null, error: false });
    expect(parseMoney(undefined)).toEqual({ value: null, error: false });
  });
  it("strips RM prefix + thousands commas", () => {
    expect(parseMoney("RM 1,535.00")).toEqual({ value: 1535, error: false });
    expect(parseMoney("rm2990")).toEqual({ value: 2990, error: false });
    expect(parseMoney("1,899.50")).toEqual({ value: 1899.5, error: false });
  });
  it("accepts a bare number incl 0", () => {
    expect(parseMoney("0")).toEqual({ value: 0, error: false });
    expect(parseMoney("42.5")).toEqual({ value: 42.5, error: false });
  });
  it("rounds to 2 decimals", () => {
    expect(parseMoney("10.005").value).toBe(10.01);
  });
  it("flags non-numeric as an error", () => {
    expect(parseMoney("abc").error).toBe(true);
    expect(parseMoney("1.2.3").error).toBe(true);
    expect(parseMoney("RM -5").error).toBe(true);
  });
});

describe("deriveModelKey", () => {
  it("kebab-cases a model name", () => {
    expect(deriveModelKey("2990 AKKA-FIRM MATT")).toBe("2990-akka-firm-matt");
    expect(deriveModelKey("  Booqit  ")).toBe("booqit");
    expect(deriveModelKey("Sofa (Deluxe)")).toBe("sofa-deluxe");
  });
  it("trims trailing dashes and caps at 60", () => {
    const long = deriveModelKey("x".repeat(80));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });
});

describe("normalizeCategory", () => {
  it("is case-insensitive over the 5 categories", () => {
    expect(normalizeCategory("MATTRESS")).toBe("mattress");
    expect(normalizeCategory(" Sofa ")).toBe("sofa");
    expect(normalizeCategory("service")).toBe("service");
  });
  it("returns null for unknown", () => {
    expect(normalizeCategory("chair")).toBeNull();
    expect(normalizeCategory("")).toBeNull();
  });
});

describe("normalizeVariantKind", () => {
  it("returns undefined for blank (no value — so an update preserves the kind)", () => {
    expect(normalizeVariantKind("")).toBeUndefined();
    expect(normalizeVariantKind("  ")).toBeUndefined();
  });
  it("accepts the 3 kinds case-insensitively", () => {
    expect(normalizeVariantKind("PRESET")).toBe("preset");
    expect(normalizeVariantKind("part")).toBe("part");
    expect(normalizeVariantKind("size")).toBe("size");
  });
  it("returns null for an unknown non-blank kind", () => {
    expect(normalizeVariantKind("colour")).toBeNull();
  });
});

describe("parseBoolish", () => {
  it("maps truthy words", () => {
    for (const v of ["yes", "TRUE", "1", "active", "y", "on"]) expect(parseBoolish(v)).toBe(true);
  });
  it("maps falsy words", () => {
    for (const v of ["no", "false", "0", "inactive", "n", "off"]) expect(parseBoolish(v)).toBe(false);
  });
  it("returns undefined for blank/unknown (preserve/default)", () => {
    expect(parseBoolish("")).toBeUndefined();
    expect(parseBoolish("maybe")).toBeUndefined();
  });
});

describe("csvRecordToImportRow", () => {
  it("maps a full valid row (case-insensitive headers, derives sku-less)", () => {
    const r = csvRecordToImportRow({
      Model: "2990 AKKA-FIRM MATT",
      Category: "Mattress",
      Variant: "K",
      Variant_Kind: "size",
      Price: "RM 2,990.00",
      Cost: "1500",
      Description: "King mattress",
      Pos_Active: "yes",
      Supplier: "nice-future",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row).toMatchObject({
      model: "2990 AKKA-FIRM MATT",
      modelKey: "2990-akka-firm-matt",
      category: "mattress",
      variant: "K",
      variantKind: "size",
      price: 2990,
      cost: 1500,
      description: "King mattress",
      posActive: true,
      supplier: "nice-future",
    });
  });

  it("honours an explicit model_key over derivation", () => {
    const r = csvRecordToImportRow({ model: "Booqit Sofa", model_key: "booqit", category: "sofa", variant: "1S" });
    expect(r.ok && r.row.modelKey).toBe("booqit");
  });

  it("omits price/cost/description/supplier/variantKind when blank (preserve semantics)", () => {
    const r = csvRecordToImportRow({ model: "MX", category: "sofa", variant: "1S" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect("price" in r.row).toBe(false);
    expect("cost" in r.row).toBe(false);
    expect("description" in r.row).toBe(false);
    expect("supplier" in r.row).toBe(false);
    expect("posActive" in r.row).toBe(false);
    // blank variant_kind => omitted, so an update preserves the stored kind.
    expect("variantKind" in r.row).toBe(false);
  });

  it("rejects a price above the max", () => {
    const r = csvRecordToImportRow({ model: "MX", category: "sofa", variant: "1S", price: "100000000" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason.toLowerCase()).toContain("max");
  });

  it.each([
    [{ category: "sofa", variant: "1S" }, "model"],
    [{ model: "MX", variant: "1S" }, "category"],
    [{ model: "MX", category: "sofa" }, "variant"],
  ])("rejects a row missing a required field: %o", (rec, field) => {
    const r = csvRecordToImportRow(rec as Record<string, string>);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason.toLowerCase()).toContain(field);
  });

  it("rejects an invalid category", () => {
    const r = csvRecordToImportRow({ model: "MX", category: "chair", variant: "1S" });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    const r = csvRecordToImportRow({ model: "MX", category: "sofa", variant: "1S", price: "free" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason.toLowerCase()).toContain("price");
  });
});

describe("hasPricingIntent", () => {
  it("is false for an empty batch or rows with no price/cost", () => {
    expect(hasPricingIntent([])).toBe(false);
    expect(hasPricingIntent([{}])).toBe(false);
    expect(hasPricingIntent([{ price: undefined, cost: undefined }])).toBe(false);
  });
  it("treats a numeric price OR cost — including 0 — as intent (the gate contract)", () => {
    expect(hasPricingIntent([{ price: 0 }])).toBe(true);
    expect(hasPricingIntent([{ cost: 0 }])).toBe(true);
    expect(hasPricingIntent([{ price: 1899 }])).toBe(true);
    expect(hasPricingIntent([{ cost: 900 }])).toBe(true);
  });
  it("is true if ANY row in the batch carries a price/cost", () => {
    expect(hasPricingIntent([{}, {}, { price: 10 }])).toBe(true);
  });
  it("accepts MAX_IMPORT_MONEY at the boundary via the schema", () => {
    const good = { model: "MX", modelKey: "mx", category: "sofa", variant: "1S", price: MAX_IMPORT_MONEY };
    expect(skuImportInput.safeParse({ rows: [good] }).success).toBe(true);
    const over = { ...good, price: MAX_IMPORT_MONEY + 1 };
    expect(skuImportInput.safeParse({ rows: [over] }).success).toBe(false);
  });
});

describe("skuImportInput (server zod)", () => {
  const good = { model: "MX", modelKey: "m-key", category: "sofa", variant: "1S", variantKind: "size" };
  it("accepts what the mapper produces", () => {
    const mapped = csvRecordToImportRow({ model: "MX", category: "sofa", variant: "1S", price: "100" });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(skuImportInput.safeParse({ rows: [mapped.row] }).success).toBe(true);
  });
  it("requires at least 1 row", () => {
    expect(skuImportInput.safeParse({ rows: [] }).success).toBe(false);
  });
  it("caps at 500 rows", () => {
    const rows = Array.from({ length: 501 }, () => good);
    expect(skuImportInput.safeParse({ rows }).success).toBe(false);
  });
  it("rejects an unknown key (strict)", () => {
    expect(skuImportInput.safeParse({ rows: [{ ...good, code: "X" }] }).success).toBe(false);
  });
});
