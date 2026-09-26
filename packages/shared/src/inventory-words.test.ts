import { describe, expect, it } from "vitest";
import { inventoryStatusOf, isHeldUnit, stillToArriveLine, stockConditionOf } from "./inventory-words";

describe("Inventory Status — owner words 2026-09-25", () => {
  it("prints the three saleability words and never Not available", () => {
    expect(inventoryStatusOf({ availability: "available" })).toBe("Available");
    expect(inventoryStatusOf({ availability: "reserved", reservedRef: "SO2609-4827" })).toBe("Reserved");
    expect(inventoryStatusOf({ availability: "not_available" })).toBe("Cannot sell");
    expect(inventoryStatusOf({ availability: "incoming" })).toBe("Incoming");
  });
  it("keeps the word a Unit had when it left — nobody records the road", () => {
    expect(inventoryStatusOf({ availability: "in_transit", reservedRef: "SO2609-4827" })).toBe("Reserved");
    expect(inventoryStatusOf({ availability: "in_transit", reservedRef: null })).toBe("Available");
  });
  it("gives an ended Unit no saleability word", () => {
    expect(inventoryStatusOf({ availability: "ended" })).toBeNull();
  });
});

describe("Stock Condition — the reason lives beside Cannot sell", () => {
  it("names the physical grade with the ruled words", () => {
    expect(stockConditionOf({ condition: "new" })).toBe("New");
    expect(stockConditionOf({ condition: "exhibition" })).toBe("Display");
    expect(stockConditionOf({ condition: "old" })).toBe("Old");
    expect(stockConditionOf({ condition: "damaged" })).toBe("Damaged");
  });
  it("names the control ahead of the grade", () => {
    expect(stockConditionOf({ condition: "new", holdReason: "wrong_item" })).toBe("Wrong item");
    expect(stockConditionOf({ condition: "new", holdReason: "inspection" })).toBe("Waiting inspection");
    expect(stockConditionOf({ condition: "new", needsRepair: true })).toBe("In repair");
  });
});

describe("the default list is what Carres holds", () => {
  it("excludes Incoming and ended Units", () => {
    expect(isHeldUnit({ availability: "available" })).toBe(true);
    expect(isHeldUnit({ availability: "in_transit" })).toBe(true);
    expect(isHeldUnit({ availability: "incoming" })).toBe(false);
    expect(isHeldUnit({ availability: "ended" })).toBe(false);
  });
  it("prints the still-to-arrive line only when goods are owed", () => {
    expect(stillToArriveLine(127)).toBe("127 still to arrive · see Inbound");
    expect(stillToArriveLine(0)).toBeNull();
  });
});
