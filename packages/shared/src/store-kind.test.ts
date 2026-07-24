import { describe, it, expect } from "vitest";
import { branchNoun, carresLocationName, isShowroom, storeNoun } from "./store-kind";

describe("store-kind nouns", () => {
  it("showroom channel → Showroom nouns; anything else → Dealer/Outlet", () => {
    expect(isShowroom("showroom")).toBe(true);
    expect(isShowroom("dealer")).toBe(false);
    expect(isShowroom(null)).toBe(false);
    expect(storeNoun("showroom")).toBe("Showroom");
    expect(storeNoun(undefined)).toBe("Dealer");
    expect(branchNoun("showroom")).toBe("Showroom");
    expect(branchNoun("dealer")).toBe("Outlet");
  });
});

describe("carresLocationName", () => {
  it("prefixes the typed location with Carres", () => {
    expect(carresLocationName("Mont Kiara")).toBe("Carres Mont Kiara");
    expect(carresLocationName("  Kota Damansara  ")).toBe("Carres Kota Damansara");
  });

  it("strips a typed-in leading Carres in any case — never doubles the prefix", () => {
    expect(carresLocationName("Carres Mont Kiara")).toBe("Carres Mont Kiara");
    expect(carresLocationName("carres mont kiara")).toBe("Carres mont kiara");
    expect(carresLocationName("CARRES - Bangsar")).toBe("Carres Bangsar");
  });

  it("does NOT strip a location that merely starts with the letters", () => {
    expect(carresLocationName("Carreston Heights")).toBe("Carres Carreston Heights");
  });

  it("empty / prefix-only input composes to empty (not filled in)", () => {
    expect(carresLocationName("")).toBe("");
    expect(carresLocationName("   ")).toBe("");
    expect(carresLocationName("Carres")).toBe("");
    expect(carresLocationName("carres ")).toBe("");
  });
});
