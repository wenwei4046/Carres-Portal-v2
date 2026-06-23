import { describe, expect, it } from "vitest";
import { resolveFabricDelta } from "./fabric-tier";

const CONFIG = { sofaTier2Delta: 100, sofaTier3Delta: 200 };
const OVERRIDE = { tier2Delta: 50, tier3Delta: 80 };

describe("resolveFabricDelta", () => {
  it("PRICE_1 always returns 0 regardless of config/override", () => {
    expect(resolveFabricDelta("PRICE_1", OVERRIDE, CONFIG)).toBe(0);
    expect(resolveFabricDelta("PRICE_1", null, CONFIG)).toBe(0);
    expect(resolveFabricDelta("PRICE_1", undefined, undefined)).toBe(0);
  });

  it("PRICE_2 with no override falls back to config.sofaTier2Delta", () => {
    expect(resolveFabricDelta("PRICE_2", null, CONFIG)).toBe(100);
    expect(resolveFabricDelta("PRICE_2", undefined, CONFIG)).toBe(100);
  });

  it("PRICE_3 with no override falls back to config.sofaTier3Delta", () => {
    expect(resolveFabricDelta("PRICE_3", null, CONFIG)).toBe(200);
    expect(resolveFabricDelta("PRICE_3", undefined, CONFIG)).toBe(200);
  });

  it("PRICE_2 override.tier2Delta wins over config", () => {
    expect(resolveFabricDelta("PRICE_2", OVERRIDE, CONFIG)).toBe(50);
  });

  it("PRICE_2 override.tier2Delta=0 wins (override beats global — ?? not ||)", () => {
    expect(resolveFabricDelta("PRICE_2", { tier2Delta: 0, tier3Delta: null }, CONFIG)).toBe(0);
  });

  it("PRICE_2 override.tier2Delta=null inherits from global config", () => {
    expect(resolveFabricDelta("PRICE_2", { tier2Delta: null, tier3Delta: null }, CONFIG)).toBe(100);
  });

  it("config null/undefined returns 0 safely (no NaN)", () => {
    expect(resolveFabricDelta("PRICE_2", null, null)).toBe(0);
    expect(resolveFabricDelta("PRICE_2", null, undefined)).toBe(0);
    expect(resolveFabricDelta("PRICE_3", null, null)).toBe(0);
  });

  it("negative delta is clamped to 0", () => {
    expect(resolveFabricDelta("PRICE_2", { tier2Delta: -50, tier3Delta: null }, null)).toBe(0);
    expect(resolveFabricDelta("PRICE_2", null, { sofaTier2Delta: -10, sofaTier3Delta: 0 })).toBe(0);
  });

  it("PRICE_3 override.tier3Delta wins over config", () => {
    expect(resolveFabricDelta("PRICE_3", OVERRIDE, CONFIG)).toBe(80);
  });

  it("PRICE_3 override.tier3Delta=null inherits from global config", () => {
    expect(resolveFabricDelta("PRICE_3", { tier2Delta: 50, tier3Delta: null }, CONFIG)).toBe(200);
  });
});
