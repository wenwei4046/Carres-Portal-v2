import { describe, expect, it } from "vitest";
import { buildFabricCsv, mergeFabricImport, type FabricCsvRow } from "./fabric-csv";

const base: FabricCsvRow = {
  fabricCode: "BF-01",
  series: "BF",
  description: "Grey, linen",
  supplierCode: "S1",
  sofaTier: "PRICE_2",
  bedframeTier: "PRICE_1",
  active: true,
};

describe("fabric csv (Houzs Fabric Converter export/import)", () => {
  it("exports a header and quotes commas", () => {
    const csv = buildFabricCsv([base]).split("\n");
    expect(csv[0]).toBe(
      "fabric_code,series,description,supplier_code,sofa_tier,bedframe_tier,active," +
        "price_sen,soh_sen,po_outstanding_sen,last_month_usage_sen,one_week_usage_sen," +
        "two_weeks_usage_sen,one_month_usage_sen,shortage_sen,reorder_point_sen,lead_time_days",
    );
    expect(csv[1]).toBe('BF-01,BF,"Grey, linen",S1,PRICE_2,PRICE_1,yes,,,,,,,,,,');
  });

  it("upserts by code; blank cells keep the current value", () => {
    const res = mergeFabricImport([base], [
      { "Fabric Code": "bf-01", description: "", sofa_tier: "Price 3", active: "no" },
      { fabric_code: "NEW-9", bedframe_tier: "1" },
    ]);
    expect(res.errors).toEqual([]);
    expect(res.updated).toBe(1);
    expect(res.added).toBe(1);
    expect(res.rows[0]).toMatchObject({ description: "Grey, linen", sofaTier: "PRICE_3", active: false });
    expect(res.rows[1]).toMatchObject({ fabricCode: "NEW-9", sofaTier: "PRICE_2", bedframeTier: "PRICE_1", active: true });
  });

  it("round-trips its own export", () => {
    const records = [{ fabric_code: "BF-01", series: "BF", description: "Grey, linen", supplier_code: "S1", sofa_tier: "PRICE_2", bedframe_tier: "PRICE_1", active: "yes" }];
    expect(mergeFabricImport([base], records).rows).toEqual([base]);
  });

  it("reports a blank code or a bad tier with its line number", () => {
    const res = mergeFabricImport([], [{ fabric_code: "" }, { fabric_code: "X", sofa_tier: "4" }]);
    expect(res.errors).toEqual(["Line 2: fabric code is blank.", 'Line 3: sofa_tier "4" is not Price 1, 2 or 3.']);
    expect(res.rows).toEqual([]);
  });

  // Follows Houzs frontend/src/vendor/scm/lib/fabric-csv.ts:42-53 and
  // backend/src/scm/routes/fabric-tracking.ts:300-308 per Weisiang's ruling (2026-10-22).
  it("imports the Houzs stock columns as whole numbers; blank keeps, text refuses", () => {
    const withStock = { ...base, stock: { sohSen: 100, reorderPointSen: 5 } };
    const res = mergeFabricImport([withStock], [{ fabric_code: "BF-01", soh_sen: "1,250.7", reorder_point_sen: "", lead_time_days: "14" }]);
    expect(res.errors).toEqual([]);
    expect(res.rows[0]!.stock).toEqual({ sohSen: 1250, reorderPointSen: 5, leadTimeDays: 14 });
    expect(withStock.stock.sohSen).toBe(100); // input not mutated
    expect(buildFabricCsv(res.rows).split("\n")[1]).toBe('BF-01,BF,"Grey, linen",S1,PRICE_2,PRICE_1,yes,,1250,,,,,,,5,14');
    expect(mergeFabricImport([], [{ fabric_code: "X", price_sen: "abc" }]).errors).toEqual(['Line 2: price_sen "abc" is not a number.']);
  });
});
