import { describe, expect, it } from "vitest";
import { pickCompartmentSpecial, resolveFabricDelta } from "./fabric-tier";

const CONFIG = { sofaTier2Delta: 100, sofaTier3Delta: 200 };
const OVERRIDE = { tier2Delta: 50, tier3Delta: 80 };
const SPECIAL = { tier2Delta: 300, tier3Delta: 400 };

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

  // 0205 — per-compartment special (4th param) is the highest-precedence layer.
  it("PRICE_2 compartment special wins over per-model override and global", () => {
    expect(resolveFabricDelta("PRICE_2", OVERRIDE, CONFIG, SPECIAL)).toBe(300);
  });

  it("PRICE_3 compartment special wins over per-model override and global", () => {
    expect(resolveFabricDelta("PRICE_3", OVERRIDE, CONFIG, SPECIAL)).toBe(400);
  });

  it("PRICE_2 compartment special=0 wins (explicit free — ?? not ||)", () => {
    expect(resolveFabricDelta("PRICE_2", OVERRIDE, CONFIG, { tier2Delta: 0, tier3Delta: null })).toBe(0);
  });

  it("PRICE_2 compartment special=null falls through to per-model override", () => {
    expect(
      resolveFabricDelta("PRICE_2", OVERRIDE, CONFIG, { tier2Delta: null, tier3Delta: null }),
    ).toBe(50);
  });

  it("PRICE_1 stays 0 even with a compartment special set", () => {
    expect(resolveFabricDelta("PRICE_1", OVERRIDE, CONFIG, SPECIAL)).toBe(0);
  });

  it("compartment special negative is clamped to 0", () => {
    expect(resolveFabricDelta("PRICE_2", null, CONFIG, { tier2Delta: -20, tier3Delta: null })).toBe(0);
  });

  it("undefined compartment special = pre-0205 behaviour (back-compat)", () => {
    expect(resolveFabricDelta("PRICE_2", OVERRIDE, CONFIG)).toBe(50);
    expect(resolveFabricDelta("PRICE_2", OVERRIDE, CONFIG, undefined)).toBe(50);
  });
});

describe("pickCompartmentSpecial (0205)", () => {
  it("no compartments → both deltas null (falls through in resolveFabricDelta)", () => {
    expect(pickCompartmentSpecial([])).toEqual({ tier2Delta: null, tier3Delta: null });
  });

  it("all-null specials → null (an unpriced tier never drags the max to 0)", () => {
    expect(
      pickCompartmentSpecial([
        { tier2Delta: null, tier3Delta: null },
        { tier2Delta: null, tier3Delta: null },
      ]),
    ).toEqual({ tier2Delta: null, tier3Delta: null });
  });

  it("highest wins per tier across several special compartments", () => {
    expect(
      pickCompartmentSpecial([
        { tier2Delta: 300, tier3Delta: 100 },
        { tier2Delta: 250, tier3Delta: 500 },
      ]),
    ).toEqual({ tier2Delta: 300, tier3Delta: 500 });
  });

  it("a null on one compartment doesn't suppress a real special on another", () => {
    expect(
      pickCompartmentSpecial([
        { tier2Delta: null, tier3Delta: 400 },
        { tier2Delta: 150, tier3Delta: null },
      ]),
    ).toEqual({ tier2Delta: 150, tier3Delta: 400 });
  });

  it("explicit 0 participates and can be the winner", () => {
    expect(pickCompartmentSpecial([{ tier2Delta: 0, tier3Delta: null }])).toEqual({
      tier2Delta: 0,
      tier3Delta: null,
    });
  });
});
