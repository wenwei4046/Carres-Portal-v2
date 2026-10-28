import { describe, expect, it } from "vitest";
import { stockDropUnitCost, stockDropValue, stockDropsTotal } from "./stock-drops";

describe("stock drops — a write-off valued as 0643 values stock", () => {
  it("costs a Unit at its PO line, a free-of-charge line at nothing, and no line as no cost recorded", () => {
    expect(stockDropUnitCost({ cost: "520.50", commercial_treatment: "chargeable" })).toBe(520.5);
    expect(stockDropUnitCost({ cost: "520.50", commercial_treatment: "free_of_charge" })).toBe(0);
    expect(stockDropUnitCost({ cost: null, commercial_treatment: "chargeable" })).toBeNull();
    expect(stockDropUnitCost(null)).toBeNull();
  });

  it("values qty × cost to the sen and never turns no cost into zero", () => {
    expect(stockDropValue(1, 520.5)).toBe(520.5);
    expect(stockDropValue(3, 0.1)).toBe(0.3);
    expect(stockDropValue(1, null)).toBeNull();
    expect(() => stockDropValue(0, 10)).toThrow();
  });

  it("totals only the known value and counts the Units with no cost recorded", () => {
    expect(stockDropsTotal([{ value: 520.5 }, { value: null }, { value: 0 }, { value: 0.1 }])).toEqual({
      units: 4, value: 52060, noCost: 1,
    });
    expect(stockDropsTotal([])).toEqual({ units: 0, value: 0, noCost: 0 });
  });
});
