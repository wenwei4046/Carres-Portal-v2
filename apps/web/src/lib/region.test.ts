import { describe, it, expect } from "vitest";
import {
  detectState,
  stateToRegion,
  regionForAddress,
  areaForAddress,
  suggestCarrier,
} from "./region";
import { composeAddress } from "@/data/malaysia-postcodes";

describe("detectState", () => {
  it("reads the state from a composed native address (state at end)", () => {
    const addr = composeAddress({
      line1: "12, Jalan Cempaka",
      city: "Petaling Jaya",
      postcode: "46000",
      state: "Selangor",
    });
    expect(detectState(addr)).toBe("Selangor");
  });

  it("matches Kuala Lumpur", () => {
    expect(detectState("Bukit Bintang, 55100, Kuala Lumpur")).toBe(
      "Kuala Lumpur",
    );
  });

  it("recognises Singapore as its own sentinel", () => {
    expect(detectState("Blk 123 Ang Mo Kio Ave, Singapore 560123")).toBe(
      "Singapore",
    );
  });

  it("resolves aliases (KL, Malacca, Pulau Pinang, N. Sembilan)", () => {
    expect(detectState("Cheras, KL")).toBe("Kuala Lumpur");
    expect(detectState("Bandar Hilir, Malacca")).toBe("Melaka");
    expect(detectState("Georgetown, Pulau Pinang")).toBe("Penang");
    expect(detectState("Seremban, N. Sembilan")).toBe("Negeri Sembilan");
  });

  it("falls back to the 5-digit postcode when no state name is present", () => {
    // 84000 = Muar, Johor — AutoCount-style address with no trailing state.
    expect(detectState("No 5, Jalan Sisi, 84000")).toBe("Johor");
    // 10450 = George Town, Penang
    expect(detectState("Lot 2, 10450")).toBe("Penang");
  });

  it("uses the coarse 2-digit prefix for unlisted postcodes", () => {
    // 81999 isn't in the curated set but 81 → Johor.
    expect(detectState("Somewhere, 81999")).toBe("Johor");
  });

  it("prefers the state nearest the end over an earlier street-name collision", () => {
    // "Melaka" appears as a street, but the address is in KL.
    expect(detectState("3, Jalan Melaka, 50100, Kuala Lumpur")).toBe(
      "Kuala Lumpur",
    );
  });

  it("returns null for empty / unrecognisable input", () => {
    expect(detectState(null)).toBeNull();
    expect(detectState("")).toBeNull();
    expect(detectState("—")).toBeNull();
    expect(detectState("just some words, no place")).toBeNull();
  });
});

describe("stateToRegion", () => {
  it("buckets states correctly", () => {
    expect(stateToRegion("Selangor")).toBe("KV");
    expect(stateToRegion("Kuala Lumpur")).toBe("KV");
    expect(stateToRegion("Putrajaya")).toBe("KV");
    expect(stateToRegion("Penang")).toBe("North");
    expect(stateToRegion("Perak")).toBe("North");
    expect(stateToRegion("Johor")).toBe("South");
    expect(stateToRegion("Melaka")).toBe("South");
    expect(stateToRegion("Singapore")).toBe("Singapore");
    expect(stateToRegion("Sabah")).toBe("Other");
    expect(stateToRegion("Negeri Sembilan")).toBe("Other");
  });

  it("returns null for null", () => {
    expect(stateToRegion(null)).toBeNull();
  });
});

describe("areaForAddress", () => {
  it("KV states → KV", () => {
    expect(areaForAddress("PJ, 46000, Selangor")).toBe("KV");
    expect(areaForAddress("Cheras, Kuala Lumpur")).toBe("KV");
  });

  it("everything else → Outstation", () => {
    expect(areaForAddress("Muar, Johor")).toBe("Outstation");
    expect(areaForAddress("George Town, Penang")).toBe("Outstation");
    expect(areaForAddress("Singapore 560123")).toBe("Outstation");
    expect(areaForAddress("Kota Kinabalu, Sabah")).toBe("Outstation");
  });

  it("undetectable → Unknown", () => {
    expect(areaForAddress(null)).toBe("Unknown");
    expect(areaForAddress("no place here")).toBe("Unknown");
  });
});

describe("suggestCarrier", () => {
  it("KV → NETS (AL backup)", () => {
    expect(suggestCarrier("PJ, 46000, Selangor")).toEqual({
      partner: "NETS",
      alt: "AL",
      region: "KV",
    });
  });

  it("North → NETS", () => {
    expect(suggestCarrier("Ipoh, 30000, Perak")?.partner).toBe("NETS");
    expect(suggestCarrier("George Town, Penang")?.partner).toBe("NETS");
  });

  it("Melaka & Johor → TT (TEOW alt)", () => {
    expect(suggestCarrier("Muar, Johor")).toEqual({
      partner: "TT",
      alt: "TEOW",
      region: "South",
    });
    expect(suggestCarrier("Melaka City, Melaka")?.partner).toBe("TT");
  });

  it("Singapore → SSY (EU alt)", () => {
    expect(suggestCarrier("Singapore 560123")).toEqual({
      partner: "SSY",
      alt: "EU",
      region: "Singapore",
    });
  });

  it("other outstation → AL (HOUZS alt)", () => {
    expect(suggestCarrier("Kota Kinabalu, Sabah")).toEqual({
      partner: "AL",
      alt: "HOUZS",
      region: "Other",
    });
    expect(suggestCarrier("Seremban, Negeri Sembilan")?.partner).toBe("AL");
  });

  it("undetectable → null (operator picks manually)", () => {
    expect(suggestCarrier(null)).toBeNull();
    expect(suggestCarrier("mystery")).toBeNull();
  });
});

describe("regionForAddress", () => {
  it("end-to-end through a composed address", () => {
    const johor = composeAddress({
      line1: "1 Jln Test",
      city: "Muar",
      postcode: "84000",
      state: "Johor",
    });
    expect(regionForAddress(johor)).toBe("South");
  });
});
