import { describe, expect, it } from "vitest";

import { MY_ADDRESS, MY_STATES, applyAddressOverrides, getPostcodes, keepCurrent } from "./malaysia-postcodes";

// Regression — 2026-07-19: the Kelana Jaya showroom (109, Jalan SS 25/2, Taman
// Mayang, 47301 Petaling Jaya) could not be keyed in: the old hand-curated demo
// dataset only carried PJ's 46xxx band (the 47xxx band was misfiled under
// Sungai Buloh), and the pickers are strict selects with no free-type escape.
// Fixed by swapping in the full national dataset (malaysia-postcodes-data.ts).
describe("malaysia-postcodes", () => {
  it("Petaling Jaya carries its 47xxx band (Kelana Jaya / SS / Damansara suburbs)", () => {
    const pj = getPostcodes("Selangor", "Petaling Jaya");
    for (const code of ["46000", "47300", "47301", "47400", "47410", "47800", "47810", "47820", "47830"]) {
      expect(pj).toContain(code);
    }
  });

  it("Sungai Buloh no longer misfiles other towns' codes", () => {
    const sb = getPostcodes("Selangor", "Sungai Buloh");
    expect(sb).toContain("47000");
    for (const misfiled of ["47100", "47300", "47400", "47800", "47810", "47900"]) {
      expect(sb).not.toContain(misfiled);
    }
  });

  it("covers towns the old demo subset was missing entirely", () => {
    expect(getPostcodes("Selangor", "Batu Caves")).toContain("68100");
    expect(getPostcodes("Selangor", "Pelabuhan Klang").length).toBeGreaterThan(0);
    expect(getPostcodes("Selangor", "Subang Airport")).toContain("47200");
  });

  it("keeps the app's canonical 16 state keys (region.ts buckets depend on them)", () => {
    expect(MY_STATES).toEqual([
      "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka",
      "Negeri Sembilan", "Pahang", "Penang", "Perak", "Perlis", "Putrajaya",
      "Sabah", "Sarawak", "Selangor", "Terengganu",
    ]);
  });

  it("every postcode is a 5-digit string", () => {
    for (const cities of Object.values(MY_ADDRESS)) {
      for (const codes of Object.values(cities)) {
        for (const code of codes) expect(code).toMatch(/^\d{5}$/);
      }
    }
  });
});

// Weisiang's decision (Mr Lim, WhatsApp 2026-10-22): office staff edit the
// State, City and Postcode lists, Houzs way — overrides on top of the
// generated national file, which stays untouched.
describe("applyAddressOverrides", () => {
  const base = { Selangor: { Klang: ["41000", "41050"], "Petaling Jaya": ["46000"] }, Johor: { Muar: ["84000"] } };

  it("adds a state, a city and a postcode", () => {
    const out = applyAddressOverrides(base, [
      { state: "Sabah", city: null, postcode: null, rename_to: null, hidden: false },
      { state: "Selangor", city: "Bandar Rimbayu", postcode: "42500", rename_to: null, hidden: false },
      { state: "Selangor", city: "Klang", postcode: "41999", rename_to: null, hidden: false },
    ]);
    expect(Object.keys(out).sort()).toEqual(["Johor", "Sabah", "Selangor"]);
    expect(out.Selangor["Bandar Rimbayu"]).toEqual(["42500"]);
    expect(out.Selangor.Klang).toContain("41999");
    expect(base.Selangor.Klang).not.toContain("41999"); // base is never mutated
  });

  it("hides a state, a city and a postcode", () => {
    const out = applyAddressOverrides(base, [
      { state: "Johor", city: null, postcode: null, rename_to: null, hidden: true },
      { state: "Selangor", city: "Petaling Jaya", postcode: null, rename_to: null, hidden: true },
      { state: "Selangor", city: "Klang", postcode: "41050", rename_to: null, hidden: true },
    ]);
    expect(Object.keys(out)).toEqual(["Selangor"]);
    expect(Object.keys(out.Selangor)).toEqual(["Klang"]);
    expect(out.Selangor.Klang).toEqual(["41000"]);
  });

  it("renames a state and a city, keeping their postcodes and adds under them", () => {
    const out = applyAddressOverrides(base, [
      { state: "Selangor", city: "Klang", postcode: null, rename_to: "Kelang", hidden: false },
      { state: "Selangor", city: "Klang", postcode: "41999", rename_to: null, hidden: false },
      { state: "Johor", city: null, postcode: null, rename_to: "Johor Darul Takzim", hidden: false },
    ]);
    expect(out.Selangor.Klang).toBeUndefined();
    expect(out.Selangor.Kelang).toEqual(["41000", "41050", "41999"]);
    expect(out["Johor Darul Takzim"]).toEqual({ Muar: ["84000"] });
    expect(out.Johor).toBeUndefined();
  });

  it("keeps a saved value the lists no longer offer, so an old order still shows it", () => {
    expect(keepCurrent(["A", "B"], "Z")).toEqual(["A", "B", "Z"]);
    expect(keepCurrent(["A", "B"], "A")).toEqual(["A", "B"]);
    expect(keepCurrent(["A"], "")).toEqual(["A"]);
  });
});
