import { describe, expect, it } from "vitest";

import { MY_ADDRESS, MY_STATES, getPostcodes } from "./malaysia-postcodes";

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
