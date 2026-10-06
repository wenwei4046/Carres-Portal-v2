import { describe, expect, it } from "vitest";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import { csvRecordToImportRow, hasPricingIntent } from "@carres/shared";

import { buildSkuExportCsv, readFileToRecords, SKU_EXPORT_COLUMNS } from "./sku-csv";

function model(over: Partial<ProductModelDto> = {}): ProductModelDto {
  return {
    id: "m1",
    category: "sofa",
    modelKey: "booqit",
    name: "Booqit",
    blurb: null,
    colors: null,
    gaps: null,
    sofaMode: null,
    ...over,
  } as ProductModelDto;
}

function sku(over: Partial<ProductSkuDto> = {}): ProductSkuDto {
  return {
    id: "s1",
    modelId: "m1",
    sku: "BOOQIT-1S",
    variant: "1S",
    variantKind: "size",
    price: 1899,
    cost: 900,
    supplierId: null,
    discontinuedAt: null,
    posActive: true,
    description: "1 seater",
    ...over,
  } as ProductSkuDto;
}

describe("buildSkuExportCsv", () => {
  it("emits the header + one row per sku in column order", () => {
    const csv = buildSkuExportCsv([{ sku: sku(), model: model() }]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe(SKU_EXPORT_COLUMNS.join(","));
    // 2026-08-24: pwp_price + supplier_code joined the round-trip — both blank
    // on this fixture, so two empty cells between cost and description.
    expect(lines[1]).toBe("Booqit,booqit,sofa,1S,size,1899,900,,,1 seater,yes,BOOQIT-1S");
  });

  it("blanks price 0 and cost null (treated as not-set, clean round-trip)", () => {
    const csv = buildSkuExportCsv([{ sku: sku({ price: 0, cost: null }), model: model() }]);
    const row = csv.split("\n")[1].split(",");
    expect(row[5]).toBe(""); // price
    expect(row[6]).toBe(""); // cost
  });

  it("marks pos_active=false as no", () => {
    const csv = buildSkuExportCsv([{ sku: sku({ posActive: false }), model: model() }]);
    // Index 10 since 2026-08-24: pwp_price + supplier_code sit between cost
    // and description in the round-trip column set.
    expect(csv.split("\n")[1].split(",")[10]).toBe("no");
  });

  it("quotes a description with a comma (RFC4180)", () => {
    const csv = buildSkuExportCsv([{ sku: sku({ description: "soft, deep" }), model: model() }]);
    expect(csv).toContain('"soft, deep"');
  });

  it("round-trips an UNPRICED sku with NO pricing intent (operation can re-import structure)", () => {
    const csv = buildSkuExportCsv([{ sku: sku({ price: 0, cost: null }), model: model() }]);
    const body = csv.split("\n")[1].split(",");
    const rec: Record<string, string> = {};
    SKU_EXPORT_COLUMNS.forEach((c, i) => (rec[c] = body[i]));
    const mapped = csvRecordToImportRow(rec);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect("price" in mapped.row).toBe(false);
    expect("cost" in mapped.row).toBe(false);
    // The whole point: an unpriced round-trip must not require the principal.
    expect(hasPricingIntent([mapped.row])).toBe(false);
  });

  it("round-trips back through the shared import mapper", () => {
    const csv = buildSkuExportCsv([{ sku: sku(), model: model() }]);
    const body = csv.split("\n")[1].split(",");
    const rec: Record<string, string> = {};
    SKU_EXPORT_COLUMNS.forEach((c, i) => (rec[c] = body[i]));
    const mapped = csvRecordToImportRow(rec);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    expect(mapped.row).toMatchObject({
      model: "Booqit",
      modelKey: "booqit",
      category: "sofa",
      variant: "1S",
      price: 1899,
      cost: 900,
    });
  });
});

describe("readFileToRecords (CSV path)", () => {
  it("parses a CSV file into header-keyed records", async () => {
    const text = "model,category,variant,price\nBooqit,sofa,1S,1899\n";
    // jsdom's File doesn't implement Blob.text(); provide it (it's a real browser
    // primitive). The unit under test is the .csv dispatch + parseCsv wiring.
    const file = { name: "skus.csv", text: async () => text } as unknown as File;
    const recs = await readFileToRecords(file);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ model: "Booqit", category: "sofa", variant: "1S", price: "1899" });
  });
});
