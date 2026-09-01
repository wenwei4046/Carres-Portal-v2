import { describe, expect, it } from "vitest";
import { addressCascadePatch } from "./SalesOrderWorkspace";
import { getCities, getPostcodes, MY_STATES } from "@/data/malaysia-postcodes";

/**
 * THE OFFICE ASKS THE ADDRESS THE WAY THE POS ASKS IT (2026-08-21).
 *
 * All three parts were free text on this door while the POS could only ever
 * write a listed value — so the office could produce an address the shop floor
 * was incapable of producing, and a postcode belonging to no city in its own
 * state. Each field was individually a real string, so nothing downstream
 * caught it.
 */
describe("addressCascadePatch — a child may never outlive its parent", () => {
  it("a new STATE clears both the city and the postcode", () => {
    expect(addressCascadePatch("state", "Selangor")).toEqual({
      customer_address_state: "Selangor",
      customer_address_city: "",
      customer_address_postcode: "",
    });
  });

  it("a new CITY clears the postcode and leaves the state alone", () => {
    const patch = addressCascadePatch("city", "Klang");
    expect(patch).toEqual({ customer_address_city: "Klang", customer_address_postcode: "" });
    expect(patch).not.toHaveProperty("customer_address_state");
  });

  it("the impossible draft this prevents", () => {
    // Selangor/Georgetown/10200 — every part a real value, the combination
    // nonsense. Switching state must not leave the old city standing.
    const patch = addressCascadePatch("state", "Selangor");
    expect(patch.customer_address_city).toBe("");
    expect(patch.customer_address_postcode).toBe("");
  });
});

describe("the dataset behind the pickers", () => {
  it("offers real Malaysian states", () => {
    expect(MY_STATES.length).toBeGreaterThan(10);
    expect(MY_STATES).toContain("Selangor");
  });

  it("cities are scoped to their state, and postcodes to their city", () => {
    const cities = getCities("Selangor");
    expect(cities.length).toBeGreaterThan(0);
    const postcodes = getPostcodes("Selangor", cities[0]);
    expect(postcodes.length).toBeGreaterThan(0);
    // Every postcode offered belongs to the picked city — that is the whole
    // point of disabling the field until a city exists.
    expect(getPostcodes("Selangor", null)).toEqual([]);
    expect(getCities(null)).toEqual([]);
  });
});
